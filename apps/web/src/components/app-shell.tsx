"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { GROUP_LABELS, GROUP_ORDER, NAV_ITEMS } from "@/config/nav";
import { SystemStatus } from "@/components/system-status";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * Khung ứng dụng dùng chung: sidebar cố định trên desktop, ngăn kéo trên mobile.
 * Mọi trang nằm trong khung này nên người xem luôn biết đang ở đâu và quay về được.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav aria-label="Điều hướng chính" className="flex flex-col gap-6 p-4">
      {GROUP_ORDER.map((group) => {
        const items = NAV_ITEMS.filter((item) => item.group === group);
        return (
          <div key={group}>
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {GROUP_LABELS[group]}
            </p>
            <ul className="flex flex-col gap-1">
              {items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                      )}
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Link href="/" className="flex items-center gap-2 px-5 py-5 text-lg font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">
            S
          </span>
          Sign<span className="-ml-2 text-primary">Bridge</span>
        </Link>
        <ScrollArea className="flex-1">{nav}</ScrollArea>
        <div className="border-t border-sidebar-border p-4">
          <SystemStatus />
        </div>
      </aside>

      {/* Ngăn kéo mobile */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Đóng menu"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-sidebar-border bg-sidebar">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-lg font-semibold">SignBridge</span>
              <Button variant="ghost" size="icon" aria-label="Đóng menu" onClick={() => setMobileOpen(false)}>
                <X className="size-5" />
              </Button>
            </div>
            <ScrollArea className="flex-1">{nav}</ScrollArea>
            <div className="border-t border-sidebar-border p-4">
              <SystemStatus />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Thanh trên chỉ hiện ở mobile — desktop đã có sidebar */}
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <Button variant="ghost" size="icon" aria-label="Mở menu" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <Link href="/" className="font-semibold">
            Sign<span className="text-primary">Bridge</span>
          </Link>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
