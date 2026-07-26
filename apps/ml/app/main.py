"""SignBridge ML Service — suy luận gloss từ chuỗi landmark.

Giai đoạn skeleton: trả gloss GIẢ (stub) để test pipeline end-to-end
browser → Spring → đây → ngược lại, trước khi có model thật.

Tuần 4+: thay stub bằng ONNX Runtime chạy model Transformer huấn luyện
trên Multi-VSL 200 (xem training/README.md).
"""

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="SignBridge ML Service", version="0.1.0")

# Khớp với các gloss seed trong module dictionary của Spring core
STUB_GLOSSES = ["XIN_CHAO", "CAM_ON", "TOI", "BAN", "BAC_SI", "DAU", "KHAM_BENH", "GIUP_DO"]


class InferRequest(BaseModel):
    # Mỗi frame: vector 144 chiều [tay trái 63 | tay phải 63 | thân trên 18]
    frames: list[list[float]]


class InferResponse(BaseModel):
    gloss: str
    confidence: float


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": "stub-v0"}


@app.post("/infer", response_model=InferResponse)
def infer(req: InferRequest) -> InferResponse:
    if not req.frames or _all_zero(req.frames):
        # Không có tay trong khung — lớp "no-sign" (model thật sẽ học lớp này)
        return InferResponse(gloss="NO_SIGN", confidence=0.0)

    # Stub tất định: chọn gloss theo tổng tọa độ frame đầu, để kết quả
    # thay đổi khi tay di chuyển — chứng minh dữ liệu chảy đúng đường.
    index = int(abs(sum(req.frames[0])) * 1000) % len(STUB_GLOSSES)
    return InferResponse(gloss=STUB_GLOSSES[index], confidence=0.85)


def _all_zero(frames: list[list[float]]) -> bool:
    return all(abs(v) < 1e-9 for frame in frames for v in frame)
