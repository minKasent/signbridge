# Chương 1 — GIỚI THIỆU

## 1.1. Bối cảnh

Cộng đồng người Điếc tại Việt Nam sử dụng ngôn ngữ ký hiệu Việt Nam (Vietnamese Sign
Language — VSL) làm phương tiện giao tiếp tự nhiên hằng ngày. Quy mô dân số người Điếc và
số thông dịch viên được đào tạo chính quy trên cả nước là những con số quyết định tính cấp
thiết của đề tài; đồ án chưa truy được nguồn thống kê chính thức nên để [CẦN TRÍCH DẪN]
thay vì điền một con số phỏng đoán.

Điểm cần làm rõ ngay từ đầu — và cũng là điểm bị hiểu sai phổ biến nhất — là VSL **không
phải tiếng Việt được "ký hiệu hoá"**. Đây là một ngôn ngữ độc lập, có từ vựng riêng và hệ
thống ngữ pháp riêng, không phải phép ánh xạ một-đối-một từ tiếng Việt sang cử chỉ tay
[CẦN TRÍCH DẪN — tài liệu ngôn ngữ học về VSL]. Quá trình xây dựng hệ thống đã va phải
chính đặc điểm đó ở ba tình huống cụ thể, đều có bằng chứng trong mã nguồn và dữ liệu của
dự án:

**Thứ nhất, VSL lược bỏ hư từ.** Chuỗi ký hiệu người Điếc thực hiện không chứa các hư từ
mà tiếng Việt nói bắt buộc phải có (là, bị, được, ạ...), và trật tự thành phần câu cũng
khác. Đây là lý do hệ thống phải có một bước xử lý ngôn ngữ thật sự chứ không thể ghép
chuỗi nhãn lại là xong; nhận định này được ghi thẳng vào thiết kế lớp ghép câu
(`translation/SentenceComposer.java`, dòng 24-26), và luật đầu tiên trong prompt gửi cho
mô hình ngôn ngữ chính là "thêm hư từ cho đúng ngữ pháp" (cùng tệp, dòng 43).

**Thứ hai, ranh giới từ giữa hai ngôn ngữ không trùng nhau.** Cụm ba tiếng "tên là gì"
trong tiếng Việt tương ứng với đúng **một** ký hiệu VSL trong từ điển quốc gia, chứ không
phải ba ký hiệu ghép lại (mục `TEN_LA_GI` → nhãn "tên là gì", video `W03129N.mp4` —
`training/preprocess/import_signconnect.py`, dòng 49; đối chiếu
`docs/merge-notes/branch-c-sprint2.md`, dòng 29 và
`apps/web/src/app/speak/SpeakTool.tsx`, dòng 65). Tương tự, "đau bụng" là một ký
hiệu nguyên khối chứ không phải "đau" cộng "bụng". Chính vì vậy thuật toán dịch chiều
ngược của hệ thống phải khớp cụm dài nhất trước (`dictionary/SignComposer.java`, dòng
17-21) thay vì tách từng từ.

**Thứ ba, có những khái niệm VSL diễn đạt bằng cơ chế phi từ vựng.** Ngôi thứ nhất "tôi"
trong VSL được thể hiện bằng động tác **chỉ vào chính mình** chứ không bằng một ký hiệu từ
vựng riêng [CẦN TRÍCH DẪN — tài liệu ngôn ngữ học về VSL]. Bằng chứng mà đồ án tự kiểm
được chỉ ở mức dữ liệu: khi đối chiếu câu mẫu trình diễn với kho ký hiệu thật, mục `TOI`
nằm trong số ít mục chưa có clip trong cơ sở dữ liệu của đồ án
(`docs/merge-notes/branch-c-sprint2.md`, dòng 33-35; `apps/web/src/app/speak/SpeakTool.tsx`,
dòng 59-61), và bộ từ vựng khởi đầu nhập từ kho quốc gia cũng không có mục rời cho "tôi" —
chỉ có cụm `TOI_YEU_BAN` (`training/preprocess/import_signconnect.py`, dòng 24-55). Quan
sát này *phù hợp với* đặc điểm ngôn ngữ học nêu trên nhưng chưa đủ để chứng minh nó: cũng
không loại trừ khả năng kho dữ liệu đơn giản là còn thiếu. Hai ghi chú nội bộ nói trên còn
chưa thống nhất từ thứ tư trong danh sách thiếu clip ("đau" so với "hôm nay"), cần rà lại
trước khi đưa vào bản nộp.

