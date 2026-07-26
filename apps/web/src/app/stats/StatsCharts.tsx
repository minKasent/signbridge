"use client";

import { CalendarRange, ChartNoAxesColumn } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/demo/state-views";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DayPoint, GlossPoint } from "./types";

/**
 * Hai biểu đồ của dashboard. Tách file riêng để `StatsDashboard` nạp động
 * (recharts nặng, chỉ trang này cần) — thẻ KPI và bảng vẫn hiện ngay.
 *
 * Vì sao đặt fontSize 14 ở cả `fontSize` lẫn `tick`: recharts dùng `fontSize`
 * để ước lượng bề rộng nhãn (quyết định giãn cách tick) còn `tick` mới là cỡ
 * chữ vẽ ra. Cỡ mặc định 12px quá nhỏ khi chiếu máy chiếu.
 */

const DAY_CONFIG = {
  count: { label: "Lượt nhận diện", color: "var(--chart-2)" },
} satisfies ChartConfig;

const GLOSS_CONFIG = {
  count: { label: "Lượt nhận diện", color: "var(--chart-1)" },
} satisfies ChartConfig;

const AXIS_FONT_SIZE = 14;

/** Gloss dài ("CAM_ON_RAT_NHIEU") sẽ đè lên biểu đồ nếu không cắt bớt. */
function shortenGloss(value: string): string {
  return value.length > 12 ? `${value.slice(0, 11)}…` : value;
}

/** 30 cột mà vẽ đủ 30 nhãn thì chữ chồng nhau — thưa dần theo độ dài chuỗi. */
function dayTickInterval(length: number): number {
  if (length <= 7) return 0;
  if (length <= 14) return 1;
  return 3;
}

export default function StatsCharts({
  days,
  glosses,
  rangeDays,
}: {
  days: DayPoint[];
  glosses: GlossPoint[];
  rangeDays: number;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarRange aria-hidden className="size-5 text-chart-2" />
            Hoạt động theo ngày
          </CardTitle>
          <CardDescription>
            {rangeDays} ngày gần nhất theo giờ Việt Nam — ngày không có lượt nào vẫn hiện cột 0.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={DAY_CONFIG} className="aspect-auto h-[280px] w-full">
            <BarChart accessibilityLayer data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={8}
                interval={dayTickInterval(days.length)}
                fontSize={AXIS_FONT_SIZE}
                tick={{ fontSize: AXIS_FONT_SIZE }}
              />
              <YAxis
                allowDecimals={false}
                width={44}
                tickLine={false}
                axisLine={false}
                fontSize={AXIS_FONT_SIZE}
                tick={{ fontSize: AXIS_FONT_SIZE }}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent className="text-sm" indicator="dot" />}
              />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ChartNoAxesColumn aria-hidden className="size-5 text-chart-1" />
            Top 10 ký hiệu
          </CardTitle>
          <CardDescription>
            Ký hiệu được nhận diện nhiều nhất trong {rangeDays} ngày gần nhất.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {glosses.length === 0 ? (
            <EmptyState
              icon={ChartNoAxesColumn}
              title="Chưa có ký hiệu nào được nhận diện"
              hint="Chạy một phiên ở trang Phiên dịch, bảng xếp hạng sẽ tự xuất hiện."
            />
          ) : (
            <ChartContainer config={GLOSS_CONFIG} className="aspect-auto h-[360px] w-full">
              <BarChart
                accessibilityLayer
                layout="vertical"
                data={glosses}
                margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis
                  type="number"
                  dataKey="count"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={AXIS_FONT_SIZE}
                  tick={{ fontSize: AXIS_FONT_SIZE }}
                />
                <YAxis
                  type="category"
                  dataKey="gloss"
                  width={100}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  tickFormatter={shortenGloss}
                  fontSize={AXIS_FONT_SIZE}
                  tick={{ fontSize: AXIS_FONT_SIZE }}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent className="text-sm" indicator="line" />}
                />
                <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
