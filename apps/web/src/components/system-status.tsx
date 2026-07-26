"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/landmarks";
import { cn } from "@/lib/utils";

/**
 * Dải tình trạng hệ thống — trả lời câu hỏi "backend còn sống không?" NGAY trên
 * mọi trang. Trước đây mỗi trang tự phát hiện backend chết theo một kiểu khác
 * nhau (hoặc im lặng), người trình bày chỉ biết khi demo đã hỏng giữa chừng.
 */

type Health = { core: boolean; ml: boolean; signs: number | null };

const POLL_MS = 15_000;

export function SystemStatus() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      // Hai lời gọi độc lập → chạy song song (quy tắc async-parallel)
      const [coreRes, signsRes] = await Promise.allSettled([
        fetch(`${API_BASE}/actuator/health`, { cache: "no-store" }),
        fetch(`${API_BASE}/api/signs`, { cache: "no-store" }),
      ]);
      if (cancelled) return;

      const core = coreRes.status === "fulfilled" && coreRes.value.ok;
      let signs: number | null = null;
      if (signsRes.status === "fulfilled" && signsRes.value.ok) {
        try {
          signs = ((await signsRes.value.json()) as unknown[]).length;
        } catch {
          signs = null;
        }
      }
      if (!cancelled) setHealth({ core, ml: core, signs });
    }

    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-1.5 text-xs" aria-live="polite">
      <Row label="Backend" ok={health?.core ?? null} />
      {health?.signs !== null && health?.signs !== undefined ? (
        <p className="text-muted-foreground">
          {health.signs.toLocaleString("vi")} ký hiệu trong từ điển
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, ok }: { label: string; ok: boolean | null }) {
  const text = ok === null ? "đang kiểm tra…" : ok ? "hoạt động" : "không kết nối được";
  return (
    <p className="flex items-center gap-2 text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          ok === null ? "bg-muted-foreground/50" : ok ? "bg-primary" : "bg-destructive"
        )}
      />
      <span className="text-foreground">{label}</span>
      <span>{text}</span>
    </p>
  );
}
