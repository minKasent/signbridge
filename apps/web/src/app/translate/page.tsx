import type { Metadata } from "next";
import TranslateDemo from "./TranslateDemo";

export const metadata: Metadata = {
  title: "Phiên dịch",
};

export default function TranslatePage() {
  return <TranslateDemo />;
}
