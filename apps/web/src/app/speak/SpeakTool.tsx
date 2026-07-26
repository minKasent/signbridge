"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { API_BASE } from "@/lib/landmarks";

/**
 * Chiều ngược: người nghe GÕ hoặc NÓI tiếng Việt → khớp từ điển (cụm dài nhất trước)
 * → phát lần lượt clip ký hiệu của TỪ ĐIỂN QUỐC GIA QIPEDC.
 *
 * Từ KHÔNG có trong từ điển → ĐÁNH VẦN bằng bảng chữ cái ngón tay (clip chữ cái
 * đơn của chính kho QIPEDC) — đúng cách thông dịch viên thật xử lý từ lạ.
 * Khớp từ + đánh vần làm ở client (tải từ điển một lần) để giữ đúng THỨ TỰ từ
 * trong câu khi trộn từ-có-ký-hiệu và từ-phải-đánh-vần.
 */

type Sign = { id: number; gloss: string; meaningVi: string; clipUrl: string | null };

type Entry =
  | { kind: "sign"; sign: Sign }
  | { kind: "spell"; word: string; letters: { ch: string; sign: Sign | null }[] };

/** Một mục trong hàng đợi phát, có đường dẫn ngược về chip đang sáng. */
type Cue = {
  sign: Sign;
  label: string;
  sublabel: string;
  entryIdx: number;
  letterIdx: number; // -1 khi là ký hiệu nguyên từ
};

const MAX_PHRASE_WORDS = 4;

/**
 * Câu mẫu được CHỌN sau khi đối chiếu với kho QIPEDC thật (kiểm bằng script, không
 * đoán): mỗi câu khớp trọn vẹn nên demo không bị đánh vần lê thê, và cả bốn câu cùng
 * nhau minh hoạ được bốn đặc điểm khác nhau của ngôn ngữ ký hiệu.
 *
 * Lưu ý dữ liệu: từ điển quốc gia KHÔNG có ký hiệu rời cho "tôi", "cảm ơn", "bác sĩ",
 * "hôm nay" (xem commit 17e0664). Riêng "tôi" là do VSL diễn đạt ngôi thứ nhất bằng
 * cách CHỈ VÀO MÌNH chứ không có ký hiệu từ vựng — nên câu mẫu tránh dùng.
 */
const EXAMPLES: { text: string; hint: string }[] = [
  { text: "Xin chào cô giáo", hint: "2 ký hiệu — chào hỏi cơ bản" },
  { text: "Bạn tên là gì", hint: "«tên là gì» là MỘT ký hiệu, không phải ba" },
  { text: "Xin chào bạn Khoa", hint: "tên riêng được đánh vần từng chữ" },
  { text: "Bệnh nhân đau bụng", hint: "tình huống y tế" },
];

const SPEEDS = [0.5, 0.75, 1, 1.5] as const;

