"use client";

import { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";

/**
 * Demo ngày 1: MediaPipe chạy NGAY TRONG BROWSER.
 * - Vẽ khung xương tay (xanh lá) + thân trên (xanh dương) lên webcam.
 * - Panel bên phải hiển thị chính dữ liệu tọa độ JSON — thứ duy nhất
 *   model ML nhìn thấy. Không ảnh, không pixel.
 * - Nút "Kết nối backend" stream vector đặc trưng 144 chiều
 *   (2 tay × 21 điểm × 3 + 6 điểm thân trên × 3) tới Spring qua WebSocket.
 */

const WS_URL = "ws://localhost:8080/ws/translate";
// Điểm pose thân trên: vai, khuỷu tay, cổ tay (trái + phải)
const UPPER_BODY_POSE = [11, 12, 13, 14, 15, 16];
const FRAME_BATCH = 5;

type GlossResult = { gloss: string; confidence: number; at: number };

export default function TranslateDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameBufferRef = useRef<number[][]>([]);
  const startedRef = useRef(false);

  const [status, setStatus] = useState("Đang tải model MediaPipe…");
  const [fps, setFps] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const [glosses, setGlosses] = useState<GlossResult[]>([]);
  const [preview, setPreview] = useState("(chưa thấy tay trong khung hình)");

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let handLandmarker: HandLandmarker | null = null;
    let poseLandmarker: PoseLandmarker | null = null;
    let rafId = 0;
    let stream: MediaStream | null = null;
    let disposed = false;

    async function createLandmarkers(delegate: "GPU" | "CPU") {
      const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate },
        runningMode: "VIDEO",
        numHands: 2,
      });
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/models/pose_landmarker_lite.task", delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    }

    async function init() {
      try {
        try {
          await createLandmarkers("GPU");
        } catch {
          setStatus("GPU không khả dụng — chuyển sang CPU…");
          await createLandmarkers("CPU");
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        const canvas = canvasRef.current!;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        const drawer = new DrawingUtils(ctx);

        setStatus("Đang chạy — đưa tay vào khung hình");

        let lastVideoTime = -1;
        let frameCount = 0;
        let fpsWindowStart = performance.now();

        const loop = () => {
          if (disposed) return;
          rafId = requestAnimationFrame(loop);
          if (video.currentTime === lastVideoTime) return;
          lastVideoTime = video.currentTime;

          const now = performance.now();
          const hands = handLandmarker!.detectForVideo(video, now);
          const pose = poseLandmarker!.detectForVideo(video, now);

          // --- Vẽ khung xương ---
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (const landmarks of hands.landmarks) {
            drawer.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
              color: "#22c55e",
              lineWidth: 3,
            });
            drawer.drawLandmarks(landmarks, { color: "#4ade80", radius: 3 });
          }
          for (const landmarks of pose.landmarks) {
            drawer.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
              color: "#3b82f6",
              lineWidth: 2,
            });
          }

          // --- Vector đặc trưng 144 chiều: [tayTrái 63][tayPhải 63][thânTrên 18] ---
          const frame = new Array<number>(144).fill(0);
          hands.landmarks.forEach((landmarks, i) => {
            const isLeft = hands.handednesses[i]?.[0]?.categoryName === "Left";
            const offset = isLeft ? 0 : 63;
            landmarks.forEach((p, j) => {
              frame[offset + j * 3] = p.x;
              frame[offset + j * 3 + 1] = p.y;
              frame[offset + j * 3 + 2] = p.z;
            });
          });
          const poseLm = pose.landmarks[0];
          if (poseLm) {
            UPPER_BODY_POSE.forEach((idx, j) => {
              frame[126 + j * 3] = poseLm[idx].x;
              frame[126 + j * 3 + 1] = poseLm[idx].y;
              frame[126 + j * 3 + 2] = poseLm[idx].z;
            });
          }

          // --- Stream tới backend theo lô ---
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            frameBufferRef.current.push(frame);
            if (frameBufferRef.current.length >= FRAME_BATCH) {
              wsRef.current.send(
                JSON.stringify({ type: "frames", frames: frameBufferRef.current })
              );
              frameBufferRef.current = [];
            }
          }

          // --- FPS + preview JSON (throttle ~5 lần/giây) ---
          frameCount++;
          if (now - fpsWindowStart >= 1000) {
            setFps(Math.round((frameCount * 1000) / (now - fpsWindowStart)));
            frameCount = 0;
            fpsWindowStart = now;
          }
          if (frameCount % 6 === 0) {
            const wrist = hands.landmarks[0]?.[0];
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
          }
        };
        loop();
      } catch (e) {
        setStatus(`Lỗi khởi tạo: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    init();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      handLandmarker?.close();
      poseLandmarker?.close();
      wsRef.current?.close();
    };
  }, []);

  function toggleBackend() {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setWsConnected(false);
      return;
    }
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => {
      wsRef.current = null;
      setWsConnected(false);
    };
    ws.onmessage = (event) => {
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
              wsConnected
                ? "bg-red-600 hover:bg-red-500"
                : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {wsConnected ? "Ngắt kết nối backend" : "Kết nối backend (Spring :8080)"}
          </button>

          <div>
            <h2 className="mb-2 font-semibold text-sky-400">Ký hiệu nhận diện được</h2>
            <ul className="h-40 overflow-auto rounded-lg bg-zinc-900 p-3 text-sm">
              {glosses.length === 0 && (
                <li className="text-zinc-500">
                  {wsConnected
                    ? "Đang chờ ML service trả kết quả…"
                    : "Chưa kết nối backend."}
                </li>
              )}
              {glosses.map((g) => (
                <li key={g.at} className="mb-1">
                  <span className="font-mono text-sky-300">{g.gloss}</span>{" "}
                  <span className="text-zinc-500">
                    ({(g.confidence * 100).toFixed(0)}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
