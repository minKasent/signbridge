# Merge notes — feature/video-translate (AGENT B)

## A. Sprint 1 — ĐÃ ÁP XONG trên `main`, giữ lại để tra cứu

- `SecurityConfig`: `GET /api/analytics/**` đã `permitAll` (dashboard đọc số liệu gộp,
  không có dữ liệu cá nhân) — AGENT C đã áp ở commit tích hợp `07807c2`.
- Link `/video` + `/stats` trên trang chủ: Phase 0 thay bằng `src/config/nav.ts`
  (sidebar + trang chủ tự sinh), hai mục đã có sẵn — **không cần làm gì thêm**.
- **Giao thức WS: `flush` là CHỐT CÂU, KHÔNG phải lệnh hủy.** Muốn xóa sạch đệm
  frame + gloss phía server thì phải đóng/mở lại WebSocket (`afterConnectionClosed`
  dọn hộ). Sprint 2 giữ nguyên kết luận này, nay nằm trong
  `components/demo/use-translation-socket.ts` (hàm `reset()`).

---

## B. Sprint 2 — CẦN AGENT C ĐỌC KHI MERGE

### B.1 File dùng chung bị chạm (đều là thêm mới, không sửa logic sẵn có)

| File | Thay đổi | Lý do |
|---|---|---|
| `apps/web/package.json` + lock | `+ recharts ^3.8.0` | Biểu đồ `/stats` dùng component `chart` của shadcn — **ngoại lệ dependency duy nhất được plan §3.2 cho phép** |
| `apps/web/components.json` | `+ registries: { "@magicui": … }` | CLI shadcn ghi vào khi cài `@magicui/shine-border` |
| `apps/web/src/app/globals.css` | `+ --animate-shine` và `@keyframes shine` trong `@theme inline` | ShineBorder cần keyframes này; **thiếu nó animation hỏng trong im lặng** (xem cảnh báo ở B.4) |
| `apps/web/src/components/ui/chart.tsx`, `switch.tsx`, `shine-border.tsx` | 3 primitive mới cài qua `npx shadcn@latest add` | UI-GUIDE §1 cho phép thêm primitive, yêu cầu ghi merge-notes |
| `apps/web/src/components/demo/**` (5 file MỚI) | Component + hook dùng chung cho `/translate` và `/video` | Xem B.2 |

Không sửa `layout.tsx`, `app-shell.tsx`, `nav.ts`, `page.tsx` (trang chủ), `SecurityConfig.java`,
`application.yml`, `pom.xml`.

### B.2 `src/components/demo/` — vì sao đặt ngoài thư mục trang

Năm file dùng chung cho **cả hai** trang demo, không nhét vào `app/translate` hay
`app/video` được vì bên kia phải import chéo:

- `use-translation-socket.ts` — vòng đời WebSocket `/ws/translate` gom về một chỗ.
  Trước đây hai trang chép lại cùng đoạn code và **cùng thiếu `onerror`** (backend chết
  thì trang hỏng trong im lặng — đúng phát hiện #8 của kiểm toán). Nay có: `onerror`,
  `try/catch` quanh `JSON.parse`, toast khi rớt kết nối, khóa React ổn định bằng bộ đếm
  (không `Date.now()`), đệm frame khi socket còn `CONNECTING`, `reset()` đóng/mở lại phiên.
- `connection-badge.tsx` — ba trạng thái kết nối (chưa/đang/đã + lỗi), có `aria-live`.
- `sentence-stage.tsx` — sân khấu câu tiếng Việt (`text-4xl md:text-5xl`), công tắc tự đọc,
  nút đọc lại, hiệu ứng ShineBorder chỉ chạy khi đã có câu.
- `gloss-chips.tsx` — chip gloss có motion `layout`, % tin cậy, đổi màu theo ngưỡng 0.6/0.8.
- `state-views.tsx` — `EmptyState` (icon + câu chỉ việc phải làm tiếp) và `ErrorState`
  (`role="alert"` + nút thử lại).

**Nếu AGENT A cũng cần 4 trạng thái**: dùng lại `EmptyState`/`ErrorState` ở đây thay vì
viết bản thứ hai.

### B.3 Backend B4 — thay đổi có ảnh hưởng xuyên module

1. **`GlossRecognized` đổi chữ ký** (record public, module `analytics` lắng nghe):
   ```java
   // cũ:  (String sessionId, String gloss, double confidence, Instant at)
   // mới: (String sessionId, String gloss, double confidence, long latencyMs, Instant at)
   ```
   Ai còn `publishEvent(new GlossRecognized(...))` ở nhánh khác thì phải sửa theo.
2. **Bảng mới** (`ddl-auto: update` tự tạo, không có migration):
   `sessions`, `transcripts` (module `translation` — PLAN §3 ghi từ đầu mà chưa làm),
   `model_metrics` (module `analytics`), và cột `gloss_usages.latency_ms` (nullable —
   dòng cũ từ sprint 1 không có số đo).
3. **Endpoint mới**: `GET /api/analytics/model-metrics` (công khai, đã nằm trong luật
   `GET /api/analytics/**`) và `POST /api/analytics/model-metrics` (ghi kết quả train).
   ⚠️ `SecurityConfig` chỉ bắt buộc "đã đăng nhập" cho POST này; **quyền ADMIN được kiểm
   trong thân controller**, KHÔNG dùng `@PreAuthorize` vì controller là package-private
   nên method security của Spring sẽ bỏ qua annotation trong im lặng. Nếu muốn siết thêm
   ở tầng cấu hình, diff gợi ý:
   ```diff
   +						.requestMatchers(HttpMethod.POST, "/api/analytics/**").hasRole("ADMIN")
   ```
   (không bắt buộc — đã chặn đúng ở tầng controller và có test).
4. **Lưu lịch sử phiên**: ghi khi phiên WebSocket đóng, trên virtual thread riêng, có chờ
   tối đa 12 giây cho câu đang ghép dở — **không nằm trên hot path** của phiên dịch.

### B.4 Cảnh báo đã trả giá để biết

- **`globals.css` từng bị hoàn nguyên giữa chừng** làm mất `@keyframes shine`. Hậu quả:
  `shine-border` build được nhưng **animation im lặng không chạy** — đúng loại bẫy mà plan
  cảnh báo với Aceternity. Khi merge, kiểm tra `globals.css` còn `--animate-shine` không;
  mất thì hiệu ứng ở khung câu chết lặng, không có lỗi nào báo.
- **Hai phiên agent từng chạy song song trên cùng worktree**, một lần `git reset --hard`
  đã xóa nguyên phần nền UI. Đã cứu bằng branch `backup/agent-b-ui-foundation`
  (giữ lại tới khi merge xong cho chắc).

### B.5 Còn nợ / gợi ý cho sprint sau

- `/api/signs` chưa có tham số `limit`/`hasClip`. Trang `/video` lách bằng cách hỏi theo
  chủ đề demo (`GREETING`, `MEDICAL`, `DAILY` — kho QIPEDC nhập vào nằm ở chủ đề `TUDIEN`)
  và chỉ tải danh sách đầy đủ khi ba chủ đề đó không có clip nào. Có tham số lọc phía
  server thì bỏ được đường dự phòng này.
- Bảng `model_metrics` hiện rỗng; số liệu thật sẽ có khi AGENT C train xong (trang `/stats`
  đã có empty state nói đúng điều đó).
