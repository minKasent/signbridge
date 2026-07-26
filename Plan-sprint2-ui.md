# Plan Sprint 2 — Nâng cấp giao diện & hoàn thiện sản phẩm

> **Cách dùng**: bạn là AI agent được giao MỘT branch. Đọc theo thứ tự: §1 kiểm toán →
> §3 quy ước (BẮT BUỘC) → mục branch của bạn → §8 cổng kiểm tra. Plan mâu thuẫn code hiện
> tại → **ưu tiên code**, ghi vào `docs/merge-notes/<branch>.md`.
> Quy ước git/lãnh thổ/Java nền tảng vẫn theo [Plan-multi-agent.md §3](Plan-multi-agent.md) —
> file này BỔ SUNG, không thay thế.

---

## 1. Kiểm toán sprint 1 (thực hiện 26/07/2026, đối chiếu từng dòng code)

**34 hạng mục đã xong · 24 chưa xong — nhưng chỉ 6 bị chặn bởi dữ liệu.**

### ✅ Xong: toàn bộ phần mềm tuần 1→11 của PLAN.md
Kiến trúc 5 module Modulith · pipeline dịch thời gian thực (webcam→MediaPipe→WS→ML→LLM→TTS) ·
chiều ngược `/speak` + 3.319 clip QIPEDC + đánh vần · `/video` dịch từ file · quản trị
`/login` `/admin` `/record` · `/stats` + module analytics · bộ huấn luyện + 4 notebook ·
17 test Java + 21 check E2E + CI xanh. Có thêm 3 trang ngoài lộ trình gốc (`/video`, `/stats`, `/admin`).

### ⛔ Bị chặn bởi dataset (6) — KHÔNG làm được trong sprint này
Tải & tiền xử lý Multi-VSL/VSL400 · train model thật (30→100 gloss) · milestone demo 20 ký hiệu ·
tinh chỉnh prompt LLM theo gloss thật · top-1/top-5 trên test split · accuracy với người ngoài dataset.

### 🔨 Chưa làm nhưng KHÔNG bị chặn (18) — phân bổ trong sprint này
| Việc | Giao cho |
|---|---|
| Đo độ trễ end-to-end (mục tiêu <500ms/ký hiệu) | **B** |
| Module `translation` chưa lưu DB (bảng `sessions`, `transcripts` trong PLAN §3) | **B** |
| Bảng `model_metrics` (lịch sử accuracy theo version) | **B** |
| Nâng TTS lên giọng neural vi-VN (edge-tts, sinh sẵn + cache) | **C** |
| Đánh giá chất lượng câu ghép (Likert ~30 câu — LLM đã chạy được) | **C** |
| `training/export_onnx.py` tách riêng | **C** |
| Chương 1-3 báo cáo + phụ lục lỗi đã bắt | **C** |
| Gộp 3 giao diện đăng nhập rời rạc + quyết định số phận `/record` | **A** |
| Toàn bộ hạng mục giao diện bên dưới | **A/B/C** |
| Khảo sát SUS ≥10 người | Sau khi UI xong (C điều phối) |
| Avatar 3D (tuần 12) | **KHÔNG làm** — đã có clip QIPEDC thay thế |
| Thu mẫu bổ sung (tuần 9) | **ĐÃ HỦY** theo quyết định người dùng |

### 🎨 Kết quả kiểm toán giao diện — vì sao sprint này tồn tại
Trích các phát hiện nghiêm trọng nhất (đã kiểm chứng bằng đọc code):

1. **Không có layout/nav chung** — `layout.tsx` vẫn là boilerplate create-next-app. Không header,
   không điều hướng, không có đường về trang chủ từ bất kỳ trang nào.
2. **Không có design system** — `src/` chỉ có `app/` và `lib/`, KHÔNG có thư mục `components`,
   không một component dùng chung nào. Mỗi trang tự chép lại `min-h-screen bg-zinc-950 p-6`.
3. **`globals.css` đang chống lại chính app** — vẫn khai báo biến light/dark chẳng ai dùng, và
   `body { font-family: Arial }` **đè lên font Geist đã nạp**.
