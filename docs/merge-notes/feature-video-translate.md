# Merge notes — feature/video-translate (AGENT B)

Việc đã làm trong branch (không đụng file chung):

- `apps/core` module `analytics`: entity `GlossUsage` (bảng `gloss_usages`),
  `GlossStatsListener` lưu DB ngoài đếm in-memory, `GET /api/analytics/summary?days=7`,
  test `analytics/AnalyticsIntegrationTests` (Testcontainers, tự khai báo container
  vì `TestcontainersConfiguration` chung là package-private ở `vn.signbridge`).
- `apps/web` trang mới `/video` (dịch ký hiệu từ file video, thuần client) và
  `/stats` (dashboard div/CSS đọc API summary).

## 1. SecurityConfig.java — mở công khai GET /api/analytics/**

Dashboard `/stats` đọc số liệu không cần đăng nhập (số liệu gộp, không có dữ liệu
cá nhân). Diff mong muốn trong `apps/core/src/main/java/vn/signbridge/SecurityConfig.java`:

```diff
 							.requestMatchers(HttpMethod.GET, "/api/signs/**", "/clips/**", "/api/dataset/stats").permitAll()
+							.requestMatchers(HttpMethod.GET, "/api/analytics/**").permitAll()
 							.requestMatchers(HttpMethod.POST, "/api/dataset/samples").permitAll()
```

Lưu ý: test `AnalyticsIntegrationTests` gọi summary KÈM token (đúng luật hiện tại)
nên trước và sau khi áp diff này test đều xanh. Trang `/stats` đã xử lý trường hợp
401/403 (hiện cảnh báo tiếng Việt) nên chưa áp diff vẫn build/chạy được.

## 2. Trang chủ apps/web/src/app/page.tsx — thêm 2 link

Thêm vào cụm nút điều hướng (sau nút `/collect`):

```tsx
<Link
  href="/video"
  className="rounded-lg bg-teal-600 px-6 py-3 font-medium hover:bg-teal-500"
>
  🎬 Dịch từ video
</Link>
<Link
  href="/stats"
  className="rounded-lg bg-rose-600 px-6 py-3 font-medium hover:bg-rose-500"
>
  📊 Thống kê
</Link>
```

## 3. Ghi chú mâu thuẫn plan / prompt

### 3a. Plan B1 nói "Dịch lại từ đầu → gửi flush" — mâu thuẫn giao thức thật

Theo `LandmarkWebSocketHandler` + `TranslationService`, `{"type":"flush"}` là lệnh
**CHỐT CÂU** (drain gloss đang đệm → ghép câu qua LLM → gửi `sentence` ngược về,
trễ vài giây), KHÔNG phải lệnh hủy; giao thức cũng không có lệnh reset và flush
không xóa buffer frame (~31 frame dư vì WINDOW=32/STRIDE=8). Nếu làm đúng chữ plan
thì sau khi bấm "⟲ Dịch lại từ đầu" (hoặc đổi file), câu của lượt cũ sẽ hiện lại
và bị đọc to SAU khi kết quả đã xóa, và frame cũ trộn vào cửa sổ đầu lượt mới.
→ Ưu tiên code hiện tại: trang `/video` reset bằng **đóng + mở lại WebSocket**
(server tự dọn buffer frame lẫn gloss trong `afterConnectionClosed`). `flush` chỉ
còn dùng đúng nghĩa chốt câu khi video phát hết (`onended`).

- Prompt giao việc nhắc branch `feature/collect-campaign` và mục "B1→B6" — đây là
  phiên bản plan CŨ. Plan hiện tại (commit `4614742`) đã hủy ý tưởng chiến dịch
  thu mẫu và đổi nhiệm vụ AGENT B thành `feature/video-translate` (mục 5, B1→B5).
  Worktree cũng checkout sẵn `feature/video-translate` → làm theo plan hiện tại.
- Trang `/collect` và module `dataset` GIỮ NGUYÊN, không đụng tới (đúng plan).

## 4. Dependency

KHÔNG thêm thư viện mới (cả Java lẫn npm). Biểu đồ `/stats` vẽ thuần div/CSS.
