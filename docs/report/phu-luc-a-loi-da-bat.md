# Phụ lục A — Các lỗi đã phát hiện và sửa

Phụ lục này liệt kê những lỗi thật đã xuất hiện trong quá trình xây dựng SignBridge, kèm
cách phát hiện, nguyên nhân gốc và bản vá tương ứng. Mục đích không phải trưng bày số
lượng, mà chứng minh rằng dự án có một quy trình kiểm soát chất lượng vận hành được: mỗi
lỗi đều truy ngược được tới một dòng mã, một comment giải thích lý do, hoặc một diff commit
trong kho mã.

**Nguyên tắc lập danh sách.** Chỉ đưa vào những lỗi có bằng chứng kiểm chứng được ngay
trong kho mã `d:/Khoa/DATN` (branch `main`, HEAD `26b7f22`): hoặc là comment tại chỗ sửa
mô tả đúng triệu chứng và nguyên nhân, hoặc là diff của commit tương ứng, hoặc là một
test hồi quy được thêm cùng bản vá. Những lỗi được các thông điệp commit hoặc tài liệu kế
hoạch nhắc tới nhưng không truy được về mã nguồn thì **không** được tính vào bảng, mà được
khai báo riêng ở mục A.5.

Theo nguyên tắc trên, số lỗi truy được bằng chứng là **68**. Con số này khác với con số
"34 lỗi" đang ghi trong `docs/report/README.md` dòng 13 và `Plan-sprint2-ui.md` dòng 271 —
xem giải thích ở mục A.5.

---

## A.1 Phương pháp phát hiện lỗi

Dự án dùng ba cơ chế phát hiện lỗi song song. Ba cơ chế này bổ sung cho nhau chứ không thay
thế nhau, và phân bố kết quả dưới đây chính là lập luận cho việc phải duy trì cả ba.

### A.1.1 Kiểm thử tự động

| Bộ kiểm thử | Quy mô thật (đếm từ mã nguồn) | Vị trí |
|---|---|---|
| Test Java (JUnit + Testcontainers + Spring Modulith) | **9 file**, chứa **17** phương thức `@Test` | `apps/core/src/test/java/vn/signbridge/` |
| E2E hạ tầng (Node, chạy trên stack thật) | **21** khẳng định `check()` | `tests/e2e/infrastructure.test.js` |
| E2E ghép câu (gọi Gemini thật) | **6** khẳng định `check()` | `tests/e2e/sentence.test.js` |
| **Tổng khẳng định E2E** | **27** | |

Trong đó `ModularityTests.java` giữ vai trò đặc biệt: nó gọi `ApplicationModules.verify()`
nên mọi vi phạm ranh giới giữa 5 module Modulith đều làm **hỏng build**, không cần ai phát
hiện bằng mắt. Đây là dạng "kiểm thử kiến trúc" chứ không phải kiểm thử hành vi.

Ghi chú trung thực về số liệu: `README.md` dòng 89 và `tests/e2e/README.md` hiện ghi
"17 kiểm tra E2E", còn `README.md` dòng 87 ghi "9 test" cho phía Java. Đếm lại trực tiếp
từ mã nguồn cho ra **21** khẳng định E2E hạ tầng và **17** phương thức `@Test` trong **9
file**. Con số 17/9 trong README là số liệu của một thời điểm cũ chưa được cập nhật; báo
cáo này dùng con số đếm lại. (Kết quả 21/21 cũng được ghi trong `docs/merge-notes/branch-c-sprint2.md`
dòng 52 và trong thông điệp commit `07807c2`.)

### A.1.2 Review đối kháng đa tác nhân

Sau mỗi khối chức năng, mã nguồn được đưa qua một vòng đọc soát có chủ đích đi tìm lỗi
(thay vì đọc để xác nhận là đúng), tập trung vào bốn nhóm câu hỏi cố định: điều gì xảy ra
khi người dùng thao tác giữa chừng; điều gì xảy ra khi hai luồng chạy song song; endpoint
này có bị lạm dụng được không khi nó công khai; và giả định ngầm nào đang được nhân bản ở
hai nơi mà không có ràng buộc nào giữ chúng đồng bộ. Ở các đợt lớn (commit `3260360`,
`e1fdf78`, `07807c2`), nhiều tác nhân review độc lập rồi đối chiếu kết quả, mỗi phát hiện
phải qua bước xác minh ngược lại trên mã nguồn trước khi được chấp nhận là lỗi thật.

### A.1.3 Chạy thật

Một số lớp lỗi chỉ lộ ra khi chạy trên môi trường thật: sai lệch giao thức giữa Java và
Python, giới hạn mặc định của container, hành vi của trình duyệt ở chế độ phát triển, giới
hạn tốc độ của API bên thứ ba. Những lỗi này thường tốn công chẩn đoán nhất vì thông điệp
lỗi bề mặt không chỉ về nguyên nhân.

### A.1.4 Phân bố theo cách phát hiện

| Cách phát hiện | Số lỗi | Tỉ lệ |
|---|---|---|
| Kiểm thử tự động bắt được trực tiếp | 4 | 5,9 % |
| Review phát hiện, sau đó test tái hiện và xác nhận | 2 | 2,9 % |
| Chạy thật thấy hỏng | 9 | 13,2 % |
| Review đối kháng bắt trước khi chạy | 53 | 77,9 % |
| **Tổng** | **68** | **~100 %** (làm tròn) |

Con số đáng chú ý là **77,9 %** lỗi được bắt bởi review chứ không phải bởi test. Điều này
không có nghĩa test vô dụng — mà có nghĩa test chỉ bảo vệ được đúng những đường đi mà nó đi
qua. Phần lớn lỗi trong bảng A.2 nằm ở các nhánh mà không bộ test nào của đồ án chạm tới:
người dùng đóng modal giữa lúc đếm ngược, tua lùi video, token hết hạn giữa phiên, hai
request cùng email chạy song song. Đây là lập luận trung tâm của phụ lục này: với một hệ
thống có nhiều tầng và nhiều trạng thái vòng đời như SignBridge, **review có chủ đích là cơ
chế phát hiện lỗi có năng suất cao nhất**, còn test đóng vai trò khóa chặt bản vá lại để
lỗi không tái phát.

Có **10** bản vá được kèm test hồi quy — hoặc được phủ bởi một test tích hợp thêm vào cùng
bản vá — ngay tại thời điểm sửa: A5, A6, A12, A16 (khẳng định mới trong
`tests/e2e/infrastructure.test.js`), E4, E6 (hai phương thức `@Test` thêm mới ở commit
`0e9d283`, `SignAdminIntegrationTests.java:194` và `:205`), G1-G4 (phủ bởi
`AnalyticsIntegrationTests.java`; comment tại chỗ sửa ghi rõ "đã tái hiện bằng test tích hợp").

---

## A.2 Bảng tổng hợp toàn bộ lỗi

