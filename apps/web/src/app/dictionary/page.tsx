import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Từ điển ký hiệu | SignBridge",
};

type Sign = {
  id: number;
  gloss: string;
  meaningVi: string;
  category: string;
  clipUrl: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

const CATEGORY_LABELS: Record<string, string> = {
  GREETING: "Chào hỏi",
  DAILY: "Đời sống",
  MEDICAL: "Y tế",
};

async function getSigns(): Promise<Sign[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/signs`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function DictionaryPage() {
  const signs = await getSigns();

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <h1 className="mb-1 text-2xl font-bold">Từ điển ký hiệu VSL</h1>
      <p className="mb-6 text-sm text-zinc-400">
        {signs ? `${signs.length} ký hiệu` : "Không kết nối được backend :8080 — hãy chạy Spring core."}
      </p>

      {signs && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {signs.map((s) => (
            <div key={s.id} className="rounded-xl bg-zinc-900 p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-mono text-lg text-emerald-400">{s.gloss}</span>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                  {CATEGORY_LABELS[s.category] ?? s.category}
                </span>
              </div>
              <p className="mb-3 text-zinc-300">“{s.meaningVi}”</p>
              {s.clipUrl ? (
                <video
                  src={`${API_BASE}${s.clipUrl}`}
                  controls
                  muted
                  loop
                  className="w-full rounded-lg"
                />
              ) : (
                <p className="rounded-lg bg-zinc-800/50 p-3 text-center text-xs text-zinc-500">
                  Chưa có clip mẫu — sẽ quay ở tuần 10
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
