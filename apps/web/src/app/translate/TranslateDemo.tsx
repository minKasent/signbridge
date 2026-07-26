"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "@/lib/landmarks";
import { useVisionPipeline } from "@/lib/useVisionPipeline";
import { speakVietnamese, warmUpVoices } from "@/lib/speech";

/**
 * Trang phiên dịch — luồng đầy đủ:
 *   webcam → MediaPipe (trong browser) → WebSocket → Spring → ML service
 *   → gloss → nghỉ tay → LLM ghép câu tiếng Việt → hiện chữ + đọc thành tiếng.
 */

const FRAME_BATCH = 5;
const PREVIEW_INTERVAL_MS = 200;

type GlossResult = { gloss: string; confidence: number; at: number };
type SentenceResult = { text: string; glosses: string[]; source: string; at: number };

const SOURCE_LABELS: Record<string, string> = {
  llm: "LLM ghép",
  cache: "LLM (cache)",
  fallback: "ghép dự phòng",
};

export default function TranslateDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameBufferRef = useRef<number[][]>([]);
  const lastPreviewRef = useRef(0);

  const [wsConnected, setWsConnected] = useState(false);
  const [glosses, setGlosses] = useState<GlossResult[]>([]);
  const [sentences, setSentences] = useState<SentenceResult[]>([]);
  const [preview, setPreview] = useState("(chưa thấy tay trong khung hình)");
  const [autoSpeak, setAutoSpeak] = useState(true);
  // ws.onmessage được gán một lần lúc kết nối; đọc state trực tiếp trong đó sẽ
  // dính giá trị cũ khi người dùng bật/tắt sau đó — giữ trong ref để luôn mới.
  const autoSpeakRef = useRef(autoSpeak);
  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);

  useEffect(() => warmUpVoices(), []);

  const onFrame = useCallback((frame: number[], hands: { landmarks: unknown[][] }) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      frameBufferRef.current.push(frame);
      if (frameBufferRef.current.length >= FRAME_BATCH) {
        wsRef.current.send(JSON.stringify({ type: "frames", frames: frameBufferRef.current }));
        frameBufferRef.current = [];
      }
    }

    const now = performance.now();
    if (now - lastPreviewRef.current < PREVIEW_INTERVAL_MS) return;
    lastPreviewRef.current = now;

    const wrist = hands.landmarks[0]?.[0] as { x: number; y: number; z: number } | undefined;
    setPreview(
      wrist
        ? JSON.stringify(
            {
              soTayPhatHien: hands.landmarks.length,
              coTayDauTien: {
                x: +wrist.x.toFixed(3),
                y: +wrist.y.toFixed(3),
                z: +wrist.z.toFixed(3),
              },
              vectorDacTrung: `${frame.length} chiều`,
            },
            null,
            2
          )
        : "(chưa thấy tay trong khung hình)"
    );
  }, []);

  const { status, fps } = useVisionPipeline({
    videoRef,
    canvasRef,
    onFrame,
    drawLandmarkDots: true,
  });

  function toggleBackend() {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setWsConnected(false);
      return;
    }
    frameBufferRef.current = []; // bỏ frame thừa của phiên trước
    const ws = new WebSocket(WS_URL);
    // Mọi handler kiểm tra "còn là socket hiện tại không" — tránh event của
    // socket cũ đóng đè lên trạng thái của kết nối mới.
    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setWsConnected(true);
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setWsConnected(false);
    };
    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      const msg = JSON.parse(event.data);
      if (msg.type === "gloss") {
        setGlosses((prev) =>
          [{ gloss: msg.gloss, confidence: msg.confidence, at: Date.now() }, ...prev].slice(0, 20)
        );
      } else if (msg.type === "sentence") {
        setSentences((prev) =>
          [{ text: msg.text, glosses: msg.glosses, source: msg.source, at: Date.now() }, ...prev].slice(0, 10)
        );
        if (autoSpeakRef.current) speakVietnamese(msg.text);
      }
    };
    wsRef.current = ws;
  }

  function flushSentence() {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "flush" }));
    }
  }

  const latest = sentences[0];

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <h1 className="mb-1 text-2xl font-bold">SignBridge — Phiên dịch ký hiệu</h1>
      <p className="mb-4 text-sm text-zinc-400">
        MediaPipe chạy trong browser · trạng thái: {status} · {fps} fps
      </p>

      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col gap-4">
          <div className="relative w-fit">
            <video
              ref={videoRef}
              playsInline
              muted
              className="rounded-lg"
              style={{ transform: "scaleX(-1)" }}
            />
            <canvas
              ref={canvasRef}
              className="absolute left-0 top-0 h-full w-full"
              style={{ transform: "scaleX(-1)" }}
            />
          </div>

          {/* Câu dịch — phần chính của demo */}
          <div className="min-h-28 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-emerald-400">Câu tiếng Việt</h2>
              {latest && (
                <span className="rounded-full bg-emerald-900 px-2 py-0.5 text-xs text-emerald-300">
                  {SOURCE_LABELS[latest.source] ?? latest.source}
                </span>
              )}
            </div>
            {latest ? (
              <>
                <p className="text-2xl font-semibold leading-snug">{latest.text}</p>
                <p className="mt-2 font-mono text-xs text-zinc-500">{latest.glosses.join(" / ")}</p>
              </>
            ) : (
              <p className="text-zinc-500">
                Ra ký hiệu rồi hạ tay xuống ~2 giây để hệ thống chốt câu.
              </p>
            )}
          </div>
        </div>

        <div className="flex w-80 flex-col gap-4">
          <div className="flex gap-2">
            <button
              onClick={toggleBackend}
              className={`flex-1 rounded-lg px-4 py-2 font-medium ${
                wsConnected ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              {wsConnected ? "Ngắt kết nối" : "Kết nối backend"}
            </button>
            <button
              onClick={flushSentence}
              disabled={!wsConnected}
              className="rounded-lg bg-sky-700 px-3 py-2 font-medium hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
              title="Chốt câu ngay, không cần chờ nghỉ tay"
            >
              Chốt câu
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => setAutoSpeak(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            Tự động đọc thành tiếng
            {latest && (
              <button
                onClick={() => speakVietnamese(latest.text)}
                className="ml-auto rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
              >
                🔊 Đọc lại
              </button>
            )}
          </label>

          <div>
            <h2 className="mb-2 font-semibold text-sky-400">Ký hiệu nhận diện được</h2>
            <ul className="h-32 overflow-auto rounded-lg bg-zinc-900 p-3 text-sm">
              {glosses.length === 0 && (
                <li className="text-zinc-500">
                  {wsConnected ? "Đang chờ ML service trả kết quả…" : "Chưa kết nối backend."}
                </li>
              )}
              {glosses.map((g) => (
                <li key={g.at} className="mb-1">
                  <span className="font-mono text-sky-300">{g.gloss}</span>{" "}
                  <span className="text-zinc-500">({(g.confidence * 100).toFixed(0)}%)</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="mb-2 font-semibold text-emerald-400">
              Dữ liệu model ML &quot;nhìn thấy&quot; (chỉ là JSON!)
            </h2>
            <pre className="h-32 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-emerald-300">
              {preview}
            </pre>
          </div>

          {sentences.length > 1 && (
            <div>
              <h2 className="mb-2 font-semibold text-zinc-300">Câu trước đó</h2>
              <ul className="max-h-32 overflow-auto rounded-lg bg-zinc-900 p-3 text-sm">
                {sentences.slice(1).map((s) => (
                  <li key={s.at} className="mb-1 text-zinc-400">
                    {s.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