Ký hiệu cột "Phát hiện": **T** = kiểm thử tự động · **R** = review đối kháng ·
**C** = chạy thật · **R+T** = review phát hiện, test tái hiện xác nhận.

### Đợt 1 — Tuần 2-3: identity, dictionary, dataset (commit `3260360`)

| # | Tầng | Lỗi | Phát hiện | Bằng chứng |
|---|---|---|---|---|
| A1 | Hạ tầng | Buffer WebSocket mặc định 8 KB của Tomcat làm rớt kết nối (mã 1009) khi gửi lô landmark lớn; nâng lên 256 KB | T | `translation/WebSocketConfig.java:26-32`; test `tests/e2e/infrastructure.test.js:152` |
| A2 | Core | JDK HttpClient gửi `Upgrade: h2c` + chunked, uvicorn/h11 từ chối toàn bộ lời gọi `/infer`; ép `HTTP_1_1` | C | `translation/MlClient.java:30-35` |
| A3 | Core | Spring Security chặn `/error` (dispatch nội bộ) làm mọi lỗi 400 trả về 401 | T | `SecurityConfig.java:39-41` |
| A4 | Web | React StrictMode làm chết vòng lặp nhận diện (camera sáng, 0 fps) vì effect dùng cờ ref chặn lần chạy thứ hai | C | `lib/useVisionPipeline.ts:16-20, 47-77, 141-146` |
| A5 | Bảo mật | Chiếm quyền ADMIN qua đăng ký đầu tiên trên DB trống; đăng ký công khai luôn chỉ cấp `Role.USER` | R | `identity/AuthController.java:33-51`; `identity/AdminBootstrap.java`; test `infrastructure.test.js:63` |
| A6 | Bảo mật | WebSocket công khai không giới hạn kích thước lô / số chiều frame / trần buffer phiên | R | `translation/LandmarkWebSocketHandler.java:42-45, 85-92, 100-103`; test `infrastructure.test.js:148-155` |
| A7 | Core | Vòng cửa sổ trượt lấy cửa sổ từ **cuối** buffer nhưng xoá STRIDE ở **đầu** → frame giữa không bao giờ được suy luận, buffer phình vô hạn | R | `LandmarkWebSocketHandler.java:28-30, 105-117`; diff `git show 3260360 -- .../LandmarkWebSocketHandler.java` |
| A8 | Core | `@Transactional` bọc cả lời gọi HTTP sang ML giữ một connection Hikari suốt thời gian gọi | R | `translation/TranslationService.java:26-28, 87-88` |
| A9 | Core | `MlClient` thiếu timeout đọc → ML service treo là khoá vĩnh viễn thread WebSocket | R | `MlClient.java:24-25, 36-39` |
| A10 | Web | Race: `onclose` của WebSocket cũ đè trạng thái kết nối mới | R | `app/translate/TranslateDemo.tsx:96-108` |
| A11 | Web | `frameBuffer` client còn frame của phiên trước, lẫn vào câu đầu của phiên mới | R | `TranslateDemo.tsx:94` |
| A12 | Core | Endpoint thu mẫu công khai không kiểm gloss theo từ điển → tạo được thư mục rác, nhiễu nhãn huấn luyện | R | `dataset/DatasetController.java:56`; test `infrastructure.test.js:98-101` |
| A13 | Core | Ghi file mẫu không nguyên tử (pipeline tiền xử lý gặp `.json.gz` cụt là hỏng cả lượt) và để lại file mồ côi khi lưu DB thất bại | R | `dataset/SampleStorage.java:20, 52-56`; `DatasetController.java` |
| A14 | Hạ tầng | Bảng `event_publication` của Modulith phình vô hạn — mỗi gloss nhận diện sinh một dòng ngay trên hot path | R | `application.yml:30` (`completion-mode: delete`) |
| A15 | Core | Đặt tên file clip theo gloss: "CHÀO" và "CHO" sau khi lọc dấu ra cùng tên, clip này ghi đè clip kia | R | `dictionary/ClipStorage.java:20-21` |
| A16 | Core | Hai request cùng email chạy song song: cả hai qua `existsByEmail`, request thua nhận 500 thay vì 409 | R | `AuthController.java:54-58`; test `infrastructure.test.js:66` |
| A17 | Web | Rò WebGL context khi fallback GPU → CPU: tạo được `HandLandmarker` GPU nhưng `PoseLandmarker` GPU lỗi, nhánh `catch` không đóng cái đã tạo | R | `lib/landmarks.ts:36-49` |

### Đợt 2 — Tầng ngôn ngữ: gloss → câu tiếng Việt (commit `953eacf`)

| # | Tầng | Lỗi | Phát hiện | Bằng chứng |
|---|---|---|---|---|
| B1 | Web | Stale closure: `ws.onmessage` gán một lần lúc kết nối nên đóng gói giá trị `autoSpeak` cũ — tắt "tự động đọc" mà máy vẫn đọc | R | `TranslateDemo.tsx:38-42, 118` |
| B2 | Web | Gán ref trong thân render (React 19 cấm đụng ref lúc render) | R | `useVisionPipeline.ts:40-45` |
| B3 | Web | `setState` đồng bộ trong thân effect gây một lượt render thừa mỗi lần mount | R | `app/stats/StatsDashboard.tsx:48-50`; `app/speak/SpeakTool.tsx:122-125` |
| B4 | Web | Đọc `localStorage` trong effect thay vì lazy initializer → render thừa và nguy cơ lệch hydration | R | `app/collect/CollectTool.tsx:30-33`; `lib/auth.ts:82-90` |

### Đợt 3 — Chiều ngược và nhập kho từ điển QIPEDC (commit `ddbb2c0`, `0531c7a`)

| # | Tầng | Lỗi | Phát hiện | Bằng chứng |
|---|---|---|---|---|
| C1 | Hạ tầng | Giới hạn multipart mặc định 1 MB của Spring Boot làm rớt upload clip 0,3-3 MB (HTTP 413) | C | `application.yml:38-41` |
| C2 | ML | Script import không resume an toàn: tập `taken` khởi tạo rỗng nên chạy lại sau khi bị ngắt sinh gloss trùng với gloss đã có trong DB, đợt import đứt | C | `training/preprocess/import_signconnect.py:101, 120, 138, 161` |
| C3 | ML | Hai nhãn QIPEDC cùng nghĩa tiếng Việt tạo hai ký hiệu trùng trong cùng một đợt chạy | C | `import_signconnect.py:143-148` |

### Đợt 4 — Dây chuyền huấn luyện ML (commit `59b2a31`, `e1fdf78`)

