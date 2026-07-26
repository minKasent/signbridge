"use client";

import { FlaskConical } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/demo/state-views";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatPercent, formatRecordedAt } from "./stats-utils";
import type { ModelMetric } from "./types";

/**
 * Lịch sử các vòng huấn luyện (bảng `model_metrics`).
 *
 * Vì sao tách khỏi phần số liệu sử dụng: hai API độc lập nhau — bảng này hỏng
 * hoặc còn rỗng thì phần dashboard phía trên vẫn phải dùng được bình thường.
 */

const SKELETON_ROWS = ["hang-1", "hang-2", "hang-3"];

function MetricsSkeleton() {
  return (
    <div role="status" aria-label="Đang tải kết quả huấn luyện" className="space-y-3">
      <Skeleton className="h-8 w-full" />
      {SKELETON_ROWS.map((row) => (
        <Skeleton key={row} className="h-10 w-full" />
      ))}
    </div>
  );
}

export default function ModelMetricsTable({
  metrics,
  error,
  onRetry,
}: {
  /** null = đang tải. */
  metrics: ModelMetric[] | null;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FlaskConical aria-hidden className="size-5 text-chart-4" />
          Kết quả huấn luyện mô hình
        </CardTitle>
        <CardDescription>
          Mỗi dòng là một vòng huấn luyện đã hoàn tất, đo trên tập kiểm tra.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error !== null ? (
          <ErrorState title="Không tải được kết quả huấn luyện" message={error} onRetry={onRetry} />
        ) : metrics === null ? (
          <MetricsSkeleton />
        ) : metrics.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="Chưa có kết quả huấn luyện"
            hint="Bảng này sẽ có số khi vòng train đầu tiên hoàn tất."
          />
        ) : (
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead className="text-sm">Phiên bản</TableHead>
                <TableHead className="text-right text-sm">Accuracy</TableHead>
                <TableHead className="text-right text-sm">Top-5</TableHead>
                <TableHead className="text-right text-sm">Số lớp</TableHead>
                <TableHead className="text-sm">Ghi chú</TableHead>
                <TableHead className="text-sm">Ngày</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((metric) => (
                <TableRow key={metric.id}>
                  <TableCell className="font-mono font-medium text-foreground">
                    {metric.version}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-chart-1">
                    {formatPercent(metric.accuracy)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-chart-2">
                    {formatPercent(metric.top5Accuracy)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {metric.numClasses === null ? "—" : formatCount(metric.numClasses)}
                  </TableCell>
                  <TableCell className="min-w-48 whitespace-normal text-muted-foreground">
                    {metric.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRecordedAt(metric.recordedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
