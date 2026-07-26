"use client";

import { MotionConfig } from "motion/react";

/**
 * Tắt hoạt ảnh khi người dùng bật "Giảm chuyển động" trong hệ điều hành.
 *
 * Khối `@media (prefers-reduced-motion: reduce)` trong `globals.css` KHÔNG đủ: nó chỉ
 * chạm tới `animation-duration`/`transition-duration` của CSS, trong khi thư viện
 * `motion` điều khiển hoạt ảnh bằng JavaScript (ghi thẳng transform từng khung) nên
 * CSS không với tới. Chip ký hiệu ở /translate, /video vẫn bay vào như thường.
 *
 * `reducedMotion="user"` bảo motion tự đọc thiết lập hệ điều hành và bỏ qua phần
 * chuyển động (giữ lại opacity) — đặt một lần ở đây là phủ toàn bộ ứng dụng, các
 * component không phải tự nhớ.
 *
 * Đây là đồ án về công nghệ trợ năng, và người tiền đình nhạy cảm là đối tượng thật.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
