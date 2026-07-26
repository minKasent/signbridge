/**
 * Kiểu dữ liệu của hai API module analytics.
 * Khai báo tách riêng để component biểu đồ (nạp động) và dashboard dùng chung
 * mà không phải import ngược vào nhau.
 */

/** Khoảng thời gian được phép truyền vào `?days=`. */
export type RangeDays = 7 | 14 | 30;

export const RANGE_OPTIONS: RangeDays[] = [7, 14, 30];

export type LatencyStats = {
  p50: number;
  /** null khi Postgres không tính được phân vị (mọi mẫu trong khoảng đều thiếu số đo). */
  p95: number | null;
  samples: number;
};

export type AnalyticsSummary = {
  totalGlosses: number;
  /** Backend đã sắp giảm dần theo count. */
  byGloss: { gloss: string; count: number }[];
  /** CHỈ có ngày phát sinh dữ liệu — ngày trống bị thiếu, phải tự lấp 0. */
  byDay: { date: string; count: number }[];
  /** null khi chưa đo được mẫu nào. */
  latency: LatencyStats | null;
};

/** Ba trường cuối để trống được: pipeline huấn luyện có thể chỉ ghi accuracy. */
export type ModelMetric = {
  id: number;
  version: string;
  accuracy: number;
  top5Accuracy: number | null;
  numClasses: number | null;
  note: string | null;
  recordedAt: string;
};

/** Một cột của biểu đồ theo ngày, đã lấp ngày trống bằng 0. */
export type DayPoint = {
  /** "2026-07-26" theo giờ Việt Nam — khóa React ổn định. */
  date: string;
  /** "26/07" cho nhãn trục. */
  label: string;
  count: number;
};

/** Một hàng của biểu đồ cột ngang top ký hiệu. */
export type GlossPoint = {
  gloss: string;
  count: number;
};
