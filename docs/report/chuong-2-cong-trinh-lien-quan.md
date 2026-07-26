# Chương 2 — Công trình liên quan

Chương này khảo sát các công trình mà đồ án đã thực sự tiếp cận và thẩm định khi xây dựng
SignBridge, mỗi công trình kèm ba phần: nội dung, phần dùng lại được, và hạn chế. Nguồn
kiểm chứng ghi theo dạng `đường-dẫn:dòng`; chỗ chưa kiểm chứng được thì đánh dấu
`[CẦN TRÍCH DẪN]` hoặc `[CẦN SỐ LIỆU]` thay vì điền số tạm.

---

## 2.1 Bộ dữ liệu ngôn ngữ ký hiệu tiếng Việt

Rào cản lớn nhất không nằm ở mô hình mà ở dữ liệu: đồ án khảo sát bốn nguồn, trong đó hai
nguồn quy mô lớn đều đang bị hạn chế quyền truy cập.

### 2.1.1 Multi-VSL (WACV 2025)

Multi-VSL là bộ dữ liệu nhận dạng ký hiệu quy mô lớn, đa góc quay, công bố tại WACV 2025 với
nhan đề *"Sign Language Recognition: A Large-Scale Multi-View Dataset and Comprehensive
Evaluation"*. Nhóm tác giả thuộc Trường Đại học Bách khoa Hà Nội (SoICT–HUST); tác giả liên
hệ là PGS.TS. Nguyễn Phi Lê, tác giả thứ nhất là Đinh Nguyễn Sơn
(`docs/EMAIL-MULTIVSL.md:3-6,16-17,26-27`). Danh sách tác giả đầy đủ và thông tin kỷ yếu:
`[CẦN TRÍCH DẪN]`. Theo khảo sát của đồ án, bộ dữ liệu gồm 1.000 gloss, 30 người ký, khoảng
84.000 video, 3 góc quay (`PLAN.md:103`); kho mã công khai là
`github.com/Etdihatthoc/Multi-VSL_WACV_2025`.

**Dùng được gì.** Đây là lựa chọn dữ liệu chính trong kế hoạch: tập con 200 nhãn, view chính
diện, dùng nguyên bộ split `train/val/test_1_200_center_ord1.csv` (khoảng 5.900 video) để
giữ tính so sánh với bài báo gốc (`docs/EMAIL-MULTIVSL.md:32-33`). Đáng chú ý về mặt đóng
góp: baseline chính thức của bài báo chạy trực tiếp trên video (ví dụ I3D), **không** phải
trên landmark, nên dựng baseline landmark trên Multi-VSL 200 là đóng góp riêng của đồ án
(`PLAN.md:103`). Số liệu accuracy của baseline gốc: `[CẦN SỐ LIỆU]`.

**Hạn chế.** Thư mục Google Drive công khai dẫn từ README chỉ chứa bản demo, ước tính khoảng
1% số video được tham chiếu trong các file split (`docs/EMAIL-MULTIVSL.md:30-31,59-60`). Kho
mã không có file LICENSE nên tình trạng pháp lý khi dùng lại không rõ ràng
(`training/README.md:32`). Kênh xin dữ liệu qua GitHub issue đã bị bỏ ngỏ 14 tháng với 5
lượt hỏi không được trả lời, buộc đồ án chuyển sang email trực tiếp
(`docs/EMAIL-MULTIVSL.md:8-12`). Cuối cùng, nhãn là số (0–198) và đồ án chưa có ánh xạ sang
từ tiếng Việt — câu hỏi đã gửi kèm thư xin dữ liệu (`docs/EMAIL-MULTIVSL.md:37,64`). Với hệ
thống cần hiển thị chữ và ghép câu tiếng Việt, thiếu ánh xạ là hạn chế nghiêm trọng.

### 2.1.2 VSL400

VSL400 là bộ dữ liệu đa góc quay cho nhận dạng ký hiệu tiếng Việt ở mức từ, nhan đề
*"VSL400: A Multi-view Dataset for Vietnamese Word-Level Sign Language Recognition"*,
DOI `10.22541/au.177075292.21810740`, dữ liệu trên Zenodo record `17943574`, giấy phép
CC-BY-4.0 ở chế độ *restricted* (`training/vsl400/README.md:3-6`). Bài báo mô tả 24.753 lượt
ký × 3 góc quay, 400 gloss, 28 người ký (`training/vsl400/README.md:6`; `PLAN.md:161`). Danh
sách tác giả và nơi công bố: `[CẦN TRÍCH DẪN]`.

