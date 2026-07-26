"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, hasHand } from "@/lib/landmarks";
import { useVisionPipeline } from "@/lib/useVisionPipeline";

/**
 * Công cụ thu mẫu dataset (tuần 3 của plan):
 * chọn ký hiệu → đếm ngược 3s → quay 2s (~50 frame) → upload chuỗi keypoint
 * lên module dataset của Spring. Dữ liệu này dùng để fine-tune model với
 * người ký ngoài dataset gốc Multi-VSL.
 */

type Sign = { id: number; gloss: string; meaningVi: string; category: string };
type Phase = "idle" | "countdown" | "recording" | "uploading";

const RECORD_MS = 2000;

export default function CollectTool() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recordingRef = useRef<{ active: boolean; frames: number[][]; startedAt: number }>({
    active: false,
    frames: [],
    startedAt: 0,
  });

  const [signs, setSigns] = useState<Sign[]>([]);
  const [selectedGloss, setSelectedGloss] = useState("");
  const [signerName, setSignerName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");

  const onFrame = useCallback((frame: number[]) => {
    if (recordingRef.current.active) recordingRef.current.frames.push(frame);
  }, []);

  const { status, ready } = useVisionPipeline({ videoRef, canvasRef, onFrame });

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/dataset/stats`);
      if (res.ok) setStats(await res.json());
    } catch {
      /* backend chưa chạy — bảng tiến độ để trống */
    }
  }, []);

  useEffect(() => {
    setSignerName(localStorage.getItem("signbridge.signer") ?? "");
    fetch(`${API_BASE}/api/signs`)
      .then((r) => r.json())
      .then((list: Sign[]) => {
        setSigns(list);
        if (list.length > 0) setSelectedGloss(list[0].gloss);
      })
      .catch(() => setMessage("Không gọi được backend :8080 — hãy chạy Spring core trước."));
    refreshStats();
  }, [refreshStats]);

  async function record() {
    if (!selectedGloss || !signerName.trim()) {
      setMessage("Nhập tên người ký và chọn ký hiệu trước đã.");
      return;
    }
    localStorage.setItem("signbridge.signer", signerName.trim());
    setMessage("");

    // Đếm ngược 3-2-1 để người ký chuẩn bị tư thế
    setPhase("countdown");
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 700));
    }

    setPhase("recording");
    recordingRef.current = { active: true, frames: [], startedAt: performance.now() };
    await new Promise((r) => setTimeout(r, RECORD_MS));
    recordingRef.current.active = false;

    const { frames, startedAt } = recordingRef.current;
    const durationSec = (performance.now() - startedAt) / 1000;
    const framesWithHand = frames.filter(hasHand).length;

    if (frames.length < 10 || framesWithHand < frames.length * 0.5) {
      setPhase("idle");
      setMessage(
        `❌ Mẫu không đạt (${frames.length} frame, chỉ ${framesWithHand} frame thấy tay) — giữ tay trong khung hình rồi thử lại.`
      );
      return;
    }

    setPhase("uploading");
    try {
      const res = await fetch(`${API_BASE}/api/dataset/samples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gloss: selectedGloss,
          signerName: signerName.trim(),
          fps: frames.length / durationSec,
          frames,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage(`✅ Đã lưu mẫu "${selectedGloss}" (${frames.length} frame).`);
      refreshStats();
    } catch (e) {
      setMessage(`❌ Upload lỗi: ${e instanceof Error ? e.message : String(e)}`);
    }
    setPhase("idle");
  }

  const selected = signs.find((s) => s.gloss === selectedGloss);

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <h1 className="mb-1 text-2xl font-bold">Thu thập mẫu ký hiệu</h1>
      <p className="mb-4 text-sm text-zinc-400">Trạng thái: {status}</p>

      <div className="flex flex-wrap gap-6">
        <div className="relative">
          <video ref={videoRef} playsInline muted className="rounded-lg" style={{ transform: "scaleX(-1)" }} />
          <canvas
            ref={canvasRef}
            className="absolute left-0 top-0 h-full w-full"
            style={{ transform: "scaleX(-1)" }}
          />
          {phase === "countdown" && (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 text-9xl font-bold text-emerald-400">
              {countdown}
            </div>
          )}
          {phase === "recording" && (
            <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-sm font-semibold">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> ĐANG QUAY
            </div>
          )}
        </div>

        <div className="flex w-96 flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Tên người ký (bạn hoặc bạn bè góp mẫu)
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="VD: Khoa"
              className="rounded-lg bg-zinc-900 px-3 py-2 text-base outline-none ring-emerald-500 focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Ký hiệu cần quay
            <select
              value={selectedGloss}
              onChange={(e) => setSelectedGloss(e.target.value)}
              className="rounded-lg bg-zinc-900 px-3 py-2 text-base outline-none ring-emerald-500 focus:ring-2"
            >
              {signs.map((s) => (
                <option key={s.id} value={s.gloss}>
                  {s.gloss} — {s.meaningVi}
                </option>
              ))}
            </select>
          </label>

          {selected && (
            <p className="text-sm text-zinc-400">
              Làm ký hiệu <span className="font-semibold text-emerald-400">“{selected.meaningVi}”</span> trong 2
              giây sau khi đếm ngược. Mỗi ký hiệu cần ~10 mẫu/người.
            </p>
          )}

          <button
            onClick={record}
            disabled={phase !== "idle" || !ready}
            className="rounded-lg bg-emerald-600 px-4 py-3 text-lg font-semibold hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-700"
          >
            {phase === "idle" ? "🎬 Quay mẫu (2 giây)" : phase === "uploading" ? "Đang lưu…" : "…"}
          </button>

          {message && <p className="text-sm">{message}</p>}

          <div>
            <h2 className="mb-2 font-semibold text-sky-400">Tiến độ thu mẫu</h2>
            <ul className="max-h-48 overflow-auto rounded-lg bg-zinc-900 p-3 text-sm">
              {Object.keys(stats).length === 0 && <li className="text-zinc-500">Chưa có mẫu nào.</li>}
              {Object.entries(stats).map(([gloss, count]) => (
                <li key={gloss} className="mb-1 flex justify-between">
                  <span className="font-mono">{gloss}</span>
                  <span className="text-zinc-400">{count} mẫu</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
