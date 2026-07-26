# Rủi ro vận hành: hạn mức LLM miễn phí

> Phát hiện ngày 27/07/2026 khi chạy `training/eval/sentence_eval.py`.
> Đây là **rủi ro cho buổi bảo vệ**, không chỉ là chuyện của script đánh giá.

## Sự việc

Bộ đánh giá 30 chuỗi gloss dừng giữa chừng vì HTTP 429. Truy vấn chi tiết lỗi từ API
trả về chính xác như sau:

```json
{
  "quotaMetric": "generativelanguage.googleapis.com/generate_content_free_tier_requests",
  "quotaId":     "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
  "quotaDimensions": { "location": "global", "model": "gemini-3.6-flash" },
  "quotaValue":  "20"
}
```

Hai dữ kiện rút ra:

1. **Hạn mức gói miễn phí là 20 lượt gọi / NGÀY / mô hình** — không phải theo phút.
   Chờ bao lâu trong ngày cũng vô ích.
2. Bí danh `gemini-flash-latest` mà `application.yml` đang cấu hình hiện trỏ tới
   **`gemini-3.6-flash`**. Bí danh này do Google đổi, ứng dụng không kiểm soát được —
   nghĩa là mô hình thật sự chạy có thể đổi bất cứ lúc nào mà không báo trước.

## Vì sao nguy hiểm khi bảo vệ

Mỗi lần người ký ngắt nhịp là một lượt gọi LLM. Chạy thử vài lượt trước khi vào phòng
là đã tiêu hết phần lớn hạn mức 20 lượt của ngày hôm đó. Khi cạn, `SentenceComposer`
rơi xuống lớp phòng thủ thứ ba — ghép thẳng nghĩa tiếng Việt của từng gloss:

> `TOI / MUON / KHAM_BENH` → "Tôi muốn khám bệnh" *(có LLM)*
> `TOI / MUON / KHAM_BENH` → "Tôi muốn khám bệnh." *(ghép dự phòng — trường hợp này may mắn giống)*
> `TOI / SOT / MUON / KHAM_BENH` → "Tôi sốt muốn khám bệnh." *(ghép dự phòng — thiếu hư từ, lộ ngay)*

Hệ thống **không chết** (đó là điểm mạnh của thiết kế ba lớp), nhưng đúng cái phần
"LLM ghép câu tự nhiên" — một trong ba đóng góp chính của đồ án — lại không chứng minh
được trước hội đồng.

## Biện pháp giảm thiểu

| # | Biện pháp | Trạng thái |
|---|---|---|
| 1 | **Mồi sẵn cache**: nạp sẵn các cặp `chuỗi gloss → câu` đã sinh vào cache của `SentenceComposer` lúc khởi động. Chuỗi gloss dùng khi demo sẽ KHÔNG gọi API lần nào. | Chưa làm — thuộc module `translation`, làm ở bước tích hợp C7 |
| 2 | **Giọng đọc sinh sẵn**: đã có. `tools/tts/pregenerate_tts.py` sinh mp3 cho các câu demo, nên khâu TTS không phụ thuộc mạng lẫn hạn mức. | ✅ Đã làm |
| 3 | Đổi sang mô hình có hạn mức miễn phí cao hơn, hoặc ghim phiên bản mô hình cụ thể thay vì bí danh `-latest` | Cần thử — mỗi lần thử tốn quota |
| 4 | Dùng khoá API trả phí trong ngày bảo vệ | Quyết định của người làm đồ án |

**Ưu tiên số 1**. Cache mồi vừa khử rủi ro hạn mức, vừa khử luôn độ trễ mạng ~2,9 giây
mỗi câu (số đo trong `sentence-eval.md`) — trên máy chiếu, 2,9 giây im lặng là rất lâu.

## Ảnh hưởng tới bộ đánh giá

`training/eval/sentence_eval.py` đã được sửa để sống chung với hạn mức này:

- Ghi kết quả **ngay sau mỗi ca**, không đợi chạy xong (lần chạy trước mất trắng 10 ca
  đã gọi API vì tiến trình bị dừng trước khi ghi file).
- **Chạy tiếp được**: nạp lại `sentence-eval.json` và chỉ làm những ca còn thiếu, nên
  chạy rải qua nhiều ngày vẫn cộng dồn được.
- Nhận biết 429-theo-ngày để **dừng ngay** thay vì thử lại 6 lần (trước đây mỗi ca đốt
  5 phút chờ vô nghĩa).
- Bước LLM chấm chuyển thành tuỳ chọn `--judge` vì nó làm **gấp đôi** số lượt gọi.

Chạy tiếp: `python training/eval/sentence_eval.py`
