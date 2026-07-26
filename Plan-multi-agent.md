# Plan-multi-agent — Kế hoạch 3 agent làm việc song song

> **Cách dùng file này**: bạn là một AI agent được giao MỘT branch. Đọc TOÀN BỘ file
> theo thứ tự: (1) Bối cảnh → (2) Quy ước chung → (3) Mục branch của bạn → (4) Cổng
> kiểm tra. Chỉ làm việc trong phạm vi branch của mình. Nếu plan mâu thuẫn với code
> hiện tại, **ưu tiên code hiện tại** và ghi chú mâu thuẫn vào file merge-notes của bạn.

---

## 1. Bối cảnh dự án (đọc 2 phút)

**SignBridge** — đồ án tốt nghiệp: dịch ngôn ngữ ký hiệu tiếng Việt (VSL) hai chiều,
thời gian thực. Kế hoạch tổng ở [PLAN.md](PLAN.md). Kiến trúc:

```
apps/web   Next.js 16 (App Router, TS) — MediaPipe chạy trong browser, giao diện tối zinc-950
apps/core  Spring Boot 4.1 + Spring Modulith 2.1 (Java 21, Maven) — modular monolith 5 module:
           identity | dictionary | translation | dataset | analytics
apps/ml    FastAPI — suy luận gloss (ONNX thật hoặc stub)
training/  pipeline huấn luyện PyTorch (chạy Colab/local)
tests/e2e  test end-to-end Node (chạy trên stack thật)
```

Đã chạy được: dịch ký hiệu→câu nói (WebSocket→ML→LLM Gemini→TTS, model đang là stub
chờ dataset), dịch nói→ký hiệu (`/speak` phát clip từ điển quốc gia QIPEDC, ~3.300 từ),
thu mẫu dataset (`/collect`), auth JWT (admin bootstrap từ config, đăng ký công khai chỉ
ra USER). Test hiện có: 11 test Java + 21 check E2E — **tất cả phải xanh sau việc của bạn**.

## 2. Mô hình làm việc

| Branch | Agent | Phạm vi |
|---|---|---|
| `feature/admin-studio` | **AGENT A** | Đăng nhập + trang quản trị từ điển + quay clip trong browser |
| `feature/collect-campaign` | **AGENT B** | Chiến dịch thu mẫu + module analytics + dashboard |
| `feature/ml-pretrain` | **AGENT C** (trưởng tích hợp) | VOYA pretraining, fingerspelling, merge A+B vào main |

- Mỗi agent làm trong **git worktree riêng** (3 thư mục, 3 branch — không giẫm nhau).
- **KHÔNG agent nào push/commit lên `main`.** Chỉ push branch của mình.
- AGENT C là người duy nhất merge vào main, theo thứ tự A → B → C.
- Agent A và B **KHÔNG chạy dev stack** (cổng 3000/8000/8080 thuộc máy chính) — kiểm tra
  bằng test tự động (Testcontainers tự cấp cổng ngẫu nhiên, an toàn) và build.

## 3. QUY ƯỚC CHUNG (bắt buộc, mọi vi phạm coi như hỏng branch)

### 3.1 Git
- Branch tạo từ `main` mới nhất. Commit message **tiếng Việt không dấu**, dòng đầu ≤ 72 ký tự,
  có tiền tố branch: `[A] Trang dang nhap + luu token`, `[B] Entity CollectTarget + API campaign`.
- Commit nhỏ theo từng phần việc hoàn chỉnh (compile + test xanh mới commit).
- KHÔNG force-push. KHÔNG sửa lịch sử. KHÔNG merge main vào branch mình (AGENT C lo).

### 3.2 Phạm vi file — "lãnh thổ" từng branch
| | AGENT A | AGENT B | AGENT C |
|---|---|---|---|
| `apps/core` | chỉ `dictionary/` | chỉ `dataset/`, `analytics/` | (tích hợp) |
| `apps/web/src/app` | `login/`, `admin/` (tạo mới) | `collect/`, `stats/` (stats tạo mới) | `speak/` |
| `apps/web/src/lib` | `auth.ts` (tạo mới) | KHÔNG | `landmarks.ts`, `speech.ts` |
| `training/` | KHÔNG | KHÔNG | toàn bộ |
| test Java | trong package module mình | trong package module mình | — |

