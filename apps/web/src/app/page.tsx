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
          <Link
            href="/speak"
            className="rounded-lg bg-amber-600 px-6 py-3 font-medium hover:bg-amber-500"
          >
            🗣️ Nói → Ký hiệu
          </Link>
          <Link
            href="/dictionary"
            className="rounded-lg bg-sky-600 px-6 py-3 font-medium hover:bg-sky-500"
          >
            📖 Từ điển ký hiệu
          </Link>
          <Link
            href="/collect"
            className="rounded-lg bg-violet-600 px-6 py-3 font-medium hover:bg-violet-500"
          >
            🎥 Thu thập dữ liệu
          </Link>
        </div>
      </main>
    </div>
  );
}
