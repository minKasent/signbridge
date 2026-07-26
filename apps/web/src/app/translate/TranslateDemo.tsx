"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { Eraser, Hand, PlugZap, Scissors, Unplug } from "lucide-react";
import { toast } from "sonner";
import { ConnectionBadge } from "@/components/demo/connection-badge";
import { GlossChips } from "@/components/demo/gloss-chips";
import { SentenceStage } from "@/components/demo/sentence-stage";
import { EmptyState, ErrorState } from "@/components/demo/state-views";
import {
  useTranslationSocket,
  type ConnectionState,
  type SentenceItem,
} from "@/components/demo/use-translation-socket";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FRAME_DIMS } from "@/lib/landmarks";
import { speakVietnamese, warmUpVoices } from "@/lib/speech";
import { useVisionPipeline } from "@/lib/useVisionPipeline";

/**
 * Màn hình demo chính: webcam → MediaPipe (trong browser) → WebSocket → Spring →
 * ML service → gloss → nghỉ tay → LLM ghép câu tiếng Việt → hiện chữ + đọc lên.
 *
 * Thứ bậc thị giác được ĐẢO so với bản cũ: câu tiếng Việt là dải ngang lớn nhất
 * nằm dưới khung hình, chuỗi gloss chỉ là chú thích phía dưới. Lý do: khi bảo vệ,
 * thứ hội đồng cần đọc từ cuối phòng là CÂU, không phải khung webcam hay JSON.
 */

/** Nhịp cập nhật dòng thông tin kỹ thuật (số bàn tay). */
const INFO_INTERVAL_MS = 500;

/** Gợi ý hiện ở sân khấu câu khi chưa có câu nào — nói rõ người dùng phải làm gì tiếp. */
const SENTENCE_HINTS: Record<ConnectionState, string> = {
  disconnected: "Bấm «Kết nối backend» để bắt đầu — câu tiếng Việt sẽ hiện ở đây.",
  connecting: "Đang kết nối tới backend, chờ một chút…",
  connected: "Ra ký hiệu trước webcam rồi hạ tay xuống khoảng 2 giây để hệ thống chốt câu.",
  error: "Mất kết nối tới backend — bấm «Kết nối backend» để thử lại.",
};

const GLOSS_HINTS: Record<ConnectionState, string> = {
  disconnected: "Chưa kết nối backend nên chưa có ký hiệu nào.",
  connecting: "Đang kết nối tới backend…",
  connected: "Đang chờ ML service trả kết quả — hãy ra ký hiệu trước webcam.",
  error: "Mất kết nối tới backend, không nhận được ký hiệu.",
};

