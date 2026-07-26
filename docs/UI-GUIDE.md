# UI-GUIDE — Hợp đồng design system SignBridge

> Mọi agent làm giao diện PHẢI đọc file này trước khi viết component.
> Nền tảng do Phase 0 dựng sẵn trên `main` — **không dựng lại, không cài lại shadcn**.

## 1. Đã có sẵn (đừng làm lại)

| Thứ | Ở đâu |
|---|---|
| shadcn/ui đã init | `components.json` (base radix, preset nova), `src/lib/utils.ts` → hàm `cn()` |
| 18 primitives | `src/components/ui/`: `button card input label badge skeleton dialog alert-dialog select tabs tooltip separator scroll-area sonner dropdown-menu avatar progress table` |
| Khung ứng dụng | `src/components/app-shell.tsx` — sidebar desktop + ngăn kéo mobile, đã gắn trong `layout.tsx` |
| Điều hướng | `src/config/nav.ts` — thêm trang mới **chỉ sửa file này**, sidebar + trang chủ tự cập nhật |
| Tình trạng hệ thống | `src/components/system-status.tsx` (nằm cuối sidebar) |
| Toast | `<Toaster />` đã gắn toàn cục → chỉ cần `import { toast } from "sonner"` |
| Tooltip | `TooltipProvider` đã bọc toàn cục |
| Route states | `src/app/{loading,error,not-found}.tsx` |
| Chuyển động | `motion@12.42.2` → `import { motion } from "motion/react"` |
| Icon | `lucide-react` |

Cần thêm primitive khác: `npx shadcn@latest add <tên> -y` (được phép, ghi vào merge-notes).

## 2. Token màu — KHÔNG hardcode `zinc-*` nữa

Token nằm trong `globals.css` dưới bộ chọn `.dark` (app luôn ở chế độ tối, class `dark`
đặt cố định trên `<html>`).

| Dùng token | Thay cho | Ý nghĩa |
|---|---|---|
| `bg-background` / `text-foreground` | `bg-zinc-950` / `text-zinc-100` | Nền & chữ chính |
| `bg-card` | `bg-zinc-900` | Nền thẻ, panel |
| `bg-muted` / `text-muted-foreground` | `bg-zinc-800` / `text-zinc-400` | Nền phụ, chữ phụ |
| `border-border` | `border-zinc-800` | Đường viền |
| `bg-primary` / `text-primary` | `bg-emerald-600` | Hành động chính, nhấn mạnh |
| `bg-accent` / `text-accent` | `bg-sky-600` | Thông tin, trạng thái |
| `bg-destructive` | `bg-red-600` | Xóa, lỗi |
| `--chart-1..5` | — | Màu biểu đồ |

⚠️ **Đã sửa `--muted-foreground` sáng hơn mặc định** để đạt tương phản AA. Đừng dùng
`text-zinc-500` cho chữ có nghĩa — đó chính là lỗi tương phản kiểm toán đã bắt.

## 3. Bốn trạng thái bắt buộc

Mọi màn hình có dữ liệu bất đồng bộ phải có đủ:

```tsx
if (loading) return <Skeleton className="h-32 w-full" />;          // 1. đang tải
if (error) return <ErrorState onRetry={refetch} />;                 // 2. lỗi + nút thử lại
if (items.length === 0) return <EmptyState />;                      // 3. rỗng, có gợi ý hành động
return <List items={items} />;                                      // 4. có dữ liệu
```

Empty state phải có: icon lucide + một câu tiếng Việt nói rõ **làm gì tiếp** (không phải
"Không có dữ liệu"). Ví dụ: *"Chưa tìm thấy «xyz» — thử bỏ dấu hoặc gõ từ khác"* + nút xóa tìm kiếm.

## 4. Thông báo

```tsx
import { toast } from "sonner";
toast.success("Đã lưu clip cho «xin chào»");
toast.error("Không lưu được", { description: "Backend không phản hồi (cổng 8080)" });
```
Chữ lỗi trần chỉ dùng khi gắn liền một field (dưới ô nhập), và phải bọc `role="alert"`.

## 5. Trợ năng — BẮT BUỘC (đồ án về trợ năng)

- Nút chỉ có icon → `aria-label="..."`.
- Lỗi → `role="alert"` (+ `aria-live="assertive"` nếu xuất hiện động).
- Modal → dùng `Dialog`/`AlertDialog` của shadcn (đã có `role="dialog"`, bẫy focus, Escape).
  **Không tự viết modal, không dùng `window.confirm`.**
- Form → `<form onSubmit>` thật + `<label htmlFor>` + `autoComplete` phù hợp.
- Không tắt focus ring. Mọi thao tác làm được bằng bàn phím.
- Ảnh/icon trang trí → `aria-hidden`.

## 6. Chuyển động

```tsx
import { motion, AnimatePresence } from "motion/react";

<AnimatePresence mode="popLayout">
  {glosses.map((g) => (
    <motion.li key={g.id} layout
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}>
      {g.label}
    </motion.li>
  ))}
</AnimatePresence>
```
Quy tắc: ≤300ms · có ý nghĩa (không animation trang trí) · `globals.css` đã tự tắt animation
khi người dùng bật `prefers-reduced-motion` · **key phải ổn định, không dùng `Date.now()`**.

## 7. Hiệu ứng nâng cao (Magic UI / React Bits)

Cài qua chính CLI shadcn:
```powershell
npx shadcn@latest add @magicui/shine-border -y        # Magic UI
npx shadcn@latest add @react-bits/BlurText-TS-TW -y   # React Bits — CHỈ biến thể TS-TW
```

⚠️ **Ba cảnh báo đã kiểm chứng:**
1. **KHÔNG dùng nền WebGL** (React Bits Aurora/Threads, Magic UI Globe…) trên `/translate`,
   `/video`, `/collect`, `/record` — chúng giành GPU với MediaPipe và làm tụt fps nhận diện.
2. **KHÔNG dùng Aceternity UI** — registry của họ không kèm `css`/`cssVars`, component cài xong
   *build được* nhưng animation im lặng không chạy trên Tailwind v4.
3. Mỗi trang tối đa **1-2** hiệu ứng điểm nhấn. Nhiều hiệu ứng = rối, không phải đẹp.

## 8. Hiệu năng (skill `vercel-react-best-practices`)

- Component nặng (MediaPipe, biểu đồ, modal quay clip) → `next/dynamic` với `{ ssr: false }`.
- Ternary `cond ? <A/> : null`, **không** `cond && <A/>`.
- Tìm kiếm trên danh sách lớn → `useDeferredValue`.
- Giá trị đổi mỗi frame → `useRef`, không `useState`.
- `page.tsx` giữ là server component (chỉ `metadata` + render component client).
- `<video>`/`<canvas>` luôn có kích thước/`aspect-ratio` để không giật layout.

## 9. Mẫu bố cục trang

```tsx
// app/<route>/page.tsx  — server component
import type { Metadata } from "next";
import XxxTool from "./XxxTool";
export const metadata: Metadata = { title: "Tên trang" };
export default function Page() { return <XxxTool />; }
```

```tsx
// app/<route>/XxxTool.tsx — "use client"
<div className="mx-auto max-w-6xl px-6 py-8">
  <header className="mb-6">
    <h1 className="text-2xl font-bold tracking-tight">Tiêu đề</h1>
    <p className="text-muted-foreground">Một câu mô tả trang làm gì.</p>
  </header>
  {/* nội dung */}
</div>
```
Không tự viết `min-h-screen bg-zinc-950` nữa — `AppShell` đã lo nền và khung.