| # | Tầng | Lỗi | Phát hiện | Bằng chứng |
|---|---|---|---|---|
| D1 | ML | MediaPipe `RunningMode.VIDEO` bắt buộc timestamp tăng đơn điệu **trên cùng một landmarker**; code cũ reset về 0 mỗi video nên crash từ video thứ hai | C | `training/preprocess/extract_landmarks.py:75-77` |
| D2 | ML | Tracker "kéo" bàn tay của video trước sang frame đầu video sau khi dùng chung landmarker | R | `extract_landmarks.py:82` |
| D3 | ML | Cột CSV mặc định (`video_path`) không khớp CSV Multi-VSL (cột `name`) → không tìm thấy video nào | C | `extract_landmarks.py:103-115, 128` |
| D4 | ML | Giữ `random.Random` trong instance dataset: DataLoader worker fork nhân bản state, mỗi epoch mọi worker sinh đúng một chuỗi augment giống nhau | R | `training/model/dataset.py:10-12` |
| D5 | ML | Trộn mẫu NO_SIGN tổng hợp (rất dễ) vào tập đánh giá chung làm top-1 cao giả tạo | R | `training/model/train.py:38-64, 111-116` |
| D6 | ML | "Tay ma": time-warp nội suy tuyến tính vắt qua frame không-tay, bịa ra bàn tay lơ lửng ở frame vốn trống | R | `dataset.py:16-17, 156-169` |
| D7 | ML | Pool NO_SIGN lấy "200 file đầu" → thiên lệch theo lớp/người ký và đổi theo thứ tự filesystem | R | `dataset.py:93-100` |
| D8 | ML | Crop ngẫu nhiên có thể trúng vùng hoàn toàn không có tay nhưng vẫn mang nhãn thật → model học "cửa sổ trống tay = ký hiệu X" | R | `dataset.py:133-143` |
| D9 | ML | Contract cửa sổ không được kiểm ở ML service: `ExportWrapper` bỏ mask nên cửa sổ sai kích thước bị âm thầm đệm 0, cho kết quả vô nghĩa mà không ai biết | R | `apps/ml/app/main.py:45-51, 83` |
| D10 | Web/ML | Nhịp trích đặc trưng không ghim: màn hình 60/120 Hz sinh chuỗi frame "nhanh gấp đôi" so với phân bố video huấn luyện 25 fps | R | `useVisionPipeline.ts:23-24, 99-103`; `train.py:35` (`FPS_HINT = 25`) |
| D11 | Core/ML | Mẫu thu qua `/collect` thiếu `signer` và `fps` → không thực hiện được split signer-independent | R | `dataset/SampleStorage.java:37-51`; `CollectTool.tsx` |
| D12 | ML | Thiếu augment vị trí camera: không có phép dịch/scale toàn khung nên model học luôn cả vị trí đứng và khoảng cách tới camera của người ký trong tập huấn luyện | R | `dataset.py:18, 174-183`; thông điệp commit `e1fdf78` ("thiếu augment vị trí camera") |

### Đợt 5 — Nhánh A, admin studio (commit `0e9d283`)

| # | Tầng | Lỗi | Phát hiện | Bằng chứng |
|---|---|---|---|---|
| E1 | Web | Vòng lặp bounce `/login` ↔ `/admin` khi token hết hạn giữa phiên: chỉ hiện thông báo rồi chuyển `/login`, nhưng `localStorage` còn `role: ADMIN` cũ nên `/login` tự chuyển ngược | R | `app/admin/AdminStudio.tsx:95-102`; `app/login/LoginForm.tsx:7-11, 22-25` |
| E2 | Web | Đóng modal quay clip giữa lúc đếm ngược: cleanup đã stop tracks và null `streamRef`, hàm chạy tiếp sau `await` gọi `new MediaRecorder(null)` → TypeError, kẹt phase | R | `app/admin/RecordClipModal.tsx:97-100` |
| E3 | Web | `recorder.onstop` bắn sau unmount, tạo `URL.createObjectURL` mà không còn ai `revoke` → rò blob URL | R | `RecordClipModal.tsx:109-112` |
| E4 | Core | Trùng gloss trả 500 (unique constraint nổ thẳng ra ngoài) thay vì 409 | R | `dictionary/SignController.java:57-60`; test hồi quy `SignAdminIntegrationTests.java:194` |
| E5 | Core | File clip bị lock trên Windows làm hỏng cả thao tác xoá ký hiệu: xoá file trước, lỗi IO làm hỏng giao dịch, bản ghi DB còn nguyên với `clipUrl` chết | R | `SignController.java:78-93` |
| E6 | Core | Thay clip khác đuôi không dọn file cũ: quay `.webm` đè clip `.mp4` nhập từ QIPEDC nhưng `/clips/sign-{id}.mp4` vẫn serve công khai | R | `ClipStorage.java:62-72`; test hồi quy `SignAdminIntegrationTests.java:205` |

### Đợt 6 — Nhánh B, dịch từ file video (commit `9a7d810`)

| # | Tầng | Lỗi | Phát hiện | Bằng chứng |
|---|---|---|---|---|
| F1 | Web | Dùng `{"type":"flush"}` để "dịch lại từ đầu" — hiểu sai giao thức: `flush` là lệnh **chốt câu**, không phải lệnh huỷ; câu của lượt cũ hiện lại vài giây sau và bị đọc to | R | `app/video/VideoTranslateTool.tsx:102-115, 203-212`; `docs/merge-notes/feature-video-translate.md:48-58` |
| F2 | Web | Trục ngày của `/stats` dựng theo giờ máy xem trong khi backend gộp `byDay` theo `Asia/Ho_Chi_Minh` cố định → cột "hôm nay" rơi khỏi biểu đồ khi máy xem không ở UTC+7 | R | `StatsDashboard.tsx:20-33` |

### Đợt 7 — Review đối kháng sau khi tích hợp ba nhánh (commit `07807c2`)

