import type { Metadata } from "next";
import RecordTool from "./RecordTool";

export const metadata: Metadata = {
  title: "Quay clip từ điển",
};

export default function RecordPage() {
  return <RecordTool />;
}