**Dùng được gì.** Kho mã đã lưu phần manifest công khai, lấy qua bên thứ ba đã được cấp
quyền (`github.com/Wbao176/Vietnamese_Sign_Language_Project`): `label_map.json` với đúng 400
gloss tiếng Việt ánh xạ id 0–399, và ba file split với 17.104 / 2.885 / 4.764 bản ghi (đếm
dòng, không kể tiêu đề), trường gồm `video_id, signer_id, fps, resolution, gloss,
num_frames, length_seconds`. Ưu thế quyết định so với Multi-VSL là **có sẵn tên gloss tiếng
Việt**, nối thẳng được vào module `dictionary` và vào prompt ghép câu mà không phải xin thêm
bảng ánh xạ (`training/vsl400/README.md:19-20`).

**Hạn chế.** Đồ án mới gửi yêu cầu cấp quyền, hiện chỉ có metadata. Split công khai **không**
signer-independent: kiểm chứng trực tiếp trên ba file CSV cho thấy toàn bộ 26 mã người ký
xuất hiện ở cả ba tập, dùng nguyên split thì accuracy sẽ lạc quan giả tạo
(`training/vsl400/README.md:13-17`). Tồn tại một mâu thuẫn chưa giải quyết: bài báo mô tả 28
người ký nhưng manifest chỉ chứa 26 mã phân biệt (dải 001–028, khuyết 005 và 017) — số người
ký thật: `[CẦN SỐ LIỆU]`, phải xác nhận sau khi được cấp quyền.

### 2.1.3 VOYA_VSL

VOYA_VSL (HuggingFace `Kateht/VOYA_VSL`, giấy phép MIT) gồm 161 lớp ký hiệu tiếng Việt, mỗi
lớp là một file `.npz` chứa mảng `(1001, 60, 1605)`: 1.000 mẫu tăng cường cộng đúng 1 mẫu
gốc (`training/preprocess/voya_to_npy.py:1-7`; `training/README.md:33`). Bố cục 1.605 chiều
đã được kiểm chứng thực nghiệm là `[pose 25 điểm | tay trái 21 | tay phải 21 | mặt 468] ×
(x, y, z)`, từ đó cắt về đúng vector 144 chiều của SignBridge bằng
`concat(seq[:, 75:201], seq[:, 33:51])` (`voya_to_npy.py:9-11,33-41`).

**Dùng được gì.** Đây là nguồn duy nhất **tải được ngay, không cần xin quyền**, nên dùng để
**tiền huấn luyện** encoder — học "ngôn ngữ chung của chuyển động tay" — rồi nạp lại bằng
`--init-from` khi có dữ liệu thật, bỏ đầu phân loại vì khác số lớp
(`training/experiments/exp03_voya_pretrain.ipynb`).

**Hạn chế.** Mỗi lớp bắt nguồn từ **đúng một video từ điển QIPEDC**, tức một người ký; 1.000
mẫu còn lại chỉ là biến thể tăng cường của cùng gốc đó. Bộ dữ liệu vì vậy **không có giá trị
đo tổng quát hóa** và không được dùng làm tập đánh giá chính (`voya_to_npy.py:5-7`). Chiều z
của pose lại theo thang legacy Holistic (hip-scale) khác MediaPipe Tasks mà hệ thống dùng
khi chạy thật, gây lệch phân bố nhỏ ở 6 chiều z của pose (`voya_to_npy.py:12-14`). Kết quả
tiền huấn luyện: notebook `exp03` chưa lưu ô kết quả nào, nên `[CẦN SỐ LIỆU]`.

### 2.1.4 QIPEDC và bản mirror SignConnect

QIPEDC (`qipedc.moet.gov.vn`) là từ điển ngôn ngữ ký hiệu quốc gia thuộc dự án của Bộ Giáo
dục và Đào tạo phối hợp Ngân hàng Thế giới; bản mirror dùng trong đồ án là dataset
HuggingFace `Lakeserl/SignConnect` với 4.362 video
(`training/preprocess/import_signconnect.py:1-5`). Hậu tố `B`/`N`/`T` trong tên file đánh
dấu biến thể vùng miền Bắc/Nam/Trung; script import ưu tiên biến thể Bắc, rồi bản không hậu
tố, rồi Nam, rồi Trung (`import_signconnect.py:5,115-117`).

