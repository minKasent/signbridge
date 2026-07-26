"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Vỏ client mỏng cho /translate.
 *
 * `next/dynamic` với `{ ssr: false }` KHÔNG gọi được trong server component (Next báo lỗi),
 * mà TranslateDemo bắt buộc phải chạy phía client: MediaPipe ~13MB WASM + webcam + WebSocket.
 * Nên page.tsx (server) render component này, còn phần nặng mới nạp động ở đây.
 */
const TranslateDemo = dynamic(() => import("./TranslateDemo"), {
  ssr: false,
  loading: () => <TranslateSkeleton />,
});

/** Khung giữ chỗ đúng bố cục thật để lúc nạp xong trang không nhảy. */
function TranslateSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <p role="status" className="sr-only">
        Đang tải công cụ phiên dịch…
      </p>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-5 w-full max-w-lg" />
      <div className="mt-6 flex flex-wrap gap-2">
        <Skeleton className="h-10 w-44 rounded-lg" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>
      <Skeleton className="mx-auto mt-6 aspect-[4/3] w-full max-w-2xl rounded-xl" />
      <Skeleton className="mt-6 h-48 w-full rounded-2xl" />
      <Skeleton className="mt-6 h-9 w-full max-w-md rounded-full" />
    </div>
  );
}

export default function TranslateClient() {
  return <TranslateDemo />;
}