Ba tình huống trên cho thấy bài toán không thể quy về "nhận dạng cử chỉ rồi tra bảng": mọi
khâu, từ định nghĩa nhãn đến cách ghép câu, đều phải tôn trọng việc VSL là một ngôn ngữ
riêng.

## 1.2. Phát biểu bài toán

Dịch VSL sang tiếng Việt khó hơn nhận dạng cử chỉ đơn thuần ở ít nhất bốn khía cạnh.

**(a) Dòng ký hiệu liên tục không có ranh giới từ.** Camera cho ra một chuỗi khung hình
không ngắt quãng; hệ thống phải tự quyết định đoạn nào là một ký hiệu, đoạn nào là chuyển
tiếp, đoạn nào là tay nghỉ — khác hẳn phân loại một đoạn video đã cắt sẵn. Hệ thống giải
quyết bằng cửa sổ trượt 32 khung hình, bước nhảy 8 khung hình
(`translation/LandmarkWebSocketHandler.java`, dòng 40-41) cộng một lớp nhãn nền `NO_SIGN`
được huấn luyện tường minh; ba cửa sổ liên tiếp không có ký hiệu thì coi như người ký đã
kết thúc câu (`translation/TranslationService.java`, dòng 34-41).

**(b) Kết quả nhận diện thô chưa phải là câu.** Đầu ra của mô hình là một chuỗi nhãn gloss
viết hoa không dấu, ví dụ `BAC_SI / XIN_CHAO / TOI / DAU / KHAM_BENH`. Để thành câu tiếng
Việt tự nhiên còn phải thêm hư từ, sắp lại trật tự và chọn dấu câu — một bước phụ thuộc
ngữ cảnh toàn câu, không xử lý được ở mức từng nhãn rời.

**(c) Biến thể vùng miền.** Cùng một khái niệm có thể có nhiều ký hiệu khác nhau theo
vùng. Bằng chứng nằm ngay trong cấu trúc kho từ điển quốc gia mà đồ án sử dụng: tên tệp
video mang hậu tố `B`, `N`, `T` tương ứng biến thể miền Bắc, miền Nam, miền Trung
(`training/preprocess/import_signconnect.py`, dòng 5 và hàm `preference` dòng 115-117).
Ở nhánh nhập toàn kho (tuỳ chọn `--all`, dòng 141-145), đồ án chọn cố định một biến thể
theo thứ tự ưu tiên B > không hậu tố > N > T; riêng bộ từ vựng khởi đầu 30 mục được chọn
tay và gán cứng tên tệp (dòng 24-55) nên không đi qua quy tắc này — ví dụ `TEN_LA_GI` dùng
`W03129N.mp4`, tức biến thể miền Nam. Xử lý đa biến thể là hướng mở rộng, không nằm trong
phạm vi.

**(d) Khoảng cách giữa môi trường huấn luyện và môi trường chạy thật.** Trình duyệt người
dùng và máy trích đặc trưng lúc huấn luyện phải cho ra cùng một phân bố dữ liệu; nếu lệch,
mô hình rớt độ chính xác âm thầm, không có thông báo lỗi nào. Đồ án ràng buộc điều này
bằng một vector đặc trưng 144 chiều định nghĩa thống nhất ở cả bốn tầng
(`apps/web/src/lib/landmarks.ts` dòng 15, `training/model/dataset.py`, `apps/ml/app/main.py`
dòng 21, `LandmarkWebSocketHandler.java` dòng 42) và nhịp trích đặc trưng ghim cứng ở 25
khung hình/giây (`apps/web/src/lib/useVisionPipeline.ts`, dòng 23-24).

## 1.3. Mục tiêu và phạm vi

**Hệ thống CÓ làm:**

- Nhận diện ký hiệu rời (isolated sign) thời gian thực từ webcam, bộ từ vựng quy mô đồ án
  (mục tiêu 100-200 gloss, ưu tiên chủ đề y tế).
- Ghép chuỗi gloss thành một câu tiếng Việt tự nhiên khi người ký ngắt nhịp, hiển thị văn
  bản và đọc thành tiếng.
- Chiều ngược lại: người nghe gõ hoặc nói tiếng Việt, hệ thống khớp từ điển và phát lần
  lượt clip ký hiệu quay sẵn; từ không có trong từ điển thì đánh vần bằng bảng chữ cái
  ngón tay và báo trung thực từ nào không dịch được.
- Công cụ quản trị từ điển (thêm, sửa, xoá ký hiệu; quay clip bù cho từ còn thiếu) và
  thống kê sử dụng. Riêng đường **thu mẫu huấn luyện tự quay** đã dừng: API phía backend
  (module `dataset`) vẫn giữ, nhưng giao diện `/collect` đã rút gọn thành trang thông báo
  (`apps/web/src/app/collect/CollectTool.tsx` dòng 7 và 13-16).

