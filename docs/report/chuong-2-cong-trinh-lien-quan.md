# Chương 2 — Công trình liên quan

Chương này khảo sát các công trình mà đồ án đã thực sự tiếp cận, thẩm định và sử dụng
trong quá trình xây dựng SignBridge. Nguyên tắc trình bày: mỗi công trình được nêu kèm
(1) nội dung công trình, (2) phần đồ án dùng lại được, (3) hạn chế khiến đồ án không thể
dùng trọn vẹn. Mọi con số đều kèm nguồn kiểm chứng trong kho mã; chỗ nào chưa kiểm chứng
được thì đánh dấu `[CẦN TRÍCH DẪN]` hoặc `[CẦN SỐ LIỆU]` thay vì điền số tạm.

---

## 2.1 Bộ dữ liệu ngôn ngữ ký hiệu tiếng Việt

Rào cản lớn nhất của bài toán nhận dạng VSL không nằm ở mô hình mà ở dữ liệu. Đồ án đã
khảo sát bốn nguồn, trong đó hai nguồn quy mô lớn đều đang bị hạn chế quyền truy cập.

### 2.1.1 Multi-VSL (WACV 2025)

Multi-VSL là bộ dữ liệu nhận dạng ký hiệu quy mô lớn, đa góc quay, công bố tại hội nghị
WACV 2025 với nhan đề *"Sign Language Recognition: A Large-Scale Multi-View Dataset and
Comprehensive Evaluation"*. Nhóm tác giả thuộc Trường Đại học Bách khoa Hà Nội (SoICT –
HUST); tác giả liên hệ là PGS.TS. Nguyễn Phi Lê, tác giả thứ nhất là Đinh Nguyễn Sơn
(nguồn: `docs/EMAIL-MULTIVSL.md` dòng 3–6, 16–17, 26–27). Danh sách tác giả đầy đủ, số
trang và thông tin kỷ yếu: `[CẦN TRÍCH DẪN]`.

Theo ghi chép khảo sát của đồ án, bộ dữ liệu gồm 1.000 gloss, 30 người ký, khoảng 84.000
video, quay từ 3 góc (nguồn: `PLAN.md` dòng 103). Kho mã công khai của nhóm tác giả là
`github.com/Etdihatthoc/Multi-VSL_WACV_2025`, kèm các file chia tách sẵn cho tập con 200
nhãn (`data/label_1_200/`).

**Đồ án dùng được gì.** Đây là lựa chọn dữ liệu chính trong kế hoạch: tập con 200 gloss,
chỉ lấy view chính diện, dùng nguyên bộ split `train/val/test_1_200_center_ord1.csv`
(khoảng 5.900 video) để bảo đảm tính so sánh khoa học với bài báo gốc
(`docs/EMAIL-MULTIVSL.md` dòng 32–33). Một điểm đáng chú ý về mặt đóng góp: baseline chính
thức của bài báo là các mô hình chạy trực tiếp trên video (ví dụ I3D), **không** phải mô
hình trên landmark; do đó việc dựng baseline landmark trên Multi-VSL 200 là đóng góp riêng
của đồ án (`PLAN.md` dòng 103). Danh sách baseline đầy đủ và số liệu accuracy của bài báo
gốc: `[CẦN SỐ LIỆU]`.

**Hạn chế.** Thứ nhất, thư mục Google Drive công khai được dẫn từ README của kho mã chỉ
chứa bản demo, ước tính khoảng 1% số video được tham chiếu trong các file split
(`docs/EMAIL-MULTIVSL.md` dòng 30–31, 59–60; `PLAN.md` dòng 160). Thứ hai, kho mã không có
file LICENSE nên tình trạng pháp lý khi sử dụng lại không rõ ràng (`training/README.md`
dòng 32). Thứ ba, kênh xin dữ liệu qua GitHub issue đã bị bỏ ngỏ 14 tháng với 5 lượt hỏi
không được trả lời, nên đồ án phải chuyển sang liên hệ email trực tiếp
(`docs/EMAIL-MULTIVSL.md` dòng 8–12). Thứ tư, nhãn của bộ dữ liệu là nhãn số (0–198) và
đồ án chưa có ánh xạ sang từ tiếng Việt tương ứng — đây là câu hỏi đã gửi kèm trong thư
xin dữ liệu (`docs/EMAIL-MULTIVSL.md` dòng 37, 64). Với một hệ thống cần hiển thị chữ và
ghép câu tiếng Việt, thiếu ánh xạ này là hạn chế nghiêm trọng.

### 2.1.2 VSL400