| # | Tầng | Lỗi | Phát hiện | Bằng chứng |
|---|---|---|---|---|
| G1 | Core | `GET /api/analytics/summary` chạy ba truy vấn trong ba giao dịch riêng → dashboard hiện `totalGlosses = 3` trong khi `byGloss` rỗng | T | `analytics/AnalyticsController.java:47-51, 65` |
| G2 | Core | `@Transactional` bị Spring **bỏ qua trong im lặng** vì method controller là package-private (AOP proxy chỉ áp cho method public) — bản vá "trông đúng" nhưng không chạy | R+T | `AnalyticsController.java:53-55, 33-38` |
| G3 | Core | Giao dịch read-only dưới READ COMMITTED vẫn không cho ảnh chụp nhất quán (Postgres cấp snapshot mới cho **từng câu lệnh**) → phải đặt REPEATABLE READ | R+T | `AnalyticsController.java:39-44` |
| G4 | Core | Khai báo một interface projection thứ hai trong cùng repository làm truy vấn JPQL thứ nhất trả rỗng | T | `analytics/GlossUsageRepository.java:23-36` |
| G5 | Bảo mật | Trang `/login` công khai in thẳng tài khoản quản trị và prefill sẵn email | R | diff `git show 07807c2 -- apps/web/src/app/login/LoginForm.tsx`; hiện trạng `LoginForm.tsx:16` (`useState("")`) |
| G6 | Bảo mật | `/actuator/**` mở cho mọi tài khoản đã đăng nhập: USER tự đăng ký xem được `/actuator/modulith`, `/actuator/env` | R | `SecurityConfig.java:42-44` |
| G7 | Bảo mật | Bảng `gloss_usages` không có trần ghi theo phiên, trong khi nguồn sự kiện là WebSocket công khai — một script cắm socket cả đêm làm phình bảng và bẻ cong dashboard | R | `analytics/GlossStatsListener.java:19-22, 29` (`MAX_ROWS_PER_SESSION = 300`) |
| G8 | Web | Trang `/record` nhận cả phiên USER: quay xong clip mới ăn 403 | R | `app/record/RecordTool.tsx:48-55, 179-185` |
| G9 | Core | Gộp theo ngày ở JVM: `findTimesSince` tải cả bảng về bộ nhớ, mà bảng do endpoint công khai sinh ra nên không giới hạn kích thước | R | `GlossUsageRepository.java:23-36` (chuyển sang `to_char(... at time zone ...)`) |
| G10 | Web | `SpeakTool`: micro còn bật sau khi rời trang | R | `SpeakTool.tsx:164-169` |
| G11 | Web | `SpeakTool`: một clip lỗi (404 hoặc sai codec) làm đứng cả chuỗi phát | R | `SpeakTool.tsx:370` (`onError={onClipEnded}`) |
| G12 | Web | `SpeakTool`: từ có trong từ điển nhưng thiếu clip vẫn vào map cụm, chặn mất nhánh "từ lạ → đánh vần" → câu chứa từ đó đứng im | R | `SpeakTool.tsx:136-139` |
| G13 | Web | `/video`: frame bị vứt trong lúc socket đang CONNECTING → mất đoạn đầu video sau khi đổi file hoặc dịch lại | R | `VideoTranslateTool.tsx:70-84, 124-129` |
| G14 | Web | `/video`: tua **lùi** không reset phiên → đoạn vừa xử lý vào đệm server lần thứ hai, gloss lặp trong câu | R | `VideoTranslateTool.tsx:181-193` |
| G15 | Web | Không lưu hạn token → UI tiếp tục dùng token đã hết hạn, người dùng làm xong việc mới ăn 401 | R | `lib/auth.ts:13, 30, 43-66` |
| G16 | Hạ tầng | Modulith không phát lại sự kiện chưa hoàn tất khi khởi động lại: listener analytics giờ ghi DB nên có thể fail giữa chừng, sự kiện lỗi nằm lại vĩnh viễn | R | `application.yml:33` (`republish-outstanding-events-on-restart: true`) |

### Đợt 8 — Kiểm toán giao diện và sprint 2 (commit `b34b236`, `26b7f22`)

| # | Tầng | Lỗi | Phát hiện | Bằng chứng |
|---|---|---|---|---|
| H1 | Web | `globals.css` đặt `body { font-family: Arial, Helvetica, sans-serif; }` đè lên font đã nạp qua `next/font` → toàn ứng dụng hiển thị Arial | R | diff `git show b34b236 -- apps/web/src/app/globals.css` (dòng bị xoá: `font-family: Arial, Helvetica, sans-serif;`) |
| H2 | Web | Font thiếu subset `"vietnamese"`: chữ có dấu rơi sang font hệ thống, nhìn vênh so với chữ không dấu | R | `app/layout.tsx:8-18` (chuyển sang `Be_Vietnam_Pro`, `subsets: ["latin", "vietnamese"]`) |
| H3 | Web | Chip ký hiệu sáng sai khi câu chứa cùng một từ hai lần: so sánh theo `sign.id` (định danh nội dung) thay vì theo vị trí | R | `SpeakTool.tsx:48, 172-186` (hàng đợi phát mang `entryIdx`/`letterIdx`) |
| H4 | Web | Hậu tố tiêu đề tab lặp ở 9 trang (`Phiên dịch \| SignBridge \| SignBridge`): `layout.tsx` đã khai `title.template` mà 9 `page.tsx` vẫn tự ghi hậu tố | R | diff `26b7f22` (9 file `page.tsx`, mỗi file ±1 dòng) |
| H5 | Kiểm thử | Test E2E để lại rác trong DB dùng chung: tích luỹ 17 dòng ký hiệu test, trong đó 5 dòng mang clip `.webm` giả, lọt vào `/dictionary` và trang demo | C | `tests/e2e/infrastructure.test.js:6-24, 157, 162-166`; `docs/merge-notes/branch-c-sprint2.md:50-53` |

### Công cụ đánh giá chất lượng ghép câu (`training/eval/sentence_eval.py`)

| # | Tầng | Lỗi | Phát hiện | Bằng chứng |
|---|---|---|---|---|
| I1 | Kiểm thử | Lùi 3 giây khi dính HTTP 429 của Gemini free tier — gói miễn phí giới hạn theo **phút** nên chờ vài giây là chắc chắn dính lại, hỏng cả lượt đánh giá | C | `sentence_eval.py:142-169` (đọc `Retry-After`, mặc định 20 s × số lần thử) |
| I2 | Kiểm thử | Prompt đánh giá bị chép tay nên lệch với prompt production → số liệu đo được là số của "một hệ thống không tồn tại" | R | `sentence_eval.py:114-122` (bóc `SYSTEM_PROMPT` trực tiếp từ `SentenceComposer.java`, xử lý đúng luật thụt lề của Java text block) |
| I3 | Kiểm thử | Độ trễ trung bình cộng cả thời gian nằm chờ giới hạn tốc độ của các ca phải thử lại | R | `sentence_eval.py:361-364` |

---

## A.3 Phân tích sâu bảy lỗi tinh vi nhất

Bảy lỗi dưới đây được chọn không phải vì hậu quả nặng nhất, mà vì chúng có chung một đặc
điểm: **hệ thống vẫn chạy, không có ngoại lệ, không có cảnh báo biên dịch, không có dòng
log nào bất thường**. Đây là loại lỗi mà một đồ án chỉ chạy demo một lần rồi nộp sẽ không
bao giờ nhìn thấy.

### A.3.1 `@Transactional` bị Spring bỏ qua trên method package-private (G2)

**Triệu chứng.** Dashboard `/stats` hiện những con số tự mâu thuẫn: tổng số gloss là 3 trong
khi danh sách chi tiết theo gloss rỗng. Sau khi thêm `@Transactional` lên phương thức
`summary()` để gom ba truy vấn vào một giao dịch, chạy lại vẫn thấy đúng hiện tượng cũ.