4. **Chữ tiếng Việt hỏng ở tầng font** — Geist nạp với `subsets: ["latin"]`, thiếu subset
   `vietnamese` → dấu tiếng Việt bị fallback sang font hệ thống.
5. **Zero motion** — không một class `transition` nào trong toàn bộ `src/`.
6. **Không có loading/error/not-found ở tầng route** — không có `loading.tsx`, `error.tsx`,
   `not-found.tsx`, `global-error.tsx`.
7. **Không có hệ thống thông báo** — 6 state `message: string` rời rạc, phân biệt thành công/lỗi
   bằng… emoji ✅/❌ ở đầu chuỗi.
8. **`/translate` và `/video` không có `ws.onerror`** — backend chết thì hai trang demo chủ lực
   **hỏng trong im lặng**, nút vẫn hiện như bình thường.
9. **Không có một thuộc tính `aria-*` hay `role=` nào trong toàn bộ codebase** — với một đồ án
   về **công nghệ trợ năng**, đây là điểm hội đồng gần như chắc chắn hỏi.
10. **Tương phản không đạt ở đúng chỗ quan trọng** — `zinc-500` trên `zinc-950` ≈ 4.2:1 (dưới
    chuẩn AA) mà lại là màu của hầu hết dòng gợi ý/empty state.
11. **Không có chiến lược responsive**, panel cố định `w-80`/`w-96`; **không có chế độ máy chiếu**
    (thông tin quan trọng nằm ở `text-xs`).
12. Ba giao diện đăng nhập khác nhau · `/record` trùng chức năng với modal trong `/admin` ·
    favicon mặc định + còn nguyên `next.svg`, `vercel.svg` · key React sinh từ `Date.now()`
    (trùng khi 2 gloss về cùng mili-giây) · `<video>` không đặt kích thước → giật layout.

---

## 2. Mục tiêu sprint 2

Biến 8 trang rời rạc thành **một sản phẩm thống nhất, chiếu máy chiếu đọc được, có trợ năng**:

1. **Design system thật** (shadcn/ui + token OKLCH) thay Tailwind tự chế.
2. **Layout + điều hướng chung**, có chỉ báo tình trạng hệ thống.
3. Trang demo (`/translate`, `/video`) đạt mức **"wow"** khi trình chiếu.
4. Mọi trang đủ **4 trạng thái** (tải/rỗng/lỗi/có dữ liệu) + toast.
5. **Trợ năng là yêu cầu bắt buộc** — đồ án về trợ năng không được có 0 thuộc tính aria.
6. Không hy sinh hiệu năng: theo quy tắc React/Next của Vercel (§3.3).

---

## 3. QUY ƯỚC (bắt buộc)

### 3.1 Nền tảng đã xác minh (26/07/2026 — không cần kiểm lại)

| Thứ | Sự thật |
|---|---|
| Next.js | **16.2.12** App Router + Turbopack |
| React | **19.2.4** |
| Tailwind | **v4** — CSS-first `@import "tailwindcss"`, **KHÔNG có `tailwind.config.js`** |
| shadcn/ui | **Hỗ trợ đầy đủ Tailwind v4 + React 19**: `@theme inline`, màu **OKLCH**, `tw-animate-css` (KHÔNG phải `tailwindcss-animate`), toast dùng **`sonner`** (component `toast` đã bỏ), style **new-york** |
| Magic UI | Cài qua chính CLI shadcn: `npx shadcn@latest add @magicui/<tên>` |
| Animate UI | Cùng cơ chế shadcn, import từ `@/components/animate-ui/...` |
| Motion | `motion@12.42.2`, peer React `^18 \|\| ^19` ✅ — import `from "motion/react"` |
| Gói | **npm** (`npx shadcn@latest ...`) |

### 3.2 Thư viện UI — dùng gì, KHÔNG dùng gì

**DÙNG**: `shadcn/ui` (nền tảng, component nằm trong repo nên sửa được) · `motion` (chuyển động) ·
`Magic UI` (chỉ vài hiệu ứng điểm nhấn ở trang demo/landing) · `lucide-react` (icon) ·
`sonner` (toast) · `recharts` qua component `chart` của shadcn (chỉ cho `/stats`).

