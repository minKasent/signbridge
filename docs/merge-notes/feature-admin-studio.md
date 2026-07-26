# Merge notes — feature/admin-studio (AGENT A)

Dành cho AGENT C khi merge branch này vào main.

## 1. Thay đổi cần áp vào file chung (A không được sửa trực tiếp)

### 1.1 `apps/web/src/app/page.tsx` — thêm link /admin vào trang chủ

Chèn ngay SAU khối `<Link href="/collect">…</Link>`:

```diff
           <Link
             href="/collect"
             className="rounded-lg bg-violet-600 px-6 py-3 font-medium hover:bg-violet-500"
           >
             🎥 Thu thập dữ liệu
           </Link>
+          <Link
+            href="/admin"
+            className="rounded-lg bg-zinc-800 px-6 py-3 font-medium hover:bg-zinc-700"
+          >
+            🛠️ Quản trị từ điển
+          </Link>
```

Đó là thay đổi file chung DUY NHẤT cần áp. Không thêm dependency mới,
không cần sửa `SecurityConfig` (PUT/DELETE `/api/signs/**` đã yêu cầu ADMIN
sẵn), không sửa `application.yml`, không sửa `pom.xml`/`package.json`.

## 2. Plan mâu thuẫn code hiện tại — đã ưu tiên code, ghi nhận tại đây

- **A1 `lib/auth.ts` đã tồn tại trước** (commit `a8d0a8a` trang /record) với key
  localStorage `signbridge.token` + `signbridge.user`, KHÔNG phải một key
  `signbridge.auth` như plan viết. Giữ nguyên key và API sẵn có
  (`login/logout/getToken/getUser/authHeader`), chỉ BỔ SUNG hook `useAuth()`
  và directive `"use client"`. Hàm `getAuth()` trong plan chính là `getUser()`
  hiện có — không đổi tên để khỏi đụng `/record`.
- **Trang `/record` đã làm sẵn luồng quay clip** (đăng nhập inline + chọn từ +
  MediaRecorder + upload). Nằm ngoài lãnh thổ A nên GIỮ NGUYÊN, không đụng.
  A4 vẫn làm modal quay clip TRONG `/admin` đúng plan (dùng chung mẫu
  MediaRecorder). Sau khi merge, cân nhắc (tùy C): `/record` có thể bỏ hoặc giữ
  như đường tắt — hai trang không xung đột, dùng chung endpoint upload.

## 3. Ghi chú kỹ thuật cho người tích hợp

- Test mới `dictionary/SignAdminIntegrationTests` tự khai báo container
  Postgres lồng trong class (`@TestConfiguration` + `@ServiceConnection`) vì
  `vn.signbridge.TestcontainersConfiguration` là package-private — test nằm
  trong package `dictionary` không nhìn thấy. KHÔNG sửa file gốc.
- Test đó trỏ `signbridge.storage.clips-dir` vào thư mục tạm
  (`@DynamicPropertySource`) để khẳng định file clip bị xóa theo ký hiệu mà
  không ghi vào `storage/clips` của repo.
- Trong test tránh dùng `MultipartBodyBuilder` (kéo theo
  `org.reactivestreams.Publisher` — classpath MVC thuần không có, ném
  `NoClassDefFoundError`); dùng `LinkedMultiValueMap` + `HttpEntity`.
- `/login` chỉ tự chuyển hướng khi phiên là ADMIN; tài khoản USER đăng nhập
  sẽ đứng lại kèm thông báo — tránh vòng lặp redirect với guard của `/admin`.
- Nút ▶ Xem clip trong `/admin` gắn `?v=<timestamp>` vào URL clip để né cache
  browser sau khi quay clip thay thế (URL clip không đổi theo nội dung).
- Sau vòng review: `SignController.create` giờ bắt trùng gloss trả **409**
  (trước đây 500 vì unique constraint nổ thẳng) — nhánh 409 sẵn có trong
  `/record` (RecordTool.tsx dòng 193) nhờ vậy hoạt động đúng, không cần sửa gì.
  `DELETE` xóa bản ghi DB trước rồi best-effort xóa file (file bị lock trên
  Windows không làm hỏng thao tác xóa); `store()` dọn file đuôi đối nghịch khi
  quay clip thay thế (.webm đè .mp4 import) để clip cũ không còn công khai.
