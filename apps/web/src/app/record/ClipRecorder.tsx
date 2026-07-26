"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleDot, RefreshCw, RotateCcw, Save, Video, VideoOff } from "lucide-react";
import { API_BASE } from "@/lib/landmarks";
import { authHeader } from "@/lib/auth";
import { describeError, type Sign } from "@/app/dictionary/sign";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Lõi quay clip ký hiệu trong browser, DÙNG CHUNG cho trang /record (luồng nhanh
 * 3 bước) và hộp thoại của /admin — trước sprint 2 hai chỗ có hai bản MediaRecorder
 * riêng, mỗi lần sửa lỗi vòng đời camera phải sửa hai nơi và vẫn lệch nhau.
 *
 * KHÔNG lật gương ở cả khung trực tiếp lẫn khung xem lại: clip lưu xuống là bản
 * thô của camera, mà chiều tay trái/phải là thông tin có nghĩa trong VSL — lật
 * gương lúc xem sẽ khiến người quay nghĩ mình quay đúng trong khi file lưu bị ngược.
 */

export type RecorderPhase =
  | "starting"
  | "idle"
  | "countdown"
  | "recording"
  | "preview"
  | "uploading";

const RECORD_MS = 3000;
const COUNTDOWN_STEP_MS = 700;

type Props = {
  sign: Sign;
  /** Upload xong: cha cập nhật danh sách + hiện toast. */
  onUploaded: (updated: Sign) => void;
  /** 401/403 giữa phiên: cha lo xóa session và chuyển /login. */
  onAuthError: () => void;
  /** Để /record tô sáng đúng bước trong stepper (đang quay ↔ đang xem lại). */
  onPhaseChange?: (phase: RecorderPhase) => void;
  className?: string;
};

