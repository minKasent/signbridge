import { Skeleton } from "@/components/ui/skeleton";

/** Khung chờ ở tầng route — trước đây chuyển trang là màn hình trắng không báo gì. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-12">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-full max-w-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}
