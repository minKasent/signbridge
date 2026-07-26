"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  FileVideo,
  Loader2,
  Pause,
  Play,
  Plug,
  PlugZap,
  RotateCcw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { ConnectionBadge } from "@/components/demo/connection-badge";
import { GlossChips } from "@/components/demo/gloss-chips";
import { SentenceStage } from "@/components/demo/sentence-stage";
import { EmptyState, ErrorState } from "@/components/demo/state-views";
import {
  useTranslationSocket,
  type SentenceItem,
} from "@/components/demo/use-translation-socket";
import { Button, buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { API_BASE } from "@/lib/landmarks";
import { speakVietnamese, warmUpVoices } from "@/lib/speech";
import { cn } from "@/lib/utils";
import { useVideoFilePipeline } from "./useVideoFilePipeline";

/**
 * Dịch ký hiệu từ FILE VIDEO — phương án demo chính khi người trình bày không tự
 * ký hiệu được: mở clip có sẵn cho hệ thống dịch. Video xử lý thuần client
 * (objectURL, không upload); phần dịch đi chung đường WebSocket với /translate
 * qua hook useTranslationSocket.
 */

const ACCEPTED_TYPES = ["video/mp4", "video/webm"];
/** Vài trình duyệt trả file.type rỗng cho mp4 — xét thêm phần mở rộng. */
const ACCEPTED_EXT = /\.(mp4|webm)$/i;
/** Số clip mẫu hiện trên trang: đủ để bấm nhanh khi trình chiếu, không rối. */
const SAMPLE_COUNT = 3;

type SampleClip = { id: number; label: string; url: string };
type SignRow = { id: number; meaningVi: string; clipUrl: string | null };

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Nút chọn file dùng chung. Input để `sr-only peer` chứ KHÔNG dùng `hidden`:
 * `display:none` khiến bàn phím không tab tới được ô chọn file, còn `sr-only`
 * vẫn nhận focus và nhãn sáng lên nhờ `peer-focus-visible`.
 */
function FilePicker({
  id,
  variant = "default",
  onPick,
  children,
}: {
  id: string;
  variant?: "default" | "outline";
  onPick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="inline-flex">
      <input
        id={id}
        type="file"
        accept="video/mp4,video/webm"
        className="peer sr-only"
        onChange={onPick}
      />
      <label
        htmlFor={id}
        className={cn(
          buttonVariants({ variant, size: "lg" }),
          "h-10 cursor-pointer px-4 text-base peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
        )}
      >
        <Upload aria-hidden className="size-4" />
        {children}
      </label>
    </div>
  );
}

export default function VideoTranslateTool() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [samples, setSamples] = useState<SampleClip[]>([]);
  const [loadingSampleId, setLoadingSampleId] = useState<number | null>(null);

  /** Mốc thời gian đã xử lý — dùng để phát hiện tua LÙI trong onSeeked. */
  const lastTimeRef = useRef(0);

  // Handler của socket gán một lần lúc kết nối; đọc state trong đó sẽ dính giá trị
  // cũ khi người dùng bật/tắt sau này, nên giữ trong ref để luôn đọc bản mới nhất.
  const autoSpeakRef = useRef(autoSpeak);
  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);

  useEffect(() => warmUpVoices(), []);

  const handleSentence = useCallback((sentence: SentenceItem) => {
    if (autoSpeakRef.current) speakVietnamese(sentence.text);
  }, []);

  // Mỗi gloss gắn mốc thời gian trong clip để vẽ vạch trên thanh tiến trình.
  const glossMeta = useCallback(() => ({ videoTime: videoRef.current?.currentTime }), []);

  const {
    connection,
    glosses,
    sentences,
    latest,
    connect,
    disconnect,
    reset,
    pushFrame,
    flush,
  } = useTranslationSocket({ glossMeta, onSentence: handleSentence });

  const { status, ready, fps } = useVideoFilePipeline({
    videoRef,
    canvasRef,
    onFrame: pushFrame,
  });

  // Hook báo lỗi khởi tạo MediaPipe qua chuỗi status (không có cờ riêng).
  const modelError = status.startsWith("Lỗi khởi tạo");

  // Thu hồi objectURL của file trước đó khi đổi file / rời trang — không thu hồi
  // thì blob nằm lại trong bộ nhớ cho tới lúc đóng tab.
  useEffect(() => {
    if (!fileUrl) return;
    return () => URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  // Clip mẫu lấy từ từ điển. Từ điển hỏng thì chỉ ẩn khu vực này, trang vẫn dịch
  // được file trong máy — không để một API lỗi làm vỡ cả trang demo.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/api/signs`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((rows: SignRow[]) => {
        const list = Array.isArray(rows) ? rows : [];
        setSamples(
          list
            .filter((row) => Boolean(row.clipUrl))
            .slice(0, SAMPLE_COUNT)
            .map((row) => ({
              id: row.id,
              label: row.meaningVi,
              url: `${API_BASE}${row.clipUrl}`,
            }))
        );
      })
      .catch(() => {
        // Im lặng có chủ đích: khu vực clip mẫu chỉ đơn giản không hiện ra.
      });
    return () => controller.abort();
  }, []);

  /** Nạp một nguồn video mới (file trong máy hoặc clip mẫu đã tải về blob). */
  const applyVideoSource = useCallback(
    (url: string, name: string) => {
      setFileUrl(url); // URL cũ do effect thu hồi
      setFileName(name);
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      lastTimeRef.current = 0;
      // Đổi video = phiên dịch mới. reset() đóng/mở lại socket để server bỏ sạch
      // frame + gloss còn đệm của clip trước, không thì chúng trộn vào câu đầu
      // tiên của clip mới.
      reset();
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    },
    [reset]
  );

  const acceptFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXT.test(file.name)) {
        toast.error("Định dạng video không hỗ trợ", {
          description: "Chỉ nhận file MP4 hoặc WebM — hãy chuyển đổi rồi thử lại.",
        });
        return;
      }
      applyVideoSource(URL.createObjectURL(file), file.name);
    },
    [applyVideoSource]
  );

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0]);
    // Xóa value để chọn lại ĐÚNG file vừa chọn vẫn kích hoạt onChange.
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault(); // không chặn thì trình duyệt tự mở file, không gọi onDrop
    setDragging(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    // Rê qua phần tử con cũng bắn dragleave — chỉ tắt khi con trỏ rời hẳn khung.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragging(false);
    }
  }

  async function loadSample(clip: SampleClip) {
    setLoadingSampleId(clip.id);
    try {
      // Bắt buộc đi qua fetch + blob: gán thẳng URL khác origin vào <video> sẽ
      // làm canvas bị "nhuộm bẩn" (taint) và MediaPipe không đọc được khung hình.
      const res = await fetch(clip.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      applyVideoSource(URL.createObjectURL(blob), `Clip mẫu — ${clip.label}`);
      toast.success(`Đã nạp clip mẫu «${clip.label}»`, {
        description: "Bấm «Phát và dịch» để bắt đầu.",
      });
    } catch {
      toast.error("Không tải được clip mẫu", {
        description: "Kiểm tra dịch vụ core đang chạy ở cổng 8080 rồi thử lại.",
      });
    } finally {
      setLoadingSampleId(null);
    }
  }

  function toggleBackend() {
    if (connection === "connected" || connection === "connecting") disconnect();
    else connect();
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video || !fileUrl) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    // Chưa kết nối mà bấm phát thì tự kết nối: hook đệm frame trong lúc socket
    // còn CONNECTING nên không mất đoạn đầu clip.
    if (connection === "disconnected" || connection === "error") connect();
    void video.play();
  }

  function restartTranslation() {
    const video = videoRef.current;
    if (!video || !fileUrl) return;
    reset();
    lastTimeRef.current = 0; // đặt trước khi tua: onSeeked không hiểu nhầm là tua lùi
    video.currentTime = 0;
    setCurrentTime(0);
    if (connection === "disconnected" || connection === "error") connect();
    void video.play();
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    // onTimeUpdate bắn ~4 lần/giây — đủ mượt cho thanh tiến trình mà không phải
    // đặt state mỗi khung hình.
    setCurrentTime(video.currentTime);
    if (!video.seeking) lastTimeRef.current = video.currentTime;
  }

  function handleSeeked() {
    const video = videoRef.current;
    if (!video) return;
    // Tua LÙI nghĩa là đoạn vừa xử lý sẽ chạy lại: không reset thì gloss của đoạn
    // đó vào đệm server lần thứ hai và câu ghép ra bị lặp từ.
    if (video.currentTime < lastTimeRef.current - 0.05) reset();
    lastTimeRef.current = video.currentTime;
    setCurrentTime(video.currentTime);
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    setDuration(video && Number.isFinite(video.duration) ? video.duration : 0);
  }

  const isLive = connection === "connected" || connection === "connecting";
  const showVideo = Boolean(fileUrl) && !modelError;
  const showModelSkeleton = !modelError && !fileUrl && !ready;
  const showDropzone = !modelError && !fileUrl && ready;
  const analyzing = playing && connection === "connected" && glosses.length === 0;
  const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  // Điểm nhận diện được trên timeline. flatMap để lọc và ép kiểu cùng lúc,
  // khỏi phải khẳng định non-null cho videoTime.
  const markers =
    duration > 0
      ? glosses.flatMap((item) =>
          item.videoTime === undefined
            ? []
            : [{ id: item.id, gloss: item.gloss, time: item.videoTime }]
        )
      : [];

  const sentenceHint = !fileUrl
    ? "Chọn một video hoặc bấm một clip mẫu để bắt đầu."
    : connection === "connected"
      ? "Phát video để hệ thống nhận diện — hết video sẽ tự chốt câu."
      : "Bấm «Phát và dịch» — hệ thống sẽ tự kết nối backend.";

  const glossHint =
    connection === "connected"
      ? "Chưa nhận diện được ký hiệu nào — phát video để bắt đầu."
      : "Kết nối backend rồi phát video, ký hiệu sẽ hiện dần ở đây.";

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Dịch từ video</h1>
        <p className="text-muted-foreground">
          Kéo thả hoặc chọn clip có người ký hiệu — khung hình được xử lý ngay trong trình
          duyệt, không tải file lên máy chủ.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* CỘT TRÁI — nguồn video, tiến trình và câu dịch */}
        <div className="min-w-0 space-y-4">
          <div
            onDragEnter={handleDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "rounded-2xl border-2 border-dashed p-4 transition-colors duration-200",
              dragging ? "border-primary bg-primary/10" : "border-border bg-card"
            )}
          >
            {/* <video> và <canvas> LUÔN nằm trong DOM: hook MediaPipe bám ref ngay
                lần render đầu, gỡ ra rồi gắn lại thì vòng lặp không khởi động nữa. */}
            <div className={showVideo ? "relative mx-auto w-fit max-w-full" : "hidden"}>
              <video
                ref={videoRef}
                src={fileUrl ?? undefined}
                playsInline
                controls
                onLoadedMetadata={handleLoadedMetadata}
                onDurationChange={handleLoadedMetadata}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                  setPlaying(false);
                  flush(); // chốt câu cuối, không thì gloss cuối clip nằm lại trong đệm
                }}
                onSeeked={handleSeeked}
                onTimeUpdate={handleTimeUpdate}
                className="max-h-[55vh] w-full rounded-xl bg-black"
              />
              {/* pointer-events-none để vẫn bấm được thanh điều khiển video bên dưới */}
              <canvas
                ref={canvasRef}
                className="pointer-events-none absolute inset-0 size-full"
              />
            </div>

            {modelError ? (
              <ErrorState
                title="Không tải được model nhận diện"
                message={`${status}. Tải lại trang để thử lại — nếu vẫn lỗi, kiểm tra thư mục /models và /mediapipe/wasm.`}
                onRetry={() => window.location.reload()}
              />
            ) : null}

            {showModelSkeleton ? (
              <div className="space-y-3">
                <Skeleton className="aspect-video w-full rounded-xl" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            ) : null}

            {showDropzone ? (
              <EmptyState
                icon={FileVideo}
                title="Chưa chọn video"
                hint="Kéo thả file MP4 hoặc WebM vào khung này, hoặc bấm nút bên dưới. Chưa có sẵn file? Dùng một clip mẫu ở ngay dưới."
                action={
                  <FilePicker id="video-file-empty" onPick={handleInputChange}>
                    Chọn video (MP4/WebM)
                  </FilePicker>
                }
              />
            ) : null}

            {!modelError && !ready ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Đang tải model nhận diện MediaPipe (~8MB)…
              </p>
            ) : null}
          </div>

          {fileUrl ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                Đang mở: <span className="text-foreground">{fileName}</span>
              </p>
              <FilePicker id="video-file-change" variant="outline" onPick={handleInputChange}>
                Chọn video khác
              </FilePicker>
            </div>
          ) : null}

          {fileUrl ? (
            <div className="space-y-2">
              <div
                role="progressbar"
                aria-label="Tiến trình dịch video"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(currentTime)}
                aria-valuetext={`${formatTime(currentTime)} trên ${formatTime(duration)}`}
                className="relative h-3 w-full rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${percent}%` }}
                />
                {/* Vạch = mốc nhận diện được. aria-hidden vì đúng thông tin đó đã được
                    đọc thành lời ở danh sách chip ký hiệu (kèm mốc thời gian). */}
                <div aria-hidden className="absolute inset-0">
                  {markers.map((marker) => (
                    <span
                      key={marker.id}
                      title={`Nhận diện «${marker.gloss}» tại ${formatTime(marker.time)}`}
                      style={{ left: `${Math.min(100, (marker.time / duration) * 100)}%` }}
                      className="absolute top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-accent"
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="font-mono">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                <span>{markers.length} mốc nhận diện trên timeline</span>
              </div>
            </div>
          ) : null}

          <AnimatePresence>
            {analyzing ? (
              <motion.p
                key="analyzing"
                aria-live="polite"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 aria-hidden className="size-4 animate-spin" />
                Đang phân tích khung hình…
              </motion.p>
            ) : null}
          </AnimatePresence>

          <SentenceStage
            sentence={latest}
            hint={sentenceHint}
            autoSpeak={autoSpeak}
            onAutoSpeakChange={setAutoSpeak}
            onSpeak={() => {
              if (latest) speakVietnamese(latest.text);
            }}
            idPrefix="video"
          />

          {samples.length > 0 ? (
            <section className="rounded-2xl bg-card p-4" aria-labelledby="video-samples">
              <h2
                id="video-samples"
                className="text-sm font-medium tracking-wider text-muted-foreground uppercase"
              >
                Clip mẫu từ từ điển
              </h2>
              <p className="mt-1 mb-3 text-sm text-muted-foreground">
                Bấm một nút để nạp clip có sẵn — nhanh hơn nhiều so với lục hộp thoại file
                khi đang trình chiếu.
              </p>
              <div className="flex flex-wrap gap-2">
                {samples.map((clip) => (
                  <Button
                    key={clip.id}
                    variant="secondary"
                    size="lg"
                    className="h-10 px-4 text-base"
                    disabled={loadingSampleId !== null}
                    onClick={() => void loadSample(clip)}
                  >
                    {loadingSampleId === clip.id ? (
                      <Loader2 aria-hidden className="size-4 animate-spin" />
                    ) : (
                      <Play aria-hidden className="size-4" />
                    )}
                    {clip.label}
                  </Button>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* CỘT PHẢI — điều khiển kết nối, phát và dòng ký hiệu */}
        <aside className="min-w-0 space-y-4">
          <div className="space-y-3 rounded-2xl bg-card p-4">
            <ConnectionBadge state={connection} />

            <Button
              onClick={toggleBackend}
              variant={isLive ? "outline" : "default"}
              size="lg"
              className="h-10 w-full text-base"
            >
              {isLive ? (
                <>
                  <Plug aria-hidden className="size-4" />
                  Ngắt kết nối
                </>
              ) : (
                <>
                  <PlugZap aria-hidden className="size-4" />
                  Kết nối backend
                </>
              )}
            </Button>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={togglePlay}
                disabled={!ready || !fileUrl}
                size="lg"
                className="h-10 min-w-36 flex-1 text-base"
              >
                {playing ? (
                  <>
                    <Pause aria-hidden className="size-4" />
                    Tạm dừng
                  </>
                ) : (
                  <>
                    <Play aria-hidden className="size-4" />
                    Phát và dịch
                  </>
                )}
              </Button>
              <Button
                onClick={restartTranslation}
                disabled={!ready || !fileUrl}
                variant="secondary"
                size="lg"
                className="h-10 min-w-36 flex-1 text-base"
              >
                <RotateCcw aria-hidden className="size-4" />
                Dịch lại từ đầu
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              Model: {status}
              {ready ? ` · ${fps} fps` : ""}
            </p>
          </div>

          <section className="rounded-2xl bg-card p-4" aria-labelledby="video-gloss-timeline">
            <h2
              id="video-gloss-timeline"
              className="mb-3 text-sm font-medium tracking-wider text-muted-foreground uppercase"
            >
              Ký hiệu nhận diện được
            </h2>
            <ScrollArea className="h-72 pr-3">
              <GlossChips glosses={glosses} showTime emptyHint={glossHint} />
            </ScrollArea>
          </section>

          {sentences.length > 1 ? (
            <section className="rounded-2xl bg-card p-4" aria-labelledby="video-history">
              <h2
                id="video-history"
                className="mb-3 text-sm font-medium tracking-wider text-muted-foreground uppercase"
              >
                Câu trước đó
              </h2>
              <ul className="space-y-2">
                {sentences.slice(1).map((item) => (
                  <li key={item.id} className="text-sm text-muted-foreground">
                    {item.text}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