**KHÔNG dùng sprint này**: GSAP, React Bits, Aceternity, Cult UI, Eldora UI, Kokonut UI, Swiper,
AlignUI, Park UI, Ark UI, Base UI… Lý do: chồng chéo với bộ trên, mỗi thư viện kéo theo một hệ
token/CSS riêng dễ đá nhau, và đồ án cần **nhất quán** hơn là nhiều hiệu ứng. Muốn thêm → ghi
merge-notes kèm lý do, AGENT C quyết khi merge.

### 3.3 Quy tắc React/Next — **nạp skill `vercel-react-best-practices` trước khi viết component**

Bốn quy tắc trọng yếu với dự án này:
1. **`bundle-dynamic-imports`** — component nặng (MediaPipe ~13MB WASM, biểu đồ, modal quay clip)
   phải nạp bằng `next/dynamic` với `{ ssr: false }`.
2. **`rendering-conditional-render`** — dùng ternary `cond ? <A/> : null`, KHÔNG dùng `cond && <A/>`.
3. **`rerender-transitions` / `rerender-use-deferred-value`** — tìm kiếm trên 3.300 ký hiệu phải
   dùng `useDeferredValue`/`startTransition`.
4. **`rerender-use-ref-transient-values`** — giá trị đổi mỗi frame (landmark, fps) giữ trong ref.

Thêm: `page.tsx` luôn là **server component** (chỉ `metadata` + render component client) ·
`js-index-maps` cho tra cứu lặp · key React phải ổn định (**không dùng `Date.now()`**) ·
`<video>`/`<canvas>` luôn có `width`/`height` hoặc `aspect-ratio` để không giật layout.

### 3.4 Quy ước giao diện

- **Tiếng Việt 100%**, kể cả thông báo lỗi.
- **Token, không hardcode màu**: dùng `bg-background bg-card bg-muted text-muted-foreground
  border-border bg-primary` — KHÔNG viết `bg-zinc-900` nữa (Phase 0 map token về đúng tông hiện tại).
- **Component**: ưu tiên `@/components/ui/*`; cần biến thể → thêm `variant`, không tạo bản sao.
- **4 trạng thái bắt buộc** cho mọi màn hình có dữ liệu bất đồng bộ: `Skeleton` khi tải · empty
  state có icon + câu gợi ý hành động · error state có nút thử lại · trạng thái có dữ liệu.
- **Toast (sonner)** cho kết quả hành động; chữ lỗi trần chỉ dùng khi gắn với một field.
- **Máy chiếu**: trên `/translate`, `/video`, `/speak`, `/stats` — thông tin chính ≥ `text-3xl`,
  nhãn phụ ≥ `text-sm`; cấm để thông tin quan trọng ở `text-xs`.
- **Chuyển động**: ≤300ms, có ý nghĩa, tôn trọng `prefers-reduced-motion`.
- **Trợ năng (BẮT BUỘC — đây là đồ án trợ năng)**: nút chỉ có icon phải có `aria-label` · lỗi
  bọc `role="alert"` + `aria-live` · modal có `role="dialog"` + `aria-modal` + bẫy focus +
  đóng bằng Escape · form dùng `<form onSubmit>` + `<label>` thật + `autoComplete` · giữ focus
  ring · tương phản chữ ≥ 4.5:1 (**bỏ `text-zinc-500` trên nền tối** — dùng `text-muted-foreground`
  đã được Phase 0 chỉnh đạt chuẩn).

---

## 4. PHASE 0 — Nền tảng (AGENT C làm TRƯỚC, push thẳng `main`)

⚠️ **A và B chỉ bắt đầu SAU khi Phase 0 lên `main`.** Lý do: `globals.css`, `layout.tsx`,
`package.json`, `components.json` là file dùng chung.

1. `npx shadcn@latest init` (new-york, base zinc, CSS variables) → `components.json`,
   `src/lib/utils.ts` (`cn`), token trong `globals.css`.
2. Cài `motion`, `sonner`, `lucide-react`, `tw-animate-css`.
3. Primitives: `button card input label badge skeleton dialog alert-dialog select tabs tooltip
   separator scroll-area sonner dropdown-menu avatar progress table command popover`.
