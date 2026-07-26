"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/landmarks";

/**
 * Từ điển ký hiệu — chịu được hàng nghìn mục: tìm kiếm phía client,
 * chỉ render tối đa MAX_SHOWN thẻ video một lúc (video preload="none",
 * bấm mới tải — không thể để 3.300 thẻ video cùng kéo dữ liệu).
 */

type Sign = {
  id: number;
  gloss: string;
  meaningVi: string;
  category: string;
  clipUrl: string | null;
};

const MAX_SHOWN = 48;

const CATEGORY_LABELS: Record<string, string> = {
  GREETING: "Chào hỏi",
  DAILY: "Đời sống",
  MEDICAL: "Y tế",
  TUDIEN: "Từ điển QIPEDC",
};

export default function DictionaryBrowser() {
  const [signs, setSigns] = useState<Sign[] | null>(null);
  const [query, setQuery] = useState("");
  const [onlyWithClip, setOnlyWithClip] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/signs`)
      .then((r) => r.json())
      .then(setSigns)
      .catch(() => setError(true));
  }, []);

  const filtered = useMemo(() => {
    if (!signs) return [];
    const q = query.trim().toLowerCase();
    return signs.filter(
      (s) =>
        (!onlyWithClip || s.clipUrl) &&
        (q === "" || s.meaningVi.toLowerCase().includes(q) || s.gloss.toLowerCase().includes(q))
    );
  }, [signs, query, onlyWithClip]);

  const shown = filtered.slice(0, MAX_SHOWN);

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <h1 className="mb-1 text-2xl font-bold">Từ điển ký hiệu VSL</h1>
      <p className="mb-4 text-sm text-zinc-400">
        {error
          ? "Không kết nối được backend :8080 — hãy chạy Spring core."
          : signs
            ? `${signs.length.toLocaleString("vi")} ký hiệu (nguồn: Từ điển NNKH quốc gia qipedc.moet.gov.vn)`
            : "Đang tải…"}
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm từ… (VD: đau bụng, cô giáo)"
          className="w-80 rounded-lg bg-zinc-900 px-3 py-2 outline-none ring-emerald-500 focus:ring-2"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={onlyWithClip}
            onChange={(e) => setOnlyWithClip(e.target.checked)}
            className="h-4 w-4 accent-emerald-500"
          />
          Chỉ hiện từ có clip
        </label>
        {signs && (
          <span className="text-sm text-zinc-500">
            {filtered.length.toLocaleString("vi")} kết quả
            {filtered.length > MAX_SHOWN && ` — hiển thị ${MAX_SHOWN} đầu tiên, gõ thêm để lọc`}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((s) => (
          <div key={s.id} className="rounded-xl bg-zinc-900 p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate font-mono text-sm text-emerald-400">{s.gloss}</span>
              <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                {CATEGORY_LABELS[s.category] ?? s.category}
              </span>
            </div>
            <p className="mb-3 text-zinc-200">“{s.meaningVi}”</p>
            {s.clipUrl ? (
              <video
                src={`${API_BASE}${s.clipUrl}`}
                controls
                muted
                preload="none"
                className="w-full rounded-lg bg-zinc-800"
              />
            ) : (
              <p className="rounded-lg bg-zinc-800/50 p-3 text-center text-xs text-zinc-500">
                Chưa có clip
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
