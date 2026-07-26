"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { WS_URL } from "@/lib/landmarks";

/**
 * Vòng đời WebSocket /ws/translate dùng chung cho /translate (webcam) và /video (file).
 *
 * Trước đây hai trang chép lại cùng một đoạn code và cùng thiếu `onerror`: backend
 * chết thì trang hỏng trong im lặng, nút vẫn hiện như thường. Gom về một chỗ để
 * cả hai trang cùng có: báo lỗi kết nối, chống JSON hỏng, và cách reset phiên đúng.
 *
 * Giao thức (xem LandmarkWebSocketHandler):
 *   gửi  {"type":"frames","frames":[[144 số], …]} · {"type":"flush"} = CHỐT CÂU
 *   nhận {"type":"gloss",…} · {"type":"sentence",…}
 * KHÔNG có lệnh hủy phiên — muốn xóa sạch đệm phía server phải đóng/mở lại socket.
 */

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export type GlossItem = {
  /** Khóa React ổn định (không dùng Date.now() — hai gloss có thể về cùng mili-giây). */
  id: string;
  gloss: string;
  confidence: number;
  /** Mốc trong video, chỉ trang /video dùng. */
  videoTime?: number;
};

export type SentenceItem = {
  id: string;
  text: string;
  glosses: string[];
  source: string;
};

/** Số frame gom lại trước khi gửi một lô — cân bằng độ trễ và số tin nhắn. */
const FRAME_BATCH = 5;
const MAX_GLOSSES = 60;
const MAX_SENTENCES = 10;
/** Trần đệm khi socket chưa mở: giữ 2 lô gần nhất, bỏ frame cũ hơn. */
const MAX_PENDING_FRAMES = FRAME_BATCH * 2;

type Options = {
  /** Thông tin gắn thêm cho mỗi gloss lúc nhận (VD mốc thời gian của video). */
  glossMeta?: () => { videoTime?: number };
  /** Gọi khi có câu mới — trang tự quyết định đọc thành tiếng hay không. */
  onSentence?: (sentence: SentenceItem) => void;
};