**Vì sao khó tìm.** Bản vá "trông hoàn toàn đúng". Annotation nằm đúng chỗ, mã biên dịch
sạch, không có cảnh báo nào từ Spring lúc khởi động, không có ngoại lệ lúc chạy. Người sửa
có mọi lý do để tin rằng mình đã sửa xong và chuyển sang việc khác. Chỉ vì có bước đo lại
sau khi vá — chứ không dừng ở "đã vá" — hiện tượng mới lộ ra là chưa hết.

**Nguyên nhân gốc.** Spring cài đặt `@Transactional` bằng AOP proxy, và proxy chỉ có thể
chặn được lời gọi tới method **public**. Quy ước của dự án là để các controller ở phạm vi
package-private (một hệ quả trực tiếp của thiết kế Modulith: mọi lớp không thuộc bề mặt
công khai của module đều phải package-private, xem `ModularityTests`). Hai quyết định đúng
đắn ở hai chỗ khác nhau va vào nhau, và Spring xử lý va chạm này bằng cách **im lặng bỏ qua
annotation**.

**Cách sửa.** Bỏ annotation, dùng `TransactionTemplate` tường minh — cơ chế này không đi qua
proxy nên không phụ thuộc vào phạm vi truy cập của method:

```java
AnalyticsController(GlossUsageRepository usages, PlatformTransactionManager transactionManager) {
    this.usages = usages;
    this.readOnlyTransactions = new TransactionTemplate(transactionManager);
    this.readOnlyTransactions.setReadOnly(true);
    this.readOnlyTransactions.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
}

@GetMapping("/summary")
SummaryResponse summary(@RequestParam(defaultValue = "7") int days) {
    ...
    return readOnlyTransactions.execute(tx -> buildSummary(since));
}
```

Lý do chọn `TransactionTemplate` được ghi thành comment ngay tại chỗ
(`AnalyticsController.java:53-55`) để người đọc sau không "dọn dẹp" nó thành `@Transactional`
cho gọn.

**Bài học.** Cơ chế dựa trên proxy có những điều kiện áp dụng không hiện ra trong mã. Khi
một framework có thể thất bại trong im lặng, không được coi "đã thêm annotation" là "đã
sửa" — phải đo lại hành vi sau khi vá.

### A.3.2 Giao dịch read-only dưới READ COMMITTED vẫn không cho ảnh chụp nhất quán (G3)

**Triệu chứng.** Sau khi thay `@Transactional` bằng `TransactionTemplate` (đã sửa xong G2),
vẫn tái hiện được cảnh `count()` trả 0 trong khi truy vấn ngay sau đó thấy dữ liệu.

**Vì sao khó tìm.** Đây là một hiểu lầm phổ biến và rất khó tự nghi ngờ: "đã bọc trong một
giao dịch thì các truy vấn bên trong thấy cùng một trạng thái dữ liệu". Câu đó chỉ đúng ở
mức cô lập REPEATABLE READ trở lên. Mặc định của PostgreSQL là READ COMMITTED, mà ở mức này
mỗi **câu lệnh** được cấp một snapshot mới chứ không phải mỗi giao dịch. Giữa hai truy vấn
trong cùng một giao dịch vẫn có thể có commit của phiên khác chen vào.

**Nguyên nhân gốc.** Kiến trúc của SignBridge làm cho lỗi này chắc chắn xảy ra chứ không chỉ
là khả năng lý thuyết: module `analytics` lắng nghe sự kiện `GlossRecognized` **bất đồng bộ**
(`@ApplicationModuleListener`), nên trong lúc controller đang chạy ba truy vấn thì listener
hoàn toàn có thể commit thêm bản ghi mới.

**Cách sửa.** Nâng mức cô lập của đúng giao dịch đọc này:

```java
// READ COMMITTED (mặc định của Postgres) cấp snapshot MỚI cho TỪNG câu lệnh:
// listener analytics ghi bất đồng bộ nên giữa hai truy vấn có thể có commit
// chen vào, làm tổng và chi tiết trong cùng một phản hồi vênh nhau
// (đã tái hiện: count()=0 trong khi truy vấn kế tiếp thấy dữ liệu).
// REPEATABLE READ khóa một snapshot cho cả ba truy vấn.
this.readOnlyTransactions.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
```

**Bài học.** Kiến trúc hướng sự kiện bất đồng bộ đưa vào hệ thống một lớp tương tranh mà mã
nguồn đồng bộ không nhìn thấy. Mọi endpoint đọc nhiều truy vấn rồi trả về **một** phản hồi
đều phải trả lời được câu hỏi: các con số trong phản hồi này có thuộc cùng một thời điểm
không? Cần lưu ý điều kiện áp dụng: REPEATABLE READ trên PostgreSQL không thêm khoá đọc và
giao dịch ở đây là read-only, nên chi phí chấp nhận được; kết luận này không tự động đúng
cho các hệ quản trị khác.

### A.3.3 Khai báo projection thứ hai làm truy vấn thứ nhất trả rỗng (G4)

**Triệu chứng.** Truy vấn `countByGlossSince` đang chạy đúng bỗng trả danh sách rỗng, sau
khi thêm một interface projection **khác** vào cùng repository để phục vụ truy vấn gộp
theo ngày.

**Vì sao khó tìm.** Sửa ở chỗ A làm hỏng hành vi ở chỗ B, trong khi B không hề bị sửa. Không
có lỗi biên dịch, không có ngoại lệ lúc chạy — truy vấn trả về một danh sách hợp lệ, chỉ có
điều nó rỗng. Phản xạ tự nhiên khi thấy kết quả rỗng là đi kiểm tra dữ liệu, kiểm tra điều
kiện `where`, kiểm tra mốc thời gian; rất khó nghĩ tới việc thủ phạm là một khai báo mới ở
chỗ khác trong cùng file.

**Nguyên nhân gốc.** Cơ chế suy luận projection của Spring Data bị nhiễu khi trong cùng một
repository có nhiều interface projection. Đây là hành vi của framework, không phải lỗi logic
của mã ứng dụng — nghĩa là không có cách nào đọc mã ứng dụng mà suy ra được.

**Cách sửa.** Truy vấn thứ hai trả `List<Object[]>` thay vì projection, kèm comment giải
thích để không ai "cải tiến" nó ngược lại:

```java
/**
 * Trả Object[] thay vì interface projection: khai báo thêm một projection
 * thứ hai trong repository này làm truy vấn JPQL bên trên trả rỗng (đã tái
 * hiện bằng test tích hợp) — Object[] không đụng cơ chế projection nên an toàn.
 * Mỗi phần tử: [0] ngày dạng chuỗi 'YYYY-MM-DD', [1] số lượng.
 */
@Query(value = "select to_char(u.at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') as day, "
        + "count(*) as total from gloss_usages u where u.at >= :sinceTs "
        + "group by day order by day", nativeQuery = true)
List<Object[]> countByDaySince(@Param("sinceTs") Instant sinceTs);
```

