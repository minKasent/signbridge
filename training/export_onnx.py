"""Xuất checkpoint SignTransformer ra ONNX cho apps/ml — CÓ TỰ KIỂM CHỨNG SỐ HỌC.

Tách khỏi training/model/train.py (khối export ở dòng 209-226) để có thể xuất lại
model đã huấn luyện mà KHÔNG phải train lại: Colab rớt phiên, đổi opset, đổi độ dài
cửa sổ, hoặc chỉ đơn giản là muốn kiểm tra lại file .onnx đã giao.

    python training/export_onnx.py --checkpoint runs/baseline/best.pt
    python training/export_onnx.py --checkpoint runs/baseline/best.pt \
        --labels runs/baseline/labels.json --out apps/ml/model --seq-len 32

Vì sao phải kiểm chứng chứ không chỉ xuất: torch.onnx.export gần như KHÔNG BAO GIỜ
báo lỗi. Nó vẫn sinh ra file .onnx khi đồ thị đã bị "nướng cứng" sai (xem ghi chú về
trục động ở hàm export_onnx, chỗ khai báo dynamic_axes). Kiểm chứng bắt được đúng loại
hỏng đó vì có ca ép trục batch và ca ép trục chuỗi (xem cases trong main).
Một file .onnx sai vẫn nạp được, vẫn trả về số, chỉ là
số sai — và ở tầng trên (apps/ml → Spring → LLM) không ai phát hiện ra. Vì vậy script
này chạy lại model bằng ĐÚNG runtime dùng lúc serve (onnxruntime, xem
apps/ml/requirements.txt dòng 5) rồi so từng phần tử với PyTorch; lệch quá ngưỡng thì
THOÁT MÃ KHÁC 0 và không coi đợt xuất là thành công.

Kết quả ghi vào --out (mặc định apps/ml/model/, đúng nơi ML service tự dò —
apps/ml/app/main.py dòng 22, 59-61):
    sign_model.onnx   float32 (B, T, 144) -> probs (B, C) đã softmax
    labels.json       {"labels": [...], "window": T, "dims": 144, "fps_hint": 25, ...}

Ghi chú trung thực về số liệu:
- Tính tới 27/07/2026 repo CHƯA có checkpoint .pt nào và CHƯA có apps/ml/model/, nên
  chưa có accuracy thật để dẫn. Mọi con số top-1 / NO_SIGN recall / streaming top-1
  trong báo cáo: [CẦN SỐ LIỆU] — chúng chỉ sinh ra khi train.py chạy trên dữ liệu thật
  (VSL400 còn đang chờ duyệt quyền truy cập Zenodo).
- Sai lệch PyTorch ↔ onnxruntime đo được trên môi trường apps/ml/.venv của máy này
  (torch 2.13.0+cpu, onnxruntime 1.28.0, onnx 1.22.0, numpy 2.5.1; đo 27/07/2026 trên
  model TRỌNG SỐ NGẪU NHIÊN 6 lớp, d_model=192, 4 lớp encoder, 4 đầu attention) nằm ở
  MỨC 1e-7 qua 4 ca kiểm — tức nhỏ hơn ngưỡng 1e-4 khoảng ba bậc độ lớn. Cố ý KHÔNG ghi
  một con số cụ thể ở đây và không được chép con số nào từ dòng này vào báo cáo: trọng
  số là ngẫu nhiên và seed dựng trọng số không được lưu ở đâu trong repo (VERIFY_SEED
  = 42 chỉ ghim ĐẦU VÀO của bước kiểm chứng, không ghim trọng số), nên mỗi lượt chạy
  cho một con số khác tuy cùng bậc độ lớn. Luận
  điểm cần chứng minh là ĐƯỜNG XUẤT ĐÚNG chứ không phải một giá trị cụ thể. Bậc độ lớn
  này cũng KHÔNG nói gì về accuracy.
  Sai lệch trên CHECKPOINT THẬT: [CẦN SỐ LIỆU] — script này in ra con số đó mỗi lần
  chạy, lấy đúng dòng in để đưa vào báo cáo.
- Thời gian suy luận một cửa sổ bằng onnxruntime trên máy demo: [CẦN SỐ LIỆU] — chưa
  đo được vì chưa có model thật; đo bằng cách gọi /infer sau khi có apps/ml/model/.
"""

