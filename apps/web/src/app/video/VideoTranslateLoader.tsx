"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Vỏ mỏng để nạp lười công cụ dịch video: MediaPipe kéo theo ~13MB WASM và chỉ
 * chạy được phía trình duyệt. `next/dynamic` với `ssr:false` KHÔNG gọi được từ
 * server component, nên phải mượn một lớp "use client" như file này.
 */
const VideoTranslateTool = dynamic(() => import("./VideoTranslateTool"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="aspect-video w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
    </div>
  ),
});

export default function VideoTranslateLoader() {
  return <VideoTranslateTool />;
}