4. **Sửa 2 lỗi nền đã phát hiện**: (a) bỏ `body { font-family: Arial }` trong `globals.css`;
   (b) nạp font với `subsets: ["latin", "vietnamese"]` — dấu tiếng Việt đang bị fallback.
5. Token OKLCH giữ tinh thần hiện tại: nền zinc-950, primary emerald, accent sky; chỉnh
   `--muted-foreground` sáng hơn để đạt tương phản AA.
6. **AppShell** trong `layout.tsx`: sidebar trái (desktop) + drawer (mobile), logo, nav có icon +
   trạng thái active, **dải tình trạng hệ thống** (backend / ML service / số ký hiệu), `<Toaster />`.
7. `src/config/nav.ts` — khai báo nav tập trung (route, nhãn, icon, nhóm, mô tả một dòng).
8. Route-level: `loading.tsx`, `error.tsx`, `not-found.tsx` (+ `global-error.tsx`).
9. Trang chủ `/` viết lại: 3 tầng ưu tiên (demo chính → công cụ → quản trị), thẻ có mô tả tiếng
   Việt một dòng, dải health, **bỏ emoji dùng icon lucide**.
10. Nhận diện: favicon + wordmark riêng, xóa `next.svg`/`vercel.svg`/`file.svg`/`globe.svg`/`window.svg`,
    thêm `theme-color` + OG image.
11. `docs/UI-GUIDE.md` — hợp đồng design system: bảng token, danh sách component, 4 trạng thái mẫu,
    ví dụ code chuẩn, checklist trợ năng. **A và B code theo file này.**

---

## 5. BRANCH A — `feature/admin-studio` · "Quản trị & Nội dung"

**Lãnh thổ**: `apps/web/src/app/{login,admin,record,dictionary}/**` · `apps/core/.../dictionary/**`.

### A1. `/dictionary` — kho 3.331 ký hiệu phải dùng được
- Tìm kiếm với `useDeferredValue`; lọc theo chủ đề (Tabs/Select); **bỏ trần cứng 48 thẻ** →
  phân trang hoặc "tải thêm".
- Thẻ dùng poster/khung hình đầu + overlay ▶, clip xem trong `Dialog` (KHÔNG nhúng 48 `<video>`).
- Skeleton 12 thẻ khi tải · **empty state khi tìm không ra** ("Không tìm thấy «xyz» — thử bỏ dấu"
  + nút xóa tìm kiếm) · badge trạng thái clip · nút "Quay clip" cho từ thiếu.

### A2. `/admin` — bàn làm việc quản trị
- Bảng dữ liệu (`table` shadcn): sắp xếp được (mới nhất / gloss A→Z / có-không clip), tìm kiếm,
  phân trang; **bộ lọc "chỉ hiện ký hiệu thiếu clip"** + thanh tiến độ `X/3.331 có clip`.
- Sửa nhanh bằng `Dialog` + form validate; xóa dùng `AlertDialog` (**bỏ `window.confirm`**),
  nêu rõ tên ký hiệu và cảnh báo xóa cả clip.
- Toast cho mọi kết quả; 401/403 → chuyển `/login` (giữ `handleAuthError` sẵn có).
- Modal quay clip: giữ nguyên logic MediaRecorder đã sửa, thay vỏ + nạp `next/dynamic {ssr:false}`.

### A3. `/login` + gộp 3 giao diện đăng nhập
- Card giữa màn có logo, `<form onSubmit>`, `<label>` thật, `autoComplete="email|current-password"`,
  nút hiện/ẩn mật khẩu, spinner khi gửi, lỗi bọc `role="alert"`.
- **KHÔNG in tài khoản dev lên trang** (lỗi bảo mật đã sửa sprint 1 — đừng làm lại).
- Bỏ form đăng nhập nội tuyến trong `/record`, chuyển hướng `/login?next=/record`.

### A4. `/record` — quyết định số phận + luồng 3 bước
- **Chọn một**: (a) giữ `/record` làm luồng nhanh và dùng CHUNG component quay với modal của
  `/admin`, hoặc (b) bỏ `/record`, mọi thứ vào `/admin`. Ghi lựa chọn + lý do vào merge-notes.
