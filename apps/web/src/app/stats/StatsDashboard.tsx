"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Hand, RefreshCw } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/demo/state-views";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API_BASE } from "@/lib/landmarks";
import KpiCards from "./KpiCards";
import ModelMetricsTable from "./ModelMetricsTable";
import { buildDaySeries, normalizeMetrics, normalizeSummary, topGlosses } from "./stats-utils";
import { RANGE_OPTIONS, type AnalyticsSummary, type ModelMetric, type RangeDays } from "./types";

/**
 * Dashboard số liệu thật của module analytics.
 *
 * Hai API độc lập nhau (số liệu sử dụng và lịch sử huấn luyện) nên chúng được
 * tải song song và hỏng riêng: bảng kết quả huấn luyện lỗi thì phần còn lại
 * vẫn dùng được bình thường.
 *
 * Vì sao mọi setState đều nằm trong .then/.catch chứ không đứng thẳng trong
 * effect: ESLint bật react-hooks/set-state-in-effect (đặt state đồng bộ trong
 * thân effect gây render dây chuyền). Cùng lý do đó, chỉ nút bấm tay mới bật cờ
 * "đang làm mới" — vòng tự động làm mới chạy ngầm, không nháy giao diện.
 */

/** Nhịp tự động làm mới: đủ nhanh để thấy số nhảy khi demo, đủ chậm để không spam backend. */
const POLL_MS = 7_000;
const TOP_GLOSS_LIMIT = 10;

/** Recharts nặng và chỉ trang này cần — thẻ KPI hiện ngay, biểu đồ nạp sau. */
const StatsCharts = dynamic(() => import("./StatsCharts"), {
  ssr: false,
  loading: () => (
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-96 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  ),
});