VSL400 là bộ dữ liệu đa góc quay cho nhận dạng ký hiệu tiếng Việt ở mức từ, công bố với
nhan đề *"VSL400: A Multi-view Dataset for Vietnamese Word-Level Sign Language
Recognition"*, DOI `10.22541/au.177075292.21810740`, dữ liệu đặt trên Zenodo record
`17943574` với giấy phép CC-BY-4.0 ở chế độ *restricted* (nguồn: `training/vsl400/README.md`
dòng 3–6). Theo mô tả của bài báo, bộ dữ liệu gồm 24.753 lượt ký × 3 góc quay, 400 gloss,
28 người ký (`training/vsl400/README.md` dòng 6; `PLAN.md` dòng 161). Danh sách tác giả và
nơi công bố chính thức: `[CẦN TRÍCH DẪN]`.

**Đồ án dùng được gì.** Kho mã hiện đã lưu phần manifest công khai của bộ dữ liệu (lấy qua
một bên thứ ba đã được cấp quyền, `github.com/Wbao176/Vietnamese_Sign_Language_Project`),
gồm `label_map.json` với đúng 400 gloss tiếng Việt ánh xạ id 0–399, và ba file split
`train.csv` / `val.csv` / `test.csv` với 17.104 / 2.885 / 4.764 bản ghi (kiểm chứng bằng
cách đếm dòng, không kể dòng tiêu đề). Mỗi bản ghi có các trường `video_id, signer_id, fps,
resolution, gloss, num_frames, length_seconds`. Ưu thế quyết định của VSL400 so với
Multi-VSL là **có sẵn tên gloss tiếng Việt**, nối thẳng được vào module `dictionary` và vào
prompt ghép câu mà không phải xin thêm bảng ánh xạ (`training/vsl400/README.md` dòng 19–20).

**Hạn chế.** Thứ nhất, đồ án mới gửi yêu cầu cấp quyền, chưa có dữ liệu thật — hiện chỉ có
metadata. Thứ hai, split công khai **không** signer-independent: kiểm chứng trực tiếp trên
ba file CSV cho thấy toàn bộ 26 mã người ký xuất hiện ở cả ba tập, nên nếu dùng nguyên
split này thì accuracy sẽ lạc quan giả tạo (`training/vsl400/README.md` dòng 13–17). Thứ
ba, tồn tại mâu thuẫn số liệu chưa giải quyết được: bài báo mô tả 28 người ký, nhưng
manifest công khai chỉ chứa 26 mã người ký phân biệt (dải 001–028, khuyết 005 và 017) —
số người ký thật của bộ dữ liệu đầy đủ: `[CẦN SỐ LIỆU]`, phải xác nhận lại sau khi được
cấp quyền.

### 2.1.3 VOYA_VSL

VOYA_VSL (HuggingFace `Kateht/VOYA_VSL`, giấy phép MIT) gồm 161 lớp ký hiệu tiếng Việt,
mỗi lớp là một file `.npz` chứa mảng `(1001, 60, 1605)`: 1.000 mẫu sinh bằng tăng cường dữ
liệu cộng đúng 1 mẫu gốc (nguồn: `training/preprocess/voya_to_npy.py` dòng 1–7;
`training/README.md` dòng 33). Bố cục 1.605 chiều đã được đồ án kiểm chứng thực nghiệm là
`[pose 25 điểm | tay trái 21 | tay phải 21 | mặt 468] × (x, y, z)`, từ đó cắt về đúng vector
144 chiều của SignBridge bằng phép nối `concat(seq[:, 75:201], seq[:, 33:51])`
(`voya_to_npy.py` dòng 9–11, 33–41).

**Đồ án dùng được gì.** Đây là nguồn dữ liệu duy nhất **tải được ngay, không cần xin
quyền**, nên được dùng để **tiền huấn luyện** encoder — học "ngôn ngữ chung của chuyển động
tay" — rồi nạp lại bằng tham số `--init-from` khi có dữ liệu thật, đồng thời bỏ đầu phân
loại vì khác số lớp. Notebook `training/experiments/exp03_voya_pretrain.ipynb` đã được
chuẩn bị cho việc này.