- Nếu giữ: stepper Chọn từ → Quay → Xem lại & lưu; đếm ngược lớn trong nút; **thống nhất việc lật
  gương** giữa khung xem trực tiếp và khung xem lại; combobox tìm từ (không dùng `<select>` 3.300 mục).
- Giữ nguyên logic vòng đời camera đã sửa (đọc lại stream sau đếm ngược, guard `recorder.stop()`,
  thu hồi blob URL).

### A5. Kiểm thử — 17 test Java phải tiếp tục xanh; đủ cổng §8.

---

## 6. BRANCH B — `feature/video-translate` · "Demo & Số liệu"

**Lãnh thổ**: `apps/web/src/app/{translate,video,stats}/**` · `apps/core/.../{analytics,translation}/**`.

### B1. `/translate` — màn hình bảo vệ đồ án (quan trọng nhất)
- **Đảo thứ bậc**: câu tiếng Việt là phần tử LỚN NHẤT (`text-5xl`+), dải ngang dưới video; chip
  gloss nằm dưới, nhỏ hơn.
- Chip gloss trượt vào bằng motion (`layout`), có % tin cậy; **key ổn định, không dùng `Date.now()`**.
- **Ba trạng thái kết nối** (mất kết nối / đang kết nối / đã kết nối) có chấm màu + toast khi rớt;
  **thêm `ws.onerror`** (đang thiếu — backend chết là hỏng trong im lặng) và bọc `JSON.parse` trong try/catch.
- Trạng thái tải model: skeleton + "Đang tải model nhận diện (~8MB)…"; lỗi camera hiện rõ.
- Nạp `TranslateDemo` bằng `next/dynamic {ssr:false}`; `<video>` có kích thước cố định.
- Được dùng **một** hiệu ứng Magic UI cho vùng câu (VD `shine-border`) — một thôi.

### B2. `/video` — dịch từ file video
- Dropzone kéo-thả + **2-3 clip mẫu bấm một nút** (trên máy chiếu, lục hộp thoại file rất tệ).
- Input file phải truy cập được bằng bàn phím (`sr-only` + `peer-focus`, không dùng `hidden`).
- Thanh tiến trình dịch đồng bộ vị trí video, đánh dấu điểm nhận diện trên timeline; chỉ báo
  "đang xử lý" khi video chạy mà chưa có gloss.
- Giữ nguyên logic WS đã sửa (đệm khi CONNECTING, reset khi tua lùi, flush khi hết video).

### B3. `/stats` — dashboard
- Thẻ KPI số lớn (`text-5xl`) có animation đếm; biểu đồ dùng `chart` của shadcn (recharts) —
  **ngoại lệ dependency duy nhất được phép**; nhãn ≥14px; vẽ đường nền cho ngày 0 hoạt động.
- Chọn khoảng 7/14/30 ngày → `?days=`; **nút tự động làm mới** (poll 5-10s) để demo "chạy
  /translate rồi xem số nhảy"; skeleton khi tải; empty state.

### B4. Phần backend chưa làm (từ kiểm toán)
- **Đo độ trễ end-to-end**: đo `t(nhận frame) → t(gửi gloss)` trong `translation`, ghi vào
  `analytics` (percentile p50/p95), hiện lên `/stats` — đây là số liệu chương 4 của báo cáo.
- **Lưu phiên dịch**: bảng `sessions` + `transcripts` (PLAN §3 có mà chưa làm) — lưu khi phiên
  kết thúc, không nằm trên hot path.
- Bảng `model_metrics` (version, accuracy, ngày) + API đọc — chỗ chứa kết quả khi train xong.
- Test: `AnalyticsIntegrationTests` phải xanh; **KHÔNG gỡ `TransactionTemplate` REPEATABLE READ**
  trong `AnalyticsController` (đó là bản vá lỗi dữ liệu vênh — gỡ là lỗi quay lại).

---

## 7. BRANCH C — `feature/ml-pretrain` · "Ngôn ngữ, ML & Báo cáo" (AGENT C)

