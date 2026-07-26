# Báo cáo đồ án tốt nghiệp — SignBridge

Nơi soạn nội dung báo cáo. Viết bằng Markdown để bám sát code (số liệu sinh tự động,
sơ đồ sinh từ chính source), khi nộp thì chuyển sang Word/LaTeX theo mẫu của khoa.

## Cấu trúc

| File | Nội dung | Trạng thái |
|---|---|---|
| [chuong-1-gioi-thieu.md](chuong-1-gioi-thieu.md) | Bối cảnh, vấn đề, mục tiêu, phạm vi, đóng góp | Bản nháp đầy đủ |
| [chuong-2-cong-trinh-lien-quan.md](chuong-2-cong-trinh-lien-quan.md) | Khảo sát công trình trong và ngoài nước, khoảng trống | Bản nháp đầy đủ |
| [chuong-3-kien-truc.md](chuong-3-kien-truc.md) | Kiến trúc hệ thống, luồng dữ liệu, quyết định thiết kế | Bản nháp đầy đủ |
| [phu-luc-a-loi-da-bat.md](phu-luc-a-loi-da-bat.md) | 34 lỗi thật bắt được qua kiểm thử tự động + review đối kháng | Bản nháp đầy đủ |
| [data/](data/) | Số liệu **sinh tự động**, không sửa tay | Có `sentence-eval` |
| [kien-truc/](kien-truc/) | Sơ đồ C4 + module canvas **sinh từ code** | Có |

## Quy tắc bắt buộc khi viết

1. **Không bịa số.** Mọi con số phải có nguồn: hoặc do script sinh ra trong `data/`,
   hoặc trích dẫn tài liệu có ghi rõ. Chỗ chưa có số thì ghi `[CẦN SỐ LIỆU]` —
   đừng điền tạm rồi quên.
2. **Không bịa trích dẫn.** Chỗ cần nguồn ngoài mà chưa kiểm chứng thì ghi
   `[CẦN TRÍCH DẪN]`. Hội đồng hỏi nguồn một câu là lộ ngay.
3. **Số liệu sinh tự động không sửa tay.** Muốn đổi thì sửa script rồi chạy lại.

## Cách sinh lại số liệu và sơ đồ

```powershell
# Bảng đánh giá chất lượng ghép câu (chương 4)
python training/eval/sentence_eval.py

# Sơ đồ kiến trúc C4 + module canvas (chương 3)
cd apps/core; ./mvnw -B test -Dtest=ModularityTests
cp target/spring-modulith-docs/*.puml target/spring-modulith-docs/*.adoc ../../docs/report/kien-truc/
```

Sơ đồ `.puml` xem bằng plugin PlantUML của VS Code, hoặc dán vào <https://www.plantuml.com/plantuml>.

## Còn thiếu (phụ thuộc dữ liệu / khảo sát)

- Chương 4 — kết quả nhận diện (top-1/top-5, ma trận nhầm lẫn): **chờ quyền dataset**
  VSL400 hoặc Multi-VSL.
- Chương 4 — độ trễ end-to-end p50/p95: đang do nhánh B đo.
- Chương 5 — khảo sát SUS ≥10 người: làm sau khi giao diện chốt.