**Dùng được gì.** Đây là vật liệu cho **chiều ngược** (tiếng Việt → ký hiệu). Script gom nhãn
theo từ, sinh gloss ASCII duy nhất và nạp qua đúng API thật của backend; kết quả kiểm chứng
trên đĩa là **3.318 clip `.mp4`** trong `storage/clips` (đếm trực tiếp; commit `17e0664` ghi
"~3.300 từ"). Bộ từ vựng khởi đầu thủ công gồm 30 mục kèm nghĩa tiếng Việt và chủ đề
(`import_signconnect.py:24-55`).

**Hạn chế.** Mỗi từ chỉ có một clip mẫu, không có biến thiên người ký, nên kho này **không
dùng làm dữ liệu huấn luyện nhận dạng** được — nó là tài nguyên phát lại, và gián tiếp là
nguồn gốc của VOYA_VSL. Đây cũng là từ điển ở mức **từ rời**, không có câu liên tục. Quan
trọng hơn, kho từ điển quốc gia thiếu ký hiệu rời cho nhiều từ rất thông dụng: "hôm nay",
"ngày mai", "hôm qua", "cảm ơn", "bác sĩ" (commit `17e0664`); riêng "tôi" không có ký hiệu
từ vựng vì VSL diễn đạt ngôi thứ nhất bằng động tác chỉ vào mình
(`apps/web/src/app/speak/SpeakTool.tsx:58-61`). Phát hiện này là lý do phải bổ sung nhánh
đánh vần bằng bảng chữ cái ngón tay. Điều khoản sử dụng lại của QIPEDC/SignConnect chưa được
xác minh: `[CẦN TRÍCH DẪN]`.

---

## 2.2 Phương pháp nhận dạng ký hiệu

Đồ án khảo sát ba hướng và chốt một hướng, lý do loại trừ ghi ngay trong mã nguồn
(`training/model/model.py:3-6`; `training/README.md:39`).

**SPOTER** (`github.com/matyasbohacek/spoter`, Apache-2.0) là kiến trúc Transformer trên
pose đơn giản nhất để khởi đầu, được lấy làm mốc tham chiếu (`training/README.md:34`). Thông
tin bài báo gốc của SPOTER (tác giả, hội nghị, năm): `[CẦN TRÍCH DẪN]`.

**Giải pháp hạng nhất cuộc thi Kaggle GISLR** (Google Isolated Sign Language Recognition,
`github.com/hoyso48/Google---Isolated-Sign-Language-Recognition-1st-place-solution`) dùng
kiến trúc lai 1D-CNN + Transformer, được đặt làm đích nâng cấp của mô hình chính
(`training/README.md:35`); kinh nghiệm từ giải pháp này cũng là lý do đồ án dùng vector gồm
cả hai tay **và** thân trên thay vì chỉ hai tay (`PLAN.md:254`).

**Mạng nơ-ron đồ thị (GCN/ST-GCN)** bị loại có chủ đích: phức tạp hơn nhiều trong khi lợi
ích được đánh giá là nhỏ ở quy mô 100–200 gloss (`model.py:5-6`). Kết luận: Transformer trên
landmark là điểm cân bằng accuracy/độ phức tạp tốt nhất cho quy mô đồ án.

Về **suy luận thời gian thực**, kế hoạch dựa trên một công thức đã công bố (arXiv
`2302.07693`): cửa sổ trượt 16–32 frame, stride 2–4, huấn luyện thêm lớp nền `NO_SIGN`,
ngưỡng softmax khoảng 0,7, bỏ phiếu N cửa sổ liên tiếp trước khi chốt gloss (`PLAN.md:117`;
`training/README.md:41-42`). Nhan đề và tác giả tài liệu này chưa được ghi lại trong kho mã:
`[CẦN TRÍCH DẪN]`.

