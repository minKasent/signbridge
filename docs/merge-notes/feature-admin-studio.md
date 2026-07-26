# Merge notes — feature/admin-studio (AGENT A)

Dành cho AGENT C khi merge branch này vào main.

---

# PHẦN II — SPRINT 2 (giao diện, §5 của `Plan-sprint2-ui.md`)

## II.1. Thay đổi cần áp vào file chung: **KHÔNG CÓ**

Không sửa `package.json`, `globals.css`, `layout.tsx`, `nav.ts`, `components/ui/**`,
`SecurityConfig`, `application.yml`, `pom.xml`. `/record` và `/admin` đã có sẵn trong
`src/config/nav.ts` (Phase 0), tiêu đề trang cũng đã được Phase 0 dọn nên không cần
đụng `page.tsx` nào.

**KHÔNG thêm dependency nào.** Cụ thể là đã CỐ Ý không cài `command` + `popover`
của shadcn (kéo theo `cmdk`) cho combobox chọn từ: cài là sửa `package.json` —
file dùng chung bị cấm sửa trực tiếp (Plan-multi-agent §3.2). Thay vào đó
`app/record/SignPicker.tsx` tự cài đặt đúng mẫu combobox của ARIA
(`role="combobox"` + `aria-expanded` + `aria-controls` + `aria-activedescendant`,
danh sách `role="listbox"`/`role="option"`, điều hướng ↑ ↓, Enter chọn, Escape đóng).
Nếu C muốn đổi sang `cmdk` sau khi merge thì đó là quyết định về dependency, không
phải việc còn thiếu của A.

## II.2. Vị trí file dùng chung (điểm C có thể muốn dọn lại)

Lãnh thổ A ở sprint 2 chỉ gồm `app/{login,admin,record,dictionary}/**`, nên ba
module dùng chung phải nằm TRONG thư mục route:

| File | Vai trò | Nơi hợp lý hơn nếu C muốn dọn |
| --- | --- | --- |
| `app/dictionary/sign.ts` | `type Sign`, `useSigns` (4 trạng thái), `foldVi`, `normalizeGloss`, `buildSearchIndex`, `clipSrc`, `categoryLabel` | `src/lib/signs.ts` |
| `app/record/ClipRecorder.tsx` | lõi quay clip (camera + đếm ngược + MediaRecorder + upload) | `src/components/clip-recorder.tsx` |
| `app/record/SignPicker.tsx` | combobox chọn ký hiệu trong 3.331 mục | `src/components/sign-picker.tsx` |

Cả `/admin` và `/record` đều import từ hai file trong `app/record/` — đổi chỗ thì
sửa 3 dòng import. Không có vòng phụ thuộc.

## II.3. Quyết định A4 — **GIỮ `/record`** (kèm lý do, plan yêu cầu ghi lại)

Giữ, và dùng CHUNG component quay với hộp thoại của `/admin`:

- `/dictionary` gắn liên kết sâu `?sign=GLOSS` cho từng từ thiếu clip. Mở thẳng
  `/record?sign=CAM_ON` nhanh hơn nhiều so với vào bàn quản trị rồi tìm lại dòng đó
  trong 3.331 dòng.
- Hai luồng khác mục đích: `/admin` sửa dữ liệu (bảng, sắp xếp, xóa), `/record` quay
  hàng loạt (chọn → quay → lưu → chọn từ tiếp, camera vẫn sáng).
- Chi phí trùng lặp mã đã về 0: lõi quay là `ClipRecorder` dùng chung, nên sửa lỗi
  vòng đời camera một lần là cả hai nơi được sửa.
- `/record` KHÔNG còn form đăng nhập nội tuyến nữa (đúng A3): chưa đăng nhập thì
  chuyển sang `/login?next=/record?sign=…` và quay lại đúng từ đang định quay.

## II.4. Hai quyết định thiết kế cần C biết khi demo

1. **Không lật gương ở bất kỳ khung nào** (khung camera trực tiếp và khung xem lại
   đều hiện đúng chiều file lưu). Trước sprint 2 khung trực tiếp lật gương còn khung
   xem lại thì không — người quay tưởng mình quay đúng trong khi clip lưu bị ngược
   tay. Chiều tay trái/phải là thông tin CÓ NGHĨA trong VSL nên phải trung thực với
   file; giao diện nói rõ "khung hình hiện đúng như clip sẽ lưu (không lật gương)".
2. **Thẻ ở `/dictionary` không có ảnh khung hình đầu (poster)** như câu chữ A1 mô tả:
   máy chủ chưa sinh thumbnail, mà nhúng `<video preload="metadata">` cho mỗi thẻ thì
   lại đúng vào lỗi cũ (mỗi thẻ một kết nối). Thẻ dùng ô bấm có nút ▶, clip phát
   trong MỘT `Dialog` duy nhất. Muốn có poster thật thì phải sinh ảnh ở khâu import
   (ffmpeg) — việc backend/pipeline, ghi lại đây làm việc tiếp theo.

## II.5. Ghi chú kỹ thuật sprint 2

