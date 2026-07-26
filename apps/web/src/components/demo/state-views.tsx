"use client";

import { RotateCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Trạng thái rỗng và trạng thái lỗi dùng chung cho các trang demo/số liệu.
 * Theo hợp đồng UI-GUIDE §3: rỗng phải nói RÕ làm gì tiếp, lỗi phải có nút thử lại
 * và bọc role="alert" để trình đọc màn hình thông báo ngay.
 */

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-10 text-center", className)}>
      <span className="grid size-12 place-items-center rounded-full bg-muted">
        <Icon aria-hidden className="size-6 text-muted-foreground" />
      </span>
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Không tải được dữ liệu",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl bg-destructive/10 p-4 ring-1 ring-destructive/30",
        className
      )}
    >
      <div className="space-y-1">
        <p className="font-medium text-destructive">{title}</p>
        <p className="text-sm text-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden />
          Thử lại
        </Button>
      ) : null}
    </div>
  );
}