export default function TranslateDemo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [autoSpeak, setAutoSpeak] = useState(true);
  const [handCount, setHandCount] = useState(0);
  // Số bàn tay đổi theo TỪNG frame. Giữ mốc trong ref và chỉ đẩy vào state khi
  // giá trị thực sự đổi, tối đa 2 lần/giây — nếu setState mỗi frame thì cả trang
  // render lại 25 lần/giây và fps nhận diện tụt.
  const handInfoRef = useRef({ at: 0, count: -1 });

  // Trình duyệt nạp danh sách giọng bất đồng bộ; gọi sớm để câu ĐẦU TIÊN đã có giọng Việt
  useEffect(() => {
    warmUpVoices();
  }, []);

  const handleSentence = useCallback(
    (sentence: SentenceItem) => {
      if (autoSpeak) speakVietnamese(sentence.text);
    },
    [autoSpeak]
  );

  const {
    connection,
    glosses,
    sentences,
    latest,
    connect,
    disconnect,
    clearResults,
    pushFrame,
    flush,
  } = useTranslationSocket({ onSentence: handleSentence });

  const onFrame = useCallback(
    (frame: number[], hands: HandLandmarkerResult) => {
      pushFrame(frame);

      const now = performance.now();
      const count = hands.landmarks.length;
      const info = handInfoRef.current;
      if (count !== info.count && now - info.at >= INFO_INTERVAL_MS) {
        handInfoRef.current = { at: now, count };
        setHandCount(count);
      }
    },
    [pushFrame]
  );

  const { status, ready, fps } = useVisionPipeline({
    videoRef,
    canvasRef,
    onFrame,
    drawLandmarkDots: true,
  });

  // Hook báo lỗi camera/model bằng chuỗi "Lỗi khởi tạo: …" trong status
  const cameraFailed = status.includes("Lỗi");
  const isLive = connection === "connected" || connection === "connecting";
  const showGlossEmpty = connection === "disconnected" && glosses.length === 0;
  const hasResults = glosses.length > 0 || sentences.length > 0;

  function handleToggleConnection() {
    if (isLive) {
      disconnect();
      return;
    }
    connect();
  }

  function handleFlush() {
    flush();
    toast.info("Đã yêu cầu chốt câu", {
      description: "Câu tiếng Việt sẽ hiện ngay khi LLM ghép xong.",
    });
  }

  function handleSpeak() {
    if (latest) speakVietnamese(latest.text);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Phiên dịch trực tiếp</h1>
          <p className="text-muted-foreground">
            Ra ký hiệu trước webcam, hạ tay xuống khoảng 2 giây để hệ thống ghép thành câu tiếng Việt.
          </p>
        </div>
        <ConnectionBadge state={connection} className="sm:ml-auto" />
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button
          size="lg"
          variant={isLive ? "outline" : "default"}
          className="h-10 px-4 text-base"
          onClick={handleToggleConnection}
        >
          {isLive ? <Unplug aria-hidden /> : <PlugZap aria-hidden />}
          {isLive ? "Ngắt kết nối" : "Kết nối backend"}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-10 px-4 text-base"
          onClick={handleFlush}
          disabled={connection !== "connected"}
          title="Chốt câu ngay, không cần chờ nghỉ tay"
        >
          <Scissors aria-hidden />
          Chốt câu ngay
        </Button>
        <Button size="lg" variant="ghost" onClick={clearResults} disabled={!hasResults}>
          <Eraser aria-hidden />
          Xóa kết quả
        </Button>
      </div>

      {connection === "error" ? (
        <ErrorState
          className="mb-6"
          title="Mất kết nối tới backend"
          message="Dịch vụ core ở cổng 8080 không phản hồi. Kiểm tra backend đang chạy rồi bấm Thử lại."
          onRetry={connect}
        />
      ) : null}

      {cameraFailed ? (
        <ErrorState
          title="Không mở được camera"
          message="Hãy cho phép trình duyệt dùng camera (biểu tượng ổ khóa trên thanh địa chỉ) và đóng ứng dụng khác đang chiếm webcam (Zoom, Meet, OBS), sau đó tải lại trang."
          onRetry={() => window.location.reload()}
        />
      ) : (
        <div className="mx-auto w-full max-w-2xl">
          {/* aspect-[4/3] khớp đúng 640×480 của webcam: khung giữ chỗ sẵn nên
              trang không giật layout lúc video có tín hiệu đầu tiên. */}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted ring-1 ring-border">
            <video
              ref={videoRef}
              width={640}
              height={480}
              playsInline
              muted
              className="absolute inset-0 size-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            {/* Lớp vẽ khung xương chỉ để trang trí — trình đọc màn hình bỏ qua */}
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              aria-hidden
              className="absolute inset-0 size-full"
              style={{ transform: "scaleX(-1)" }}
            />
            {ready ? null : (
              <div className="absolute inset-0">
                <Skeleton className="size-full rounded-none" />
                <p
                  role="status"
                  className="absolute inset-0 grid place-items-center px-4 text-center text-base font-medium text-foreground"
                >
                  Đang tải model nhận diện (~8MB)…
                </p>
              </div>
            )}
          </div>

          {/* Thay ô JSON thô của bản cũ: một dòng gọn, không chiếm chỗ của câu dịch */}
          <p className="mt-2 text-center text-sm text-muted-foreground">
            {handCount > 0 ? `${handCount} bàn tay trong khung` : "Chưa thấy bàn tay trong khung"} ·{" "}
            {fps} fps · vector {FRAME_DIMS} chiều
          </p>
        </div>
      )}

      <SentenceStage
        className="mt-6"
        sentence={latest}
        hint={SENTENCE_HINTS[connection]}
        autoSpeak={autoSpeak}
        onAutoSpeakChange={setAutoSpeak}
        onSpeak={handleSpeak}
        idPrefix="translate"
      />

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium tracking-wider text-muted-foreground uppercase">
          Ký hiệu nhận diện được
        </h2>
        {showGlossEmpty ? (
          <EmptyState
            className="rounded-xl bg-card ring-1 ring-border"
            icon={Hand}
            title="Chưa có ký hiệu nào"
            hint="Kết nối backend rồi ra ký hiệu trước webcam — mỗi ký hiệu nhận diện được sẽ hiện thành một chip kèm độ tin cậy."
            action={
              <Button onClick={connect}>
                <PlugZap aria-hidden />
                Kết nối backend
              </Button>
            }
          />
        ) : (
          <GlossChips glosses={glosses} emptyHint={GLOSS_HINTS[connection]} />
        )}
      </section>

      {sentences.length > 1 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium tracking-wider text-muted-foreground uppercase">
            Câu trước đó
          </h2>
          <ul className="space-y-2 rounded-xl bg-card p-4 ring-1 ring-border">
            {sentences.slice(1).map((sentence) => (
              <li key={sentence.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm text-foreground">{sentence.text}</span>
                {sentence.glosses.length > 0 ? (
                  <span className="font-mono text-sm text-muted-foreground">
                    {sentence.glosses.join(" · ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
