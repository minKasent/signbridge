"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/lib/landmarks";

/**
 * Dashboard số liệu thật từ module analytics (bảng gloss_usages):
 * tổng lượt nhận diện, top ký hiệu và hoạt động theo ngày trong 7 ngày.
 * Biểu đồ vẽ thuần div/CSS theo quy ước — không thêm thư viện chart.
 */

type Summary = {
  totalGlosses: number;
  byGloss: { gloss: string; count: number }[];
  byDay: { date: string; count: number }[];
};

const TOP_GLOSSES = 10;
const DAYS = 7;

// Trục ngày phải tính theo ĐÚNG múi giờ backend gộp byDay (Asia/Ho_Chi_Minh,
// xem AnalyticsController) — dùng giờ local máy xem thì entry "hôm nay VN"
// không khớp cột nào và rơi khỏi biểu đồ khi máy xem không ở UTC+7.
// Locale en-CA cho sẵn định dạng YYYY-MM-DD trùng với backend.
const VN_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 7 ngày gần nhất theo giờ VN (VN không có DST nên lùi đúng 24h mỗi bước). */
function lastDays(): string[] {
  const days: string[] = [];
  const now = Date.now();
  for (let i = DAYS - 1; i >= 0; i--) {
    days.push(VN_DAY.format(new Date(now - i * MS_PER_DAY)));
  }
  return days;
}

/** "2026-07-26" → "26/07" cho nhãn trục ngày. */
function dayLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export default function StatsDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // setState chỉ trong callback .then/.catch — thân hàm không setState đồng bộ,
  // vì effect gọi thẳng hàm này lúc mount (rule react-hooks/set-state-in-effect).
  // Trạng thái loading khởi tạo true; nút "Làm mới" tự set lại trước khi gọi.
  const load = useCallback(() => {
    fetch(`${API_BASE}/api/analytics/summary?days=${DAYS}`)
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          setError(
            "API thống kê hiện yêu cầu đăng nhập — số liệu sẽ hiện khi cấu hình mở công khai được áp dụng ở khâu tích hợp."
          );
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSummary((await res.json()) as Summary);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(`Không tải được số liệu: ${e instanceof Error ? e.message : String(e)}`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const topGlosses = summary?.byGloss.slice(0, TOP_GLOSSES) ?? [];
  const maxGloss = topGlosses[0]?.count ?? 0;

  const dayCounts = new Map(summary?.byDay.map((d) => [d.date, d.count]) ?? []);
  const days = lastDays().map((date) => ({ date, count: dayCounts.get(date) ?? 0 }));
  const maxDay = Math.max(0, ...days.map((d) => d.count));
  const todayCount = days[days.length - 1]?.count ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mb-4 flex items-center gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold">SignBridge — Thống kê sử dụng</h1>
          <p className="text-sm text-zinc-400">
            Số liệu thật từ các phiên dịch (/translate, /video) — module analytics ghi qua sự kiện.
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            load();
          }}
          disabled={loading}
          className="ml-auto rounded-lg bg-sky-700 px-4 py-2 font-medium hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
        >
          {loading ? "Đang tải…" : "⟳ Làm mới"}
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-amber-700 bg-amber-950/40 p-4 text-amber-400">
          {error}
        </div>
      )}

      {summary && (
        <>
          <div className="mb-6 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Tổng lượt nhận diện ({DAYS} ngày)</p>
              <p className="mt-1 text-3xl font-bold text-emerald-400">{summary.totalGlosses}</p>
            </div>
            <div className="rounded-xl bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Số ký hiệu khác nhau</p>
              <p className="mt-1 text-3xl font-bold text-sky-400">{summary.byGloss.length}</p>
            </div>
            <div className="rounded-xl bg-zinc-900 p-4">
              <p className="text-sm text-zinc-400">Hôm nay</p>
              <p className="mt-1 text-3xl font-bold text-zinc-100">{todayCount}</p>
            </div>
          </div>

          <div className="flex max-w-5xl flex-wrap gap-6">
            <div className="min-w-80 flex-1 rounded-xl bg-zinc-900 p-4">
              <h2 className="mb-3 font-semibold text-emerald-400">
                Top {TOP_GLOSSES} ký hiệu được nhận diện
              </h2>
              {topGlosses.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Chưa có dữ liệu — chạy trang /translate hoặc /video để sinh số liệu.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {topGlosses.map((g) => (
                    <li key={g.gloss} className="flex items-center gap-2 text-sm">
                      <span className="w-28 shrink-0 truncate font-mono text-sky-300" title={g.gloss}>
                        {g.gloss}
                      </span>
                      <div className="h-4 flex-1 rounded bg-zinc-800">
                        <div
                          className="h-full rounded bg-emerald-600"
                          style={{ width: `${maxGloss > 0 ? (g.count / maxGloss) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-zinc-400">{g.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="min-w-80 flex-1 rounded-xl bg-zinc-900 p-4">
              <h2 className="mb-3 font-semibold text-sky-400">Hoạt động {DAYS} ngày gần nhất</h2>
              <div className="flex items-end gap-2">
                {days.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                    <span className="h-4 text-xs text-zinc-400">{d.count > 0 ? d.count : ""}</span>
                    <div className="flex h-36 w-full items-end">
                      <div
                        className="w-full rounded-t bg-sky-600"
                        style={{
                          height: `${
                            maxDay > 0 ? Math.max(d.count > 0 ? 4 : 0, (d.count / maxDay) * 100) : 0
                          }%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-zinc-500">{dayLabel(d.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
