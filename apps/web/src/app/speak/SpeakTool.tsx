"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const MAX_PHRASE_WORDS = 4;
const EXAMPLES = ["Tôi bị đau bụng", "Xin chào cô giáo", "Hôm nay đi khám bệnh", "Bạn tên là gì"];

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

  const [dictReady, setDictReady] = useState(false);
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [playIndex, setPlayIndex] = useState(-1);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");

  // Rời trang khi đang bật mic → phải tắt nhận dạng, không thì micro còn nóng
  useEffect(() => {
    return () => {
      recognizerRef.current?.stop();
      recognizerRef.current = null;
    };
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/signs`)
      .then((r) => r.json())
      .then((signs: Sign[]) => {
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
        setDictReady(true);
      })
      .catch(() => setMessage("Không gọi được backend :8080 — hãy chạy Spring core."));
  }, []);

  // Danh sách phát: mọi clip theo đúng thứ tự câu (ký hiệu nguyên từ + chữ cái đánh vần)
  const playable = (entries ?? []).flatMap((entry) =>
    entry.kind === "sign"
      ? entry.sign.clipUrl
        ? [{ sign: entry.sign, label: entry.sign.meaningVi }]
        : []
      : entry.letters
          .filter((l) => l.sign?.clipUrl)
          .map((l) => ({ sign: l.sign as Sign, label: `${entry.word}: chữ "${l.ch}"` }))
  );

  const translate = useCallback(
    (input: string) => {
      if (!input.trim() || !dictReady) return;
      setMessage("");
      setPlayIndex(-1);

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

      setEntries(result);
      const hasClip = result.some(
        (e) => (e.kind === "sign" && e.sign.clipUrl) || (e.kind === "spell" && e.letters.some((l) => l.sign))
      );
      if (!hasClip) setMessage("Không có từ/chữ cái nào phát được cho câu này.");
      else setPlayIndex(0);
    },
    [dictReady]
  );

  // Phát tuần tự theo playIndex
  useEffect(() => {
    if (playIndex < 0 || playIndex >= playable.length) return;
    const video = videoRef.current;
    if (!video) return;
    video.src = `${API_BASE}${playable[playIndex].sign.clipUrl}`;
    video.play().catch(() => setMessage("Trình duyệt chặn tự phát — bấm ▶ trên video."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playIndex, entries]);

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
        Clip từ Từ điển NNKH quốc gia (qipedc.moet.gov.vn) · từ lạ được đánh vần bằng bảng
        chữ cái ngón tay{dictReady ? "" : " · đang tải từ điển…"}
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
            disabled={!dictReady}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 disabled:bg-zinc-700"
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

          {entries && (
            <div className="rounded-lg bg-zinc-900 p-3">
              <p className="mb-2 text-xs text-zinc-500">Chuỗi ký hiệu (từ lạ đánh vần từng chữ):</p>
              <div className="flex flex-wrap items-center gap-2">
                {entries.map((entry, idx) =>
                  entry.kind === "sign" ? (
                    <span
                      key={idx}
                      className={`rounded-lg px-2 py-1 text-sm ${
                        current?.sign.id === entry.sign.id
                          ? "bg-emerald-600 text-white"
                          : entry.sign.clipUrl
                            ? "bg-zinc-800 text-emerald-300"
                            : "bg-zinc-800 text-zinc-500"
                      }`}
                      title={entry.sign.clipUrl ? entry.sign.gloss : "chưa có clip"}
                    >
                      {entry.sign.meaningVi}
                    </span>
                  ) : (
                    <span key={idx} className="flex items-center gap-1 rounded-lg bg-amber-950/60 px-2 py-1">
                      {entry.letters.map((l, j) => (
                        <span
                          key={j}
                          className={`text-sm font-mono ${
                            l.sign && current?.sign.id === l.sign.id
                              ? "rounded bg-amber-500 px-1 text-black"
                              : l.sign
                                ? "text-amber-300"
                                : "text-zinc-600 line-through"
                          }`}
                          title={l.sign ? `chữ "${l.ch}"` : `không có clip chữ "${l.ch}"`}
                        >
                          {l.ch}
                        </span>
                      ))}
                    </span>
                  )
                )}
              </div>
            </div>
          )}

          {message && <p className="text-sm text-amber-400">{message}</p>}
        </div>

        <div className="flex flex-col items-center gap-2">
          <video
            ref={videoRef}
            onEnded={onClipEnded}
            // Clip lỗi (404/codec) không được làm đứng cả chuỗi — nhảy sang clip kế
            onError={onClipEnded}
            controls
            muted
            className="w-96 rounded-xl bg-zinc-900"
          />
          <p className="h-6 text-lg font-semibold text-emerald-400">
            {current ? current.label : entries && playable.length > 0 ? "— hết —" : ""}
          </p>
          {entries && playable.length > 0 && playIndex === -1 && (
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
