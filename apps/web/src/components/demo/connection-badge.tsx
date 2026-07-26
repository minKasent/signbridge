"use client";

import { Loader2, Plug, PlugZap, TriangleAlert } from "lucide-react";
import type { ConnectionState } from "@/components/demo/use-translation-socket";
import { cn } from "@/lib/utils";

/**
 * Ba trạng thái kết nối backend hiện thành chấm màu + chữ, đọc được từ xa khi
 * chiếu máy chiếu. `aria-live` để người dùng đọc màn hình biết lúc rớt kết nối.
 */

const LABELS: Record<ConnectionState, { text: string; dot: string; icon: typeof Plug }> = {
  disconnected: { text: "Chưa kết nối", dot: "bg-muted-foreground", icon: Plug },
  connecting: { text: "Đang kết nối…", dot: "bg-accent animate-pulse", icon: Loader2 },
  connected: { text: "Đã kết nối", dot: "bg-primary", icon: PlugZap },
  error: { text: "Mất kết nối", dot: "bg-destructive", icon: TriangleAlert },
};

export function ConnectionBadge({ state, className }: { state: ConnectionState; className?: string }) {
  const { text, dot, icon: Icon } = LABELS[state];
  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm ring-1 ring-foreground/10",
        className
      )}
    >
      <span aria-hidden className={cn("size-2.5 rounded-full", dot)} />
      <Icon aria-hidden className="size-4 text-muted-foreground" />
      <span className={state === "error" ? "font-medium text-destructive" : "text-foreground"}>{text}</span>
    </span>
  );
}