**Bài học.** Test tích hợp có giá trị cao nhất đúng ở những chỗ mà hành vi do framework
quyết định chứ không do mã ứng dụng quyết định. Lỗi này chỉ được xác nhận là thật (chứ
không phải phỏng đoán) nhờ tái hiện được bằng test.

### A.3.4 JDK HttpClient gửi `Upgrade: h2c`, uvicorn từ chối (A2)

**Triệu chứng.** Mọi lời gọi từ Spring sang `POST /infer` của ML service đều thất bại. Phía
Java chỉ thấy một `RestClientException` chung chung; phía Python, uvicorn ghi log
"Invalid HTTP request" mà không kèm chi tiết.

**Vì sao khó tìm.** Đây là lỗi nằm chính xác ở đường biên giữa hai ngôn ngữ và hai hệ sinh
thái. Cả hai phía đều "đúng" theo tiêu chuẩn riêng: `RestClient` của Spring dùng JDK
HttpClient mặc định thử nâng cấp lên HTTP/2 qua cơ chế h2c, còn h11 (thư viện HTTP của
uvicorn) chỉ nói HTTP/1.1 và từ chối request có header nâng cấp kèm chunked encoding. Không
có công cụ nào ở tầng ứng dụng chỉ ra được điều này — phải dump gói tin TCP thô mới nhìn
thấy header thực sự được gửi đi.

**Nguyên nhân gốc.** Một mặc định của thư viện Java không tương thích với một mặc định của
thư viện Python. Không bên nào có lỗi; lỗi nằm ở giả định ngầm rằng "HTTP là HTTP".

**Cách sửa.** Ép phiên bản giao thức, và ghi lại toàn bộ chẩn đoán ngay tại chỗ sửa:

```java
// Ép HTTP/1.1: JDK HttpClient mặc định gửi "Upgrade: h2c" + chunked,
// uvicorn/h11 từ chối ("Invalid HTTP request") — tìm ra qua dump TCP thô.
HttpClient http11 = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_1_1)
        .connectTimeout(CONNECT_TIMEOUT)
        .build();
```

**Bài học.** Ở kiến trúc đa ngôn ngữ, đường biên giữa các tiến trình là nơi mật độ lỗi cao
nhất và cũng là nơi công cụ chẩn đoán yếu nhất. Khi triệu chứng ở tầng ứng dụng không đủ
thông tin, phải sẵn sàng tụt xuống tầng thấp hơn thay vì thử-sai ở tầng ứng dụng.

### A.3.5 React StrictMode làm chết vòng lặp nhận diện (A4)

**Triệu chứng.** Ở môi trường phát triển, camera bật sáng nhưng không có khung xương nào
được vẽ và fps hiển thị 0. Không có lỗi trong console. Ở bản build production thì chạy bình
thường.

**Vì sao khó tìm.** Cách sửa trực giác chính là nguyên nhân. React StrictMode ở chế độ dev
cố tình chạy effect → cleanup → effect lần nữa để phơi bày các effect không dọn dẹp đúng.
Phản ứng tự nhiên khi thấy effect chạy hai lần là "chặn lần chạy thứ hai bằng một cờ ref".
Nhưng cleanup của lần chạy **thứ nhất** đã đặt cờ `disposed = true`, nên lần chạy thứ hai —
là lần duy nhất còn sống — thoát ra ngay lập tức. Hệ quả là bản vá dành cho StrictMode lại
biến StrictMode thành thứ giết chương trình.

**Nguyên nhân gốc.** Nhầm lẫn giữa hai bài toán khác nhau: "làm sao để effect không chạy hai
lần" và "làm sao để effect chạy hai lần vẫn đúng". React yêu cầu cái thứ hai.

**Cách sửa.** Viết effect theo kiểu **huỷ được**: sau mỗi `await`, kiểm tra cờ và tự giải
phóng đúng tài nguyên vừa tạo ra ở bước đó.

```ts
const created = await createLandmarkers();
if (disposed) {
  created.close();          // vừa tạo xong đã bị huỷ -> tự dọn, không rò
  return;
}
landmarkers = created;

const media = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
if (disposed) {
  media.getTracks().forEach((t) => t.stop());
  return;
}
stream = media;
```

Toàn bộ lý do được ghi thành docblock ở đầu file `useVisionPipeline.ts:16-20` để hook dùng
chung này không bị viết lại theo lối cũ.

**Bài học.** StrictMode không phải chướng ngại cần vô hiệu hoá, nó là một bộ dò lỗi vòng đời
chạy miễn phí. Nguyên tắc rút ra và áp dụng lại nhiều lần về sau trong dự án (E2, E3, G10,
G13): mọi tác vụ bất đồng bộ có tài nguyên đi kèm đều phải có đường thoát an toàn ở **mỗi**
điểm `await`, chứ không chỉ ở đầu hàm.

### A.3.6 Vòng cửa sổ trượt lấy cửa sổ từ cuối buffer (A7)

**Triệu chứng.** Hệ thống vẫn trả về gloss, vẫn chạy demo được, chỉ là kết quả trả về trễ và
thiếu; khi client gửi lô lớn thì buffer server phình dần và không bao giờ co lại.

**Vì sao khó tìm.** Không có ngoại lệ, không có log lỗi, không có test nào fail. Đây là lỗi
**thuật toán im lặng**: đầu ra vẫn thuộc đúng miền giá trị hợp lệ nên không có cách nào phát
hiện bằng cách nhìn kết quả. Chỉ có đọc kỹ bất biến của vòng lặp mới thấy.

**Nguyên nhân gốc.** Mã cũ lấy cửa sổ từ **cuối** buffer nhưng lại xoá STRIDE frame ở **đầu**
buffer, và chỉ xử lý một cửa sổ cho mỗi tin nhắn WebSocket:

```java
// mã cũ (diff 3260360)
List<double[]> window = List.copyOf(buffer.subList(buffer.size() - WINDOW, buffer.size()));
buffer.subList(0, STRIDE).clear();
```

Hai chỉ số này chạy về hai hướng ngược nhau. Với mỗi tin nhắn 5 frame gửi lên, buffer chỉ
mất 8 frame ở đầu nhưng cửa sổ luôn bám lấy 32 frame mới nhất ở cuối, nên toàn bộ phần giữa
không bao giờ lọt vào cửa sổ nào. Khi client gửi lô lớn (tối đa 60 frame), tốc độ nạp vượt
tốc độ xả và buffer phình vô hạn.

**Cách sửa.** Cửa sổ luôn lấy từ **đầu** buffer và lặp cho tới khi không đủ frame, kèm trần
số cửa sổ mỗi tin nhắn để một tin nhắn không khoá thread quá lâu:

```java
int windows = 0;
while (buffer.size() >= WINDOW && windows < MAX_WINDOWS_PER_MESSAGE) {
    List<double[]> window = List.copyOf(buffer.subList(0, WINDOW));
    buffer.subList(0, STRIDE).clear();
    windows++;
    ...
}
```

