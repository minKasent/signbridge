"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/landmarks";
import { authHeader } from "@/lib/auth";

/**
 * Modal quay clip ký hiệu ngay trong browser: camera → đếm ngược 3-2-1 →
 * MediaRecorder ~3 giây (video/webm) → xem lại → upload POST /api/signs/{id}/clip.
 * Đóng modal ở bất kỳ bước nào cũng phải tắt camera (stop tracks trong cleanup).
 */

type Sign = { id: number; gloss: string; meaningVi: string; category: string; clipUrl: string | null };
type Phase = "starting" | "idle" | "countdown" | "recording" | "preview" | "uploading";

const RECORD_MS = 3000;

type Props = {
  sign: Sign;
  onClose: () => void;
  onUploaded: (updated: Sign) => void;
};

export default function RecordClipModal({ sign, onClose, onUploaded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [countdown, setCountdown] = useState(0);
  const [clip, setClip] = useState<Blob | null>(null);
  const [error, setError] = useState("");

  // Bật camera khi mở modal; effect hủy được (chuẩn StrictMode)
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        if (disposed) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = media;
        if (videoRef.current) {
          videoRef.current.srcObject = media;
          await videoRef.current.play();
        }
        setPhase("idle");
      } catch (e) {
        if (!disposed) {
          setError(`Không mở được camera: ${e instanceof Error ? e.message : e}`);
        }
      }
    })();
    return () => {
      disposed = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  // Esc đóng modal (cleanup phía trên lo tắt camera)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function record() {
    if (!streamRef.current) return;
    setError("");
    setClip(null);

    setPhase("countdown");
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 700));
    }

    setPhase("recording");
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(streamRef.current, { mimeType });
    recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setClip(blob);
      setPhase("preview");
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = URL.createObjectURL(blob);
      if (previewRef.current) {
        previewRef.current.src = previewUrlRef.current;
      }
    };
    recorder.start();
    await new Promise((r) => setTimeout(r, RECORD_MS));
    if (recorder.state !== "inactive") recorder.stop();
  }

  async function upload() {
    if (!clip) return;
    setPhase("uploading");
    setError("");
    try {
      const form = new FormData();
      form.append("file", clip, `${sign.gloss}.webm`);
      const res = await fetch(`${API_BASE}/api/signs/${sign.id}/clip`, {
        method: "POST",
        headers: authHeader(),
        body: form,
      });
      if (res.status === 401 || res.status === 403) {
        throw new Error("Phiên đăng nhập hết hạn hoặc không đủ quyền — đăng nhập lại.");
      }
      if (!res.ok) throw new Error(`Upload lỗi (HTTP ${res.status})`);
      const updated: Sign = await res.json();
      onUploaded(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("preview");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-xl bg-zinc-900 p-5 text-zinc-100">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Quay clip ký hiệu</h2>
            <p className="text-sm text-zinc-400">
              “{sign.meaningVi}” — <span className="font-mono text-emerald-400">{sign.gloss}</span>
              {sign.clipUrl && <span className="ml-2 text-xs text-amber-400">(sẽ thay clip cũ)</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
          >
            ✕ Đóng
          </button>
        </div>

        <div className="relative">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full rounded-lg bg-zinc-800 ${phase === "preview" || phase === "uploading" ? "hidden" : ""}`}
            style={{ transform: "scaleX(-1)" }}
          />
          <video
            ref={previewRef}
            controls
            loop
            autoPlay
            className={`w-full rounded-lg bg-zinc-800 ${phase === "preview" || phase === "uploading" ? "" : "hidden"}`}
          />
          {phase === "starting" && !error && (
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-zinc-400">
              Đang xin quyền camera…
            </p>
          )}
          {phase === "countdown" && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 text-8xl font-bold text-emerald-400">
              {countdown}
            </div>
          )}
          {phase === "recording" && (
            <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-sm font-semibold">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-amber-400">{error}</p>}

        <div className="mt-4 flex justify-center gap-3">
          {phase === "preview" || phase === "uploading" ? (
            <>
              <button
                onClick={upload}
                disabled={phase === "uploading"}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                {phase === "uploading" ? "Đang lưu…" : "✅ Dùng clip này"}
              </button>
              <button
                onClick={() => {
                  setClip(null);
                  setPhase("idle");
                }}
                disabled={phase === "uploading"}
                className="rounded-lg bg-zinc-800 px-5 py-2.5 hover:bg-zinc-700 disabled:cursor-not-allowed"
              >
                🔄 Quay lại
              </button>
            </>
          ) : (
            <button
              onClick={record}
              disabled={phase !== "idle"}
              className="rounded-lg bg-red-600 px-5 py-2.5 font-semibold hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-700"
            >
              🎬 Quay (3 giây)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