Cần nói rõ một điểm trung thực: **cài đặt thật lệch khỏi công thức tham chiếu**. Mã hiện tại
dùng cửa sổ 32 frame nhưng stride 8 (`LandmarkWebSocketHandler.java:40-41`), ngưỡng tin cậy
0,6 (`TranslationService.java:35`), và **chưa có** cơ chế bỏ phiếu nhiều cửa sổ trên đường
chạy thật — mới chỉ chặn lặp gloss liền kề, còn bỏ phiếu đa số hiện chỉ tồn tại trong hàm
đánh giá streaming lúc huấn luyện ngoại tuyến. Ảnh hưởng của độ lệch này lên accuracy:
`[CẦN SỐ LIỆU]` (chưa có mô hình thật để đo).

---

## 2.3 Sinh câu tiếng Việt từ chuỗi gloss

Ngữ pháp VSL khác ngữ pháp tiếng Việt nói: thiếu hư từ, trật tự từ khác. Bước chuyển chuỗi
gloss thành câu vì vậy là một bài toán xử lý ngôn ngữ thực sự chứ không phải phần trang trí
(`translation/SentenceComposer.java:24-26`). Tiền lệ được đồ án dựa vào là **Spotter+GPT**
(arXiv `2403.10434`): dùng mô hình ngôn ngữ lớn với prompt few-shot, **không** fine-tune
(`SentenceComposer.java:25-26`; `PLAN.md:93`). Nhan đề đầy đủ, tác giả và nơi công bố:
`[CẦN TRÍCH DẪN]`.

**Dùng được gì.** SignBridge áp dụng đúng nguyên tắc đó: prompt hệ thống chứa 6 ví dụ mẫu,
gọi Gemini `gemini-flash-latest` ở nhiệt độ 0,2, kèm ba lớp phòng thủ (cache LRU 200 mục
theo chuỗi gloss → gọi LLM → ghép nghĩa tiếng Việt từ từ điển khi mất mạng hoặc thiếu khóa).
Lý do không fine-tune ở quy mô đồ án còn nằm ở chỗ chưa tiếp cận được corpus song song
gloss ↔ câu tiếng Việt nào; bằng chứng về sự tồn tại của corpus như vậy: `[CẦN TRÍCH DẪN]`.

**Kết quả đo được.** Bộ đánh giá tự động (`training/eval/sentence_eval.py`, gọi API thật)
trên các ca đã chạy xong cho: phủ nội dung 4/4 (100%), không bịa thêm 3/4 (75%), đúng dạng
một câu 4/4 (100%); độ trễ gọi LLM trung vị 2.920 ms, nhỏ nhất 2.432 ms, lớn nhất 3.433 ms
(`docs/report/data/sentence-eval.md`). Ca chưa đạt là `XIN_LOI / TOI / DI` → "Xin lỗi, tôi
đi đây.", mô hình thêm từ "đây" ngoài chuỗi gloss — đúng kiểu lỗi mà hệ thống hỗ trợ giao
tiếp không được phép mắc.

**Hạn chế phải nói thẳng.** Thứ nhất, cỡ mẫu quá nhỏ để có ý nghĩa thống kê: bộ kiểm thử
`training/eval/gloss_sequences.json` hiện chứa 30 chuỗi gloss, nhưng bản báo cáo sinh tự
động mới nêu 6 chuỗi và **chỉ chạy xong 4/6 ca** vì hết hạn mức miễn phí
(`docs/report/data/sentence-eval.md:5-6`). Hai con số này đang lệch nhau, nên cỡ mẫu chính
thức của chương đánh giá: `[CẦN SỐ LIỆU]` — phải đọc lại sau khi chạy hết script. Thứ hai,
việc chấm Likert độc lập bởi ≥3 người vẫn chưa thực hiện (`Plan-sprint2-ui.md:266`;
`docs/report/data/phieu-cham.csv` mới ở dạng phiếu trống). Thứ ba, có một rủi ro vận hành
đã được ghi nhận bằng chứng cứ từ chính API: gói miễn phí giới hạn **20 lượt gọi mỗi ngày
cho mỗi mô hình** (`quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`), và bí danh
`gemini-flash-latest` mà hệ thống cấu hình hiện trỏ tới `gemini-3.6-flash` — tức mô hình
thật sự chạy có thể đổi bất cứ lúc nào ngoài tầm kiểm soát của ứng dụng
(`docs/report/data/rui-ro-quota-llm.md`). Đây là điểm phải nêu khi so sánh với Spotter+GPT:
tiền lệ đó dùng LLM thương mại, còn đồ án phụ thuộc vào một hạn mức miễn phí rất chặt.

