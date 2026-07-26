# SignBridge ML Service

Service suy luận duy nhất bằng Python — nhận cửa sổ landmark (JSON), trả gloss + confidence.
Không chứa business logic; với Spring core đây chỉ là một HTTP dependency.

## Chạy

```powershell
cd apps/ml
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000 --reload
```

Kiểm tra: http://localhost:8000/docs (Swagger UI tự sinh).

## Lộ trình

- Hiện tại: stub trả gloss giả để test pipeline end-to-end.
- Tuần 4: nạp model ONNX huấn luyện từ `training/` — thay thân hàm `infer`,
  giữ nguyên contract `/infer` nên Spring core KHÔNG phải đổi dòng nào.