/** Lỗi mạng/HTTP → câu tiếng Việt nói rõ phải kiểm tra gì. */
function describeError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `${detail}. Kiểm tra dịch vụ core đang chạy ở cổng 8080 rồi bấm Thử lại.`;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <p role="status" className="sr-only">
        Đang tải số liệu thống kê…
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-96 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function StatsDashboard() {
  const [range, setRange] = useState<RangeDays>(7);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ModelMetric[] | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  /** Hủy lượt tải đang dở khi đổi khoảng ngày / rời trang / bấm làm mới liên tục. */
  const abortRef = useRef<AbortController | null>(null);
  /** Có lượt tải đang chạy không — vòng poll dựa vào đây để KHÔNG cắt ngang lượt cũ. */
  const inFlightRef = useRef(false);

  // KHÔNG khai báo async: mọi setState phải nằm trong callback .then, không được
  // đứng trong thân hàm được effect gọi thẳng (react-hooks/set-state-in-effect).
  const loadAll = useCallback((days: RangeDays) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    inFlightRef.current = true;
    const { signal } = controller;

    // Hai lời gọi độc lập → chạy song song, và hỏng riêng từng cái
    return Promise.allSettled([
      fetch(`${API_BASE}/api/analytics/summary?days=${days}`, { signal }).then(async (res) => {
        if (!res.ok) throw new Error(`Máy chủ trả mã ${res.status}`);
        return normalizeSummary(await res.json());
      }),
      fetch(`${API_BASE}/api/analytics/model-metrics`, { signal }).then(async (res) => {
        if (!res.ok) throw new Error(`Máy chủ trả mã ${res.status}`);
        return normalizeMetrics(await res.json());
      }),
    ]).then(([summaryResult, metricsResult]) => {
      if (signal.aborted) return;

      if (summaryResult.status === "fulfilled") {
        setSummary(summaryResult.value);
        setSummaryError(null);
      }
      else if (!isAbort(summaryResult.reason)) {
        setSummaryError(describeError(summaryResult.reason));
      }

      if (metricsResult.status === "fulfilled") {
        setMetrics(metricsResult.value);
        setMetricsError(null);
      }
      else if (!isAbort(metricsResult.reason)) {
        setMetricsError(describeError(metricsResult.reason));
      }
    }).finally(() => {
      // Chỉ hạ cờ nếu đây vẫn là lượt hiện tại: lượt mới hơn đã hủy lượt này thì
      // nó mới là chủ của cờ.
      if (abortRef.current === controller) inFlightRef.current = false;
    });
  }, []);

  // Tải lần đầu và mỗi khi đổi khoảng ngày
  useEffect(() => {
    void loadAll(range);
    return () => abortRef.current?.abort();
  }, [loadAll, range]);

  // Tự động làm mới — dọn hẹn giờ khi tắt công tắc, đổi khoảng, hoặc rời trang.
  // Backend chậm hơn một nhịp poll thì BỎ QUA nhịp đó thay vì hủy lượt đang chạy:
  // hủy đều đặn mỗi 7 giây sẽ khiến số liệu không bao giờ về được.
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      if (!inFlightRef.current) void loadAll(range);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, loadAll, range]);

  function handleManualRefresh() {
    setRefreshing(true);
    void loadAll(range).finally(() => setRefreshing(false));
  }

  const firstLoad = summary === null && summaryError === null;
  const days = summary ? buildDaySeries(summary.byDay, range) : [];
  const glosses = summary ? topGlosses(summary.byGloss, TOP_GLOSS_LIMIT) : [];
  const noData = summary !== null && summary.totalGlosses === 0;

  /**
   * Nội dung của khoảng ngày đang chọn. Lỗi khi ĐÃ có số liệu chỉ hiện thành dải
   * cảnh báo phía trên chứ không thay thế dashboard: một nhịp tự động làm mới hụt
   * mà xóa sạch màn hình đang chiếu là mất mặt ngay giữa buổi bảo vệ.
   */
  const rangeBody = (
    <>
      {summaryError !== null ? (
        <ErrorState
          title={summary === null ? "Không tải được số liệu sử dụng" : "Không làm mới được số liệu"}
          message={
            summary === null
              ? summaryError
              : `${summaryError} Số liệu bên dưới là lần tải gần nhất còn dùng được.`
          }
          onRetry={handleManualRefresh}
        />
      ) : null}

      {firstLoad ? <DashboardSkeleton /> : null}

      {summary !== null ? (
        <>
          <KpiCards
            totalGlosses={summary.totalGlosses}
            distinctGlosses={summary.byGloss.length}
            latency={summary.latency}
            days={range}
          />
          {noData ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={Hand}
                  title="Chưa có lượt nhận diện nào"
                  hint={`Trong ${range} ngày gần nhất chưa có ký hiệu nào được nhận diện. Chạy một phiên dịch rồi quay lại đây — số liệu hiện ngay.`}
                  action={
                    <Button asChild>
                      <Link href="/translate">
                        <Hand aria-hidden />
                        Mở trang Phiên dịch
                      </Link>
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <StatsCharts days={days} glosses={glosses} rangeDays={range} />
          )}
        </>
      ) : null}
    </>
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Thống kê sử dụng</h1>
          <p className="text-muted-foreground">
            Số liệu thật ghi từ các phiên dịch — module analytics nhận sự kiện và lưu vào cơ sở dữ liệu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 sm:ml-auto">
          <div className="flex items-center gap-2">
            <Switch id="stats-auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label htmlFor="stats-auto-refresh" className="text-sm text-muted-foreground">
              Tự động làm mới
            </Label>
          </div>
          <Button
            variant="outline"
            onClick={handleManualRefresh}
            disabled={refreshing}
            aria-label="Làm mới số liệu ngay"
          >
            <RefreshCw aria-hidden className={refreshing ? "animate-spin" : undefined} />
            {refreshing ? "Đang tải…" : "Làm mới"}
          </Button>
        </div>
      </header>

      {/* Mỗi tab PHẢI có TabsContent tương ứng: Radix gắn aria-controls từ trigger
          sang panel, thiếu panel là trỏ vào id không tồn tại — trình đọc màn hình
          báo lỗi cấu trúc. Radix chỉ gắn panel đang chọn nên không render thừa. */}
      <Tabs value={String(range)} onValueChange={(value) => setRange(Number(value) as RangeDays)}>
        <TabsList aria-label="Chọn khoảng thời gian">
          {RANGE_OPTIONS.map((option) => (
            <TabsTrigger key={option} value={String(option)}>
              {option} ngày
            </TabsTrigger>
          ))}
        </TabsList>

        <p aria-live="polite" className="sr-only">
          {autoRefresh ? "Đang tự động làm mới số liệu mỗi 7 giây" : "Tự động làm mới đang tắt"}
        </p>

        {RANGE_OPTIONS.map((option) => (
          <TabsContent key={option} value={String(option)} className="mt-6 space-y-4">
            {rangeBody}
          </TabsContent>
        ))}
      </Tabs>

      {/* Kết quả huấn luyện không phụ thuộc khoảng ngày → để ngoài tab */}
      <div className="mt-4">
        <ModelMetricsTable metrics={metrics} error={metricsError} onRetry={handleManualRefresh} />
      </div>
    </div>
  );
}
