"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/lib/landmarks";

/**
 * Lớp dữ liệu từ điển dùng chung cho /dictionary, /admin và /record.
 * Trước sprint 2 mỗi trang tự khai báo lại `type Sign`, tự chuẩn hóa gloss và tự
 * fetch — ba bản sao lệch nhau (trang này bỏ dấu khi tìm, trang kia thì không).
 */

export type Sign = {
  id: number;
  gloss: string;
  meaningVi: string;
  category: string;
  clipUrl: string | null;
};

const COMBINING_MARKS = /[̀-ͯ]/g;
const NON_GLOSS_CHARS = /[^A-Z0-9]+/g;
const EDGE_UNDERSCORES = /^_+|_+$/g;

export const CATEGORY_LABELS: Record<string, string> = {
  GREETING: "Chào hỏi",
  DAILY: "Đời sống",
  MEDICAL: "Y tế",
  TUDIEN: "Từ điển QIPEDC",
  CHUCAI: "Bảng chữ cái",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/**
 * Bỏ dấu + hạ chữ để so khớp. Nhờ vậy gõ "cam on" vẫn ra "cảm ơn" — người trình
 * chiếu gõ nhanh và thường không bỏ dấu, còn kho QIPEDC thì có dấu đầy đủ.
 */
export function foldVi(text: string): string {
  return text
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/** "cảm ơn" → "CAM_ON": gloss là nhãn dataset nên chỉ nhận A-Z, 0-9 và "_". */
export function normalizeGloss(raw: string): string {
  return foldVi(raw)
    .toUpperCase()
    .replace(NON_GLOSS_CHARS, "_")
    .replace(EDGE_UNDERSCORES, "")
    .slice(0, 60);
}

/**
 * URL clip đầy đủ. `version` tăng dần sau mỗi lần quay clip thay thế để né cache
 * browser — tên file clip đặt theo id nên URL không tự đổi khi nội dung đổi.
 */
export function clipSrc(sign: Sign, version = 0): string | null {
  if (!sign.clipUrl) return null;
  return version > 0 ? `${API_BASE}${sign.clipUrl}?v=${version}` : `${API_BASE}${sign.clipUrl}`;
}

/**
 * Diễn giải lỗi ra tiếng Việt. `fetch` thất bại vì mất mạng/backend chết ném
 * TypeError với thông điệp tiếng Anh ("Failed to fetch") — bê nguyên lên giao
 * diện là vi phạm quy ước tiếng Việt 100% và người dùng cũng không hiểu.
 */
export function describeError(error: unknown): string {
  if (error instanceof TypeError) return "Không kết nối được máy chủ (cổng 8080).";
  if (error instanceof DOMException && error.name === "AbortError") return "Yêu cầu bị hủy.";
  if (error instanceof Error && error.message !== "") return error.message;
  return "Lỗi không xác định.";
}

export type SearchEntry = { sign: Sign; haystack: string };

/**
 * Chỉ mục tìm kiếm: chuẩn hóa 3.331 chuỗi MỘT lần thay vì bỏ dấu lại toàn bộ
 * danh sách sau từng ký tự người dùng gõ.
 */
export function buildSearchIndex(signs: Sign[]): SearchEntry[] {
  return signs.map((sign) => ({
    sign,
    haystack: foldVi(`${sign.meaningVi} ${sign.gloss}`),
  }));
}

export function searchSigns(index: SearchEntry[], query: string): Sign[] {
  const needle = foldVi(query.trim());
  const found: Sign[] = [];
  for (const entry of index) {
    if (needle === "" || entry.haystack.includes(needle)) found.push(entry.sign);
  }
  return found;
}

export type SignsResult = {
  signs: Sign[] | null;
  loading: boolean;
  failed: boolean;
  /** Gọi lại API — dùng cho nút "Thử lại" của trạng thái lỗi. */
  reload: () => void;
  upsert: (sign: Sign) => void;
  prepend: (sign: Sign) => void;
  remove: (id: number) => void;
};

/**
 * Tải toàn bộ từ điển một lần rồi lọc phía client (kho ~3.331 mục — một lần tải
 * đổi lấy tìm kiếm tức thì khi trình chiếu, chấp nhận được).
 * `enabled` để trang quản trị chờ xác thực xong mới gọi API.
 */
export function useSigns(enabled = true): SignsResult {
  const [signs, setSigns] = useState<Sign[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/signs`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list: Sign[] = await res.json();
        if (!controller.signal.aborted) {
          setSigns(list);
          setFailed(false);
        }
      } catch {
        // Effect bị hủy (StrictMode, rời trang) không phải lỗi tải
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [enabled, attempt]);

  const reload = useCallback(() => {
    setSigns(null);
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  const upsert = useCallback((sign: Sign) => {
    setSigns((prev) => (prev ? prev.map((s) => (s.id === sign.id ? sign : s)) : prev));
  }, []);

  const prepend = useCallback((sign: Sign) => {
    setSigns((prev) => (prev ? [sign, ...prev] : [sign]));
  }, []);

  const remove = useCallback((id: number) => {
    setSigns((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
  }, []);

  return {
    signs,
    loading: enabled && signs === null && !failed,
    failed,
    reload,
    upsert,
    prepend,
    remove,
  };
}