export function useTranslationSocket({ glossMeta, onSentence }: Options = {}) {
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [glosses, setGlosses] = useState<GlossItem[]>([]);
  const [sentences, setSentences] = useState<SentenceItem[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const frameBufferRef = useRef<number[][]>([]);
  /** Bộ đếm sinh khóa React ổn định cho gloss/câu. */
  const seqRef = useRef(0);

  // Callback đổi mỗi lần render — giữ trong ref để handler của socket luôn đọc
  // bản mới nhất mà không phải mở lại kết nối (gán trong effect, không gán khi render).
  const glossMetaRef = useRef(glossMeta);
  const onSentenceRef = useRef(onSentence);
  useEffect(() => {
    glossMetaRef.current = glossMeta;
    onSentenceRef.current = onSentence;
  }, [glossMeta, onSentence]);

  const openSocket = useCallback(() => {
    frameBufferRef.current = [];
    setConnection("connecting");

    let opened = false;
    let intentional = false;
    const ws = new WebSocket(WS_URL);

    // Mọi handler kiểm tra "còn là socket hiện tại không" — event của socket cũ
    // đóng lại không được đè lên trạng thái của kết nối mới.
    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      opened = true;
      setConnection("connected");
      // Xả frame đã đệm trong lúc chờ kết nối (video có thể phát ngay khi bấm)
      if (frameBufferRef.current.length > 0) {
        ws.send(JSON.stringify({ type: "frames", frames: frameBufferRef.current }));
        frameBufferRef.current = [];
      }
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      // Chỉ đổi trạng thái ở đây; thông báo để onclose lo — onerror luôn kéo
      // theo onclose nên báo cả hai chỗ sẽ ra hai toast cho cùng một sự cố.
      setConnection("error");
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (intentional) {
        setConnection("disconnected");
        return;
      }
      setConnection("error");
      toast.error(
        opened ? "Mất kết nối tới backend" : "Không kết nối được backend",
        { description: "Kiểm tra dịch vụ core đang chạy ở cổng 8080 rồi kết nối lại." }
      );
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      let msg: { type?: string; gloss?: string; confidence?: number; text?: string; glosses?: string[]; source?: string };
      try {
        msg = JSON.parse(event.data as string);
      }
      catch {
        // Tin nhắn hỏng không được làm chết handler — phiên vẫn phải chạy tiếp
        return;
      }

      if (msg.type === "gloss" && typeof msg.gloss === "string") {
        seqRef.current += 1;
        const item: GlossItem = {
          id: `gloss-${seqRef.current}`,
          gloss: msg.gloss,
          confidence: typeof msg.confidence === "number" ? msg.confidence : 0,
          ...glossMetaRef.current?.(),
        };
        setGlosses((prev) => [item, ...prev].slice(0, MAX_GLOSSES));
        return;
      }

      if (msg.type === "sentence" && typeof msg.text === "string") {
        seqRef.current += 1;
        const item: SentenceItem = {
          id: `sentence-${seqRef.current}`,
          text: msg.text,
          glosses: Array.isArray(msg.glosses) ? msg.glosses : [],
          source: typeof msg.source === "string" ? msg.source : "",
        };
        setSentences((prev) => [item, ...prev].slice(0, MAX_SENTENCES));
        onSentenceRef.current?.(item);
      }
    };

    wsRef.current = ws;
    return () => {
      intentional = true;
    };
  }, []);

  /** Đóng chủ động: cờ intentional để onclose không báo "mất kết nối". */
  const closeCurrent = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current) return;
    closeCurrent.current = openSocket();
  }, [openSocket]);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    closeCurrent.current?.();
    wsRef.current = null;
    ws.close();
    setConnection("disconnected");
  }, []);

  const clearResults = useCallback(() => {
    setGlosses([]);
    setSentences([]);
  }, []);

  /**
   * Bắt đầu lại phiên dịch phía server. Giao thức không có lệnh hủy: "flush" là
   * CHỐT CÂU (server ghép câu từ gloss đang đệm rồi gửi ngược về sau vài giây,
   * đè lên kết quả vừa xóa). Đóng phiên thì server tự dọn cả đệm frame lẫn gloss.
   */
  const reset = useCallback(() => {
    if (!wsRef.current) {
      clearResults();
      return;
    }
    const old = wsRef.current;
    closeCurrent.current?.();
    wsRef.current = null; // handler của socket cũ tự vô hiệu nhờ guard wsRef
    old.close();
    clearResults();
    closeCurrent.current = openSocket();
  }, [clearResults, openSocket]);

  /** Đẩy một frame 144 chiều vào lô; đủ lô thì gửi. */
  const pushFrame = useCallback((frame: number[]) => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING) return;

    frameBufferRef.current.push(frame);
    if (ws.readyState === WebSocket.OPEN && frameBufferRef.current.length >= FRAME_BATCH) {
      ws.send(JSON.stringify({ type: "frames", frames: frameBufferRef.current }));
      frameBufferRef.current = [];
      return;
    }
    if (frameBufferRef.current.length > MAX_PENDING_FRAMES) {
      frameBufferRef.current = frameBufferRef.current.slice(-MAX_PENDING_FRAMES);
    }
  }, []);

  /** Gửi nốt frame còn đọng rồi yêu cầu server chốt câu ngay. */
  const flush = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    if (frameBufferRef.current.length > 0) {
      ws.send(JSON.stringify({ type: "frames", frames: frameBufferRef.current }));
      frameBufferRef.current = [];
    }
    ws.send(JSON.stringify({ type: "flush" }));
  }, []);

  // Rời trang thì đóng socket, không để lại phiên treo phía server
  useEffect(() => {
    return () => {
      closeCurrent.current?.();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return {
    connection,
    glosses,
    sentences,
    latest: sentences[0] ?? null,
    connect,
    disconnect,
    reset,
    clearResults,
    pushFrame,
    flush,
  };
}