from __future__ import annotations

import argparse
import importlib.util
import inspect
import json
import sys
from pathlib import Path

import numpy as np
import torch

# --- Contract cứng với apps/ml (đổi ở đây là phải đổi cả bên kia) ------------
# apps/ml/app/main.py dòng 53 gọi session.run(None, {"frames": x}) — tên input
# "frames" là một phần giao kèo, không phải chi tiết trang trí. Đổi tên là ML
# service ném KeyError lúc suy luận chứ không phải lúc khởi động.
ONNX_INPUT_NAME = "frames"
ONNX_OUTPUT_NAME = "probs"
ONNX_FILENAME = "sign_model.onnx"  # main.py dòng 59 dò đúng tên này
LABELS_FILENAME = "labels.json"  # main.py dòng 35 đọc đúng tên này
NO_SIGN_LABEL = "NO_SIGN"  # train.py dòng 220: labels + ["NO_SIGN"], LUÔN là lớp cuối

# --- Mặc định lấy từ code hiện hành, không phải trí nhớ ----------------------
DEFAULT_WINDOW = 32  # train.py dòng 93 (--window) và LandmarkWebSocketHandler.java dòng 40
FPS_HINT = 25  # train.py dòng 35; khớp TARGET_FPS trong useVisionPipeline.ts dòng 24
DEFAULT_NUM_HEADS = 4  # SignTransformer.__init__ (model.py dòng 23)
VERIFY_SEED = 42  # cùng seed với train.py dòng 108 — kiểm chứng lặp lại được

TRAINING_DIR = Path(__file__).resolve().parent
REPO_ROOT = TRAINING_DIR.parent
MODEL_PY = TRAINING_DIR / "model" / "model.py"
DEFAULT_OUT = REPO_ROOT / "apps" / "ml" / "model"