**Hạn chế.** Mỗi lớp chỉ bắt nguồn từ **đúng một video từ điển QIPEDC**, tức một người ký,
toàn bộ 1.000 mẫu còn lại là biến thể tăng cường của cùng một gốc. Vì vậy bộ dữ liệu
**không có giá trị đo tổng quát hóa** và tuyệt đối không được dùng làm tập đánh giá chính
(`voya_to_npy.py` dòng 5–7). Ngoài ra, chiều z của pose trong VOYA theo thang legacy
Holistic (hip-scale) khác với MediaPipe Tasks mà hệ thống dùng khi chạy thật, gây lệch phân
bố nhỏ ở 6 chiều z của pose (`voya_to_npy.py` dòng 12–14). Kết quả tiền huấn luyện: hiện
notebook `exp03` chưa có ô kết quả nào được lưu, nên `[CẦN SỐ LIỆU]`.

### 2.1.4 QIPEDC — Từ điển Ngôn ngữ Ký hiệu Việt Nam và bản mirror SignConnect

QIPEDC (`qipedc.moet.gov.vn`) là từ điển ngôn ngữ ký hiệu quốc gia thuộc dự án của Bộ Giáo
dục và Đào tạo phối hợp Ngân hàng Thế giới. Bản mirror dùng trong đồ án là dataset
HuggingFace `Lakeserl/SignConnect` với 4.362 video (nguồn:
`training/preprocess/import_signconnect.py` dòng 1–5). Trong tên file, hậu tố `B`/`N`/`T`
đánh dấu biến thể vùng miền Bắc/Nam/Trung; script import ưu tiên biến thể Bắc, rồi đến bản
không hậu tố, rồi Nam, rồi Trung (`import_signconnect.py` dòng 5, 115–117).

**Đồ án dùng được gì.** Đây là nguồn vật liệu cho **chiều ngược** (tiếng Việt → ký hiệu).
Script `import_signconnect.py` gom nhãn theo từ, sinh gloss ASCII duy nhất và nạp qua đúng
API thật của backend; kết quả kiểm chứng trên đĩa là **3.318 clip `.mp4`** trong
`storage/clips` (đếm trực tiếp; commit `17e0664` ghi "~3.300 từ"). Bộ từ vựng khởi đầu thủ
công gồm 30 mục có kèm nghĩa tiếng Việt và chủ đề (`import_signconnect.py` dòng 24–55).

**Hạn chế.** Thứ nhất, mỗi từ chỉ có một clip mẫu, không có biến thiên người ký, nên kho
này **không dùng làm dữ liệu huấn luyện nhận dạng** được — nó là tài nguyên phát lại, và
gián tiếp là nguồn gốc của VOYA_VSL. Thứ hai, đây là từ điển ở mức **từ rời**, không có câu
liên tục. Thứ ba, kho từ điển quốc gia thiếu ký hiệu rời cho một số từ rất thông dụng:
"hôm nay", "ngày mai", "hôm qua", "cảm ơn", "bác sĩ" (commit `17e0664`); riêng "tôi" không
có ký hiệu từ vựng vì VSL diễn đạt ngôi thứ nhất bằng động tác chỉ vào mình
(`apps/web/src/app/speak/SpeakTool.tsx` dòng 58–61). Đây là phát hiện có giá trị nghiệp vụ,
đồng thời là lý do phải bổ sung nhánh đánh vần bằng bảng chữ cái ngón tay. Thứ tư, điều
khoản sử dụng lại của QIPEDC/SignConnect chưa được xác minh: `[CẦN TRÍCH DẪN]`.

---

## 2.2 Phương pháp nhận dạng ký hiệu

Đồ án khảo sát ba hướng và chốt một hướng, có ghi lại lý do loại trừ ngay trong mã nguồn
(`training/model/model.py` dòng 3–6; `training/README.md` dòng 39).

**SPOTER** (`github.com/matyasbohacek/spoter`, Apache-2.0) là kiến trúc Transformer trên
pose đơn giản nhất để khởi đầu, được đồ án lấy làm mốc tham chiếu (`training/README.md`
dòng 34). Thông tin bài báo gốc của SPOTER (tác giả, hội nghị, năm): `[CẦN TRÍCH DẪN]`.

**Giải pháp hạng nhất cuộc thi Kaggle GISLR** (Google Isolated Sign Language Recognition,
`github.com/hoyso48/Google---Isolated-Sign-Language-Recognition-1st-place-solution`) dùng
kiến trúc lai 1D-CNN + Transformer và được đặt làm đích nâng cấp của mô hình chính
(`training/README.md` dòng 35). Kinh nghiệm rút ra từ giải pháp này cũng là lý do đồ án
dùng vector gồm cả hai tay **và** thân trên thay vì chỉ hai tay (`PLAN.md` dòng 254).

