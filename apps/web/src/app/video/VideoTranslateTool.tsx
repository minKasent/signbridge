"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WS_URL } from "@/lib/landmarks";
import { speakVietnamese, warmUpVoices } from "@/lib/speech";
import { useVideoFilePipeline } from "./useVideoFilePipeline";

/**
 * Trang dịch ký hiệu từ FILE VIDEO — phương án demo chính khi người dùng không
 * tự ký hiệu được: mở clip test của dataset cho hệ thống dịch. Video xử lý
 * thuần client (objectURL, không upload); phần dịch đi cùng đường WebSocket
 * với trang /translate.
 */

const FRAME_BATCH = 5;

type GlossResult = { gloss: string; confidence: number; at: number; videoTime: number };
type SentenceResult = { text: string; glosses: string[]; source: string; at: number };

const SOURCE_LABELS: Record<string, string> = {
  llm: "LLM ghép",
  cache: "LLM (cache)",
  fallback: "ghép dự phòng",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function VideoTranslateTool() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameBufferRef = useRef<number[][]>([]);

  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [playing, setPlaying] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [glosses, setGlosses] = useState<GlossResult[]>([]);
  const [sentences, setSentences] = useState<SentenceResult[]>([]);
  const [autoSpeak, setAutoSpeak] = useState(true);
  // ws.onmessage gán một lần lúc kết nối — đọc state trong đó sẽ dính giá trị
  // cũ khi người dùng bật/tắt sau này, giữ trong ref để luôn mới
  const autoSpeakRef = useRef(autoSpeak);
  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);

  useEffect(() => warmUpVoices(), []);

  // Thu hồi objectURL của file trước đó khi đổi file / rời trang — không thu
  // hồi thì blob giữ nguyên trong bộ nhớ tới khi đóng tab
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  // Rời trang thì đóng WebSocket
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  const onFrame = useCallback((frame: number[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      frameBufferRef.current.push(frame);
      if (frameBufferRef.current.length >= FRAME_BATCH) {
        wsRef.current.send(JSON.stringify({ type: "frames", frames: frameBufferRef.current }));
        frameBufferRef.current = [];
      }
    }
  }, []);

  const { status, ready, fps } = useVideoFilePipeline({ videoRef, canvasRef, onFrame });

  function toggleBackend() {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setWsConnected(false);
      return;
    }
    openSocket();
  }

  /**
   * Đặt lại phiên dịch phía server bằng cách đóng và mở lại WebSocket.
   * Giao thức không có lệnh hủy: "flush" là CHỐT CÂU từ gloss đang đệm — nếu
   * dùng flush để reset thì câu của lượt cũ về SAU khi đã xóa kết quả (LLM trễ
   * vài giây) rồi hiện lại và bị đọc to. Đóng phiên thì server tự dọn sạch cả
   * buffer frame lẫn gloss đang đệm (afterConnectionClosed).
   */
  function resetBackendSession() {
    if (!wsRef.current) return;
    const old = wsRef.current;
    wsRef.current = null; // handler của socket cũ tự vô hiệu nhờ guard wsRef
    old.close();
    openSocket();
  }

  function openSocket() {
    frameBufferRef.current = []; // bỏ frame thừa của phiên trước
    const ws = new WebSocket(WS_URL);
    // Mọi handler kiểm tra "còn là socket hiện tại không" — tránh event của
    // socket cũ đóng đè lên trạng thái của kết nối mới
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
        const videoTime = videoRef.current?.currentTime ?? 0;
        setGlosses((prev) =>
          [{ gloss: msg.gloss, confidence: msg.confidence, at: Date.now(), videoTime }, ...prev].slice(0, 50)
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

  /** Gửi nốt frame còn đọng trong batch rồi yêu cầu chốt câu. */
  function flushTranslation() {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    if (frameBufferRef.current.length > 0) {
      ws.send(JSON.stringify({ type: "frames", frames: frameBufferRef.current }));
      frameBufferRef.current = [];
    }
    ws.send(JSON.stringify({ type: "flush" }));
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileUrl(URL.createObjectURL(file)); // URL cũ được effect thu hồi
    // Đổi file = phiên dịch mới: reset cả server, không thì gloss/frame còn đệm
    // của video trước trộn vào câu đầu tiên của video mới
    resetBackendSession();
    setGlosses([]);
    setSentences([]);
    setPlaying(false);
    frameBufferRef.current = [];
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video || !fileUrl) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function restartTranslation() {
    const video = videoRef.current;
    if (!video || !fileUrl) return;
    // Reset phiên server bằng đóng/mở lại WS thay vì gửi flush như plan mô tả:
    // flush thật ra CHỐT câu từ gloss đang đệm nên câu của lượt cũ sẽ về sau
    // khi đã xóa kết quả và hiện lại trong lượt mới (ghi chú trong merge-notes)
    resetBackendSession();
    setGlosses([]);
    setSentences([]);
    frameBufferRef.current = [];
    video.currentTime = 0;
    void video.play();
  }

  const latest = sentences[0];

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <h1 className="mb-1 text-2xl font-bold">SignBridge — Dịch từ video</h1>
      <p className="mb-4 text-sm text-zinc-400">
        Chọn file video có người ký hiệu — xử lý ngay trong browser, không upload · trạng thái:{" "}
        {status} · {fps} fps
      </p>

      <div className="flex flex-wrap gap-6">
        <div className="flex max-w-2xl flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500">
              📂 Chọn video (mp4/webm)
              <input
                type="file"
                accept="video/mp4,video/webm"
                onChange={onPickFile}
                className="hidden"
              />
            </label>
            {fileName && <span className="text-sm text-zinc-400">{fileName}</span>}
          </div>

          {!fileUrl && (
            <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900 text-zinc-500">
              Chưa chọn video. Gợi ý: dùng clip test của dataset hoặc clip từ điển.
            </div>
          )}

          <div className={`relative w-fit ${fileUrl ? "" : "hidden"}`}>
            <video
              ref={videoRef}
              src={fileUrl ?? undefined}
              playsInline
              controls
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={flushTranslation}
              className="max-h-[60vh] rounded-lg"
            />
            {/* pointer-events-none để bấm được thanh điều khiển video bên dưới */}
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute left-0 top-0 h-full w-full"
            />
          </div>

          {fileUrl && (
            <div className="flex gap-2">
              <button
                onClick={togglePlay}
                disabled={!ready}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
              >
                {playing ? "⏸ Tạm dừng" : "▶ Phát và dịch"}
              </button>
              <button
                onClick={restartTranslation}
                disabled={!ready}
                className="rounded-lg bg-sky-700 px-4 py-2 font-medium hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
                title="Seek về đầu video, xóa kết quả cũ và dịch lại"
              >
                ⟲ Dịch lại từ đầu
              </button>
            </div>
          )}

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
                {wsConnected
                  ? "Phát video để hệ thống nhận diện — hết video sẽ tự chốt câu."
                  : "Kết nối backend rồi phát video để bắt đầu dịch."}
              </p>
            )}
          </div>
        </div>

        <div className="flex w-80 flex-col gap-4">
          <button
            onClick={toggleBackend}
            className={`rounded-lg px-4 py-2 font-medium ${
              wsConnected ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {wsConnected ? "Ngắt kết nối" : "Kết nối backend"}
          </button>

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
            <h2 className="mb-2 font-semibold text-sky-400">Timeline ký hiệu</h2>
            <ul className="h-72 overflow-auto rounded-lg bg-zinc-900 p-3 text-sm">
              {glosses.length === 0 && (
                <li className="text-zinc-500">
                  {wsConnected ? "Chưa có ký hiệu nào được nhận diện." : "Chưa kết nối backend."}
                </li>
              )}
              {glosses.map((g) => (
                <li key={g.at} className="mb-1">
                  <span className="font-mono text-xs text-zinc-500">[{formatTime(g.videoTime)}]</span>{" "}
                  <span className="font-mono text-sky-300">{g.gloss}</span>{" "}
                  <span className="text-zinc-500">({(g.confidence * 100).toFixed(0)}%)</span>
                </li>
              ))}
            </ul>
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
