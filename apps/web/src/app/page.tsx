import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <main className="flex max-w-2xl flex-col items-center gap-6 text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          Sign<span className="text-emerald-400">Bridge</span>
        </h1>
        <p className="text-lg text-zinc-400">
          Hệ thống dịch ngôn ngữ ký hiệu tiếng Việt (VSL) hai chiều, thời gian thực.
          Đồ án tốt nghiệp — 2026.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/translate"
            className="rounded-lg bg-emerald-600 px-6 py-3 font-medium hover:bg-emerald-500"
          >
            🖐️ Demo phiên dịch
          </Link>
          <span
            className="cursor-not-allowed rounded-lg bg-zinc-800 px-6 py-3 font-medium text-zinc-500"
            title="Tuần 2-3"
          >
            📖 Từ điển ký hiệu (sắp có)
          </span>
          <span
            className="cursor-not-allowed rounded-lg bg-zinc-800 px-6 py-3 font-medium text-zinc-500"
            title="Tuần 3"
          >
            🎥 Thu thập dữ liệu (sắp có)
          </span>
        </div>
      </main>
    </div>
  );
}