**Mạng nơ-ron đồ thị (GCN/ST-GCN)** bị loại có chủ đích: phức tạp hơn nhiều trong khi lợi
ích được đánh giá là nhỏ ở quy mô 100–200 gloss (`model.py` dòng 5–6). Kết luận: Transformer
trên landmark là điểm cân bằng accuracy/độ phức tạp tốt nhất cho quy mô của đồ án.

Về **suy luận thời gian thực**, kế hoạch dựa trên một công thức đã công bố (arXiv
`2302.07693`): cửa sổ trượt 16–32 frame, stride 2–4, huấn luyện thêm lớp nền `NO_SIGN`,
ngưỡng softmax khoảng 0,7 và bỏ phiếu N cửa sổ liên tiếp trước khi chốt gloss (`PLAN.md`
dòng 117; `training/README.md` dòng 41–42). Nhan đề và tác giả của tài liệu này chưa được
ghi lại trong kho mã: `[CẦN TRÍCH DẪN]`.

Cần nói rõ một điểm trung thực: **cài đặt thật lệch khỏi công thức tham chiếu**. Mã hiện
tại dùng cửa sổ 32 frame nhưng stride 8 (`LandmarkWebSocketHandler.java` dòng 40–41), ngưỡng
tin cậy 0,6 (`TranslationService.java` dòng 35) và **chưa có** cơ chế bỏ phiếu nhiều cửa sổ
ở đường chạy thật — mới chỉ chặn lặp gloss liền kề, còn bỏ phiếu đa số hiện chỉ tồn tại
trong hàm đánh giá streaming lúc huấn luyện ngoại tuyến. Ảnh hưởng của các độ lệch này lên
accuracy: `[CẦN SỐ LIỆU]` (chưa có mô hình thật để đo).

---

## 2.3 Sinh câu tiếng Việt từ chuỗi gloss

Ngữ pháp VSL khác ngữ pháp tiếng Việt nói: thiếu hư từ, trật tự từ khác. Vì vậy bước
chuyển chuỗi gloss thành câu là một bài toán xử lý ngôn ngữ thực sự chứ không phải phần
trang trí (`apps/core/.../translation/SentenceComposer.java` dòng 24–26).

Tiền lệ được đồ án dựa vào là **Spotter+GPT** (arXiv `2403.10434`): dùng mô hình ngôn ngữ
lớn với prompt few-shot, **không** fine-tune (`SentenceComposer.java` dòng 25–26; `PLAN.md`
dòng 93). Nhan đề đầy đủ, tác giả và nơi công bố của công trình này: `[CẦN TRÍCH DẪN]`.

**Đồ án dùng được gì.** SignBridge áp dụng đúng nguyên tắc đó: prompt hệ thống chứa 6 ví
dụ mẫu, gọi Gemini `gemini-flash-latest` ở nhiệt độ 0,2, kèm ba lớp phòng thủ (cache LRU
200 mục theo chuỗi gloss → gọi LLM → ghép nghĩa tiếng Việt từ từ điển khi mất mạng hoặc
thiếu khóa). Lý do không fine-tune ở quy mô đồ án còn nằm ở chỗ chưa tiếp cận được corpus
song song gloss ↔ câu tiếng Việt nào; bằng chứng về sự tồn tại/không tồn tại của corpus
như vậy: `[CẦN TRÍCH DẪN]`.

**Kết quả đo được và hạn chế.** Bộ đánh giá tự động (`training/eval/sentence_eval.py`, gọi
API thật) cho: phủ nội dung 4/4 (100%), không bịa thêm 3/4 (75%), đúng dạng một câu 4/4
(100%); độ trễ gọi LLM trung vị 2.920 ms, nhỏ nhất 2.432 ms, lớn nhất 3.433 ms
(`docs/report/data/sentence-eval.md`). Hạn chế phải nói thẳng: bộ kiểm thử **chỉ có 4 chuỗi
gloss**, quá nhỏ để có ý nghĩa thống kê; kế hoạch nâng lên 30 chuỗi kèm chấm Likert độc lập
vẫn chưa thực hiện (`Plan-sprint2-ui.md` dòng 264). Ca chưa đạt là `XIN_LOI / TOI / DI` →
"Xin lỗi, tôi đi đây.", trong đó mô hình thêm từ "đây" ngoài chuỗi gloss — đúng kiểu lỗi
mà một hệ thống hỗ trợ giao tiếp không được phép mắc.

---

## 2.4 Sản phẩm thương mại và cộng đồng

