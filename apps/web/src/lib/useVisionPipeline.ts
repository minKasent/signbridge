"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  DrawingUtils,
  HandLandmarker,
  PoseLandmarker,
  type HandLandmarkerResult,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { buildFrame, createLandmarkers, type Landmarkers } from "./landmarks";

/**
 * Vòng đời webcam + MediaPipe dùng chung cho /translate và /collect.
 *
 * Effect được viết theo kiểu "hủy được" (cancelable) thay vì dùng cờ chặn chạy lại:
 * React StrictMode ở dev chạy effect → cleanup → effect lần nữa. Nếu chặn lần 2 bằng
 * một ref thì cleanup lần 1 đã đặt disposed = true, khiến vòng lặp chết ngay
 * (camera sáng nhưng 0 fps, không vẽ khung xương) — đúng lỗi đã gặp.
 * Cách đúng: sau mỗi await kiểm tra disposed và tự giải phóng tài nguyên vừa tạo.
 */

interface Options {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Gọi mỗi frame với vector đặc trưng 144 chiều đã dựng sẵn. */
  onFrame?: (frame: number[], hands: HandLandmarkerResult, pose: PoseLandmarkerResult) => void;
  /** Vẽ thêm chấm trên từng điểm bàn tay (trang dịch dùng cho trực quan). */
  drawLandmarkDots?: boolean;
}

export function useVisionPipeline({ videoRef, canvasRef, onFrame, drawLandmarkDots }: Options) {
  const [status, setStatus] = useState("Đang tải model MediaPipe…");
  const [ready, setReady] = useState(false);
  const [fps, setFps] = useState(0);

  // onFrame thay đổi mỗi lần render — giữ trong ref để effect không phải chạy lại
  // (gán trong effect, không gán lúc render: React 19 cấm đụng ref khi render)
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    let disposed = false;
    let rafId = 0;
    let stream: MediaStream | null = null;
    let landmarkers: Landmarkers | null = null;

    (async () => {
      try {
        const created = await createLandmarkers();
        if (disposed) {
          created.close();
          return;
        }
        landmarkers = created;

        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });
        if (disposed) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = media;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        video.srcObject = media;
        await video.play();
        if (disposed) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        const drawer = new DrawingUtils(ctx);

        setStatus("Đang chạy");
        setReady(true);

        let lastVideoTime = -1;
        let frameCount = 0;
        let fpsWindowStart = performance.now();

        const loop = () => {
          if (disposed) return;
          rafId = requestAnimationFrame(loop);
          if (video.currentTime === lastVideoTime) return;
          lastVideoTime = video.currentTime;

          const now = performance.now();
          const hands = landmarkers!.hand.detectForVideo(video, now);
          const pose = landmarkers!.pose.detectForVideo(video, now);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (const landmarks of hands.landmarks) {
            drawer.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
              color: "#22c55e",
              lineWidth: 3,
            });
            if (drawLandmarkDots) {
              drawer.drawLandmarks(landmarks, { color: "#4ade80", radius: 3 });
            }
          }
          for (const landmarks of pose.landmarks) {
            drawer.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
              color: "#3b82f6",
              lineWidth: 2,
            });
          }

          onFrameRef.current?.(buildFrame(hands, pose), hands, pose);

          frameCount++;
          if (now - fpsWindowStart >= 1000) {
            setFps(Math.round((frameCount * 1000) / (now - fpsWindowStart)));
            frameCount = 0;
            fpsWindowStart = now;
          }
        };
        loop();
      } catch (e) {
        if (!disposed) {
          setStatus(`Lỗi khởi tạo: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
      landmarkers?.close();
    };
  }, [videoRef, canvasRef, drawLandmarkDots]);

  return { status, ready, fps };
}