export function ClipRecorder({
  sign,
  onUploaded,
  onAuthError,
  onPhaseChange,
  className,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewUrlRef = useRef<string | null>(null);
  // Component đã unmount: record()/onstop còn chạy tiếp sau await và callback bất
  // đồng bộ, đi tiếp sẽ tạo MediaRecorder(null) hoặc blob URL không ai thu hồi.
  const disposedRef = useRef(false);
  const clipRef = useRef<Blob | null>(null);

  const [phase, setPhase] = useState<RecorderPhase>("starting");
  const [countdown, setCountdown] = useState(0);
  const [hasClip, setHasClip] = useState(false);
  const [error, setError] = useState("");
  // Tăng lên để xin lại quyền camera — trạng thái lỗi phải có đường thoát (nút
  // "Thử lại"), không thì người dùng bị kẹt phải tải lại cả trang.
  const [attempt, setAttempt] = useState(0);

  // Báo bước hiện tại ra ngoài (stepper của /record). Cha nên truyền hàm ổn định
  // bằng useCallback; nếu không thì cùng lắm gọi lại với giá trị cũ, React bỏ qua.
  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  // Bật camera khi mount; effect hủy được (chuẩn StrictMode)
  useEffect(() => {
    let disposed = false;
    disposedRef.current = false;
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
          const name = e instanceof Error ? e.name : "";
          setError(
            name === "NotAllowedError"
              ? "Bạn đã từ chối quyền camera. Cho phép camera cho trang này rồi bấm Thử lại."
              : name === "NotFoundError"
                ? "Không tìm thấy webcam nào trên máy. Cắm webcam rồi bấm Thử lại."
                : name === "NotReadableError"
                  ? "Webcam đang bị ứng dụng khác dùng (Zoom, Teams…). Đóng ứng dụng đó rồi bấm Thử lại."
                  : `Không mở được camera: ${describeError(e)}`
          );
        }
      }
    })();
    return () => {
      disposed = true;
      disposedRef.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [attempt]);

  /**
   * Dừng và tháo khung xem lại: thẻ video bị ẩn bằng class vẫn tiếp tục giải mã
   * và phát vòng lặp ngầm, còn blob URL thì không ai thu hồi cho tới khi unmount.
   */
  const releasePreview = useCallback(() => {
    const preview = previewRef.current;
    if (preview) {
      preview.pause();
      preview.removeAttribute("src");
      preview.load();
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const record = useCallback(async () => {
    if (!streamRef.current) return;
    setError("");
    setHasClip(false);
    clipRef.current = null;

    setPhase("countdown");
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, COUNTDOWN_STEP_MS));
    }

    // Đọc lại stream SAU đếm ngược: 2,1 giây đó người dùng có thể đã đóng hộp
    // thoại hoặc rút webcam — cleanup đã stop tracks và gán null.
    const stream = streamRef.current;
    if (disposedRef.current || !stream) return;
    if (!stream.active) {
      setPhase("idle");
      setError("Mất kết nối camera — kiểm tra webcam rồi quay lại.");
      return;
    }

    setPhase("recording");
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
    recorder.onstop = () => {
      // Đóng giữa lúc quay: tracks bị stop nên onstop vẫn bắn SAU cleanup —
      // tạo object URL lúc này thì không còn ai thu hồi (rò rỉ blob).
      if (disposedRef.current) return;
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      clipRef.current = blob;
      setHasClip(true);
      setPhase("preview");
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = URL.createObjectURL(blob);
      if (previewRef.current) previewRef.current.src = previewUrlRef.current;
    };
    recorder.start();
    await new Promise((r) => setTimeout(r, RECORD_MS));
    // stop() khi recorder đã tự dừng (camera rút giữa chừng) ném InvalidStateError
    if (recorder.state !== "inactive") recorder.stop();
  }, []);

  async function upload() {
    const clip = clipRef.current;
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
        onAuthError();
        return;
      }
      if (!res.ok) throw new Error(`máy chủ trả lỗi ${res.status}`);
      const updated: Sign = await res.json();
      if (!disposedRef.current) {
        // Về lại trạng thái sẵn sàng: /record giữ component này sống để quay liên
        // tiếp nhiều từ, kẹt mãi ở "Đang lưu…" là hỏng luồng.
        clipRef.current = null;
        setHasClip(false);
        releasePreview();
        setPhase("idle");
      }
      // Báo cha DÙ ĐÃ unmount: clip đã nằm trên máy chủ rồi, im lặng ở đây thì
      // bảng vẫn hiện "Chưa có clip" cho một ký hiệu thực tế đã có clip.
      onUploaded(updated);
    } catch (e) {
      if (disposedRef.current) return;
      setError(`Không lưu được clip: ${describeError(e)}`);
      setPhase("preview");
    }
  }

  const showPreview = phase === "preview" || phase === "uploading";
  const busy = phase === "countdown" || phase === "recording" || phase === "uploading";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative overflow-hidden rounded-xl bg-muted">
        {/* width/height + aspect cố định: khung không nhảy khi camera lên hình */}
        <video
          ref={videoRef}
          width={640}
          height={480}
          playsInline
          muted
          aria-label={`Khung camera trực tiếp cho ký hiệu ${sign.meaningVi}`}
          className={cn("aspect-[4/3] w-full object-cover", showPreview && "hidden")}
        />
        <video
          ref={previewRef}
          width={640}
          height={480}
          controls
          loop
          autoPlay
          playsInline
          aria-label={`Xem lại clip vừa quay cho ký hiệu ${sign.meaningVi}`}
          className={cn("aspect-[4/3] w-full bg-black object-contain", !showPreview && "hidden")}
        />

        {phase === "starting" && error === "" ? (
          <div className="absolute inset-0 grid place-items-center bg-card/80 p-4 text-center">
            <Skeleton className="absolute inset-0 rounded-none opacity-40" />
            <p className="relative z-10 text-sm text-muted-foreground">Đang xin quyền camera…</p>
          </div>
        ) : null}

        {error !== "" && phase === "starting" ? (
          // role="alert": node này được chèn vào DOM sau khi component đã mount nên
          // trình đọc màn hình đọc ngay. Không có nó thì lỗi camera — nhánh lỗi hay
          // gặp nhất của tính năng này — hoàn toàn im lặng với người dùng khiếm thị.
          <div
            role="alert"
            className="absolute inset-0 grid place-items-center bg-card/95 p-6 text-center"
          >
            <div className="space-y-3">
              <VideoOff className="mx-auto size-8 text-destructive" aria-hidden />
              <p className="text-sm text-foreground">{error}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setError("");
                  setAttempt((n) => n + 1);
                }}
              >
                <RefreshCw aria-hidden />
                Thử lại
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "countdown" ? (
          <div className="absolute inset-0 grid place-items-center bg-black/60">
            <span className="text-8xl font-bold tabular-nums text-primary">{countdown}</span>
          </div>
        ) : null}

        {phase === "recording" ? (
          <div className="absolute right-3 top-3 flex items-center gap-2 rounded-4xl bg-destructive px-3 py-1 text-sm font-semibold text-destructive-foreground">
            <CircleDot className="size-4 animate-pulse" aria-hidden />
            Đang quay
          </div>
        ) : null}
      </div>

      {/* Quay clip là luồng hoàn toàn bằng hình ảnh — không đọc trạng thái thì người
          dùng trình đọc màn hình không biết mình đang ở bước nào */}
      <p aria-live="polite" className="sr-only">
        {error !== "" && phase === "starting"
          ? "" /* overlay lỗi đã có role=alert — để trống ở đây kẻo đọc lặp hai lần */
          : phase === "starting"
            ? "Đang chuẩn bị camera"
            : phase === "countdown"
            ? `Bắt đầu quay sau ${countdown}`
            : phase === "recording"
              ? "Đang quay, ba giây"
              : phase === "preview"
                ? "Đã quay xong, xem lại rồi lưu"
                : phase === "uploading"
                  ? "Đang lưu clip"
                  : "Camera đã sẵn sàng"}
      </p>

      {error !== "" && phase !== "starting" ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {showPreview ? (
          <>
            <Button size="lg" onClick={upload} disabled={phase === "uploading" || !hasClip}>
              <Save aria-hidden />
              {phase === "uploading" ? "Đang lưu…" : "Dùng clip này"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setHasClip(false);
                clipRef.current = null;
                releasePreview();
                setPhase("idle");
              }}
              disabled={phase === "uploading"}
            >
              <RotateCcw aria-hidden />
              Quay lại
            </Button>
          </>
        ) : (
          <Button size="lg" onClick={record} disabled={phase !== "idle"}>
            <Video aria-hidden />
            {phase === "countdown"
              ? `Bắt đầu sau ${countdown}…`
              : phase === "recording"
                ? "Đang quay 3 giây…"
                : "Quay 3 giây"}
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          {busy
            ? "Giữ nguyên khung hình cho tới khi hết 3 giây."
            : "Khung hình hiện đúng như clip sẽ lưu (không lật gương)."}
        </p>
      </div>
    </div>
  );
}

export default ClipRecorder;