**File dùng chung — CẤM SỬA TRỰC TIẾP**: `SecurityConfig.java`, `application.yml`, `pom.xml`,
`page.tsx` (trang chủ), `package.json`, `.github/`, `PLAN.md`, file này.
Cần thay đổi gì ở đó → ghi CHÍNH XÁC diff mong muốn vào `docs/merge-notes/<tên-branch>.md`
(tạo file, commit cùng branch) — AGENT C sẽ áp khi merge. KHÔNG thêm thư viện/dependency mới
khi chưa ghi vào merge-notes kèm lý do.

### 3.3 Java (apps/core)
- **Spring Modulith là luật**: không import class nội bộ module khác. Giao tiếp xuyên module
  chỉ qua (a) interface public ở package gốc module (mẫu: `dictionary/SignCatalog.java`) hoặc
  (b) application event (mẫu: `translation/GlossRecognized.java` → `analytics/GlossStatsListener`).
  Test `ModularityTests` sẽ fail nếu vi phạm — không được sửa test để lách.
- Controller/Service/Repository **package-private** (không `public`) trừ khi là API xuyên module.
- DTO là `record` khai báo trong controller. Validation bằng `jakarta.validation` (@NotBlank...).
  Lỗi nghiệp vụ: `throw new ResponseStatusException(HttpStatus.X, "thông điệp tiếng Việt")`.
- Entity: Lombok `@Getter @Setter @Builder @NoArgsConstructor(PROTECTED) @AllArgsConstructor(PRIVATE)`,
  bảng snake_case số nhiều (`collect_targets`). KHÔNG viết migration — dev đang dùng `ddl-auto: update`.
- Thụt lề **tab** (theo code sẵn có). Javadoc/comment **tiếng Việt**, chỉ giải thích "vì sao",
  không giải thích "dòng này làm gì".
- Endpoint mới phải khớp bảng phân quyền hiện có trong `SecurityConfig` (GET `/api/signs/**`,
  `/clips/**`, `/api/dataset/stats` công khai; POST/PUT/DELETE `/api/signs/**` cần ADMIN;
  còn lại mặc định cần đăng nhập). Cần mở thêm đường công khai → merge-notes.

### 3.4 Web (apps/web)
- App Router: `page.tsx` là server component chỉ chứa `metadata` + render `<XxxTool />`;
  toàn bộ logic trong component client `"use client"` cùng thư mục (mẫu: `speak/`).
- Gọi API qua `API_BASE` import từ `@/lib/landmarks`. KHÔNG hardcode `http://localhost:8080`.
- UI **tiếng Việt**, nền tối: `bg-zinc-950 text-zinc-100`, thẻ `bg-zinc-900 rounded-lg/xl`,
  nút chính `bg-emerald-600 hover:bg-emerald-500`, phụ `bg-sky-700`, cảnh báo `text-amber-400`.
  Chỉ Tailwind — KHÔNG thêm thư viện UI/chart (biểu đồ vẽ bằng div/CSS).
- Ref trong render là lỗi (React 19): gán ref trong effect/handler. `useEffect` phải
  hủy được (xem mẫu `lib/useVisionPipeline.ts`). Token đọc/ghi `localStorage` chỉ trong
  client component, key tiền tố `signbridge.` (VD `signbridge.token`).

### 3.5 Python (training/, apps/ml)
- Type hint đầy đủ, docstring tiếng Việt đầu file nêu cách chạy. CLI bằng `argparse`.
- Chạy bằng venv có sẵn: `apps/ml/.venv/Scripts/python`. Thư viện mới → merge-notes.

### 3.6 CỔNG KIỂM TRA — chạy đủ TRƯỚC khi kết thúc, dán kết quả vào báo cáo cuối
```powershell
cd apps/core; ./mvnw -B test          # toàn bộ test Java + Modulith verify — 0 fail
cd apps/web;  npx tsc --noEmit        # 0 lỗi
cd apps/web;  npx eslint src --max-warnings 0
cd apps/web;  npm run build           # build thành công
git diff --name-only origin/main      # đối chiếu: KHÔNG file nào ngoài lãnh thổ (trừ docs/merge-notes/)
```
(Test Java dùng Testcontainers — cần Docker đang chạy; cổng ngẫu nhiên nên không đụng stack chính.)

---

## 4. BRANCH A — `feature/admin-studio` (AGENT A)