---

## 2.4 Sản phẩm thương mại và cộng đồng

Kho mã của đồ án chỉ chứng thực được **một** sản phẩm đang vận hành thật: **từ điển QIPEDC
của Bộ Giáo dục và Đào tạo** (mục 2.1.4) — sản phẩm cộng đồng cấp quốc gia, nhưng về bản
chất là **tra cứu từ điển một chiều**: người dùng gõ từ để xem clip; hệ thống không nhận
dạng, không dịch, không hoạt động thời gian thực.

Kế hoạch có nêu tên **Signvrse / Imagine Cup** như một đối tượng cần khảo sát trong chương
này (`Plan-sprint2-ui.md:269`), nhưng kho mã **không chứa bất kỳ dữ kiện kiểm chứng được
nào** về sản phẩm đó — không có tên nhóm, năm, quy mô từ vựng hay số liệu hiệu năng. Toàn bộ
phần mô tả sản phẩm này: `[CẦN TRÍCH DẪN]`. Tương tự, các sản phẩm thương mại quốc tế cùng
lĩnh vực chưa được khảo sát có hệ thống: `[CẦN TRÍCH DẪN]`.

Một ghi nhận kỹ thuật có bằng chứng: ở hướng sinh chuyển động bằng avatar 3D, đồ án kết luận
**chưa có giải pháp web mã nguồn mở sẵn dùng**, nên avatar bị xếp vào phần mở rộng rồi loại
khỏi phạm vi, thay bằng phát lại clip từ điển (`PLAN.md:257`; `Plan-sprint2-ui.md:38`).

---

## 2.5 Khoảng trống mà đồ án lấp vào

**Thứ nhất, khoảng trống hệ thống chứ không phải khoảng trống mô hình.** Multi-VSL và VSL400
dừng ở mức bộ dữ liệu và baseline nhận dạng từ rời; QIPEDC dừng ở tra cứu. Chưa công trình
nào trong số đã khảo sát cung cấp một **hệ thống hai chiều, thời gian thực, đầu-cuối** từ
webcam tới câu tiếng Việt phát thành tiếng và ngược lại — đóng góp chính của SignBridge nằm
ở tầng hệ thống này (`PLAN.md:13`).

**Thứ hai, baseline landmark trên Multi-VSL** (mục 2.1.1) là đóng góp riêng đã lên kế hoạch
nhưng **chưa thực hiện được** vì còn chờ dữ liệu.

**Thứ ba, tầng gloss → câu tiếng Việt.** Các bộ dữ liệu chỉ trả về nhãn từ rời; khoảng cách
từ chuỗi nhãn tới câu tiếng Việt tự nhiên chưa được các công trình khảo sát xử lý cho tiếng
Việt. SignBridge lấp bằng tiền lệ Spotter+GPT, đã có số liệu đo thật nhưng trên bộ kiểm thử
rất nhỏ (mục 2.3).

**Thứ tư, chiều ngược có xử lý từ ngoài từ điển** (mục 2.1.4): kết hợp khớp cụm dài nhất với
đánh vần bằng bảng chữ cái ngón tay, đồng thời báo trung thực những từ không dịch được thay
vì im lặng bỏ qua.

**Giới hạn phải nêu rõ để không thổi phồng.** (1) Phạm vi là nhận dạng ký hiệu **rời**; đồ án
không giải bài toán ký hiệu liên tục không ngắt (`PLAN.md:18,21`). (2) Tại thời điểm viết
chương này **chưa có mô hình ONNX thật**: `apps/ml/` chỉ có `README.md`, `app/`,
`requirements.txt`, không có `model/`, nên dịch vụ suy luận đang chạy chế độ stub; toàn bộ
số liệu top-1/top-5, recall của lớp `NO_SIGN` và độ trễ đầu-cuối: `[CẦN SỐ LIỆU]`. (3) Vì cả
Multi-VSL lẫn VSL400 đều chờ cấp quyền, "đóng góp baseline landmark" hiện là **cam kết chưa
được kiểm chứng bằng thực nghiệm** và phải được trình bày đúng như vậy.
