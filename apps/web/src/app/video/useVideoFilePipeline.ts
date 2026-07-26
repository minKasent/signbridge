"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { DrawingUtils, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { buildFrame, createLandmarkers, type Landmarkers } from "@/lib/landmarks";

/**
 * Vòng đời MediaPipe cho trang /video — nguồn là THẺ VIDEO FILE thay vì webcam
 * (tham khảo lib/useVisionPipeline.ts, không dùng chung được vì hook đó tự mở
 * getUserMedia). Effect viết kiểu "hủy được": sau mỗi await kiểm tra disposed
 * và tự giải phóng tài nguyên vừa tạo — sống sót StrictMode chạy effect 2 lần.
 */

/** Nhịp trích đặc trưng — khớp fps_hint của model (giống trang /translate). */
const TARGET_FPS = 25;

interface Options {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Gọi mỗi frame với vector đặc trưng 144 chiều đã dựng sẵn. */
  onFrame?: (frame: number[]) => void;
}

export function useVideoFilePipeline({ videoRef, canvasRef, onFrame }: Options) {
  const [status, setStatus] = useState("Đang tải model MediaPipe…");
  const [ready, setReady] = useState(false);
  const [fps, setFps] = useState(0);

  // onFrame đổi mỗi render — giữ trong ref để effect không phải chạy lại
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    let disposed = false;
    let rafId = 0;
    let landmarkers: Landmarkers | null = null;

    (async () => {
      try {
        const created = await createLandmarkers();
        if (disposed) {
          created.close();
          return;
        }
        landmarkers = created;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const ctx = canvas.getContext("2d")!;
        const drawer = new DrawingUtils(ctx);

        setStatus("Sẵn sàng");
        setReady(true);

        let lastVideoTime = -1;
        let lastEmit = 0;
        let frameCount = 0;
        let fpsWindowStart = performance.now();

        const loop = () => {
          if (disposed) return;
          rafId = requestAnimationFrame(loop);
          const hasData = video.readyState >= 2 && video.videoWidth > 0;
          if (!hasData) return;
          // Đổi file video → khớp lại kích thước canvas với video mới
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          // Pause/seek: không xử lý — tránh gửi lặp frame khi hình đứng yên
          if (video.paused || video.seeking) return;
          if (video.currentTime === lastVideoTime) return;
          lastVideoTime = video.currentTime;

          const now = performance.now();
          // Ghim ~25fps cho khớp phân bố thời gian model đã học — video 60fps
          // mà không ghim thì chuỗi frame "nhanh gấp đôi" so với huấn luyện
          if (now - lastEmit < 1000 / TARGET_FPS) return;
          lastEmit = now;
          const hands = landmarkers!.hand.detectForVideo(video, now);
          const pose = landmarkers!.pose.detectForVideo(video, now);

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

          onFrameRef.current?.(buildFrame(hands, pose));

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
      landmarkers?.close();
    };
  }, [videoRef, canvasRef]);

  return { status, ready, fps };
}
