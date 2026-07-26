"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE } from "@/lib/landmarks";
import { authHeader, getUser, login, logout, type AuthUser } from "@/lib/auth";

/**
 * Quay clip mẫu cho từ điển ngay trong browser (MediaRecorder → upload).
 * Mục đích chính: tự quay các từ mà Từ điển quốc gia QIPEDC còn thiếu
 * ("cảm ơn", "bác sĩ", "hôm nay"...) — hệ thống lấp khoảng trống tài nguyên.
 * Chỉ ADMIN được upload nên trang có bước đăng nhập.
 */

type Sign = { id: number; gloss: string; meaningVi: string; category: string; clipUrl: string | null };
type Phase = "idle" | "countdown" | "recording" | "preview" | "uploading";

const RECORD_MS = 3000;

function RecordToolInner() {
  const preselect = useSearchParams().get("sign") ?? "";

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState("admin@signbridge.vn");
  const [password, setPassword] = useState("");
  const [signs, setSigns] = useState<Sign[]>([]);
  const [query, setQuery] = useState(preselect);
  const [selected, setSelected] = useState<Sign | null>(null);
  const [newWord, setNewWord] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [clip, setClip] = useState<Blob | null>(null);
  const [message, setMessage] = useState("");

  // Đọc phiên đăng nhập từ localStorage sau khi hydrate (microtask → không setState
  // đồng bộ trong effect, và không lệch hydration giữa server/client)
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setUser(getUser());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/signs`);
        const list: Sign[] = await res.json();
        if (cancelled) return;
        setSigns(list);
        if (preselect) {
          const found = list.find((s) => s.gloss === preselect);
          if (found) setSelected(found);
        }
      } catch {
        if (!cancelled) setMessage("Không gọi được backend :8080.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preselect]);

  // Webcam bật khi đã đăng nhập; effect hủy được (chuẩn StrictMode)
  useEffect(() => {
    if (!user) return;
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
      } catch (e) {
        if (!disposed) setMessage(`Không mở được camera: ${e instanceof Error ? e.message : e}`);
      }
    })();
    return () => {
      disposed = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [user]);

  async function handleLogin() {
    setMessage("");
    try {
      const u = await login(email, password);
      if (u.role !== "ADMIN") {
        setMessage("Cần tài khoản ADMIN để upload clip từ điển.");
        logout();
        return;
      }
      setUser(u);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function record() {
    if (!streamRef.current || !selected) return;
    setMessage("");
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
      if (previewRef.current) {
        previewRef.current.src = URL.createObjectURL(blob);
      }
    };
    recorderRef.current = recorder;
    recorder.start();
    await new Promise((r) => setTimeout(r, RECORD_MS));
    recorder.stop();
  }

  async function upload() {
    if (!clip || !selected) return;
    setPhase("uploading");
    try {
      const form = new FormData();
      form.append("file", clip, `${selected.gloss}.webm`);
      const res = await fetch(`${API_BASE}/api/signs/${selected.id}/clip`, {
        method: "POST",
        headers: authHeader(),
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Sign = await res.json();
      setSigns((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setSelected(updated);
      setMessage(`✅ Đã lưu clip cho "${updated.meaningVi}".`);
      setClip(null);
    } catch (e) {
      setMessage(`❌ Upload lỗi: ${e instanceof Error ? e.message : e}`);
    }
    setPhase("idle");
  }

  async function createSign() {
    const meaning = newWord.trim();
    if (!meaning) return;
    setMessage("");
    try {
      const gloss = meaning
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60);
      const res = await fetch(`${API_BASE}/api/signs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ gloss, meaningVi: meaning, category: "TUDIEN" }),
      });
      if (!res.ok) throw new Error(res.status === 409 ? "Từ đã tồn tại" : `HTTP ${res.status}`);
      const created: Sign = await res.json();
      setSigns((prev) => [created, ...prev]);
      setSelected(created);
      setNewWord("");
      setQuery(created.meaningVi);
      setMessage(`Đã thêm từ "${created.meaningVi}" — giờ quay clip cho nó.`);
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : e}`);
    }
  }

  const q = query.trim().toLowerCase();
  const candidates = signs
    .filter((s) => q === "" || s.meaningVi.toLowerCase().includes(q) || s.gloss.toLowerCase().includes(q))
    .sort((a, b) => Number(!!a.clipUrl) - Number(!!b.clipUrl))
    .slice(0, 12);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">
        <div className="w-80 rounded-xl bg-zinc-900 p-6">
          <h1 className="mb-4 text-xl font-bold">Đăng nhập quản trị</h1>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="mb-2 w-full rounded-lg bg-zinc-800 px-3 py-2 outline-none ring-emerald-500 focus:ring-2"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Mật khẩu"
            className="mb-3 w-full rounded-lg bg-zinc-800 px-3 py-2 outline-none ring-emerald-500 focus:ring-2"
          />
          <button
            onClick={handleLogin}
            className="w-full rounded-lg bg-emerald-600 py-2 font-medium hover:bg-emerald-500"
          >
            Đăng nhập
          </button>
          {message && <p className="mt-3 text-sm text-amber-400">{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quay clip từ điển</h1>
          <p className="text-sm text-zinc-400">
            Tự quay các từ mà từ điển quốc gia còn thiếu — {user.name}
          </p>
        </div>
        <button
          onClick={() => {
            logout();
            setUser(null);
          }}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
        >
          Đăng xuất
        </button>
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="flex w-80 flex-col gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm từ cần quay…"
            className="rounded-lg bg-zinc-900 px-3 py-2 outline-none ring-emerald-500 focus:ring-2"
          />
          <ul className="max-h-64 overflow-auto rounded-lg bg-zinc-900 p-2">
            {candidates.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelected(s)}
                  className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    selected?.id === s.id ? "bg-emerald-700" : "hover:bg-zinc-800"
                  }`}
                >
                  <span>{s.meaningVi}</span>
                  <span className="text-xs text-zinc-400">{s.clipUrl ? "có clip" : "— thiếu —"}</span>
                </button>
              </li>
            ))}
            {candidates.length === 0 && <li className="p-2 text-sm text-zinc-500">Không thấy từ nào.</li>}
          </ul>

          <div className="rounded-lg bg-zinc-900 p-3">
            <p className="mb-2 text-xs text-zinc-500">Từ chưa có trong từ điển? Thêm mới:</p>
            <div className="flex gap-2">
              <input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createSign()}
                placeholder="VD: cảm ơn"
                className="flex-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm outline-none ring-emerald-500 focus:ring-2"
              />
              <button
                onClick={createSign}
                className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm hover:bg-sky-600"
              >
                Thêm
              </button>
            </div>
          </div>

          {message && <p className="text-sm">{message}</p>}
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-[480px] rounded-xl ${phase === "preview" ? "hidden" : ""}`}
              style={{ transform: "scaleX(-1)" }}
            />
            <video
              ref={previewRef}
              controls
              loop
              className={`w-[480px] rounded-xl ${phase === "preview" ? "" : "hidden"}`}
            />
            {phase === "countdown" && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-9xl font-bold text-emerald-400">
                {countdown}
              </div>
            )}
            {phase === "recording" && (
              <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-sm font-semibold">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC
              </div>
            )}
          </div>

          {selected ? (
            <p className="text-lg">
              Đang quay cho: <span className="font-semibold text-emerald-400">“{selected.meaningVi}”</span>
              {selected.clipUrl && <span className="ml-2 text-xs text-amber-400">(sẽ thay clip cũ)</span>}
            </p>
          ) : (
            <p className="text-zinc-500">Chọn một từ bên trái để bắt đầu.</p>
          )}

          <div className="flex gap-3">
            {phase === "preview" ? (
              <>
                <button
                  onClick={upload}
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold hover:bg-emerald-500"
                >
                  ✅ Dùng clip này
                </button>
                <button
                  onClick={() => {
                    setClip(null);
                    setPhase("idle");
                  }}
                  className="rounded-lg bg-zinc-800 px-5 py-2.5 hover:bg-zinc-700"
                >
                  🔄 Quay lại
                </button>
              </>
            ) : (
              <button
                onClick={record}
                disabled={!selected || phase !== "idle"}
                className="rounded-lg bg-red-600 px-5 py-2.5 font-semibold hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                {phase === "uploading" ? "Đang lưu…" : "🎬 Quay (3 giây)"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RecordTool() {
  return (
    <Suspense>
      <RecordToolInner />
    </Suspense>
  );
}
