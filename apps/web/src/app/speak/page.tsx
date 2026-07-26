import type { Metadata } from "next";
import SpeakTool from "./SpeakTool";

export const metadata: Metadata = {
  title: "Nói → Ký hiệu",
};

export default function SpeakPage() {
  return <SpeakTool />;
}