**Mục tiêu**: người quản trị đăng nhập được trên web, quản lý từ điển và **quay clip ký hiệu
ngay trong browser** — để tự bổ sung các từ mà từ điển quốc gia thiếu ("cảm ơn", "bác sĩ"...).

### A1. Hạ tầng auth phía web — `src/lib/auth.ts`
- Hàm `login(email, password)` → POST `/api/auth/login`, lưu `{token, email, name, role}`
  vào `localStorage` key `signbridge.auth`; `logout()`, `getAuth()`, `authHeader()`.
- Hook `useAuth()` trả `{auth, login, logout}` cho client component.

### A2. Trang `/login`
- Form email + mật khẩu, lỗi hiện tiếng Việt ("Sai email hoặc mật khẩu").
- Đăng nhập xong chuyển về `/admin`. Đã đăng nhập mà vào `/login` → chuyển `/admin`.
- Tài khoản dev có sẵn: `admin@signbridge.vn` / `signbridge-admin-dev` (ghi gợi ý ngay trên form).

### A3. Trang `/admin` — quản trị từ điển
- Client-side guard: chưa đăng nhập hoặc role ≠ ADMIN → chuyển `/login`.
- Bảng ký hiệu: ô tìm kiếm (lọc theo meaningVi/gloss), phân trang client 50 dòng/trang
  (từ điển ~3.300 mục — KHÔNG render tất cả).
- Tạo ký hiệu mới (form gloss + meaningVi + category), sửa meaningVi/category, xóa (confirm).
- Cột trạng thái clip: có clip (▶ xem) / chưa có (nút "Quay clip").

### A4. Quay clip trong browser (điểm ăn tiền của branch)
- Modal: xin quyền camera → preview → đếm ngược 3-2-1 → quay ~3 giây bằng **MediaRecorder**
  (`video/webm`) → xem lại → "Dùng clip này" upload `POST /api/signs/{id}/clip`
  (multipart, field `file`, kèm `Authorization` — endpoint ĐÃ CÓ, nhận webm/mp4) → cập nhật bảng.
- Quay lại được nếu chưa ưng. Đóng modal phải tắt camera (stop tracks).

### A5. Backend (chỉ module `dictionary`)
- Thêm vào `SignController`:
  - `PUT /api/signs/{id}` body `{meaningVi, category}` → 200 Sign. **Gloss bất biến** (dataset
    tham chiếu theo gloss). 404 nếu không có.
  - `DELETE /api/signs/{id}` → 204; xóa cả file clip (thêm method `delete(long signId)` vào
    `ClipStorage`). 404 nếu không có.
  - (Phân quyền PUT/DELETE cần ADMIN — `SecurityConfig` hiện tại ĐÃ cover, không cần merge-notes.)
- Test mới `dictionary/SignAdminIntegrationTests.java` (mẫu Testcontainers:
  `AuthFlowIntegrationTests`): USER bị 403 khi PUT/DELETE; ADMIN sửa được, xóa được (kể cả
  ký hiệu có clip); PUT không đổi được gloss.

### A6. Definition of Done
- [ ] Luồng: login → admin → tạo từ "CAM_ON / cảm ơn / GREETING" → quay clip → thấy ▶ trong bảng
- [ ] Refresh trang vẫn đăng nhập; logout xong vào /admin bị đá về /login
- [ ] Cổng kiểm tra 3.6 xanh toàn bộ; `docs/merge-notes/feature-admin-studio.md` liệt kê
  thay đổi file chung cần AGENT C áp (nếu có — dự kiến: thêm link /admin vào trang chủ)

---

## 5. BRANCH B — `feature/collect-campaign` (AGENT B)

**Mục tiêu**: biến `/collect` thành chiến dịch thu mẫu có mục tiêu + tiến độ (chuẩn bị cho
buổi quay với 5-7 người), và làm module `analytics` lưu số liệu thật (tuần 11 của PLAN).

### B1. Backend module `dataset` — chiến dịch thu mẫu
- Entity `CollectTarget`: `id, gloss (unique, not null), targetPerSigner (int, not null),
  active (bool, default true), createdAt`. Bảng `collect_targets`.
- `GET /api/dataset/campaign` → công khai (cần merge-notes mở đường — xem B4):
```json
{ "targets": [ { "gloss": "XIN_CHAO", "meaningVi": "xin chào", "targetPerSigner": 10,
                 "countsBySigner": {"Khoa": 7, "Lan": 2}, "total": 9 } ],
  "signers": ["Khoa", "Lan"] }
```
  (meaningVi lấy qua `SignCatalog` — KHÔNG import repository của dictionary.)
