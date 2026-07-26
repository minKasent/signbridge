import type { AnalyticsSummary, DayPoint, GlossPoint, ModelMetric } from "./types";

/**
 * Hàm thuần dùng chung cho trang /stats: dựng trục ngày, định dạng số.
 *
 * Vì sao trục ngày phải cố định múi giờ: backend gộp `byDay` theo
 * Asia/Ho_Chi_Minh. Nếu sinh trục bằng getDate()/getMonth() theo giờ máy người
 * xem thì máy không ở UTC+7 sẽ lệch một ngày và cột "hôm nay" rơi khỏi biểu đồ —
 * đúng lỗi đã bị bắt ở sprint 1. Locale en-CA cho sẵn định dạng "YYYY-MM-DD"
 * trùng khóa backend nên so khớp trực tiếp được.
 */
const VN_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** "2026-07-26" → "26/07". */
export function dayLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/**
 * Dựng đủ `days` cột liên tiếp tính tới hôm nay (giờ VN), lấp 0 cho ngày backend
 * không trả về. Việt Nam không có giờ mùa hè nên lùi đúng 24h mỗi bước là chuẩn.
 */
export function buildDaySeries(byDay: AnalyticsSummary["byDay"], days: number): DayPoint[] {
  const counts = new Map(byDay.map((d) => [d.date, d.count]));
  const now = Date.now();
  const points: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = VN_DAY.format(new Date(now - i * MS_PER_DAY));
    points.push({ date, label: dayLabel(date), count: counts.get(date) ?? 0 });
  }
  return points;
}

/** Top N ký hiệu — backend đã sắp giảm dần nên chỉ cần cắt. */
export function topGlosses(byGloss: AnalyticsSummary["byGloss"], limit: number): GlossPoint[] {
  return byGloss.slice(0, limit).map((g) => ({ gloss: g.gloss, count: g.count }));
}

/** Số nguyên có dấu phân cách nghìn kiểu Việt Nam: 12345 → "12.345". */
export function formatCount(value: number): string {
  return Math.round(value).toLocaleString("vi-VN");
}

/** 0.8234 → "82,3%" (một chữ số thập phân theo yêu cầu bảng model_metrics). */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toLocaleString("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** ISO từ backend → "26/07/2026 17:00" theo giờ Việt Nam. */
export function formatRecordedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Chuẩn hóa payload trước khi dùng: backend có thể bỏ trống mảng hoặc trả
 * latency = null, không để một trường thiếu làm sập cả trang.
 */
export function normalizeSummary(raw: Partial<AnalyticsSummary> | null): AnalyticsSummary {
  return {
    totalGlosses: typeof raw?.totalGlosses === "number" ? raw.totalGlosses : 0,
    byGloss: Array.isArray(raw?.byGloss) ? raw.byGloss : [],
    byDay: Array.isArray(raw?.byDay) ? raw.byDay : [],
    latency: raw?.latency ?? null,
  };
}

/** Mảng rỗng khi backend trả về thứ gì đó không phải mảng. */
export function normalizeMetrics(raw: unknown): ModelMetric[] {
  return Array.isArray(raw) ? (raw as ModelMetric[]) : [];
}