- **Phase 0** (§4) — làm trước, push main, báo A/B bắt đầu.
- C1. `/speak` viết lại: **trình phát clip là phần tử chính** (≥60vw, hiện đang 384px), có
  transport (clip N/M, ⏮⏯⏭, tốc độ), chip từ/chữ cái có animation, câu mẫu là nút lớn nổi bật,
  khóa nút mic + skeleton cho tới khi tải xong từ điển.
- C2. Gỡ `/collect` khỏi nav chính (giữ route để không vỡ link) — tính năng đã hủy.
- C3. Nâng TTS: sinh sẵn giọng neural vi-VN (edge-tts `HoaiMyNeural`) cho câu mẫu + cache,
  giữ `speechSynthesis` làm dự phòng.
- C4. Đánh giá chất lượng câu ghép: bộ 30 chuỗi gloss mẫu → chấm Likert → bảng số liệu cho báo cáo.
- C5. `training/export_onnx.py` tách riêng; chạy/giám sát pretrain VOYA (`exp03`) khi bật Colab.
- C6. **Khởi động báo cáo** `docs/report/`: chương 1 (giới thiệu, bối cảnh VSL Việt Nam),
  chương 2 (công trình liên quan: Multi-VSL WACV 2025, VSL400, Signvrse/Imagine Cup, QIPEDC,
  Spotter+GPT), chương 3 (kiến trúc: sơ đồ Modulith tự sinh + luồng dữ liệu), phụ lục
  "34 lỗi đã bắt qua kiểm thử tự động + review đối kháng" (điểm cộng lớn khi bảo vệ).
- C7. Tích hợp: merge A → B → C, chạy đủ cổng + E2E stack thật, review đối kháng, push main.

---

## 8. Cổng kiểm tra (chạy đủ trước khi kết thúc branch)

```powershell
cd apps/core; ./mvnw -B test          # 17/17 test Java, Modulith verify
cd apps/web;  npx tsc --noEmit        # 0 lỗi
cd apps/web;  npx eslint src --max-warnings 0
cd apps/web;  npm run build           # build sạch
git diff --name-only origin/main      # KHÔNG file nào ngoài lãnh thổ (trừ docs/merge-notes/)
```
**Tự kiểm thêm cho sprint này** (ghi kết quả vào báo cáo cuối):
- [ ] Mỗi trang mình sửa có đủ 4 trạng thái: tải / rỗng / lỗi / có dữ liệu
- [ ] Mở ở khổ ~400px không vỡ layout
- [ ] Dùng được bằng bàn phím (Tab tới mọi nút, Escape đóng modal, Enter gửi form)
- [ ] Không còn `text-zinc-500` cho chữ có nghĩa; không còn `cond && <JSX>`; không key `Date.now()`

---

## 9. Prompt giao việc (người dùng copy)

**AGENT A** — thư mục `d:\Khoa\DATN-agent-a`:
> Đọc `Plan-sprint2-ui.md` ở gốc repo (và `Plan-multi-agent.md §3` cho quy ước nền). Bạn là
> **AGENT A**, branch `feature/admin-studio`. TRƯỚC KHI viết component, nạp skill
> `vercel-react-best-practices` và đọc `docs/UI-GUIDE.md`. Thực hiện đầy đủ §5 (A1→A5), tuân
> thủ tuyệt đối §3 (đặc biệt §3.4 về trợ năng). KHÔNG chạy dev server/stack. Kết thúc: chạy đủ
> cổng §8 + checklist tự kiểm, push branch, báo cáo kết quả từng cổng + merge-notes.

**AGENT B** — thư mục `d:\Khoa\DATN-agent-b`:
> Đọc `Plan-sprint2-ui.md` ở gốc repo (và `Plan-multi-agent.md §3`). Bạn là **AGENT B**, branch
> `feature/video-translate`. TRƯỚC KHI viết component, nạp skill `vercel-react-best-practices`
> và đọc `docs/UI-GUIDE.md`. Thực hiện đầy đủ §6 (B1→B4), tuân thủ tuyệt đối §3 (đặc biệt §3.4
> về trợ năng). KHÔNG chạy dev server/stack. Kết thúc: chạy đủ cổng §8 + checklist tự kiểm,
> push branch, báo cáo kết quả từng cổng + merge-notes.
