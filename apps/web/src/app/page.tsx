import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { GROUP_LABELS, GROUP_ORDER, NAV_ITEMS } from "@/config/nav";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Trang chủ = trung tâm điều hướng có THỨ BẬC: nhóm "Phiên dịch" (thứ hội đồng
 * xem khi bảo vệ) nổi bật hẳn, công cụ và quản trị nhỏ hơn. Trước đây 7 nút cùng
 * cỡ, cùng độ rực → "Quản trị từ điển" trông ngang hàng với demo chính.
 */
export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-12">
        <Badge variant="secondary" className="mb-4">
          Đồ án tốt nghiệp 2026
        </Badge>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Sign<span className="text-primary">Bridge</span>
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-lg text-muted-foreground">
          Hệ thống dịch ngôn ngữ ký hiệu tiếng Việt hai chiều, thời gian thực: người khiếm
          thính ra ký hiệu thì máy đọc thành lời, người nghe nói thì máy phát ký hiệu.
        </p>
      </header>

      {GROUP_ORDER.map((group) => {
        const items = NAV_ITEMS.filter((item) => item.group === group);
        const isPrimary = group === "demo";
        return (
          <section key={group} className="mb-10">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {GROUP_LABELS[group]}
            </h2>
            <div
              className={
                isPrimary
                  ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              }
            >
              {items.map((item) => (
                <Link key={item.href} href={item.href} className="group focus-visible:outline-none">
                  <Card
                    className={
                      isPrimary
                        ? "h-full transition-colors group-hover:border-primary/60 group-focus-visible:border-primary"
                        : "h-full bg-card/50 transition-colors group-hover:border-border group-focus-visible:border-primary"
                    }
                  >
                    <CardHeader>
                      <item.icon
                        className={isPrimary ? "size-7 text-primary" : "size-5 text-muted-foreground"}
                        aria-hidden
                      />
                      <CardTitle className={isPrimary ? "text-xl" : "text-base"}>
                        <span className="flex items-center gap-2">
                          {item.label}
                          <ArrowRight
                            className="size-4 opacity-0 transition-opacity group-hover:opacity-100"
                            aria-hidden
                          />
                        </span>
                      </CardTitle>
                      <CardDescription className={isPrimary ? "text-sm" : "text-xs"}>
                        {item.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
