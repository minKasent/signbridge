import type { Metadata } from "next";
import StatsDashboard from "./StatsDashboard";

export const metadata: Metadata = {
  title: "Thống kê",
};

export default function StatsPage() {
  return <StatsDashboard />;
}
