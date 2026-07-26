"use client";

import { useCallback, useRef, useState } from "react";
import { WS_URL } from "@/lib/landmarks";
import { useVisionPipeline } from "@/lib/useVisionPipeline";

/**
 * Trang phiên dịch: MediaPipe chạy NGAY TRONG BROWSER.
 * - Vẽ khung xương tay (xanh lá) + thân trên (xanh dương) lên webcam.
 * - Panel phải hiển thị chính dữ liệu tọa độ JSON — thứ duy nhất model ML
 *   nhìn thấy. Không ảnh, không pixel.
 * - "Kết nối backend" stream vector 144 chiều tới Spring qua WebSocket.
 */

const FRAME_BATCH = 5;
const PREVIEW_INTERVAL_MS = 200;

type GlossResult = { gloss: string; confidence: number; at: number };

export default function TranslateDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameBufferRef = useRef<number[][]>([]);
  const lastPreviewRef = useRef(0);

  const [wsConnected, setWsConnected] = useState(false);
  const [glosses, setGlosses] = useState<GlossResult[]>([]);
  const [preview, setPreview] = useState("(chưa thấy tay trong khung hình)");

  const onFrame = useCallback((frame: number[], hands: { landmarks: unknown[][] }) => {
    // Stream tới backend theo lô
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      frameBufferRef.current.push(frame);
      if (frameBufferRef.current.length >= FRAME_BATCH) {
        wsRef.current.send(JSON.stringify({ type: "frames", frames: frameBufferRef.current }));
        frameBufferRef.current = [];
      }
    }

    // Preview JSON, tối đa 5 lần/giây
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
      }
    };
    wsRef.current = ws;
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <h1 className="mb-1 text-2xl font-bold">SignBridge — Demo nhận landmark</h1>
      <p className="mb-4 text-sm text-zinc-400">
        MediaPipe chạy trong browser · trạng thái: {status} · {fps} fps
      </p>

      <div className="flex flex-wrap gap-6">
        <div className="relative">
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

        <div className="flex w-80 flex-col gap-4">
          <div>
            <h2 className="mb-2 font-semibold text-emerald-400">
              Dữ liệu model ML &quot;nhìn thấy&quot; (chỉ là JSON!)
            </h2>
            <pre className="h-40 overflow-auto rounded-lg bg-zinc-900 p-3 text-xs text-emerald-300">
              {preview}
            </pre>
          </div>

          <button
            onClick={toggleBackend}
            className={`rounded-lg px-4 py-2 font-medium ${
              wsConnected ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {wsConnected ? "Ngắt kết nối backend" : "Kết nối backend (Spring :8080)"}
          </button>

          <div>
            <h2 className="mb-2 font-semibold text-sky-400">Ký hiệu nhận diện được</h2>
            <ul className="h-40 overflow-auto rounded-lg bg-zinc-900 p-3 text-sm">
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
        </div>
      </div>
    </div>
  );
}
