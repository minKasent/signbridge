import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

/**
 * Font PHẢI có subset "vietnamese" — thiếu nó, dấu tiếng Việt rơi sang font hệ
 * thống và chữ trông vênh nhau (lỗi đã phát hiện khi kiểm toán giao diện).
 * Be Vietnam Pro do người Việt thiết kế, dấu cân đối hơn Geist cho tiếng Việt.
 */
const sans = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// Geist Mono không có subset tiếng Việt — chấp nhận được vì font này chỉ dùng
// cho mã gloss (A-Z, 0-9, gạch dưới), không dùng cho câu tiếng Việt.
const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SignBridge — Dịch ngôn ngữ ký hiệu tiếng Việt",
    template: "%s | SignBridge",
  },
  description:
    "Hệ thống dịch ngôn ngữ ký hiệu tiếng Việt (VSL) hai chiều, thời gian thực: ký hiệu → tiếng nói và tiếng nói → ký hiệu.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // class "dark" cố định: token tối của shadcn nằm dưới bộ chọn .dark, không có
    // class này thì app dùng token sáng trong khi giao diện được thiết kế cho nền tối.
    <html lang="vi" className={`dark ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <TooltipProvider delayDuration={200}>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