- **ESLint của Phase 0 bật luật React Compiler**: `setState` trong `useEffect` và ghi
  `ref.current` khi render đều là LỖI (không phải cảnh báo). Bốn chỗ "reset khi đổi
  bộ lọc" vì vậy được viết theo lối dẫn xuất trong render — state mang theo khóa của
  bộ lọc sinh ra nó (`{ key, page }`, `{ key, count }`, `{ key, index }`), và
  `/record` dẫn xuất từ đang chọn = `choice ?? preselected`. C nếu thêm code tương tự
  thì tránh mẫu `useEffect(() => setX(0), [filter])`, lint sẽ chặn.
- Tìm kiếm ở cả 3 trang bỏ dấu (`foldVi`): gõ "cam on" ra "cảm ơn". Chỉ mục chuẩn hóa
  được dựng MỘT lần bằng `useMemo` chứ không bỏ dấu lại 3.331 chuỗi mỗi lần gõ, và
  giá trị lọc dùng `useDeferredValue`.
- `app/admin/RecordClipModal.tsx` đã **xóa**, thay bằng `app/admin/RecordClipDialog.tsx`
  (vỏ `Dialog` của shadcn + `ClipRecorder`). Hộp thoại nạp bằng
  `next/dynamic { ssr: false }` và chỉ render khi thật sự mở → mount là bật camera,
  unmount là tắt, không còn khả năng camera sáng sau lưng hộp thoại đã đóng.
- Né cache clip sau khi quay thay thế: dùng bộ đếm `clipVersions[id]` (`?v=1`, `?v=2`)
  thay cho `Date.now()` — plan sprint 2 cấm `Date.now()` và bộ đếm cũng ổn định hơn.
- Xóa ký hiệu giờ dùng `AlertDialog` (nêu tên ký hiệu + cảnh báo xóa cả clip), không
  còn `window.confirm`. Hộp thoại giữ nguyên mở tới khi API trả lời (chặn
  `event.preventDefault()` trong `AlertDialogAction`) để lỗi không hiện ra sau khi mọi
  thứ đã đóng.
- Không còn `text-zinc-*` / `bg-zinc-*` trong 4 trang của A; toàn bộ dùng token
  (`bg-card`, `text-muted-foreground`, `bg-primary`, `bg-destructive`…).
- Backend sprint 2: **không sửa gì** trong `apps/core` — 17 test Java vẫn chạy nguyên
  trạng (A5 chỉ yêu cầu giữ xanh).

---

# PHẦN I — SPRINT 1 (đã áp xong, giữ lại để tra cứu)

## I.1. Thay đổi file chung — **ĐÃ HẾT HIỆU LỰC**

Ghi chú cũ yêu cầu C thêm link `/admin` vào `apps/web/src/app/page.tsx`. Phase 0 đã
viết lại trang chủ theo `src/config/nav.ts` (trong đó đã có `/admin` và `/record`),
nên **không cần áp diff này nữa**.

## I.2. Plan mâu thuẫn code hiện tại (sprint 1)

- **`lib/auth.ts` đã tồn tại trước** với key localStorage `signbridge.token` +
  `signbridge.user`, KHÔNG phải một key `signbridge.auth` như plan viết. Giữ nguyên
  key và API sẵn có (`login/logout/getToken/getUser/authHeader`), chỉ BỔ SUNG hook
  `useAuth()`. Hàm `getAuth()` trong plan chính là `getUser()` hiện có.
- Trang `/record` khi đó nằm ngoài lãnh thổ A nên sprint 1 không đụng tới; sprint 2
  đã nhận `/record` vào lãnh thổ và gộp xong (xem II.3).

## I.3. Ghi chú kỹ thuật sprint 1 (backend, vẫn còn hiệu lực)

- Test `dictionary/SignAdminIntegrationTests` tự khai báo container Postgres lồng
  trong class (`@TestConfiguration` + `@ServiceConnection`) vì
  `vn.signbridge.TestcontainersConfiguration` là package-private — test trong package
  `dictionary` không nhìn thấy. KHÔNG sửa file gốc.
- Test đó trỏ `signbridge.storage.clips-dir` vào thư mục tạm
  (`@DynamicPropertySource`) để khẳng định file clip bị xóa theo ký hiệu mà không ghi
  vào `storage/clips` của repo.
- Trong test tránh dùng `MultipartBodyBuilder` (kéo theo `org.reactivestreams.Publisher`
  — classpath MVC thuần không có, ném `NoClassDefFoundError`); dùng
  `LinkedMultiValueMap` + `HttpEntity`.
- `SignController.create` bắt trùng gloss trả **409** (trước đây 500 vì unique
  constraint nổ thẳng). `DELETE` xóa bản ghi DB trước rồi best-effort xóa file (file
  bị lock trên Windows không làm hỏng thao tác xóa); `store()` dọn file đuôi đối nghịch
  khi quay clip thay thế (.webm đè .mp4 import) để clip cũ không còn công khai.
- `/login` chỉ tự chuyển hướng khi phiên là ADMIN; tài khoản USER đăng nhập sẽ đứng
  lại kèm thông báo — tránh vòng lặp redirect với guard của `/admin`.
