# Đánh giá chất lượng khâu ghép câu (gloss → tiếng Việt)

> Sinh tự động bởi `training/eval/sentence_eval.py`. **Không sửa tay** — chạy lại script.

- Bộ kiểm thử: **6 chuỗi gloss** (`training/eval/gloss_sequences.json`)
- Đã chạy được: **4/6 ca**  ⚠️ chưa đủ — hết quota miễn phí, chạy lại script để làm nốt
- Mô hình: `gemini-flash-latest`, temperature 0.2
- Prompt: đọc trực tiếp từ `SentenceComposer.java` (463 ký tự) — không chép lại

## 1. Đo tự động

| Chỉ số | Kết quả | Ý nghĩa |
|---|---|---|
| Phủ nội dung | **4/4** (100%) | câu chứa đủ ý của mọi gloss |
| Không bịa thêm | **3/4** (75%) | không có danh/động từ ngoài gloss |
| Đúng dạng một câu | **4/4** (100%) | một câu, có dấu kết, không giải thích |

Độ trễ gọi LLM: trung vị **2920 ms**, nhỏ nhất 2432 ms, lớn nhất 3433 ms (đo qua Internet, đã có cache nên câu lặp lại gần như tức thì).

## 3. Phiếu người chấm

`phieu-cham.csv` đã sinh sẵn với 3 cột điểm để trống. Quy trình: ≥3 người chấm độc lập
trên thang Likert 1-5, lấy trung bình, báo cáo kèm độ đồng thuận.

## 4. Chi tiết từng ca

| # | Chuỗi gloss | Câu hệ thống sinh ra | Phủ ý | Không bịa | 1 câu |
|---|---|---|:--:|:--:|:--:|
| 1 | `XIN_CHAO / BAC_SI` | Xin chào bác sĩ. | ✓ | ✓ | ✓ |
| 2 | `XIN_CHAO / CO_GIAO` | Xin chào cô giáo. | ✓ | ✓ | ✓ |
| 3 | `CAM_ON / BAN` | Cảm ơn bạn. | ✓ | ✓ | ✓ |
| 4 | `XIN_LOI / TOI / DI` | Xin lỗi, tôi đi đây. | ✓ | ✗ | ✓ |

## 5. Ca chưa đạt — phân tích

- **#4** `XIN_LOI / TOI / DI` → “Xin lỗi, tôi đi đây.” — thêm từ ngoài gloss: *đây*