- `PUT /api/dataset/campaign` (ADMIN) body `{"targets":[{"gloss":"XIN_CHAO","targetPerSigner":10}]}`
  → thay toàn bộ danh sách; 400 nếu gloss không tồn tại trong từ điển (check `SignCatalog`).
- `GET /api/dataset/samples?gloss=&signerName=` (ADMIN) → list metadata SampleRecord.
- `DELETE /api/dataset/samples/{id}` (ADMIN) → xóa DB + file (`SampleStorage.delete` ĐÃ CÓ); 404 nếu không có.

### B2. Web `/collect` nâng cấp (giữ nguyên pipeline quay `useVisionPipeline` + logic upload hiện có)
- **QUAN TRỌNG NHẤT — panel "clip mẫu để bắt chước"**: người quay KHÔNG biết ngôn ngữ ký
  hiệu, nên khi chọn từ phải hiện **clip mẫu của từ điển quốc gia** (lấy `clipUrl` của sign,
  đã có sẵn ~3.300 clip) ngay CẠNH khung webcam: autoplay + loop + muted, nút
  "chậm 0.5x" (`playbackRate`). Quy trình trên UI ghi rõ: *"1. Xem mẫu vài lần →
  2. Tập theo → 3. Bấm quay"*. Từ không có clip mẫu → không cho quay, hiện chú thích.
- Panel trái thêm: bảng mục tiêu chiến dịch — mỗi từ một thanh tiến độ
  `min(count của signer hiện tại / targetPerSigner, 100%)`, tô xanh khi đủ.
- Nút "▶ Quay từ tiếp theo còn thiếu" tự chọn từ chưa đủ mẫu của người ký hiện tại.
- Sau mỗi lần upload thành công → refresh campaign. Không có chiến dịch (targets rỗng)
  → hiện đúng giao diện cũ (chọn từ tự do, vẫn có panel clip mẫu).
- `PUT /api/dataset/campaign` thêm ràng buộc: chỉ nhận gloss **có clip** (`clipUrl != null`)
  — mục tiêu không có mẫu để bắt chước là mục tiêu vô nghĩa. (Check qua `SignCatalog` —
  cần thêm method `clipUrlOf(gloss)` vào interface này: được phép, cùng module dictionary
  sở hữu nó? KHÔNG — `SignCatalog` thuộc lãnh thổ AGENT A? Cũng không: file đó thuộc module
  dictionary nhưng là API xuyên module. QUYẾT ĐỊNH: AGENT B được thêm MỘT method
  `Optional<String> clipUrlOf(String gloss)` vào `SignCatalog` + `SignCatalogImpl` —
  đây là ngoại lệ lãnh thổ duy nhất, ghi vào merge-notes để AGENT C soát khi merge.)

### B3. Backend module `analytics` — lưu số liệu thật
- Entity `GlossUsage`: `id, sessionId, gloss, confidence, at`. Bảng `gloss_usages`.
- Sửa `GlossStatsListener`: ngoài đếm in-memory, lưu bản ghi `GlossUsage`
  (listener là `@ApplicationModuleListener` — chạy async ngoài hot path, giữ nguyên).
- `GET /api/analytics/summary?days=7` → công khai (merge-notes):
```json
{ "totalGlosses": 123, "byGloss": [{"gloss":"XIN_CHAO","count":45}],
  "byDay": [{"date":"2026-07-26","count":80}] }
```
### B4. Web `/stats` — dashboard (tạo mới)
- Thẻ số tổng + 2 biểu đồ cột **thuần div/CSS** (theo gloss top 10, theo ngày 7 ngày).
- Tự ghi `docs/merge-notes/feature-collect-campaign.md`: (1) mở công khai
  `GET /api/dataset/campaign` + `GET /api/analytics/**` trong SecurityConfig,
  (2) link `/stats` trên trang chủ.

### B5. Test (Testcontainers, package `dataset` + `analytics`)
- Campaign: PUT với gloss không tồn tại → 400; PUT hợp lệ rồi GET → đúng shape JSON,
  đếm mẫu đúng theo signer; DELETE sample xóa cả file.
- Analytics: bắn event `GlossRecognized` (dùng `ApplicationEventPublisher` trong test
  transaction) → chờ listener async → GET summary có số liệu.

