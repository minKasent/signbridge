"use client";

import { Activity, Gauge, Info, Shapes, Timer, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount } from "./stats-utils";
import type { LatencyStats } from "./types";
import { useCountUp } from "./use-count-up";

/**
 * Bốn thẻ số lớn đứng đầu dashboard.
 *
 * Vì sao con số hiển thị lại `aria-hidden` và có thêm một dòng `sr-only`:
 * số chạy đổi ~60 lần/giây khi đếm lên, để nguyên thì trình đọc màn hình đọc
 * chồng chéo. Dòng ẩn giữ đúng giá trị cuối cùng để đọc khi người dùng cần.
 */

type KpiCardProps = {
  icon: LucideIcon;
  label: string;
  /** null = chưa đo được (latency null) → hiện dấu "—". */
  value: number | null;
  hint: string;
  explain?: string;
  valueClassName: string;
  animate: boolean;
  delay: number;
};

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  explain,
  valueClassName,
  animate,
  delay,
}: KpiCardProps) {
  const animated = useCountUp(value ?? 0);
  const hasValue = value !== null;

  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: animate ? delay : 0 }}
    >
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Icon aria-hidden className="size-4 shrink-0" />
            <span>{label}</span>
            {explain ? (
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-label={`Giải thích: ${label}`}
                  className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Info aria-hidden className="size-4" />
                </TooltipTrigger>
                <TooltipContent className="max-w-72 text-sm">{explain}</TooltipContent>
              </Tooltip>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p
            aria-hidden
            className={`text-5xl leading-none font-bold tabular-nums ${valueClassName}`}
          >
            {hasValue ? formatCount(animated) : "—"}
          </p>
          <span className="sr-only">
            {label}: {hasValue ? formatCount(value) : "chưa có số liệu"}
          </span>
          <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function KpiCards({
  totalGlosses,
  distinctGlosses,
  latency,
  days,
}: {
  totalGlosses: number;
  distinctGlosses: number;
  latency: LatencyStats | null;
  days: number;
}) {
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion;
  const rangeHint = `trong ${days} ngày gần nhất`;
  const sampleHint = latency ? `đo trên ${formatCount(latency.samples)} mẫu` : "chưa có mẫu đo";

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon={Activity}
        label="Tổng lượt nhận diện"
        value={totalGlosses}
        hint={rangeHint}
        valueClassName="text-chart-1"
        animate={animate}
        delay={0}
      />
      <KpiCard
        icon={Shapes}
        label="Số ký hiệu khác nhau"
        value={distinctGlosses}
        hint={`đã xuất hiện ${rangeHint}`}
        valueClassName="text-chart-2"
        animate={animate}
        delay={0.05}
      />
      <KpiCard
        icon={Timer}
        label="Độ trễ p50 (ms)"
        value={latency ? latency.p50 : null}
        hint={latency ? `một nửa số ký hiệu nhanh hơn mức này · ${sampleHint}` : sampleHint}
        explain="p50 là mức giữa: một nửa số ký hiệu được trả về nhanh hơn con số này, một nửa chậm hơn. Đây là cảm giác độ trễ thường gặp khi dùng."
        valueClassName="text-chart-3"
        animate={animate}
        delay={0.1}
      />
      <KpiCard
        icon={Gauge}
        label="Độ trễ p95 (ms)"
        value={latency ? latency.p95 : null}
        hint={latency ? `95 trên 100 ký hiệu nhanh hơn mức này · ${sampleHint}` : sampleHint}
        explain="p95 là mức xấu gần nhất còn tính được: 95 trên 100 ký hiệu được trả về nhanh hơn con số này. Mục tiêu của đồ án là dưới 500 ms."
        valueClassName="text-chart-4"
        animate={animate}
        delay={0.15}
      />
    </div>
  );
}
