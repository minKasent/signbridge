"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/landmarks";

/**
 * Chiều ngược: người nghe GÕ hoặc NÓI tiếng Việt → hệ thống khớp với từ điển
 * (cụm dài nhất trước) → phát lần lượt clip ký hiệu của TỪ ĐIỂN QUỐC GIA QIPEDC.
 * Từ không có trong từ điển hiển thị gạch xám — minh bạch phần chưa dịch được.
 */

type Sign = { id: number; gloss: string; meaningVi: string; clipUrl: string | null };
type ComposeResult = { items: Sign[]; missing: string[] };

const EXAMPLES = ["Tôi bị đau bụng", "Xin chào cô giáo", "Bố đi làm việc", "Bạn tên là gì"];

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

  const [text, setText] = useState("");
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [playIndex, setPlayIndex] = useState(-1);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");

  const playable = result?.items.filter((s) => s.clipUrl) ?? [];

  const translate = useCallback(async (input: string) => {
    if (!input.trim()) return;
    setMessage("");
    setPlayIndex(-1);
    try {
      const res = await fetch(`${API_BASE}/api/signs/compose?text=${encodeURIComponent(input)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ComposeResult = await res.json();
      setResult(data);
      if (data.items.length === 0) {
        setMessage("Không có từ nào trong câu khớp với từ điển hiện tại.");
      } else {
        setPlayIndex(0); // bắt đầu phát chuỗi clip
      }
    } catch (e) {
      setMessage(`Lỗi gọi backend: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // Phát tuần tự: đổi playIndex → nạp clip tương ứng
  useEffect(() => {
    if (playIndex < 0 || playIndex >= playable.length) return;
    const video = videoRef.current;
    if (!video) return;
    video.src = `${API_BASE}${playable[playIndex].clipUrl}`;
    video.play().catch(() => setMessage("Trình duyệt chặn tự phát — bấm nút ▶ trên video."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playIndex, result]);

  function onClipEnded() {
    setPlayIndex((current) => (current + 1 < playable.length ? current + 1 : -1));
  }

  function toggleMic() {
    if (listening) {
      recognizerRef.current?.stop();
      return;
    }
    const recognizer = createRecognizer();
    if (!recognizer) {
      setMessage("Trình duyệt không hỗ trợ nhận dạng giọng nói — hãy dùng Chrome.");
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
    recognizer.onerror = () => setListening(false);
    recognizerRef.current = recognizer;
    setListening(true);
    recognizer.start();
  }

  const current = playIndex >= 0 ? playable[playIndex] : null;

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <h1 className="mb-1 text-2xl font-bold">Nói → Ký hiệu</h1>
      <p className="mb-4 text-sm text-zinc-400">
        Clip từ Từ điển ngôn ngữ ký hiệu quốc gia (qipedc.moet.gov.vn)
      </p>

      <div className="flex flex-wrap gap-6">
        <div className="flex w-full max-w-md flex-col gap-3">
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && translate(text)}
              placeholder="Gõ câu tiếng Việt…"
              className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 outline-none ring-emerald-500 focus:ring-2"
            />
            <button
              onClick={toggleMic}
              className={`rounded-lg px-3 py-2 ${listening ? "animate-pulse bg-red-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
              title="Nói tiếng Việt"
            >
              🎤
            </button>
          </div>
          <button
            onClick={() => translate(text)}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500"
          >
            Dịch sang ký hiệu
          </button>

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => {
                  setText(ex);
                  translate(ex);
                }}
                className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                {ex}
              </button>
            ))}
          </div>

          {result && (
            <div className="rounded-lg bg-zinc-900 p-3">
              <p className="mb-2 text-xs text-zinc-500">Chuỗi ký hiệu:</p>
              <div className="flex flex-wrap gap-2">
                {result.items.map((s, i) => (
                  <button
                    key={`${s.id}-${i}`}
                    onClick={() => {
                      const idx = playable.findIndex((p) => p.id === s.id);
                      if (idx >= 0) setPlayIndex(idx);
                    }}
                    className={`rounded-lg px-2 py-1 text-sm font-mono ${
                      current?.id === s.id
                        ? "bg-emerald-600 text-white"
                        : s.clipUrl
                          ? "bg-zinc-800 text-emerald-300 hover:bg-zinc-700"
                          : "bg-zinc-800 text-zinc-500"
                    }`}
                    title={s.clipUrl ? s.meaningVi : `${s.meaningVi} (chưa có clip)`}
                  >
                    {s.meaningVi}
                  </button>
                ))}
                {result.missing.map((w, i) => (
                  <span
                    key={`m-${i}`}
                    className="rounded-lg bg-zinc-900 px-2 py-1 text-sm text-zinc-600 line-through"
                    title="Không có trong từ điển"
                  >
                    {w}
                  </span>
                ))}
              </div>
              {result.missing.length > 0 && (
                <p className="mt-2 text-xs text-zinc-500">
                  Từ gạch xám chưa có trong từ điển ({result.missing.length} từ).
                </p>
              )}
            </div>
          )}

          {message && <p className="text-sm text-amber-400">{message}</p>}
        </div>

        <div className="flex flex-col items-center gap-2">
          <video
            ref={videoRef}
            onEnded={onClipEnded}
            controls
            muted
            className="w-96 rounded-xl bg-zinc-900"
          />
          <p className="h-6 text-lg font-semibold text-emerald-400">
            {current ? current.meaningVi : result && playable.length > 0 ? "— hết —" : ""}
          </p>
          {result && playable.length > 0 && playIndex === -1 && (
            <button
              onClick={() => setPlayIndex(0)}
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm hover:bg-sky-600"
            >
              ▶ Phát lại từ đầu
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