/** Chữ thường + bỏ dấu câu + gộp khoảng trắng — PHẢI khớp SignComposer.normalize phía server. */
function normalize(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.,!?;:…"'()[\]-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** đ→d + bỏ dấu thanh/mũ — dùng khi kho không có clip cho chữ cái có dấu. */
function stripDiacritics(ch: string): string {
  return ch.replace(/đ/g, "d").normalize("NFD").replace(/\p{M}/gu, "");
}

// Web Speech API — Chrome hỗ trợ vi-VN (từ Chrome 139 chạy được cả on-device)
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function createRecognizer(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, new () => SpeechRecognitionLike>;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export default function SpeakTool() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recognizerRef = useRef<SpeechRecognitionLike | null>(null);
  const phraseMapRef = useRef<Map<string, Sign>>(new Map());
  const letterMapRef = useRef<Map<string, Sign>>(new Map());

  const [dictState, setDictState] = useState<"loading" | "ready" | "error">("loading");
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [playIndex, setPlayIndex] = useState(-1);
  const [finished, setFinished] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [runNonce, setRunNonce] = useState(0);
  const [listening, setListening] = useState(false);

  const dictReady = dictState === "ready";

  // Không đặt setDictState("loading") ở đây: hàm này được gọi thẳng trong effect,
  // setState đồng bộ trong thân effect sẽ kéo theo một lượt render thừa (react-hooks
  // /set-state-in-effect). Trạng thái "loading" đã là giá trị khởi tạo; nút "Thử lại"
  // tự đặt lại trước khi gọi.
  const fetchDictionary = useCallback((signal?: AbortSignal) => {
    fetch(`${API_BASE}/api/signs`, { signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Sign[]>;
      })
      .then((signs) => {
        const phrases = new Map<string, Sign>();
        const letters = new Map<string, Sign>();
        for (const s of signs) {
          const key = normalize(s.meaningVi);
          // CHỈ nhận từ CÓ clip: từ có trong từ điển mà chưa có clip thì phát
          // được gì đâu — để nó rơi xuống nhánh đánh vần mới đúng.
          if (s.clipUrl && !phrases.has(key)) phrases.set(key, s);
          if (key.length === 1 && s.clipUrl) letters.set(key, s);
        }
        phraseMapRef.current = phrases;
        letterMapRef.current = letters;
        setDictState("ready");
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setDictState("error");
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchDictionary(controller.signal);
    return () => controller.abort();
  }, [fetchDictionary]);

  const retryDictionary = useCallback(() => {
    setDictState("loading");
    fetchDictionary();
  }, [fetchDictionary]);

  // Rời trang khi đang bật mic → phải tắt nhận dạng, không thì micro còn nóng
  useEffect(() => {
    return () => {
      recognizerRef.current?.stop();
      recognizerRef.current = null;
    };
  }, []);

  // Hàng đợi phát: mọi clip theo đúng thứ tự câu (ký hiệu nguyên từ + chữ cái đánh vần).
  // Giữ entryIdx/letterIdx để chip sáng đúng vị trí — một từ lặp lại hai lần trong câu
  // không được làm sáng cả hai chip.
  const cues = useMemo<Cue[]>(() => {
    if (!entries) return [];
    const list: Cue[] = [];
    entries.forEach((entry, entryIdx) => {
      if (entry.kind === "sign") {
        if (entry.sign.clipUrl) {
          list.push({
            sign: entry.sign,
            label: entry.sign.meaningVi,
            sublabel: entry.sign.gloss,
            entryIdx,
            letterIdx: -1,
          });
        }
        return;
      }
      entry.letters.forEach((l, letterIdx) => {
        if (!l.sign?.clipUrl) return;
        list.push({
          sign: l.sign,
          label: l.ch.toUpperCase(),
          sublabel: `đánh vần «${entry.word}»`,
          entryIdx,
          letterIdx,
        });
      });
    });
    return list;
  }, [entries]);

  const translate = useCallback(
    (input: string) => {
      if (!input.trim() || !dictReady) return;

      const phrases = phraseMapRef.current;
      const letters = letterMapRef.current;
      const words = normalize(input).split(" ").filter(Boolean);
      const result: Entry[] = [];

      let i = 0;
      while (i < words.length) {
        let found: Sign | null = null;
        let consumed = 1;
        for (let n = Math.min(MAX_PHRASE_WORDS, words.length - i); n >= 1; n--) {
          const phrase = words.slice(i, i + n).join(" ");
          const candidate = phrases.get(phrase);
          if (candidate) {
            found = candidate;
            consumed = n;
            break;
          }
        }
        if (found) {
          result.push({ kind: "sign", sign: found });
        } else {
          // Từ lạ → đánh vần bằng chữ cái ngón tay (thử chữ có dấu trước, rồi chữ gốc)
          const word = words[i];
          result.push({
            kind: "spell",
            word,
            letters: Array.from(word).map((ch) => ({
              ch,
              sign: letters.get(ch) ?? letters.get(stripDiacritics(ch)) ?? null,
            })),
          });
        }
        i += consumed;
      }

      const hasClip = result.some(
        (e) =>
          (e.kind === "sign" && e.sign.clipUrl) ||
          (e.kind === "spell" && e.letters.some((l) => l.sign?.clipUrl))
      );

      setEntries(result);
      setFinished(false);
      setPaused(false);
      setPlayIndex(hasClip ? 0 : -1);
      setRunNonce((n) => n + 1);

      if (!hasClip) {
        toast.error("Chưa phát được câu này", {
          description: "Không có ký hiệu lẫn clip chữ cái nào khớp — thử câu ngắn hơn.",
        });
      }
    },
    [dictReady]
  );

  // Phát tuần tự theo playIndex
  useEffect(() => {
    if (playIndex < 0 || playIndex >= cues.length) return;
    const video = videoRef.current;
    if (!video) return;
    video.src = `${API_BASE}${cues[playIndex].sign.clipUrl}`;
    video.playbackRate = speed;
    video.play().catch(() => {
      setPaused(true);
      toast.info("Trình duyệt chặn tự phát", { description: "Bấm nút Phát để xem clip." });
    });
    // `speed` cố ý KHÔNG nằm trong deps: đổi tốc độ chỉ chỉnh video đang chạy
    // (effect riêng bên dưới), không được nạp lại clip từ đầu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playIndex, cues, runNonce]);

  // Đổi tốc độ áp ngay lên clip đang chạy
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed]);

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= cues.length) return;
      setFinished(false);
      setPaused(false);
      setPlayIndex(index);
      setRunNonce((n) => n + 1);
    },
    [cues.length]
  );

  function onClipEnded() {
    setPlayIndex((current) => {
      if (current + 1 < cues.length) return current + 1;
      setFinished(true);
      return current;
    });
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (finished) {
      goTo(0);
      return;
    }
    if (video.paused) video.play().catch(() => setPaused(true));
    else video.pause();
  }

  function toggleMic() {
    if (listening) {
      recognizerRef.current?.stop();
      return;
    }
    const recognizer = createRecognizer();
    if (!recognizer) {
      toast.error("Trình duyệt không hỗ trợ nhận dạng giọng nói", {
        description: "Hãy mở bằng Chrome hoặc Edge, hoặc gõ câu vào ô bên cạnh.",
      });
      return;
    }
    recognizer.lang = "vi-VN";
    recognizer.interimResults = false;
    recognizer.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length })
        .map((_, i) => event.results[i][0].transcript)
        .join(" ");
      setText(transcript);
      translate(transcript);
    };
    recognizer.onend = () => setListening(false);
    recognizer.onerror = () => {
      setListening(false);
      toast.error("Không nghe được", { description: "Kiểm tra quyền micro của trình duyệt." });
    };
    recognizerRef.current = recognizer;
    setListening(true);
    recognizer.start();
  }

  const current = playIndex >= 0 && playIndex < cues.length ? cues[playIndex] : null;
  const progress = cues.length > 0 ? ((playIndex + 1) / cues.length) * 100 : 0;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Nói → Ký hiệu</h1>
        <p className="text-muted-foreground">
          Gõ hoặc nói một câu tiếng Việt, hệ thống phát lần lượt clip ký hiệu từ Từ điển Ngôn ngữ
          Ký hiệu quốc gia. Từ chưa có ký hiệu sẽ được đánh vần bằng bảng chữ cái ngón tay.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ——— Trình phát: phần tử chính của trang ——— */}
        <section aria-label="Trình phát clip ký hiệu" className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="relative aspect-video w-full bg-black">
              <video
                ref={videoRef}
                onEnded={onClipEnded}
                // Clip lỗi (404/codec) không được làm đứng cả chuỗi — nhảy sang clip kế
                onError={onClipEnded}
                onPlay={() => setPaused(false)}
                onPause={() => setPaused(true)}
                muted
                playsInline
                className="size-full object-contain"
              />
              {current ? null : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                  <Sparkles className="size-10 text-muted-foreground" aria-hidden />
                  <p className="max-w-sm px-6 text-lg text-muted-foreground">
                    {entries
                      ? "Câu này chưa có clip nào phát được — thử câu mẫu bên phải."
                      : "Chọn một câu mẫu hoặc gõ câu của bạn để bắt đầu."}
                  </p>
                </div>
              )}
            </div>

            {/* Nhãn lớn cho máy chiếu — hội đồng ngồi xa vẫn đọc được đang ký hiệu từ nào */}
            <div
              className="min-h-24 border-t border-border px-6 py-4 text-center"
              aria-live="polite"
              aria-atomic="true"
            >
              {current ? (
                <>
                  <p className="text-4xl font-bold tracking-tight text-primary">{current.label}</p>
                  <p className="mt-1 font-mono text-sm text-muted-foreground">{current.sublabel}</p>
                </>
              ) : (
                <p className="text-lg text-muted-foreground">
                  {finished ? "Đã phát hết câu" : "Chưa có clip nào đang phát"}
                </p>
              )}
            </div>
          </div>

          {/* ——— Thanh điều khiển ——— */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Button
              variant="outline"
              size="icon"
              aria-label="Ký hiệu trước"
              disabled={playIndex <= 0}
              onClick={() => goTo(playIndex - 1)}
            >
              <SkipBack className="size-4" aria-hidden />
            </Button>
            <Button
              size="icon"
              aria-label={finished ? "Phát lại từ đầu" : paused ? "Phát" : "Tạm dừng"}
              disabled={cues.length === 0}
              onClick={togglePlay}
            >
              {finished ? (
                <RotateCcw className="size-4" aria-hidden />
              ) : paused ? (
                <Play className="size-4" aria-hidden />
              ) : (
                <Pause className="size-4" aria-hidden />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Ký hiệu tiếp theo"
              disabled={playIndex < 0 || playIndex >= cues.length - 1}
              onClick={() => goTo(playIndex + 1)}
            >
              <SkipForward className="size-4" aria-hidden />
            </Button>

            <div className="flex min-w-40 flex-1 items-center gap-3">
              <Progress
                value={progress}
                aria-label="Tiến độ chuỗi ký hiệu"
                className="h-2 flex-1"
              />
              <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                {cues.length > 0 ? `${Math.max(playIndex + 1, 0)}/${cues.length}` : "0/0"}
              </span>
            </div>

            <div
              role="group"
              aria-label="Tốc độ phát"
              className="flex items-center gap-1 rounded-lg bg-muted p-1"
            >
              {SPEEDS.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={speed === s ? "default" : "ghost"}
                  aria-pressed={speed === s}
                  className="h-7 px-2 font-mono text-sm"
                  onClick={() => setSpeed(s)}
                >
                  {s}×
                </Button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={cues.length === 0}
              onClick={() => goTo(0)}
            >
              <RotateCcw className="size-4" aria-hidden />
              Phát lại
            </Button>
          </div>

          {/* ——— Chuỗi ký hiệu ——— */}
          {entries ? (
            <Card className="gap-3 p-4">
              <p className="text-sm text-muted-foreground">
                Chuỗi ký hiệu — ô viền xanh dương là từ phải đánh vần từng chữ:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <AnimatePresence mode="popLayout">
                  {entries.map((entry, idx) =>
                    entry.kind === "sign" ? (
                      <motion.span
                        key={`${idx}:${entry.sign.id}`}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              disabled={!entry.sign.clipUrl}
                              onClick={() => {
                                const target = cues.findIndex((c) => c.entryIdx === idx);
                                if (target >= 0) goTo(target);
                              }}
                              className={`rounded-lg px-3 py-1.5 text-base transition-colors disabled:cursor-not-allowed ${
                                current?.entryIdx === idx
                                  ? "bg-primary font-semibold text-primary-foreground"
                                  : entry.sign.clipUrl
                                    ? "bg-muted text-foreground hover:bg-muted/70"
                                    : "bg-muted text-muted-foreground line-through"
                              }`}
                            >
                              {entry.sign.meaningVi}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {entry.sign.clipUrl
                              ? `Mã ký hiệu: ${entry.sign.gloss}`
                              : "Từ điển chưa có clip cho ký hiệu này"}
                          </TooltipContent>
                        </Tooltip>
                      </motion.span>
                    ) : (
                      <motion.span
                        key={`${idx}:${entry.word}`}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/10 px-2 py-1.5"
                      >
                        {entry.letters.map((l, j) => (
                          <Tooltip key={`${j}:${l.ch}`}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                disabled={!l.sign?.clipUrl}
                                onClick={() => {
                                  const target = cues.findIndex(
                                    (c) => c.entryIdx === idx && c.letterIdx === j
                                  );
                                  if (target >= 0) goTo(target);
                                }}
                                className={`rounded px-1 font-mono text-base transition-colors disabled:cursor-not-allowed ${
                                  current?.entryIdx === idx && current.letterIdx === j
                                    ? "bg-accent font-semibold text-accent-foreground"
                                    : l.sign?.clipUrl
                                      ? "text-accent hover:bg-accent/20"
                                      : "text-muted-foreground line-through"
                                }`}
                              >
                                {l.ch}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {l.sign?.clipUrl
                                ? `Chữ cái ngón tay «${l.ch}»`
                                : `Kho chưa có clip chữ «${l.ch}»`}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </motion.span>
                    )
                  )}
                </AnimatePresence>
              </div>
            </Card>
          ) : null}
        </section>

        {/* ——— Cột nhập liệu ——— */}
        <aside className="flex flex-col gap-4">
          <Card className="gap-4 p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                translate(text);
              }}
              className="flex flex-col gap-3"
            >
              <Label htmlFor="speak-input">Câu tiếng Việt</Label>
              <div className="flex gap-2">
                <Input
                  id="speak-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Ví dụ: Tôi bị đau bụng"
                  autoComplete="off"
                  disabled={!dictReady}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={listening ? "destructive" : "outline"}
                      size="icon"
                      aria-label={listening ? "Dừng nghe" : "Nói tiếng Việt"}
                      aria-pressed={listening}
                      disabled={!dictReady}
                      onClick={toggleMic}
                      className={listening ? "animate-pulse" : undefined}
                    >
                      {listening ? (
                        <MicOff className="size-4" aria-hidden />
                      ) : (
                        <Mic className="size-4" aria-hidden />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {listening ? "Đang nghe — bấm để dừng" : "Nói thay vì gõ (cần Chrome/Edge)"}
                  </TooltipContent>
                </Tooltip>
              </div>
              <Button type="submit" disabled={!dictReady || !text.trim()}>
                {dictReady ? null : <Loader2 className="size-4 animate-spin" aria-hidden />}
                Dịch sang ký hiệu
              </Button>
            </form>
          </Card>

          <Card className="gap-3 p-4">
            <h2 className="text-sm font-medium text-muted-foreground">Câu mẫu</h2>
            {dictState === "loading" ? (
              <div className="flex flex-col gap-2" aria-hidden>
                {EXAMPLES.map((ex) => (
                  <Skeleton key={ex.text} className="h-14 w-full" />
                ))}
              </div>
            ) : dictState === "error" ? (
              <div role="alert" className="flex flex-col items-start gap-3">
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Không tải được từ điển. Backend ở cổng 8080 chưa chạy hoặc đang lỗi.
                </p>
                <Button variant="outline" size="sm" onClick={retryDictionary}>
                  <RotateCcw className="size-4" aria-hidden />
                  Thử lại
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {EXAMPLES.map((ex) => (
                  <Button
                    key={ex.text}
                    variant="outline"
                    className="h-auto flex-col items-start gap-0.5 whitespace-normal py-2.5 text-left"
                    onClick={() => {
                      setText(ex.text);
                      translate(ex.text);
                    }}
                  >
                    <span className="text-base font-medium">{ex.text}</span>
                    <span className="text-sm font-normal text-muted-foreground">{ex.hint}</span>
                  </Button>
                ))}
              </div>
            )}
          </Card>

          <p className="text-sm text-muted-foreground">
            Nguồn clip: Từ điển Ngôn ngữ Ký hiệu Việt Nam –{" "}
            <a
              href="https://qipedc.moet.gov.vn"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              qipedc.moet.gov.vn
            </a>{" "}
            (Bộ Giáo dục &amp; Đào tạo).
          </p>
        </aside>
      </div>
    </div>
  );
}