**Hệ thống KHÔNG làm (ghi rõ để giới hạn kỳ vọng khi bảo vệ):**

- Không sinh chuyển động **avatar 3D** bằng AI — chiều ngược chỉ phát lại clip có sẵn.
- Không nhận diện **biểu cảm khuôn mặt** và các thành tố phi thủ công khác (hướng nhìn,
  chuyển động thân), dù đây là thành phần ngữ pháp thật sự của VSL: vector đặc trưng chỉ
  gồm hai bàn tay và sáu điểm thân trên (vai, khuỷu, cổ tay).
- Không phủ **toàn bộ từ vựng VSL** — từ điển tra cứu và chiều ngược dùng được kho lớn,
  nhưng mô hình nhận diện chỉ học một tập con.
- Không nhận diện **câu ký hiệu liên tục không ngắt nhịp** (continuous signing) — bài toán
  nghiên cứu mở, nêu ở phần hạn chế.

## 1.4. Đóng góp của đồ án

1. **Hệ thống hai chiều chạy được đầu-cuối.** Mười trang giao diện trong
   `apps/web/src/app/` (`/translate`, `/speak`, `/video`, `/dictionary`, `/record`,
   `/admin`, `/stats`...) phủ cả chiều ký hiệu → tiếng nói lẫn chiều tiếng Việt → ký hiệu.
   Trong số đó `/collect` chỉ còn là route giữ lại để không hỏng liên kết cũ, không còn
   là một chức năng đang chạy.

2. **Lớp chuyển gloss → câu tiếng Việt có ba tầng phòng thủ và có số liệu đánh giá.**
   `SentenceComposer.java` dùng prompt few-shot theo tiền lệ Spotter+GPT (arXiv 2403.10434)
   [CẦN TRÍCH DẪN — tên tác giả, năm và nơi công bố của arXiv 2403.10434; trong kho mã,
   mã số này mới chỉ xuất hiện ở hai ghi chú do chính người làm đồ án viết:
   `SentenceComposer.java` dòng 24-26 và `PLAN.md` dòng 93], xếp tầng cache →
   mô hình ngôn ngữ → ghép dự phòng từ nghĩa trong từ điển. Kết quả đánh giá sinh tự động
   ở `docs/report/data/sentence-eval.md`: phủ nội dung 4/4, không bịa thêm 3/4, đúng dạng
   một câu 4/4, độ trễ gọi trung vị 2.920 ms. Lưu ý trung thực: bộ ca thử
   `training/eval/gloss_sequences.json` hiện có **30 chuỗi gloss**, mới chạy được **4 ca**
   thì cạn hạn mức miễn phí của mô hình ngôn ngữ, nên các tỉ lệ trên tính trên **4/30 ca**
   đã chạy — đây là phép đo dở dang, sẽ cập nhật ở Chương 4 sau khi chạy hết bộ. (Bảng
   trong `sentence-eval.md` hiện ghi tổng số ca là 6 vì được sinh bởi một lượt chạy có
   `--limit 6`; tuỳ chọn này khai báo ở `training/eval/sentence_eval.py` dòng 277 và cắt
   danh sách ca ở dòng 287-289.)

3. **Kiến trúc modular monolith có ranh giới được kiểm chứng bằng máy.** Năm module
   (`identity`, `dictionary`, `translation`, `dataset`, `analytics`) khai báo bằng
   `package-info.java`; bài kiểm thử `ModularityTests.java` thất bại nếu có import chéo
   package nội bộ (dòng 16-19), đồng thời tự sinh 12 tệp sơ đồ C4 và module canvas vào
   `apps/core/target/spring-modulith-docs/` (dòng 21-24). Các tệp này được chép sang
   `docs/report/kien-truc/` bằng một lệnh ghi ở `docs/report/README.md` dòng 34 để đưa vào
   báo cáo — tài liệu kiến trúc do đó được sinh từ mã nguồn chứ không vẽ tay, tuy bước chép
   là thủ công nên vẫn phải chạy lại sau mỗi lần đổi cấu trúc module.

