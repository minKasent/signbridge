# Merge notes — Branch C, sprint 2

## C1. Viết lại `/speak`

`apps/web/src/app/speak/SpeakTool.tsx` viết lại hoàn toàn theo Plan-sprint2-ui §7.

- Trình phát clip thành phần tử chính: cột `minmax(0,1fr)` trong lưới `lg:grid-cols-[1fr_340px]`
  (trước là `w-96` = 384px cố định), khung `aspect-video` nên không giật layout.
- Thanh transport: ⏮ ⏯ ⏭, `N/M`, thanh tiến độ, tốc độ 0.5×–1.5×, nút phát lại.
- Nhãn ký hiệu đang phát ở `text-4xl` cho máy chiếu, bọc `aria-live="polite"`.
- Chip ký hiệu/chữ cái bấm được để nhảy tới đúng clip, có `motion` layout animation.
- Đủ 4 trạng thái: skeleton khi tải từ điển · lỗi có nút "Thử lại" (`role="alert"`) ·
  câu không phát được → toast + panel rỗng có gợi ý · có dữ liệu.
- Chuyển hết sang token (`bg-card`, `text-muted-foreground`, `bg-primary`, `bg-accent`),
  không còn `zinc-*` hardcode.

### Sửa một lỗi logic sẵn có
Chip sáng trước đây so bằng `current?.sign.id === entry.sign.id` → câu có **cùng một từ
lặp lại hai lần** làm sáng cả hai chip. Nay hàng đợi phát mang theo `entryIdx`/`letterIdx`
nên chỉ chip đang phát mới sáng.

### Câu mẫu được chọn bằng cách đối chiếu kho thật
Câu mẫu cũ `"Tôi bị đau bụng"` phải đánh vần `t-ô-i` và `b-ị` → 6 clip cho một câu 4 từ,
demo rất tệ. Đã dò toàn kho 3.322 ký hiệu bằng script và thay bằng 4 câu khớp trọn:

| Câu | Kết quả | Minh hoạ |
|---|---|---|
| Xin chào cô giáo | 2 clip | chào hỏi cơ bản |
| Bạn tên là gì | 2 clip | «tên là gì» là MỘT ký hiệu, không phải ba |
| Xin chào bạn Khoa | 2 clip + 4 chữ | tên riêng được đánh vần — đúng nghiệp vụ thông dịch |
| Bệnh nhân đau bụng | 2 clip | tình huống y tế |

**Ghi vào báo cáo**: từ điển quốc gia không có ký hiệu rời cho `tôi`, `cảm ơn`, `bác sĩ`,
`đau` (4 ký hiệu duy nhất còn thiếu clip trong DB). Riêng `tôi` là đặc điểm ngôn ngữ học:
VSL diễn đạt ngôi thứ nhất bằng cách **chỉ vào mình**, không có ký hiệu từ vựng.

## Sửa xuyên lãnh thổ — ĐÃ PUSH TRƯỚC KHI A/B BẮT ĐẦU

### 1. Tiêu đề tab bị lặp hậu tố (9 file `page.tsx`)
Phase 0 thêm `title.template = "%s | SignBridge"` vào `layout.tsx` nhưng 9 trang vẫn tự ghi
hậu tố → tab hiện `Phiên dịch | SignBridge | SignBridge`. Đã bỏ hậu tố khỏi cả 9 file.

**A và B**: khi thêm trang mới chỉ ghi `title: "Tên trang"`, template tự nối `| SignBridge`.

### 2. `tests/e2e/infrastructure.test.js` — test tự dọn rác
Test tạo ký hiệu `TEST_xxxxx` ("ký hiệu test") và `TEST_CLIP_xxxxx` mỗi lần chạy nhưng
**không bao giờ xóa** → DB dùng chung tích lũy **17 dòng rác**, 5 dòng còn mang clip `.webm`
giả 2KB và lọt vào `/dictionary` lẫn trang demo.

- Đã thêm `cleanupCreatedSigns()` chạy cả ở nhánh thành công lẫn nhánh ném lỗi.
- Đã xóa 17 dòng rác khỏi DB đang chạy (còn 3.322 ký hiệu, 4 chưa có clip).
- Kiểm chứng: `node tests/e2e/infrastructure.test.js` → **21 pass / 0 fail**, log
  `Dọn dẹp: xóa 2/2 ký hiệu test`.

**A**: `/dictionary` và `/admin` giờ không còn thấy dòng "ký hiệu test" nào. Nếu thấy lại
tức là ai đó chạy bản test cũ.
