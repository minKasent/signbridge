"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Ranh giới lỗi tầng route — lỗi render không còn làm trắng cả trang. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Lỗi trang:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-24 text-center" role="alert">
      <AlertTriangle className="size-10 text-destructive" aria-hidden />
      <h1 className="text-2xl font-semibold">Trang gặp sự cố</h1>
      <p className="text-muted-foreground">
        Đã có lỗi khi hiển thị nội dung. Bạn thử tải lại xem sao — nếu vẫn lỗi, kiểm tra
        backend ở cổng 8080 có đang chạy không.
      </p>
      <p className="font-mono text-xs text-muted-foreground">{error.message}</p>
      <Button onClick={reset}>
        <RotateCcw className="size-4" aria-hidden />
        Thử lại
      </Button>
    </div>
  );
}