4. **Nhập và chuẩn hoá kho từ điển ký hiệu quốc gia.** Script
   `training/preprocess/import_signconnect.py` nhập kho QIPEDC (qipedc.moet.gov.vn, dự án
   của Bộ Giáo dục và Đào tạo [CẦN TRÍCH DẪN — nguồn chính thức về dự án QIPEDC]) thông qua
   bản sao công khai `Lakeserl/SignConnect` trên HuggingFace (dòng 3-4 và hằng `HF_BASE`
   dòng 20; bản sao này công bố 4.362 video, mức độ sai khác so với bản gốc chưa kiểm
   chứng được), rồi ghi vào hệ thống qua đúng API quản trị của backend — đăng nhập lấy
   token (dòng 21 và 136), tạo ký hiệu, tải clip kèm `Bearer` token (dòng 68-81) — thay vì
   ghi thẳng vào cơ sở dữ liệu. Script có xử lý biến thể vùng miền, sinh gloss ASCII duy
   nhất và chạy lại an toàn sau khi bị ngắt. Kết quả kiểm chứng trên đĩa: **3.318 tệp
   clip `.mp4`** trong `storage/clips`.

5. **Bộ huấn luyện tách bạch ba nhóm số liệu để không tự thổi phồng kết quả.**
   `training/model/train.py` báo cáo riêng (i) top-1/top-5 trên mẫu thật, (ii) độ nhạy với
   lớp `NO_SIGN` đo trên batch cố định, (iii) top-1 chế độ streaming mô phỏng đúng cấu hình
   phục vụ thật (cửa sổ 32, bước 8, bỏ phiếu đa số). Mẫu `NO_SIGN` tổng hợp **chỉ trộn vào
   tập huấn luyện**, không trộn vào tập kiểm tra.

6. **Hồ sơ lỗi và quy trình review đối kháng.** Lỗi bắt được cùng nguyên nhân gốc và bản vá
   được ghi ở Phụ lục A, kèm bộ kiểm thử hồi quy: 7 lớp kiểm thử Java chứa 17 phương thức
   `@Test` (cùng 2 tệp cấu hình hạ tầng test không chứa `@Test` là
   `TestCoreApplication.java` và `TestcontainersConfiguration.java`), và 27 khẳng định
   kiểm thử đầu-cuối (21 ở `tests/e2e/infrastructure.test.js`,
   6 ở `tests/e2e/sentence.test.js`).

**Những gì chưa đo được, khai báo trung thực:** tại thời điểm viết chương này kho mã **chưa
có mô hình ONNX đã huấn luyện** (thư mục `apps/ml/model/` không tồn tại, không có tệp
`labels.json` nào trong repo), nên dịch vụ suy luận đang chạy ở chế độ giả lập. Do đó độ
chính xác top-1/top-5, ma trận nhầm lẫn, độ trễ đầu-cuối p50/p95 và điểm khảo sát khả dụng
SUS đều là [CẦN SỐ LIỆU], sẽ bổ sung ở Chương 4 sau khi có quyền truy cập dữ liệu. Bộ dữ
liệu VSL400 hiện mới có siêu dữ liệu công khai: `training/vsl400/label_map.json` chứa đúng
400 gloss (id 0-399) và ba tệp CSV chứa 17.104 / 2.885 / 4.764 bản ghi (tổng 24.753). Có
một mâu thuẫn phải làm rõ trước khi trích dẫn: bài báo mô tả bộ dữ liệu ghi **28 người
ký**, trong khi đếm trực tiếp trên ba tệp CSV chỉ thấy **26 mã người ký phân biệt**, và cả
26 mã đều xuất hiện ở cả ba tập — nghĩa là bản chia sẵn **không** độc lập theo người ký,
phải tự chia lại trước khi báo cáo kết quả.

## 1.5. Bố cục báo cáo

Phần còn lại của báo cáo được tổ chức như sau:

- **Chương 2 — Các công trình liên quan.** Khảo sát hướng tiếp cận nhận dạng ngôn ngữ ký
  hiệu trong và ngoài nước, các bộ dữ liệu VSL công khai, và khoảng trống đồ án nhắm vào.
- **Chương 3 — Kiến trúc hệ thống.** Kiến trúc ba tầng, năm module nghiệp vụ, luồng dữ liệu
  hai chiều, giao thức truyền landmark, và lý do đằng sau từng quyết định thiết kế.
- **Chương 4 — Mô hình và kết quả thực nghiệm.** Kiến trúc mô hình, quy trình huấn luyện,
  cách tách ba nhóm số liệu đánh giá và kết quả đo được.
- **Chương 5 — Đánh giá và thảo luận.** Đánh giá khả dụng với người dùng thật, phân tích
  hạn chế và hướng phát triển.
- **Phụ lục A — Hồ sơ lỗi đã bắt được.** Danh sách lỗi thật kèm triệu chứng, nguyên nhân
  gốc, bản vá và kiểm thử hồi quy tương ứng.
