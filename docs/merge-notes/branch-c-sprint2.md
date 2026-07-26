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

---

# PHẦN II — C3, C4 (sprint 2, đợt 2)

## C3. TTS giọng neural vi-VN sinh sẵn

- `tools/tts/pregenerate_tts.py` — sinh mp3 bằng `edge-tts` giọng `vi-VN-HoaiMyNeural`
  cho các câu demo, ghi vào `apps/web/public/tts/` kèm `manifest.json`. Đã sinh **33 câu,
  434 KB**. Tự xoá file mồ côi khi danh sách câu thay đổi.
- `apps/web/src/lib/neural-tts.ts` — `speakVietnameseNeural(text)`: tra manifest, có thì
  phát mp3, không thì lùi về `speechSynthesis` sẵn có. Không bao giờ im lặng.
- Vì sao đáng làm: nhiều máy Windows KHÔNG cài giọng vi-VN nào, và giọng trình duyệt đọc
  tiếng Việt rất máy móc. File tĩnh trong `public/` phát được **kể cả khi mất mạng**.

**Việc còn lại cho C7**: nối `speakVietnameseNeural` vào `/translate` (lãnh thổ B nên C
không tự sửa). Chỉ cần đổi lời gọi `speakVietnamese` hiện có sang hàm mới.

## C4. Bộ đánh giá chất lượng ghép câu

- `training/eval/gloss_sequences.json` — 30 chuỗi gloss chia 5 nhóm, mỗi chuỗi có câu
  tham chiếu. Nhóm E cố ý chứa gloss lặp (lỗi phổ biến nhất của cửa sổ trượt).
- `training/eval/sentence_eval.py` — đọc **thẳng `SYSTEM_PROMPT` từ `SentenceComposer.java`**
  thay vì chép lại, nên số đo luôn là số của hệ thống đang chạy. Ba lớp đo: đo tự động
  (phủ ý / không bịa / đúng dạng một câu), LLM chấm (tuỳ chọn), phiếu cho người chấm.
- Ghi ra `docs/report/data/sentence-eval.{json,md}` + `phieu-cham.csv`.

## ⚠️ Phát hiện quan trọng: hạn mức LLM miễn phí chỉ **20 lượt/ngày**

Xem đầy đủ: `docs/report/data/rui-ro-quota-llm.md`.

Tóm tắt: gói miễn phí Gemini giới hạn `GenerateRequestsPerDayPerProjectPerModel-FreeTier`
= **20 lượt/NGÀY**. Bí danh `gemini-flash-latest` hiện trỏ tới `gemini-3.6-flash`.
Nghĩa là chạy thử vài lượt trước buổi bảo vệ là hết quota, và phần "LLM ghép câu tự nhiên"
sẽ rơi xuống lớp ghép dự phòng ngay giữa buổi demo.

**Việc phải làm ở C7 (ưu tiên cao)**: mồi sẵn cache của `SentenceComposer` lúc khởi động
bằng các cặp `chuỗi gloss → câu` đã sinh trong `sentence-eval.json`. Vừa khử rủi ro hạn mức,
vừa khử độ trễ mạng ~2,9 giây mỗi câu (số đo thật). Việc này nằm trong module `translation`
= lãnh thổ B, nên để bước tích hợp làm.

## Đã áp yêu cầu của AGENT A
`src/components/ui/dialog.tsx`: nhãn nút đóng `Close` → `Đóng` (cả `sr-only` lẫn nút trong
`DialogFooter`). Đã quét toàn bộ `components/ui/` và `components/*.tsx`, không còn nhãn
trợ năng tiếng Anh nào khác.
