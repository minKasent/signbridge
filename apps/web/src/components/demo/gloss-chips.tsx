"use client";

import { AnimatePresence, motion } from "motion/react";
import type { GlossItem } from "@/components/demo/use-translation-socket";
import { cn } from "@/lib/utils";

/**
 * Dòng ký hiệu vừa nhận diện, mới nhất trước. Chip trượt vào bằng motion để người
 * xem thấy hệ thống ĐANG chạy — trên máy chiếu, chuyển động là thứ chứng minh
 * "đây là thời gian thực" rõ hơn bất kỳ con số nào.
 *
 * Khóa React lấy từ id tăng dần của hook (không phải Date.now(): hai gloss về
 * trong cùng một mili-giây sẽ trùng khóa và React bỏ mất một chip).
 */

/** Mốc tin cậy đổi màu chip — khớp ngưỡng chấp nhận 0.6 của TranslationService. */
function confidenceTone(confidence: number): string {
  if (confidence >= 0.8) return "bg-primary/15 text-primary ring-primary/30";
  if (confidence >= 0.6) return "bg-accent/15 text-accent ring-accent/30";
  return "bg-muted text-muted-foreground ring-border";
}

function formatVideoTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function GlossChips({
  glosses,
  emptyHint,
  showTime = false,
  className,
}: {
  glosses: GlossItem[];
  emptyHint: string;
  /** /video hiện thêm mốc thời gian trong clip. */
  showTime?: boolean;
  className?: string;
}) {
  if (glosses.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyHint}</p>;
  }

  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      <AnimatePresence initial={false} mode="popLayout">
        {glosses.map((item) => (
          <motion.li
            key={item.id}
            layout
            initial={{ opacity: 0, scale: 0.9, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 ring-1",
              confidenceTone(item.confidence)
            )}
          >
            {showTime && item.videoTime !== undefined ? (
              <span className="font-mono text-xs text-muted-foreground">
                {formatVideoTime(item.videoTime)}
              </span>
            ) : null}
            <span className="font-mono text-base font-medium">{item.gloss}</span>
            <span className="text-sm opacity-80">{Math.round(item.confidence * 100)}%</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
