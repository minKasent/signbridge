"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Đếm số từ giá trị đang hiển thị tới giá trị mới bằng requestAnimationFrame.
 *
 * Vì sao tự viết: chỉ vài dòng, và trang /stats không nên kéo thêm một runtime
 * animation thứ hai chỉ để chạy bốn con số.
 *
 * Vì sao mọi setState đều nằm trong callback rAF: ESLint bật
 * react-hooks/set-state-in-effect nên cấm setState đồng bộ trong thân effect.
 *
 * Vì sao 600ms mà không phải ≤300ms như quy ước chuyển động: đây là số liệu
 * người xem phải ĐỌC được chứ không phải hiệu ứng chuyển cảnh — dưới 300ms thì
 * con số nhảy quá nhanh để mắt bám theo. Người bật "giảm chuyển động" nhảy
 * thẳng tới số cuối, không có khung hình trung gian nào.
 */

const DURATION_MS = 600;

export function useCountUp(target: number): number {
  // Làm tròn ngay tại nguồn: mọi KPI của trang đều là số nguyên (lượt, ms).
  const safeTarget = Number.isFinite(target) ? Math.round(target) : 0;

  const [value, setValue] = useState(0);
  // Giữ giá trị đang vẽ trong ref để khi số đích đổi giữa chừng (tự động làm
  // mới 7 giây) thì chạy tiếp từ chỗ đang dừng thay vì giật về 0.
  const currentRef = useRef(0);

  useEffect(() => {
    const from = currentRef.current;
    if (from === safeTarget) return;

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const settle = () => {
      currentRef.current = safeTarget;
      setValue(safeTarget);
    };

    let frame = 0;
    let startedAt = 0;

    const step = (now: number) => {
      if (reduceMotion) {
        settle();
        return;
      }
      if (startedAt === 0) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / DURATION_MS);
      if (progress >= 1) {
        settle();
        return;
      }
      // easeOutCubic: chạy nhanh lúc đầu rồi hãm dần — số cuối đứng yên đủ lâu để đọc.
      const eased = 1 - (1 - progress) ** 3;
      const next = from + (safeTarget - from) * eased;
      currentRef.current = next;
      setValue(Math.round(next));
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [safeTarget]);

  return value;
}