Ở mảng này, kho mã của đồ án chỉ chứng thực được **một** sản phẩm đang vận hành thật:
**từ điển QIPEDC của Bộ Giáo dục và Đào tạo** (mục 2.1.4). Đây là sản phẩm cộng đồng cấp
quốc gia, nhưng về bản chất là **tra cứu từ điển một chiều**: người dùng gõ từ để xem clip,
hệ thống không nhận dạng, không dịch, không hoạt động thời gian thực.

Kế hoạch của đồ án có nêu tên **Signvrse / Imagine Cup** như một đối tượng cần khảo sát
trong chương này (`Plan-sprint2-ui.md` dòng 269), nhưng kho mã **không chứa bất kỳ dữ kiện
kiểm chứng được nào** về sản phẩm đó — không có tên nhóm, năm, quy mô từ vựng hay số liệu
hiệu năng. Do đó toàn bộ phần mô tả sản phẩm này: `[CẦN TRÍCH DẪN]`. Tương tự, các sản phẩm
thương mại quốc tế cùng lĩnh vực chưa được đồ án khảo sát có hệ thống: `[CẦN TRÍCH DẪN]`.

Một ghi nhận kỹ thuật có bằng chứng: ở hướng sinh chuyển động bằng avatar 3D, đồ án kết
luận **chưa có giải pháp web mã nguồn mở sẵn dùng**, nên avatar chỉ được xếp vào phần mở
rộng và cuối cùng bị loại khỏi phạm vi, thay bằng phát lại clip từ điển (`PLAN.md` dòng 257;
`Plan-sprint2-ui.md` dòng 38).

---

## 2.5 Khoảng trống mà đồ án lấp vào

Đối chiếu các công trình trên, có thể xác định bốn khoảng trống — kèm giới hạn trung thực
về mức độ đồ án thực sự lấp được đến đâu tại thời điểm viết chương này.

**Thứ nhất, khoảng trống hệ thống, không phải khoảng trống mô hình.** Multi-VSL và VSL400
đều dừng ở mức bộ dữ liệu và baseline nhận dạng từ rời; QIPEDC dừng ở tra cứu từ điển. Chưa
có công trình nào trong số đã khảo sát cung cấp một **hệ thống hai chiều, chạy thời gian
thực, đầu-cuối** từ webcam tới câu tiếng Việt phát thành tiếng và ngược lại. Đóng góp chính
của SignBridge nằm ở tầng hệ thống này (`PLAN.md` dòng 13).

**Thứ hai, baseline landmark trên Multi-VSL.** Baseline chính thức của Multi-VSL chạy trên
video, không phải trên landmark; một baseline landmark có tính so sánh được trên tập con
200 gloss là đóng góp riêng đã được lên kế hoạch (`PLAN.md` dòng 103). Đây là đóng góp
**chưa thực hiện được** vì còn chờ dữ liệu.

**Thứ ba, tầng gloss → câu tiếng Việt.** Các bộ dữ liệu chỉ trả về nhãn từ rời; khoảng cách
từ chuỗi nhãn tới câu tiếng Việt tự nhiên chưa được các công trình khảo sát xử lý cho tiếng
Việt. SignBridge lấp bằng cách áp dụng tiền lệ Spotter+GPT, và đã có số liệu đo thật, dù
trên bộ kiểm thử rất nhỏ (mục 2.3).

**Thứ tư, chiều ngược có xử lý từ ngoài từ điển.** Việc kho từ điển quốc gia thiếu ký hiệu
rời cho nhiều từ thông dụng buộc hệ thống phải kết hợp khớp cụm dài nhất với đánh vần bằng
bảng chữ cái ngón tay, đồng thời báo trung thực những từ không dịch được thay vì im lặng
bỏ qua (mục 2.1.4).

**Giới hạn phải nêu rõ để không thổi phồng.** (1) Phạm vi là nhận dạng ký hiệu **rời**, đồ
án không giải bài toán ký hiệu liên tục không ngắt (`PLAN.md` dòng 21–22). (2) Tại thời
điểm viết chương này, **chưa có mô hình ONNX thật**: thư mục `apps/ml/` chỉ có
`README.md`, `app/`, `requirements.txt`, không có `model/`, nên dịch vụ suy luận đang chạy
chế độ stub. Toàn bộ số liệu top-1/top-5, recall của lớp `NO_SIGN` và độ trễ đầu-cuối:
`[CẦN SỐ LIỆU]`. (3) Do cả Multi-VSL lẫn VSL400 đều đang chờ cấp quyền, tuyên bố "đóng góp
baseline landmark" hiện là **cam kết chưa được kiểm chứng bằng thực nghiệm**, và phải được
trình bày đúng như vậy trước hội đồng.
