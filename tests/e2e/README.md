# Test end-to-end

Chạy trên hệ thống ĐANG CHẠY THẬT (Postgres + ML service + Spring core) —
kiểm tra những thứ unit test không chạm tới: giao thức WebSocket, phân quyền
qua HTTP thật, ghi file dataset, và đường gọi LLM.

Chính bộ test này đã tìm ra các lỗi mà đọc code không thấy: buffer WebSocket 8KB
làm rớt kết nối (mã 1009), JDK HttpClient gửi `Upgrade: h2c` khiến uvicorn từ chối,
và Spring Security chặn `/error` làm mọi lỗi 400 hóa thành 401.

## Chạy

Cần 3 service đang chạy (xem [README gốc](../../README.md)), rồi:

```powershell
node tests/e2e/infrastructure.test.js   # 17 kiểm tra: auth, phân quyền, dataset, WebSocket
node tests/e2e/sentence.test.js         # 6 kiểm tra: buffer gloss → nghỉ tay → câu tiếng Việt
```

Không cần cài gói nào — dùng `fetch` và `WebSocket` có sẵn trong Node 22+.
Thoát mã 0 = tất cả pass.

## Ghi chú

- `sentence.test.js` gọi Gemini thật nên cần `GEMINI_API_KEY` trong `.env`
  (không có key thì test vẫn chạy nhưng câu sẽ mang nhãn `fallback`).
- Chưa gắn vào CI vì cần dựng cả stack; CI hiện chạy 9 test Java
  (Modulith verify + Testcontainers + unit) và build web.