**Bài học.** Với cấu trúc dữ liệu kiểu hàng đợi trượt, phải phát biểu rõ bất biến ("cửa sổ
kế tiếp luôn bắt đầu tại đầu buffer; mỗi lần xử lý tiêu thụ đúng STRIDE frame") rồi mới viết
mã, thay vì viết mã rồi kiểm bằng cách chạy thử. Lỗi im lặng không tự khai báo.

### A.3.7 "Tay ma" khi co giãn thời gian trong augmentation (D6)

**Triệu chứng.** Không có triệu chứng quan sát được lúc chạy. Dữ liệu huấn luyện sau khi
augment chứa những frame có bàn tay đầy đủ 21 điểm ở vị trí mà trong video gốc **không hề có
bàn tay nào**.

**Vì sao khó tìm.** Augmentation là bước không ai nhìn bằng mắt: nó chạy trong DataLoader,
sinh ra tensor, và tensor đó trông hoàn toàn hợp lệ. Hậu quả duy nhất là accuracy thấp hơn
đáng ra phải có, mà accuracy thấp thì luôn có mười lý do khác dễ đổ lỗi hơn (thiếu dữ liệu,
model nhỏ, learning rate). Lỗi này thuộc loại làm hỏng kết quả nghiên cứu mà không để lại
dấu vết.

**Nguyên nhân gốc.** Quy ước biểu diễn: trong vector 144 chiều, giá trị 0 mang nghĩa
**"điểm này không tồn tại"**, chứ không phải "toạ độ bằng 0". Phép nội suy tuyến tính của
time-warp không biết quy ước đó — khi nội suy giữa một frame có tay và một frame không tay,
nó cho ra một bàn tay "nửa vời" lơ lửng giữa không trung. Cùng một quy ước 0-nghĩa-là-vắng
mặt cũng chi phối các bước augment khác (dịch/scale chỉ áp lên điểm có mặt, jitter chỉ áp
lên toạ độ khác 0).

**Cách sửa.** Nội suy thêm một chỉ báo "có tay" riêng cho từng tay, và xoá cả block toạ độ
của tay đó ở những frame mà chỉ báo không đạt 1:

```python
warped = np.stack(
    [np.interp(old_idx, base, frames[:, d]) for d in range(FRAME_DIMS)], axis=1
).astype(np.float32)
for lo, hi in ((0, 63), (63, 126)):
    present = (np.abs(frames[:, lo:hi]).sum(axis=1) > 1e-6).astype(np.float32)
    indicator = np.interp(old_idx, base, present)
    warped[indicator < 0.999, lo:hi] = 0.0
```

**Bài học.** Khi một giá trị đặc biệt trong dữ liệu mang ý nghĩa ngoài miền số học
(0 = vắng mặt, `NaN` = thiếu, `-1` = chưa xác định), mọi phép biến đổi số học trên dữ liệu
đó đều phải được rà lại một lượt. Trong pipeline này, quy ước đó buộc phải được tôn trọng ở
bốn nơi độc lập: trình duyệt (`landmarks.ts`), script trích landmark
(`extract_landmarks.py`), augmentation (`dataset.py`) và mô hình (masked mean pooling trong
`model.py`).

---

## A.4 Bài học chung

**1. Test bảo vệ đường đi đã biết; review tìm ra đường đi chưa nghĩ tới.**
77,9 % số lỗi trong phụ lục này do review đối kháng phát hiện chứ không phải do test. Điều
đó không hạ thấp giá trị của test: chức năng của test là **khoá bản vá lại**, để lỗi đã sửa
không quay lại khi mã tiếp tục thay đổi. Mười bản vá trong bảng A.2 được kèm test hồi quy
ngay tại thời điểm sửa, và chính nhờ cơ chế đó mà các lỗi A5, A6, A16, E4, E6 không tái phát
qua các đợt tích hợp sau. Quy trình rút ra: review để **tìm**, test để **giữ**.

**2. Lỗi nguy hiểm nhất là lỗi im lặng.**
Nhóm khó nhất trong bảng — G2, G4, A7, D6 — không có điểm chung về tầng công nghệ, nhưng có
chung một đặc điểm: hệ thống vẫn chạy, không ngoại lệ, không cảnh báo biên dịch, đầu ra vẫn
thuộc miền giá trị hợp lệ. Ba dạng lỗi im lặng gặp trong dự án này là: framework bỏ qua cấu
hình mà không báo (G2), một khai báo mới làm hỏng hành vi cũ ở nơi khác (G4), và thuật toán
sai nhưng đầu ra vẫn "trông đúng" (A7, D6). Đối phó với chúng cần một thói quen cụ thể:
**sau khi vá thì phải đo lại**, không dừng ở việc mã đã biên dịch được.

**3. Đường biên là nơi tập trung lỗi.**
Đếm theo vị trí, phần lớn các lỗi khó nằm đúng tại chỗ hai thành phần gặp nhau: Java gặp
Python (A2, D9), trình duyệt gặp mô hình huấn luyện (D10 — nhịp 25 fps), múi giờ backend gặp
múi giờ client (F2), giao thức WebSocket gặp cách hiểu của người viết client (F1), quy ước
Modulith gặp cơ chế AOP của Spring (G2). Lý do là ở đường biên, mỗi bên đều "đúng" theo tiêu
chuẩn riêng nên không bên nào báo lỗi. Biện pháp mà dự án áp dụng là biến giả định ngầm
thành **contract kiểm tra được**: `/health` của ML service công bố `window` để Spring đối
chiếu (D9); frame sai số chiều bị từ chối ngay ở WebSocket (A6); cửa sổ sai kích thước bị
trả 422 thay vì âm thầm đệm 0 (D9); `fps_hint` được ghi vào `labels.json` (D10).

**4. Endpoint công khai phải được thiết kế với giả định bị lạm dụng.**
`/ws/translate` và `POST /api/dataset/samples` không yêu cầu đăng nhập vì nhu cầu demo và
thu mẫu. Hệ quả là mọi giới hạn đầu vào phải nằm ngay tại điểm nhận: trần frame mỗi lô, kiểm
số chiều, trần buffer mỗi phiên (A6), kiểm gloss theo từ điển (A12), trần dòng ghi DB mỗi
phiên (G7), trần dung lượng upload (C1). Bảng A.2 có **5** mục được xếp vào tầng bảo mật
(A5, A6, G5, G6, G7); trong đó A6 và G7 — cùng với A12 tuy được xếp ở tầng core — đều xuất
phát từ đúng một thiếu sót: quên rằng "công khai" nghĩa là "bất kỳ ai, bao nhiêu lần cũng
được".

**5. Ghi lý do ngay tại chỗ sửa, không ghi trong tài liệu rời.**
Gần như mọi bản vá trong phụ lục này đều kèm một comment nêu triệu chứng và nguyên nhân
ngay tại dòng mã liên quan. Đây là quyết định có chủ đích chứ không phải thói quen: một bản
vá không có lý do đi kèm sẽ bị người sau (kể cả chính tác giả sau vài tuần) "dọn dẹp" cho
gọn và lỗi quay lại. Các trường hợp cụ thể có nguy cơ đó cao nhất là `TransactionTemplate`
thay cho `@Transactional` (G2), `List<Object[]>` thay cho projection (G4), `HTTP_1_1` ép
tường minh (A2) và đóng-mở lại WebSocket thay cho `flush` (F1) — cả bốn đều **trông như mã
xấu** nếu không đọc lý do. Phụ lục này thực chất là bản tổng hợp của những comment đó.

---

## A.5 Khai báo trung thực về số liệu

Theo quy tắc "không bịa số" của dự án, phần này ghi rõ những chỗ số liệu không khớp nhau
hoặc không kiểm chứng được, để hội đồng có thể tự đối chiếu.

**1. Con số "34 lỗi" trong tài liệu hiện tại là số cũ và không đầy đủ.**
`docs/report/README.md` dòng 13 và `Plan-sprint2-ui.md` dòng 271 ghi "34 lỗi". Con số này
bằng 18 (đợt 1) + 16 (đợt 7), tức chỉ gồm hai đợt lớn, không tính các đợt 2, 3, 4, 5, 6, 8
và công cụ đánh giá. Tổng truy được bằng chứng theo tiêu chí ở đầu phụ lục là **68**. Hai
tài liệu trên cần được cập nhật lại theo con số này.

**2. Đợt 1 tuyên bố 18 lỗi, chỉ dựng lại được 17 mục riêng biệt.**
Thông điệp commit `3260360` và `PLAN.md` dòng 148 ghi "18 lỗi thật (3 qua test E2E + 15 qua
review đa tác nhân)", nhưng danh sách liệt kê ngay sau đó ở `PLAN.md` dòng 149-153 chỉ nêu
tên 16 mục. Đối chiếu với thông điệp commit (có thêm mục "frameBuffer cũ") dựng lại được
**17** mục riêng biệt, ghi trong bảng A.2 là A1-A17. Mục thứ 18 nhiều khả năng là do tách
A6 ("WebSocket không giới hạn buffer/số chiều") hoặc A13 ("ghi file không atomic" + "dọn file
mồ côi") thành hai lỗi riêng. Vì không xác định được chắc chắn, phụ lục này ghi **17** và
không làm tròn lên. Tương tự, việc phân loại "3 lỗi do test E2E" trong thông điệp commit chỉ
xác minh được **2** trường hợp có comment ghi rõ "tìm ra qua test E2E" (A1, A3);
trường hợp thứ ba **[CẦN SỐ LIỆU]** — không có bằng chứng trong mã để xác định đó là lỗi nào.

**3. Đợt 4 tuyên bố 16 lỗi review ML, chỉ truy được 12.**
Thông điệp commit `e1fdf78` ghi "16 lỗi review đã sửa" nhưng phần liệt kê kết thúc bằng dấu
ba chấm và chỉ nêu tên **8** mục (tương ứng D4, D5, D6, D7, D8, D12, D9, D10 trong bảng A.2).
Cộng thêm D11 — được nêu ở mục "Hạ tầng đi kèm" của cùng commit chứ không nằm trong danh
sách 16 — và 3 lỗi của `extract_landmarks.py` thuộc commit `59b2a31` (D1-D3), tổng truy được
là **12** (D1-D12). **[CẦN SỐ LIỆU]** cho 7 tới 8 lỗi ML còn lại (tuỳ D11 có được tính vào
danh sách 16 hay không): chúng không có tên, không có diff riêng và không có comment tương
ứng trong mã — không được suy đoán và không được đưa vào bảng.

Ghi chú phụ ở chiều ngược lại: tiêu đề commit `59b2a31` ghi "sửa 2 bug script" nhưng phần
thân của chính commit đó mô tả **3** sửa lỗi riêng biệt trong `extract_landmarks.py`
(timestamp phải tăng đơn điệu; nhảy 1 s giữa các video để tracker không kéo tay video trước
sang; mặc định cột CSV khớp Multi-VSL), và cả ba đều còn comment tại chỗ trong mã hiện tại.
Bảng A.2 ghi **3** theo bằng chứng trong mã, không theo con số ở tiêu đề commit.

**4. Số liệu về quy mô bộ kiểm thử trong README chưa được cập nhật.**
`README.md` dòng 87-90 ghi "9 test" (Java) và "17 kiểm tra E2E". Đếm lại từ mã nguồn: **17**
phương thức `@Test` trong **9 file**, và **21** khẳng định `check()` trong
`tests/e2e/infrastructure.test.js` (cộng 6 trong `sentence.test.js`). Con số 21 khớp với kết
quả ghi trong commit `07807c2` và `docs/merge-notes/branch-c-sprint2.md` dòng 52.

**5. Chưa có lỗi nào truy được ở ba khu vực sau.**
Không có bằng chứng trong kho mã về lỗi liên quan tới CI/GitHub Actions, tới Docker Compose,
hoặc tới việc chạy mô hình ONNX thật. Lý do là hiện chưa có mô hình thật: thư mục
`apps/ml/model/` không tồn tại, `apps/ml/app/main.py` đang chạy chế độ stub, và
`docs/report/README.md` dòng 41-42 tự xác nhận chương kết quả nhận diện đang chờ quyền
dataset. Các lỗi D4-D10 được phát hiện trên dây chuyền huấn luyện chạy smoke-test với dữ
liệu giả, không phải trên một lượt huấn luyện thật.

**6. Chưa đo được ảnh hưởng định lượng của các lỗi hiệu năng.**
Các lỗi A8 (giữ connection Hikari), A9 (thiếu timeout), G9 (gộp theo ngày ở JVM) và A7
(buffer phình) đều là lỗi hiệu năng/tài nguyên, nhưng **[CẦN SỐ LIỆU]** cho mức độ ảnh
hưởng: dự án chưa chạy đo tải nên không có con số về số phiên đồng thời tối đa trước và sau
khi vá, cũng chưa có số liệu độ trễ end-to-end p50/p95. Phần mô tả trong bảng A.2 chỉ nêu
cơ chế gây lỗi, không kèm số đo.

**7. Số liệu duy nhất được đo tự động trong dự án là chất lượng ghép câu.**
`docs/report/data/sentence-eval.md` và `sentence-eval.json` do
`training/eval/sentence_eval.py` sinh ra bằng cách gọi Gemini thật. Ba lỗi I1-I3 trong bảng
A.2 chính là các lỗi của công cụ đo này — nghĩa là bản thân công cụ sinh số liệu cũng đã
phải qua một vòng soát trước khi số liệu của nó được dùng.
