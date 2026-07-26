"""SignBridge ML Service — suy luận gloss từ chuỗi landmark.

Hai chế độ, tự chọn lúc khởi động:
  1. MODEL THẬT: nếu thư mục model (mặc định apps/ml/model/, đổi bằng biến môi
     trường SIGNBRIDGE_MODEL_DIR) chứa sign_model.onnx + labels.json — sản phẩm
     của training/model/train.py — thì suy luận bằng ONNX Runtime.
  2. STUB: chưa có model thì trả gloss giả để test pipeline end-to-end.

Contract /infer không đổi giữa hai chế độ nên Spring core không cần biết gì.
"""

import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="SignBridge ML Service", version="0.2.0")

FRAME_DIMS = 144
MODEL_DIR = Path(os.environ.get("SIGNBRIDGE_MODEL_DIR", Path(__file__).parent.parent / "model"))

# Khớp với các gloss seed trong module dictionary của Spring core
STUB_GLOSSES = ["XIN_CHAO", "CAM_ON", "TOI", "BAN", "BAC_SI", "DAU", "KHAM_BENH", "GIUP_DO"]


class _OnnxModel:
    """Nạp một lần lúc khởi động; session ONNX Runtime dùng được đa luồng."""

    def __init__(self, model_dir: Path):
        import numpy as np
        import onnxruntime as ort

        meta = json.loads((model_dir / "labels.json").read_text(encoding="utf-8"))
        self.labels: list[str] = meta["labels"]
        self.window: int = int(meta["window"])
        self.session = ort.InferenceSession(
            str(model_dir / "sign_model.onnx"), providers=["CPUExecutionProvider"])
        self.np = np
        self.version = f"onnx-{meta.get('run', 'unknown')}"

    def predict(self, frames: list[list[float]]) -> tuple[str, float]:
        np = self.np
        # ONNX export bỏ mask với tiền đề "luôn nhận đủ window frame" — vì vậy
        # PHẢI từ chối cửa sổ sai kích thước thay vì âm thầm đệm 0 (frame 0 chưa
        # từng xuất hiện không-mask lúc train → kết quả vô nghĩa mà không ai biết).
        if len(frames) != self.window:
            raise HTTPException(
                status_code=422,
                detail=f"Cần đúng {self.window} frame mỗi cửa sổ (nhận {len(frames)})")
        x = np.asarray(frames, dtype=np.float32)[None]
        probs = self.session.run(None, {"frames": x})[0][0]
        index = int(probs.argmax())
        return self.labels[index], float(probs[index])


model: _OnnxModel | None = None
if (MODEL_DIR / "sign_model.onnx").exists() and (MODEL_DIR / "labels.json").exists():
    model = _OnnxModel(MODEL_DIR)
    print(f"[ml] Đã nạp model thật: {MODEL_DIR} ({len(model.labels)} lớp, window {model.window})")
else:
    print(f"[ml] Chưa có model tại {MODEL_DIR} — chạy chế độ STUB")


class InferRequest(BaseModel):
    # Mỗi frame: vector 144 chiều [tay trái 63 | tay phải 63 | thân trên 18]
    frames: list[list[float]]


class InferResponse(BaseModel):
    gloss: str
    confidence: float


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": model.version if model else "stub-v0",
        "classes": len(model.labels) if model else len(STUB_GLOSSES),
        # Contract cửa sổ: Spring (WINDOW=32) có thể đối chiếu lúc khởi động
        "window": model.window if model else 32,
    }


@app.post("/infer", response_model=InferResponse)
def infer(req: InferRequest) -> InferResponse:
    if not req.frames:
        return InferResponse(gloss="NO_SIGN", confidence=0.0)
    if any(len(f) != FRAME_DIMS for f in req.frames):
        raise HTTPException(status_code=422, detail=f"Mỗi frame phải đúng {FRAME_DIMS} chiều")

    if model is not None:
        gloss, confidence = model.predict(req.frames)
        return InferResponse(gloss=gloss, confidence=confidence)

    return _stub_infer(req.frames)


def _stub_infer(frames: list[list[float]]) -> InferResponse:
    if _all_zero(frames):
        # Không có tay trong khung — lớp "no-sign" (model thật học lớp này)
        return InferResponse(gloss="NO_SIGN", confidence=0.0)
    # Stub tất định: chọn gloss theo tổng tọa độ frame đầu, để kết quả thay đổi
    # khi tay di chuyển — chứng minh dữ liệu chảy đúng đường.
    index = int(abs(sum(frames[0])) * 1000) % len(STUB_GLOSSES)
    return InferResponse(gloss=STUB_GLOSSES[index], confidence=0.85)


def _all_zero(frames: list[list[float]]) -> bool:
    return all(abs(v) < 1e-9 for frame in frames for v in frame)