def _force_utf8_stdout() -> None:
    """Console Windows mặc định cp1252 — in tiếng Việt có dấu là UnicodeEncodeError.

    Đây là lỗi thật đã gặp: torch.onnx.export in ký tự "✅" trong thanh tiến trình và
    làm CẢ ĐỢT XUẤT văng ngoại lệ, trong khi bản thân việc xuất đã thành công. Ép UTF-8
    ngay từ đầu để lỗi hiển thị không giả dạng lỗi kỹ thuật.
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):  # stream đã bị redirect/bọc
            pass


def load_model_module():
    """Nạp training/model/model.py theo ĐƯỜNG DẪN TUYỆT ĐỐI.

    Không dùng `import model` vì có va tên: thư mục training/model/ và tệp
    training/model/model.py cùng tên "model". Tuỳ thư mục làm việc lúc chạy mà
    `import model` ra namespace package (rỗng, thiếu SignTransformer) hay ra module
    thật — một lỗi chỉ hiện khi đổi chỗ đứng gõ lệnh. importlib theo đường dẫn thì
    tất định.
    """
    if not MODEL_PY.is_file():
        raise SystemExit(f"Không tìm thấy {MODEL_PY} — chạy script từ trong repo SignBridge.")
    spec = importlib.util.spec_from_file_location("signbridge_model", MODEL_PY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_checkpoint(path: Path) -> tuple[dict, dict]:
    """Trả (state_dict, checkpoint đầy đủ). Chấp nhận cả best.pt lẫn last.pt.

    train.py lưu hai định dạng khác nhau:
      best.pt  -> {"state_dict", "labels", "args"}          (dòng 187-188)
      last.pt  -> {"model", "optimizer", "scheduler", ...}  (dòng 189-191)
    last.pt KHÔNG chứa labels nên khi dùng nó bắt buộc phải có --labels.
    """
    if not path.is_file():
        raise SystemExit(f"Không có checkpoint: {path}")
    # weights_only=True: checkpoint là dữ liệu, không nên cho phép nó chạy pickle
    # tuỳ ý lúc nạp. Torch cũ chưa có tham số này nên phải bọc TypeError.
    try:
        ckpt = torch.load(path, map_location="cpu", weights_only=True)
    except TypeError:
        ckpt = torch.load(path, map_location="cpu")
    if not isinstance(ckpt, dict):
        raise SystemExit(f"{path} không phải checkpoint dạng dict của train.py")

    for key in ("state_dict", "model"):
        if key in ckpt and isinstance(ckpt[key], dict):
            return ckpt[key], ckpt
    # Có thể là state_dict trần
    if all(isinstance(v, torch.Tensor) for v in ckpt.values()) and ckpt:
        return ckpt, {}
    raise SystemExit(f"{path} không có khoá 'state_dict' hay 'model' — không rõ định dạng.")


def infer_architecture(state_dict: dict, ckpt_args: dict) -> dict:
    """Suy siêu tham số TỪ CHÍNH TRỌNG SỐ, không hardcode.

    Trọng số là nguồn sự thật duy nhất: nếu đọc siêu tham số từ chỗ khác mà lệch, ta
    dựng model sai kích thước và load_state_dict sẽ nổ — hoặc tệ hơn, nạp được nhưng
    chạy sai (trường hợp num_heads bên dưới).
    """
    required = ("input_proj.0.weight", "pos_embedding", "head.2.weight")
    missing = [k for k in required if k not in state_dict]
    if missing:
        raise SystemExit(
            f"Checkpoint thiếu khoá {missing} — không phải SignTransformer của repo này."
        )

    d_model, input_dims = tuple(state_dict["input_proj.0.weight"].shape)
    _, max_len, pos_dim = tuple(state_dict["pos_embedding"].shape)
    num_classes, head_dim = tuple(state_dict["head.2.weight"].shape)
    if pos_dim != d_model or head_dim != d_model:
        raise SystemExit(
            f"Trọng số tự mâu thuẫn: d_model={d_model} nhưng pos={pos_dim}, head={head_dim}."
        )

    layer_ids = {
        int(k.split(".")[2]) for k in state_dict if k.startswith("encoder.layers.") and k.count(".") > 2
    }
    if not layer_ids:
        raise SystemExit("Checkpoint không có encoder.layers.* — trọng số hỏng.")
    num_layers = max(layer_ids) + 1

    # num_heads KHÔNG suy được từ state_dict: nn.MultiheadAttention lưu in_proj_weight
    # dạng (3*d_model, d_model) bất kể chia mấy đầu. Nghĩa là dựng sai num_heads vẫn
    # load_state_dict THÀNH CÔNG rồi cho ra kết quả sai lặng lẽ. train.py hiện không
    # có cờ --heads (dòng 86-105) nên checkpoint của repo luôn dùng mặc định 4; nếu
    # sau này thêm cờ, giá trị sẽ nằm trong ckpt["args"] và được ưu tiên đọc ở đây.
    num_heads = None
    for key in ("num_heads", "heads", "nhead"):
        if key in ckpt_args:
            num_heads = int(ckpt_args[key])
            break
    heads_from_args = num_heads is not None
    if num_heads is None:
        num_heads = DEFAULT_NUM_HEADS
    if d_model % num_heads != 0:
        raise SystemExit(f"d_model={d_model} không chia hết cho num_heads={num_heads}.")

    arch = {
        "num_classes": num_classes,
        "input_dims": input_dims,
        "d_model": d_model,
        "num_layers": num_layers,
        "num_heads": num_heads,
        "max_len": max_len,
        "heads_from_args": heads_from_args,
    }

    # Đối chiếu với args đã lưu — lệch thì trọng số thắng, nhưng phải NÓI ra.
    for arg_key, derived_key in (("d_model", "d_model"), ("layers", "num_layers")):
        if arg_key in ckpt_args and int(ckpt_args[arg_key]) != arch[derived_key]:
            print(
                f"  CẢNH BÁO: args lưu {arg_key}={ckpt_args[arg_key]} nhưng trọng số cho "
                f"{derived_key}={arch[derived_key]} — dùng theo trọng số."
            )
    return arch


def resolve_labels(args, ckpt: dict) -> tuple[list[str], dict, Path | None]:
    """Trả (labels đầy đủ kể cả NO_SIGN, metadata gốc, đường dẫn labels.json đã đọc).

    Thứ tự ưu tiên: --labels > labels.json cạnh checkpoint > ckpt["labels"].
    Tuyệt đối KHÔNG sinh tên lớp giả (kiểu "class_0") khi thiếu — một model trả nhãn
    bịa còn tệ hơn một model không chạy, vì nó vẫn hiện chữ lên màn hình demo.
    """
    explicit = args.labels is not None
    path = Path(args.labels) if explicit else args.checkpoint.parent / LABELS_FILENAME
    if path.is_file():
        meta = json.loads(path.read_text(encoding="utf-8"))
        labels = list(meta.get("labels") or [])
        if not labels:
            raise SystemExit(f"{path} không có mảng 'labels'.")
        return labels, meta, path
    if explicit:
        # Người dùng chỉ đích danh một file mà không có: dừng, đừng lẳng lặng
        # rơi về nguồn nhãn khác — họ sẽ tưởng đã dùng file mình chỉ.
        raise SystemExit(f"Không có file labels: {path}")

    # train.py dòng 187 lưu labels CHƯA có NO_SIGN; dòng 220 mới nối thêm khi ghi
    # labels.json. Tái tạo đúng thứ tự đó, đừng đảo — chỉ số lớp phải khớp head.
    if ckpt.get("labels"):
        labels = list(ckpt["labels"])
        if labels[-1] != NO_SIGN_LABEL:
            labels = labels + [NO_SIGN_LABEL]
        return labels, {}, None

    raise SystemExit(
        "Không xác định được danh sách nhãn: checkpoint không có 'labels' và không tìm "
        f"thấy {LABELS_FILENAME}. Truyền --labels <đường dẫn>."
    )


def resolve_seq_len(args, meta: dict, ckpt_args: dict, max_len: int) -> int:
    """Độ dài cửa sổ dùng làm hình dạng danh nghĩa khi xuất.

    Ưu tiên: --seq-len > labels.json["window"] > ckpt args["window"] > 32.
    """
    if args.seq_len > 0:
        seq_len = args.seq_len
        source = "--seq-len"
    elif meta.get("window"):
        seq_len = int(meta["window"])
        source = f"{LABELS_FILENAME}[window]"
    elif "window" in ckpt_args:
        seq_len = int(ckpt_args["window"])
        source = "checkpoint args[window]"
    else:
        seq_len = DEFAULT_WINDOW
        source = f"mặc định {DEFAULT_WINDOW}"

    # pos_embedding chỉ có max_len vị trí và forward cắt [:, :T] (model.py dòng 32, 52)
    # nên T > max_len là lỗi hình dạng ngay lúc chạy, không phải chuyện "chậm hơn".
    if not 1 <= seq_len <= max_len:
        raise SystemExit(
            f"seq-len={seq_len} ngoài khoảng hợp lệ 1..{max_len} (max_len của pos_embedding)."
        )
    print(f"  Độ dài cửa sổ T = {seq_len} (nguồn: {source})")
    return seq_len


def export_onnx(wrapper, dummy: torch.Tensor, path: Path, opset: int, dynamic_seq: bool,
                exporter: str) -> str:
    """Xuất ONNX. Trả về tên đường xuất đã dùng ("dynamo" hoặc "legacy")."""
    dynamic_axes = {ONNX_INPUT_NAME: {0: "batch"}, ONNX_OUTPUT_NAME: {0: "batch"}}
    if dynamic_seq:
        dynamic_axes[ONNX_INPUT_NAME][1] = "seq"

    kwargs = {
        "input_names": [ONNX_INPUT_NAME],
        "output_names": [ONNX_OUTPUT_NAME],
        "dynamic_axes": dynamic_axes,
    }
    # opset = 0 nghĩa là KHÔNG ghim, giữ đúng quyết định ở train.py dòng 212-213:
    # exporter tự chọn bản mới nhất nó cài đặt được. Ghim một số THẤP hơn khả năng
    # exporter chỉ khiến nó tự nâng lên rồi in cảnh báo chuyển đổi ồn ào (đã thấy
    # thật với opset 17 trên torch 2.13: nó nâng lên 18 và cảnh báo).
    if opset > 0:
        kwargs["opset_version"] = opset

    supports_dynamo = "dynamo" in inspect.signature(torch.onnx.export).parameters
    want_dynamo = exporter == "dynamo" or (exporter == "auto" and supports_dynamo)
    if want_dynamo and not supports_dynamo:
        raise SystemExit("Bản torch này không có đường xuất dynamo — dùng --exporter legacy.")

    if want_dynamo:
        try:
            torch.onnx.export(wrapper, (dummy,), str(path), dynamo=True, **kwargs)
            return "dynamo"
        except Exception as exc:  # noqa: BLE001 — muốn thử nốt đường legacy rồi mới bỏ cuộc
            if exporter == "dynamo":
                raise
            print(f"  Đường xuất dynamo hỏng ({type(exc).__name__}: {exc}), thử lại legacy…")

    if supports_dynamo:
        torch.onnx.export(wrapper, (dummy,), str(path), dynamo=False, **kwargs)
    else:
        torch.onnx.export(wrapper, (dummy,), str(path), **kwargs)
    return "legacy"


def verify_onnx(path: Path, wrapper, cases: list[tuple[int, int, bool]], input_dims: int,
                tol: float) -> tuple[bool, dict]:
    """Chạy lại bằng onnxruntime và so từng phần tử với PyTorch.

    Trả (mọi ca đều đạt, chi tiết theo ca). Ca lỗi runtime (sai hình dạng) cũng tính
    là KHÔNG ĐẠT chứ không bỏ qua.
    """
    import onnxruntime as ort

    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])

    # Kiểm tên input/output TRƯỚC khi kiểm số: sai tên thì apps/ml chết lúc suy luận
    # với KeyError khó hiểu, chứ không chết lúc khởi động.
    in_names = [i.name for i in session.get_inputs()]
    out_names = [o.name for o in session.get_outputs()]
    if in_names != [ONNX_INPUT_NAME] or out_names[0] != ONNX_OUTPUT_NAME:
        raise SystemExit(
            f"Sai giao kèo tên: input={in_names} output={out_names}, "
            f"cần input=['{ONNX_INPUT_NAME}'] output[0]='{ONNX_OUTPUT_NAME}'."
        )
    print(f"  Hình dạng input trong file: {session.get_inputs()[0].shape}")

    # Seed cứng: cùng một lệnh chạy hai lần phải ra cùng con số, nếu không thì không
    # thể dùng con số đó trong báo cáo.
    gen = torch.Generator().manual_seed(VERIFY_SEED)
    results: dict[str, dict] = {}
    all_ok = True

    for batch, seq, zeros in cases:
        name = f"batch={batch}, T={seq}" + (" (toàn 0)" if zeros else "")
        if zeros:
            # Cửa sổ toàn 0 = KHÔNG phát hiện được cả tay lẫn thân trên (che camera,
            # không có ai trong khung). apps/web/src/lib/landmarks.ts dòng 64 khởi tạo
            # vector 144 chiều toàn 0 rồi chỉ điền ô nào phát hiện được: tay vào ô
            # 0-125 (dòng 65-73), thân trên vào ô 126-143 (dòng 74-81).
            # Phạm vi của ca này: nó KHÔNG phủ trạng thái idle phổ biến hơn là người
            # vẫn trong khung nhưng hạ tay xuống — khi đó khối pose vẫn khác 0 nên
            # frame không hề toàn 0. Bộ kiểm hiện chưa có ca đó.
            x = torch.zeros(batch, seq, input_dims)
        else:
            x = torch.rand(batch, seq, input_dims, generator=gen)

        # eval() + no_grad(): dropout p=0.2 (model.py dòng 25) mà còn ở chế độ train
        # thì mỗi lần gọi ra một số khác nhau, "sai lệch" đo được sẽ là nhiễu dropout
        # chứ không phải sai lệch xuất ONNX. no_grad chỉ để khỏi dựng đồ thị đạo hàm.
        with torch.no_grad():
            reference = wrapper(x).numpy()

        try:
            produced = session.run(None, {ONNX_INPUT_NAME: x.numpy()})[0]
        except Exception as exc:  # noqa: BLE001 — lỗi runtime của ORT là kết quả cần ghi
            results[name] = {"ok": False, "error": f"{type(exc).__name__}: {str(exc)[:120]}"}
            all_ok = False
            continue

        if produced.shape != reference.shape:
            results[name] = {
                "ok": False,
                "error": f"hình dạng lệch: ONNX {produced.shape} vs PyTorch {reference.shape}",
            }
            all_ok = False
            continue

        max_diff = float(np.max(np.abs(produced - reference)))
        argmax_match = bool(np.array_equal(produced.argmax(-1), reference.argmax(-1)))
        # Đầu ra đã qua softmax (ExportWrapper, model.py dòng 72) nên tổng phải bằng 1;
        # tổng khác 1 nghĩa là softmax bị rơi mất lúc xuất và apps/ml sẽ trả "confidence"
        # vô nghĩa cho ngưỡng CONFIDENCE_THRESHOLD = 0.6 (TranslationService.java dòng 35).
        prob_sum_err = float(np.max(np.abs(produced.sum(axis=-1) - 1.0)))
        ok = max_diff < tol and argmax_match and prob_sum_err < 1e-3
        results[name] = {
            "ok": ok,
            "max_diff": max_diff,
            "argmax_match": argmax_match,
            "prob_sum_err": prob_sum_err,
        }
        all_ok = all_ok and ok

    return all_ok, results


def print_results(results: dict, tol: float) -> None:
    for name, r in results.items():
        if "error" in r:
            print(f"  [HỎNG] {name}: {r['error']}")
        else:
            flag = "ĐẠT " if r["ok"] else "HỎNG"
            print(
                f"  [{flag}] {name}: lệch tuyệt đối lớn nhất = {r['max_diff']:.3e} "
                f"(ngưỡng {tol:.0e}) | argmax khớp: {r['argmax_match']} "
                f"| |Σprob - 1| = {r['prob_sum_err']:.2e}"
            )


def main() -> int:
    _force_utf8_stdout()

    parser = argparse.ArgumentParser(
        description="Xuất SignTransformer ra ONNX cho apps/ml và kiểm chứng bằng onnxruntime.",
    )
    parser.add_argument("--checkpoint", type=Path, required=True,
                        help="File .pt do train.py sinh (best.pt hoặc last.pt). "
                             "Không có mặc định: đoán đường dẫn checkpoint là bịa.")
    parser.add_argument("--labels", type=Path, default=None,
                        help=f"labels.json. Bỏ trống: tìm {LABELS_FILENAME} cạnh checkpoint, "
                             "không có thì lấy nhãn trong chính checkpoint.")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT,
                        help=f"Thư mục ra (mặc định {DEFAULT_OUT} — nơi apps/ml tự dò).")
    parser.add_argument("--opset", type=int, default=0,
                        help="Opset ONNX. 0 = KHÔNG ghim, để exporter tự chọn (mặc định, "
                             "theo train.py). Chỉ ghim khi runtime đích cũ hơn.")
    parser.add_argument("--seq-len", type=int, default=0,
                        help="Độ dài cửa sổ danh nghĩa T. 0 = lấy từ labels.json/checkpoint, "
                             f"cuối cùng mới về {DEFAULT_WINDOW}.")
    parser.add_argument("--tol", type=float, default=1e-4,
                        help="Ngưỡng sai lệch tuyệt đối lớn nhất PyTorch↔ONNX (mặc định 1e-4).")
    parser.add_argument("--exporter", choices=("auto", "dynamo", "legacy"), default="auto",
                        help="Đường xuất của torch.onnx. auto = dynamo nếu bản torch có.")
    parser.add_argument("--fixed-seq", action="store_true",
                        help="Xuất luôn với trục chuỗi CỐ ĐỊNH (bỏ qua bước thử trục động).")
    parser.add_argument("--strict-dynamic-seq", action="store_true",
                        help="Trục chuỗi động không chạy được thì HỎNG luôn, không lùi về cố định.")
    parser.add_argument("--run-name", default=None,
                        help="Nhãn phiên bản ghi vào labels.json['run'] (apps/ml hiển thị ở "
                             "/health). Bỏ trống: giữ giá trị cũ, không có thì lấy tên thư mục.")
    args = parser.parse_args()

    model_mod = load_model_module()

    print(f"[1/5] Đọc checkpoint {args.checkpoint}")
    state_dict, ckpt = read_checkpoint(args.checkpoint)
    ckpt_args = ckpt.get("args") or {}
    arch = infer_architecture(state_dict, ckpt_args)
    print(f"  Kiến trúc suy từ trọng số: {arch['num_classes']} lớp | "
          f"input_dims={arch['input_dims']} | d_model={arch['d_model']} | "
          f"layers={arch['num_layers']} | heads={arch['num_heads']} | max_len={arch['max_len']}")
    if not arch["heads_from_args"]:
        print(f"  Lưu ý: num_heads không lưu trong checkpoint → dùng mặc định "
              f"{DEFAULT_NUM_HEADS} của SignTransformer. Nếu lần train đó sửa tay số đầu "
              f"attention thì phải truyền lại đúng — sai heads vẫn nạp được nhưng cho kết quả sai.")

    labels, meta, labels_src = resolve_labels(args, ckpt)
    print(f"  Nhãn: {len(labels)} lớp (nguồn: {labels_src or 'checkpoint[labels]'})")
    if len(labels) != arch["num_classes"]:
        raise SystemExit(
            f"Số nhãn ({len(labels)}) khác số lớp của model ({arch['num_classes']}). "
            "Sai cặp checkpoint/labels.json — dừng, không xuất."
        )
    if labels[-1] != NO_SIGN_LABEL:
        # Không tự sửa: thứ tự nhãn quyết định ánh xạ chỉ số→gloss. Đảo nhầm là toàn bộ
        # từ điển dịch lệch mà vẫn "chạy được".
        print(f"  CẢNH BÁO: lớp cuối là '{labels[-1]}', không phải '{NO_SIGN_LABEL}'. "
              "train.py luôn đặt NO_SIGN cuối cùng — kiểm lại nguồn nhãn.")

    seq_len = resolve_seq_len(args, meta, ckpt_args, arch["max_len"])

    print("[2/5] Dựng lại model và nạp trọng số")
    net = model_mod.SignTransformer(
        num_classes=arch["num_classes"],
        input_dims=arch["input_dims"],
        d_model=arch["d_model"],
        num_layers=arch["num_layers"],
        num_heads=arch["num_heads"],
        max_len=arch["max_len"],
    )
    # strict=True: thiếu/thừa một khoá là dừng. Nạp "gần đúng" nghĩa là một phần model
    # còn nguyên trọng số khởi tạo ngẫu nhiên — vẫn chạy, vẫn ra số, và sai.
    net.load_state_dict(state_dict, strict=True)
    # .eval(): tắt dropout. Quên dòng này thì file ONNX xuất ra chứa dropout đang bật
    # (exporter đóng băng theo trạng thái hiện tại của module) → mỗi lần suy luận một
    # kết quả khác, và bước kiểm chứng bên dưới sẽ trượt một cách khó hiểu.
    wrapper = model_mod.ExportWrapper(net).eval().cpu()

    print("[3/5] Xuất ONNX")
    args.out.mkdir(parents=True, exist_ok=True)
    onnx_path = args.out / ONNX_FILENAME
    # Batch danh nghĩa phải > 1. torch.export CHUYÊN BIỆT HOÁ mọi chiều bằng 1 của ví
    # dụ đầu vào: xuất bằng dummy batch=1 thì trục batch tuy được KHAI BÁO là "batch"
    # nhưng chạy batch=3 sẽ nổ Reshape trong self-attention (đã tái hiện được với
    # torch 2.13). train.py dòng 211 dùng batch=1 — đây là khác biệt có chủ đích.
    dummy = torch.rand(2, seq_len, arch["input_dims"])
    dynamic_seq = not args.fixed_seq
    route = export_onnx(wrapper, dummy, onnx_path, args.opset, dynamic_seq, args.exporter)
    size_mb = onnx_path.stat().st_size / 1e6
    print(f"  Đã ghi {onnx_path} ({size_mb:.2f} MB) qua đường xuất '{route}', "
          f"opset {'tự chọn' if args.opset <= 0 else args.opset}, "
          f"trục chuỗi {'động' if dynamic_seq else 'cố định'}")

    print(f"[4/5] Kiểm chứng bằng onnxruntime (ngưỡng {args.tol:.0e})")
    # Ca 1 mô phỏng đúng cách apps/ml gọi thật (main.py dòng 52 thêm chiều batch = 1).
    # Ca 2 ép trục batch. Ca 3 là cửa sổ TOÀN 0 (không phát hiện được cả tay lẫn thân
    # trên — che camera / không có ai trong khung). Ca 4 ép trục chuỗi.
    cases = [(1, seq_len, False), (4, seq_len, False), (1, seq_len, True)]
    seq_case = None
    if dynamic_seq and seq_len > 8:
        seq_case = (2, seq_len - 8, False)
        cases.append(seq_case)

    ok, results = verify_onnx(onnx_path, wrapper, cases, arch["input_dims"], args.tol)
    print_results(results, args.tol)

    # Trục chuỗi động là chỗ dễ dối lòng nhất: exporter legacy vẫn GHI tên trục "seq"
    # vào file trong khi đã nướng cứng T vào các phép Reshape của attention — file nói
    # một đằng, chạy một nẻo. Nếu thử thấy không chạy được thì xuất lại với trục chuỗi
    # CỐ ĐỊNH, để hình dạng ghi trong file đúng với hành vi thật.
    if seq_case is not None and not results[f"batch={seq_case[0]}, T={seq_case[1]}"]["ok"]:
        if args.strict_dynamic_seq:
            print("  Trục chuỗi động không chạy được và đang bật --strict-dynamic-seq → dừng.")
        else:
            print("  Trục chuỗi động KHÔNG chạy được thật (exporter đã nướng cứng T). "
                  "Xuất lại với trục chuỗi cố định để hình dạng trong file nói đúng sự thật.")
            dynamic_seq = False
            route = export_onnx(wrapper, dummy, onnx_path, args.opset, False, args.exporter)
            cases = [(1, seq_len, False), (4, seq_len, False), (1, seq_len, True)]
            ok, results = verify_onnx(onnx_path, wrapper, cases, arch["input_dims"], args.tol)
            print_results(results, args.tol)

    if not ok:
        print("\nKIỂM CHỨNG THẤT BẠI — file .onnx vừa xuất KHÔNG dùng được. "
              "Không chép vào apps/ml/model/.", file=sys.stderr)
        return 1

    worst = max(r["max_diff"] for r in results.values() if "max_diff" in r)
    print(f"  Toàn bộ {len(results)} ca ĐẠT. Sai lệch tuyệt đối lớn nhất: {worst:.3e}")

    print(f"[5/5] Ghi {LABELS_FILENAME}")
    out_meta = dict(meta)  # giữ nguyên mọi số liệu train.py đã ghi (val_top1, test_top1…)
    out_meta["labels"] = labels
    # window PHẢI khớp T đã xuất: apps/ml/app/main.py dòng 48-51 từ chối (HTTP 422) mọi
    # cửa sổ khác đúng con số này. Ghi lệch là ML service chặn sạch mọi yêu cầu hợp lệ.
    if meta.get("window") not in (None, seq_len):
        print(f"  Ghi đè window {meta['window']} → {seq_len} cho khớp file .onnx vừa xuất.")
    out_meta["window"] = seq_len
    out_meta["dims"] = arch["input_dims"]
    out_meta.setdefault("fps_hint", FPS_HINT)
    out_meta.setdefault("run", args.run_name or args.checkpoint.parent.name or "export")
    if args.run_name:
        out_meta["run"] = args.run_name
    out_meta["dynamic_seq"] = dynamic_seq  # thông tin, apps/ml không đọc khoá này
    (args.out / LABELS_FILENAME).write_text(
        json.dumps(out_meta, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    if not any(k in out_meta for k in ("val_top1", "test_top1", "test_streaming_top1")):
        print("  Lưu ý: labels.json này KHÔNG có số liệu accuracy (nguồn nhãn không kèm). "
              "Số liệu chỉ do train.py sinh — đừng điền tay vào báo cáo.")

    print(f"\nXong. {args.out} đã đủ ({ONNX_FILENAME} + {LABELS_FILENAME}) để "
          "apps/ml nạp thay chế độ STUB — khởi động lại uvicorn rồi đối chiếu "
          f"GET /health: phải trả classes={len(labels)}, window={seq_len}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
