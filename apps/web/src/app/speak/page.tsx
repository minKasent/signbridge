import type { Metadata } from "next";
import SpeakTool from "./SpeakTool";

export const metadata: Metadata = {
  title: "Nói → Ký hiệu | SignBridge",
};

export default function SpeakPage() {
  return <SpeakTool />;
}
