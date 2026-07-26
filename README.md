# SignBridge 🖐️

Hệ thống dịch **ngôn ngữ ký hiệu tiếng Việt (VSL) hai chiều, thời gian thực** — đồ án tốt nghiệp 2026.

- 📋 Kế hoạch chi tiết 16 tuần: [PLAN.md](PLAN.md)
- 🔑 Hướng dẫn đăng ký tài khoản & lấy API key: [docs/SETUP-KEYS.md](docs/SETUP-KEYS.md)
- 🧠 Pipeline huấn luyện model: [training/README.md](training/README.md)

## Kiến trúc

```
apps/web   — Next.js 16: webcam + MediaPipe (landmark NGAY TRONG browser) → WebSocket
apps/core  — Spring Boot 4.1 MODULAR MONOLITH (Spring Modulith 2.1):
             identity | dictionary | translation | dataset | analytics
apps/ml    — FastAPI: 1 service mỏng suy luận gloss từ chuỗi landmark (ONNX)
training/  — tiền xử lý + notebook huấn luyện (Colab/Kaggle, log lên W&B)
```

## Chạy dev (3 terminal)

Yêu cầu: Docker Desktop đang mở, JDK 21, Node 20+, Python 3.11+.

```powershell
# Terminal 1 — ML service
cd apps/ml
python -m venv .venv; .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000

# Terminal 2 — Spring core (tự start Postgres qua docker-compose)
cd apps/core
./mvnw spring-boot:run

# Terminal 3 — Web
cd apps/web
npm install
npm run dev
```

Mở http://localhost:3000/translate → cho phép camera → đưa tay vào khung hình:
khung xương tay hiện màu xanh lá, panel bên phải hiển thị JSON tọa độ —
đó chính là toàn bộ dữ liệu mà model ML "nhìn thấy".
Nhấn **"Kết nối backend"** để stream landmark tới Spring → FastAPI và nhận gloss (stub) trả về.

## Tài khoản quản trị

Tạo tự động lúc khởi động từ `application.yml` (prod: đặt biến môi trường
`SIGNBRIDGE_SECURITY_ADMIN_EMAIL` / `SIGNBRIDGE_SECURITY_ADMIN_PASSWORD`).

| Môi trường dev | Giá trị |
|---|---|
| Email | `admin@signbridge.vn` |
| Mật khẩu | `signbridge-admin-dev` |

API đăng ký công khai (`POST /api/auth/register`) **luôn chỉ cấp quyền USER** —
quyền ADMIN chỉ đến từ tài khoản bootstrap này.

## Kiểm tra kiến trúc module

```powershell
cd apps/core
./mvnw test -Dtest=ModularityTests
```

Test này kiểm chứng ranh giới 5 module và sinh sơ đồ kiến trúc (C4 + module canvas)
vào `target/spring-modulith-docs/` — dùng trực tiếp cho báo cáo.
