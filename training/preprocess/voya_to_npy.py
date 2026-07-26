"""Chuyển VOYA_VSL (HF Kateht/VOYA_VSL) sang cây .npy 144 chiều để PRETRAIN.

VOYA_VSL: 161 lớp ký hiệu tiếng Việt, mỗi lớp một file .npz chứa (1001, 60, 1605) —
1000 mẫu augment + 1 mẫu GỐC (index 1000) từ đúng MỘT video từ điển QIPEDC.
⚠️ VÌ VẬY chỉ dùng cho PRETRAINING (học "ngôn ngữ chung của chuyển động tay"),
KHÔNG dùng làm dữ liệu đánh giá chính — 1 người ký, augment cùng gốc, không có
giá trị đo tổng quát hóa. (Xem điều tra 26/07/2026 trong PLAN.md.)

Bố cục 1605 chiều đã kiểm chứng thực nghiệm: [pose 25 điểm | tay trái 21 | tay phải 21 |
mặt 468] × (x,y,z). Cắt về 144 chiều của SignBridge:
    seq144 = concat(seq[:, 75:201], seq[:, 33:51])   # [trái 63 | phải 63 | vai-khuỷu-cổ tay 18]
Caveat: pose Z của VOYA theo thang legacy Holistic (hip-scale, tới ~-1.0) khác MediaPipe
Tasks — lệch phân bố nhỏ ở 6 chiều z pose; fine-tune trên dữ liệu thật sẽ tự thích nghi
(hoặc dùng --zero-pose-z để về 0 cả hai phía nếu muốn triệt để).

Chạy (local thử vài lớp / Colab đầy đủ):
    python voya_to_npy.py --classes 1-161 --out <dir> [--max-aug 200] [--cache <dir>]

Kết quả: out/train/class_XXXX/aug_NNN.npy (mẫu augment) + out/val/class_XXXX/orig.npy
(mẫu gốc) + out/gloss_map.json (class_XXXX → tên tiếng Việt).
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

import numpy as np

HF_BASE = "https://huggingface.co/datasets/Kateht/VOYA_VSL/resolve/main"
LEFT_HAND = slice(75, 138)
RIGHT_HAND = slice(138, 201)
POSE_UPPER = slice(33, 51)  # điểm pose 11-16 (vai, khuỷu, cổ tay) × 3


def slice_144(seq: np.ndarray) -> np.ndarray:
    """(T, 1605) → (T, 144) theo đúng bố cục SignBridge, làm tròn 4 chữ số như browser."""
    out = np.concatenate([seq[:, LEFT_HAND], seq[:, RIGHT_HAND], seq[:, POSE_UPPER]], axis=1)
    return np.round(out, 4).astype(np.float32)


def parse_classes(spec: str) -> list[int]:
    ids: list[int] = []
    for part in spec.split(","):
        if "-" in part:
            lo, hi = part.split("-")
            ids.extend(range(int(lo), int(hi) + 1))
        else:
            ids.append(int(part))
    return ids


def fetch_class(class_id: int, cache_dir: Path) -> Path:
    name = f"class_{class_id:04d}.npz"
    target = cache_dir / name
    if target.exists():
        return target
    url = f"{HF_BASE}/Merged/{name}"
    print(f"Tải {name} (~340MB)…")
    tmp = target.with_suffix(".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(target)
    return target


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--classes", default="1-161", help="VD: 1-161 hoặc 1,23,50-60")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--cache", type=Path, default=Path("voya_cache"),
                        help="Nơi giữ file .npz đã tải (xóa sau khi convert nếu thiếu disk)")
    parser.add_argument("--max-aug", type=int, default=200,
                        help="Số mẫu augment giữ lại mỗi lớp (1000 là thừa — cùng một video gốc)")
    parser.add_argument("--zero-pose-z", action="store_true",
                        help="Đưa 6 chiều z của pose về 0 (né lệch thang legacy vs Tasks)")
    parser.add_argument("--delete-npz", action="store_true", help="Xóa .npz sau khi convert (tiết kiệm disk)")
    args = parser.parse_args()

    args.cache.mkdir(parents=True, exist_ok=True)
    args.out.mkdir(parents=True, exist_ok=True)

    with urllib.request.urlopen(f"{HF_BASE}/labels.json") as res:
        gloss_map_all = json.load(res)

    rng = np.random.default_rng(42)
    gloss_map: dict[str, str] = {}
    for class_id in parse_classes(args.classes):
        key = f"class_{class_id:04d}"
        try:
            npz_path = fetch_class(class_id, args.cache)
            data = np.load(npz_path)["sequences"]  # (1001, 60, 1605)
        except Exception as e:  # noqa: BLE001 — lớp hỏng/thiếu thì bỏ qua, đi tiếp
            print(f"✗ {key}: {e}")
            continue

        original = slice_144(data[-1])
        augmented = data[:-1]
        picks = rng.choice(len(augmented), size=min(args.max_aug, len(augmented)), replace=False)

        train_dir = args.out / "train" / key
        val_dir = args.out / "val" / key
        train_dir.mkdir(parents=True, exist_ok=True)
        val_dir.mkdir(parents=True, exist_ok=True)

        for i, idx in enumerate(sorted(picks)):
            arr = slice_144(augmented[idx])
            if args.zero_pose_z:
                arr[:, 128::3] = 0.0
            np.save(train_dir / f"aug_{i:03d}.npy", arr)
        if args.zero_pose_z:
            original[:, 128::3] = 0.0
        np.save(val_dir / "orig.npy", original)

        gloss_map[key] = gloss_map_all.get(key, key)
        print(f"✓ {key} ({gloss_map[key]}): {len(picks)} train + 1 val")

        if args.delete_npz:
            npz_path.unlink(missing_ok=True)

    (args.out / "gloss_map.json").write_text(
        json.dumps(gloss_map, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nXong: {len(gloss_map)} lớp → {args.out}")
    print("Pretrain: python ../model/train.py --data", args.out,
          "--out <ckpt_dir> --no-sign-per-class 0 --run-name voya-pretrain")


if __name__ == "__main__":
    main()