### B6. Definition of Done
- [ ] Đặt chiến dịch 3 từ × 2 mẫu qua API → `/collect` hiện tiến độ, quay đủ → thanh xanh
- [ ] `/translate` chạy một lúc → `/stats` hiện số liệu thật
- [ ] Cổng kiểm tra 3.6 xanh; merge-notes đầy đủ

---

## 6. BRANCH C — `feature/ml-pretrain` (AGENT C — Claude phiên chính)

**Mục tiêu**: pretraining trên VOYA_VSL + fingerspelling + trưởng tích hợp.

- C1. Script `training/preprocess/voya_to_npy.py`: tải class .npz từ HF (`Kateht/VOYA_VSL`,
  token trong `.env`), cắt 144 chiều đúng công thức đã kiểm chứng
  (`seq144 = concat(seq[:, 75:201], seq[:, 33:51])`), CHỈ giữ mẫu gốc index 1000 làm eval,
  mẫu augmented làm pretrain; xuất cây `.npy` chuẩn.
- C2. `train.py` thêm `--init-from <checkpoint>`: nạp trọng số pretrain, reset head, LR thấp hơn.
- C3. Pretrain 161 lớp VOYA (local CPU thử nhỏ → Colab đầy đủ), log W&B `run=voya-pretrain`.
- C4. Fingerspelling: dò bảng chữ cái trong kho QIPEDC; có thì import clip `FS_A..FS_Z`
  + `/speak` đánh vần từ thiếu; không có thì ghi nhận vào báo cáo.
- C5. Giám sát import 3.300 từ; theo dõi phản hồi VSL400/Multi-VSL.
- C6. **Tích hợp**: merge A → chạy đủ cổng + E2E live → merge B → như trên → áp merge-notes
  → push main. Xung đột do C xử, không trả ngược cho A/B.

---

## 7. Quy trình khởi động cho AGENT A / B (làm đúng thứ tự)

```powershell
# Chạy MỘT LẦN trong d:\Khoa\DATN trước khi mở agent (người dùng đã chạy sẵn — kiểm tra lại):
git worktree add -b feature/admin-studio    ..\DATN-agent-a main   # cho AGENT A
git worktree add -b feature/collect-campaign ..\DATN-agent-b main  # cho AGENT B
```
Mỗi agent làm việc TRONG THƯ MỤC WORKTREE CỦA MÌNH (`d:\Khoa\DATN-agent-a` hoặc `-b`):
1. `git status` xác nhận đúng branch.
2. Đọc file này đủ 3 mục: Quy ước chung + mục branch mình + Cổng kiểm tra.
3. Làm từng phần (A1→A6 / B1→B6), compile-test-commit theo từng phần.
4. Xong: chạy đủ Cổng kiểm tra 3.6, `git push -u origin <branch>`, viết báo cáo cuối
   (việc đã làm, kết quả từng cổng, nội dung merge-notes).

## 8. Prompt mẫu giao việc (người dùng copy cho từng agent)

**AGENT A** (mở Claude Code trong `d:\Khoa\DATN-agent-a`):
> Đọc file `Plan-multi-agent.md` ở gốc repo. Bạn là **AGENT A**, phụ trách branch
> `feature/admin-studio` (đang checkout sẵn trong thư mục này). Thực hiện đầy đủ mục 4
> (A1→A6), tuân thủ tuyệt đối mục 3 (quy ước, lãnh thổ file, file cấm sửa) và mục 7.
> KHÔNG chạy dev server/stack. Kết thúc bằng việc chạy đủ Cổng kiểm tra 3.6, push branch,
> và báo cáo kết quả từng cổng. Plan mâu thuẫn code hiện tại → ưu tiên code, ghi vào merge-notes.

**AGENT B** (mở Claude Code trong `d:\Khoa\DATN-agent-b`):
> Đọc file `Plan-multi-agent.md` ở gốc repo. Bạn là **AGENT B**, phụ trách branch
> `feature/collect-campaign` (đang checkout sẵn trong thư mục này). Thực hiện đầy đủ mục 5
> (B1→B6), tuân thủ tuyệt đối mục 3 và mục 7. KHÔNG chạy dev server/stack. Kết thúc bằng
> việc chạy đủ Cổng kiểm tra 3.6, push branch, và báo cáo kết quả từng cổng.
> Plan mâu thuẫn code hiện tại → ưu tiên code, ghi vào merge-notes.
