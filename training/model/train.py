"""Huấn luyện SignTransformer trên landmark VSL (Multi-VSL hoặc dữ liệu tự thu).

Chạy trên Colab (exp02_train_baseline.ipynb) hoặc local:
    python train.py --data <root có train/ val/ test/> --out <thư mục kết quả> \
        --epochs 40 --batch 64 [--wandb] [--resume]

Ba nhóm số liệu (tách bạch — không trộn để khỏi thổi phồng):
  1. top-1/top-5 trên MẪU THẬT (center-crop) — số liệu chính
  2. NO_SIGN recall — đánh giá riêng trên batch idle tổng hợp cố định
  3. streaming top-1 — mô phỏng cách serve thật: cửa sổ trượt 32/8 + vote đa số

Kết quả trong --out:
    best.pt / last.pt — checkpoint (last.pt để --resume sau khi Colab rớt phiên)
    sign_model.onnx   — model suy luận (input float32 (B, 32, 144) → softmax (B, C))
    labels.json       — {"labels": [...], "window": 32, "dims": 144, "fps_hint": 25, ...}
Copy sign_model.onnx + labels.json vào apps/ml/model/ là ML service tự nạp thay stub.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader

from dataset import FRAME_DIMS, VslSequenceDataset, discover_labels
from model import ExportWrapper, SignTransformer

SERVE_STRIDE = 8  # khớp LandmarkWebSocketHandler bên Spring
FPS_HINT = 25  # browser throttle về nhịp này (useVisionPipeline.ts)


def evaluate(model, loader, device) -> tuple[float, float]:
    """Top-1/top-5 trên mẫu thật (center-crop). Loader này KHÔNG chứa NO_SIGN tổng hợp."""
    model.eval()
    top1 = top5 = total = 0
    with torch.no_grad():
        for x, mask, y in loader:
            x, mask, y = x.to(device), mask.to(device), y.to(device)
            logits = model(x, mask)
            ranked = logits.topk(min(5, logits.size(1)), dim=-1).indices
            top1 += (ranked[:, 0] == y).sum().item()
            top5 += (ranked == y.unsqueeze(1)).any(dim=1).sum().item()
            total += len(y)
    return top1 / total, top5 / total


def evaluate_no_sign(model, dataset: VslSequenceDataset, device, count: int = 200) -> float:
    """NO_SIGN recall trên batch idle tổng hợp cố định (seed cứng — so sánh được giữa run)."""
    model.eval()
    with torch.no_grad():
        x = dataset.no_sign_batch(count).to(device)
        pred = model(x, mask=None).argmax(dim=-1)
    return (pred == dataset.no_sign_index).float().mean().item()


def evaluate_streaming(model, dataset: VslSequenceDataset, device, window: int) -> float:
    """Mô phỏng serve: trượt cửa sổ window/stride-8 trên CẢ chuỗi (không cắt giữa),
    vote đa số các cửa sổ không-NO_SIGN → nhãn clip. Đây là con số gần thực tế nhất."""
    model.eval()
    correct = total = 0
    with torch.no_grad():
        for path, label in dataset.items:
            frames = np.load(path).astype(np.float32)
            if len(frames) < window:
                pad = np.zeros((window, FRAME_DIMS), dtype=np.float32)
                pad[: len(frames)] = frames
                windows = pad[None]
            else:
                starts = range(0, len(frames) - window + 1, SERVE_STRIDE)
                windows = np.stack([frames[s : s + window] for s in starts])
            x = torch.from_numpy(windows).to(device)
            preds = model(x, mask=None).argmax(dim=-1).cpu().numpy()
            votes = preds[preds != dataset.no_sign_index]
            clip_pred = np.bincount(votes).argmax() if len(votes) else dataset.no_sign_index
            correct += int(clip_pred == label)
            total += 1
    return correct / total


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True, help="Thư mục có train/ val/ test/")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--window", type=int, default=32)
    parser.add_argument("--d-model", type=int, default=192)
    parser.add_argument("--layers", type=int, default=4)
    parser.add_argument("--no-sign-per-class", type=int, default=3,
                        help="Mẫu NO_SIGN tổng hợp mỗi lớp khi TRAIN (eval luôn tách riêng)")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--wandb", action="store_true")
    parser.add_argument("--run-name", default="baseline-transformer")
    parser.add_argument("--resume", action="store_true", help="Nối tiếp từ last.pt (Colab rớt phiên)")
    parser.add_argument("--init-from", type=Path, default=None,
                        help="Checkpoint pretrain (best.pt của đợt VOYA): nạp encoder, "
                             "BỎ head phân loại (số lớp khác), nên dùng kèm --lr thấp hơn")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.manual_seed(42)
    np.random.seed(42)

    labels = discover_labels(args.data / "train")
    # Eval KHÔNG trộn NO_SIGN tổng hợp — tách metric riêng để không thổi phồng top-1
    datasets = {
        "train": VslSequenceDataset(args.data / "train", labels, window=args.window,
                                    train=True, no_sign_per_class=args.no_sign_per_class),
        "val": VslSequenceDataset(args.data / "val", labels, window=args.window),
    }
    # VOYA pretraining chỉ có train/val (không có test đúng nghĩa — 1 người ký)
    if (args.data / "test").is_dir():
        datasets["test"] = VslSequenceDataset(args.data / "test", labels, window=args.window)
    loaders = {
        split: DataLoader(ds, batch_size=args.batch, shuffle=(split == "train"),
                          num_workers=args.workers, pin_memory=(device.type == "cuda"))
        for split, ds in datasets.items()
    }
    num_classes = len(labels) + 1  # + NO_SIGN
    print(f"Thiết bị: {device} | {num_classes} lớp (gồm NO_SIGN) | "
          + " | ".join(f"{s}: {len(d)} mẫu" for s, d in datasets.items()))

    model = SignTransformer(num_classes, FRAME_DIMS, args.d_model, args.layers,
                            max_len=max(64, args.window)).to(device)
    print(f"Tham số: {sum(p.numel() for p in model.parameters()):,}")

    if args.init_from is not None:
        state = torch.load(args.init_from, map_location=device)["state_dict"]
        # Bỏ head: số lớp pretrain khác số lớp fine-tune; encoder + input_proj giữ nguyên.
        # Kiến trúc (d_model/layers) phải khớp — lệch là load_state_dict báo lỗi ngay.
        encoder_state = {k: v for k, v in state.items() if not k.startswith("head.")}
        missing, unexpected = model.load_state_dict(encoder_state, strict=False)
        assert not unexpected, f"Checkpoint có key lạ: {unexpected[:5]}"
        print(f"Nạp pretrain từ {args.init_from} — head khởi tạo mới ({len(missing)} tham số)")

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    args.out.mkdir(parents=True, exist_ok=True)
    start_epoch, best_val = 1, 0.0
    if args.resume and (args.out / "last.pt").exists():
        state = torch.load(args.out / "last.pt", map_location=device)
        model.load_state_dict(state["model"])
        optimizer.load_state_dict(state["optimizer"])
        scheduler.load_state_dict(state["scheduler"])
        start_epoch, best_val = state["epoch"] + 1, state["best_val"]
        print(f"Resume từ epoch {start_epoch} (best val {best_val:.3f})")

    run = None
    if args.wandb and os.environ.get("WANDB_API_KEY"):
        import wandb
        run = wandb.init(project="signbridge", name=args.run_name, resume="allow",
                         config=vars(args) | {"num_classes": num_classes})

    safe_args = {k: str(v) if isinstance(v, Path) else v for k, v in vars(args).items()}
    for epoch in range(start_epoch, args.epochs + 1):
        model.train()
        losses = []
        for x, mask, y in loaders["train"]:
            x, mask, y = x.to(device), mask.to(device), y.to(device)
            optimizer.zero_grad()
            loss = criterion(model(x, mask), y)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            losses.append(loss.item())
        scheduler.step()

        val1, val5 = evaluate(model, loaders["val"], device)
        ns_recall = evaluate_no_sign(model, datasets["val"], device)
        print(f"epoch {epoch:3d} | loss {np.mean(losses):.4f} | "
              f"val top1 {val1:.3f} top5 {val5:.3f} | NO_SIGN recall {ns_recall:.3f}")
        if run:
            run.log({"epoch": epoch, "train_loss": float(np.mean(losses)),
                     "val_top1": val1, "val_top5": val5, "no_sign_recall": ns_recall,
                     "lr": scheduler.get_last_lr()[0]})
        if val1 > best_val:
            best_val = val1
            torch.save({"state_dict": model.state_dict(), "labels": labels, "args": safe_args},
                       args.out / "best.pt")
        torch.save({"model": model.state_dict(), "optimizer": optimizer.state_dict(),
                    "scheduler": scheduler.state_dict(), "epoch": epoch, "best_val": best_val},
                   args.out / "last.pt")

    # Đánh giá cuối với checkpoint tốt nhất — 3 nhóm số liệu tách bạch
    model.load_state_dict(torch.load(args.out / "best.pt", map_location=device)["state_dict"])
    if "test" in datasets:
        test1, test5 = evaluate(model, loaders["test"], device)
        test_ns = evaluate_no_sign(model, datasets["test"], device)
        test_stream = evaluate_streaming(model, datasets["test"], device, args.window)
        print(f"\nTEST (signer-independent, mẫu thật): top1 {test1:.3f} | top5 {test5:.3f}")
        print(f"TEST NO_SIGN recall: {test_ns:.3f}")
        print(f"TEST streaming (cửa sổ trượt {args.window}/{SERVE_STRIDE} + vote): {test_stream:.3f}")
    else:
        test1 = test5 = test_ns = test_stream = None
        print("\n(Không có thư mục test — chế độ pretrain, bỏ qua đánh giá test)")
    if run:
        run.summary.update({"test_top1": test1, "test_top5": test5,
                            "test_no_sign_recall": test_ns, "test_streaming_top1": test_stream})

    # Export ONNX + labels.json cho apps/ml
    export_model = ExportWrapper(model).eval().cpu()
    dummy = torch.zeros(1, args.window, FRAME_DIMS)
    # Không ghim opset: exporter dùng bản mới nhất nó hỗ trợ — serving chạy
    # onnxruntime >= 1.28 nên tương thích; ghim 17 chỉ sinh cảnh báo fallback ồn ào.
    torch.onnx.export(
        export_model, (dummy,), str(args.out / "sign_model.onnx"),
        input_names=["frames"], output_names=["probs"],
        dynamic_axes={"frames": {0: "batch"}, "probs": {0: "batch"}},
    )
    (args.out / "labels.json").write_text(json.dumps({
        "labels": labels + ["NO_SIGN"], "window": args.window, "dims": FRAME_DIMS,
        "fps_hint": FPS_HINT, "val_top1": best_val, "test_top1": test1,
        "test_streaming_top1": test_stream, "test_no_sign_recall": test_ns,
        "run": args.run_name,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Đã export: {args.out / 'sign_model.onnx'} + labels.json "
          f"→ copy vào apps/ml/model/ để thay stub")
    if run:
        run.finish()


if __name__ == "__main__":
    main()
