import type { Metadata } from "next";
import TranslateClient from "./TranslateClient";

// Server component: chỉ khai báo metadata rồi giao phần nặng cho vỏ client
export const metadata: Metadata = {
  title: "Phiên dịch",
  description:
    "Bật webcam, ra ký hiệu và xem hệ thống ghép thành câu tiếng Việt theo thời gian thực.",
};

export default function TranslatePage() {
  return <TranslateClient />;
}
