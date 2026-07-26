"use client";

import { AnimatePresence, motion } from "motion/react";
import { Volume2 } from "lucide-react";
import type { SentenceItem } from "@/components/demo/use-translation-socket";
import { ShineBorder } from "@/components/ui/shine-border";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Sân khấu của cả hệ thống: câu tiếng Việt dịch ra. Đây là phần tử LỚN NHẤT trên
 * hai trang demo — hội đồng ngồi cuối phòng phải đọc được, nên chữ ≥ text-4xl và
 * chuỗi gloss (thông tin phụ) nhỏ hơn nằm dưới.
 */

const SOURCE_LABELS: Record<string, string> = {
  llm: "LLM ghép câu",
  cache: "LLM (bộ nhớ đệm)",
  fallback: "ghép dự phòng",
};

export function SentenceStage({
  sentence,
  hint,
  autoSpeak,
  onAutoSpeakChange,
  onSpeak,
  idPrefix,
  className,
}: {
  sentence: SentenceItem | null;
  hint: string;
  autoSpeak: boolean;
  onAutoSpeakChange: (value: boolean) => void;
  onSpeak: () => void;
  /** Cho phép hai trang dùng chung component mà id của switch không trùng nhau. */
  idPrefix: string;
  className?: string;
}) {
  const switchId = `${idPrefix}-auto-speak`;

  return (
    <section
      aria-label="Câu tiếng Việt được dịch"
      className={cn(
        "relative overflow-hidden rounded-2xl bg-card p-6 ring-1 ring-primary/25",
        className
      )}
    >
      {/* Hiệu ứng điểm nhấn duy nhất của trang — chỉ chạy khi đã có câu thật */}
      {sentence ? <ShineBorder borderWidth={2} duration={8} shineColor={["#34d399", "#38bdf8"]} /> : null}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium tracking-wider text-muted-foreground uppercase">
          Câu tiếng Việt
        </h2>
        {sentence ? (
          <Badge variant="secondary">{SOURCE_LABELS[sentence.source] ?? sentence.source}</Badge>
        ) : null}

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id={switchId} checked={autoSpeak} onCheckedChange={onAutoSpeakChange} />
            <Label htmlFor={switchId} className="text-sm text-muted-foreground">
              Tự động đọc
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onSpeak}
            disabled={!sentence}
            aria-label="Đọc lại câu vừa dịch"
          >
            <Volume2 aria-hidden />
            Đọc lại
          </Button>
        </div>
      </div>

      {/* aria-live: người dùng trình đọc màn hình nghe được câu mới mà không cần rời focus */}
      <div aria-live="polite" className="min-h-28">
        <AnimatePresence mode="wait">
          {sentence ? (
            <motion.div
              key={sentence.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <p className="text-4xl leading-tight font-semibold text-balance text-foreground md:text-5xl">
                {sentence.text}
              </p>
              {sentence.glosses.length > 0 ? (
                <p className="mt-3 font-mono text-sm text-muted-foreground">
                  {sentence.glosses.join(" · ")}
                </p>
              ) : null}
            </motion.div>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-lg text-muted-foreground"
            >
              {hint}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
