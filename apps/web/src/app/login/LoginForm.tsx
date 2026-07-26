"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

/**
 * Đăng nhập quản trị. Chỉ ADMIN được tự chuyển sang /admin — tài khoản USER
 * đăng nhập xong vẫn đứng lại đây kèm thông báo, tránh vòng lặp redirect
 * /login → /admin → /login (guard bên /admin đá USER về lại đây).
 */
export default function LoginForm() {
  const router = useRouter();
  const { auth, ready, login, logout } = useAuth();

  const [email, setEmail] = useState("admin@signbridge.vn");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Đã đăng nhập ADMIN mà vào /login → chuyển thẳng /admin
  useEffect(() => {
    if (ready && auth?.role === "ADMIN") {
      router.replace("/admin");
    }
  }, [ready, auth, router]);

  async function handleSubmit() {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      if (user.role !== "ADMIN") {
        setError("Tài khoản không có quyền quản trị.");
      } else {
        router.replace("/admin");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sai email hoặc mật khẩu");
    }
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="w-96 rounded-xl bg-zinc-900 p-6">
        <h1 className="mb-1 text-xl font-bold">Đăng nhập quản trị</h1>
        <p className="mb-4 text-sm text-zinc-400">SignBridge — quản lý từ điển ký hiệu</p>

        <label className="mb-1 block text-sm text-zinc-300" htmlFor="login-email">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3 w-full rounded-lg bg-zinc-800 px-3 py-2 outline-none ring-emerald-500 focus:ring-2"
        />

        <label className="mb-1 block text-sm text-zinc-300" htmlFor="login-password">
          Mật khẩu
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className="mb-4 w-full rounded-lg bg-zinc-800 px-3 py-2 outline-none ring-emerald-500 focus:ring-2"
        />

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-lg bg-emerald-600 py-2 font-medium hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-700"
        >
          {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>

        {error && <p className="mt-3 text-sm text-amber-400">{error}</p>}

        {ready && auth && auth.role !== "ADMIN" && (
          <div className="mt-3 rounded-lg bg-zinc-800 p-3 text-sm text-zinc-300">
            Đang đăng nhập là <span className="font-medium">{auth.email}</span> (quyền {auth.role})
            — không đủ quyền vào trang quản trị.{" "}
            <button onClick={logout} className="text-sky-400 underline hover:text-sky-300">
              Đăng xuất
            </button>
          </div>
        )}

        <p className="mt-4 text-xs text-zinc-500">
          Tài khoản dev: <span className="font-mono">admin@signbridge.vn</span> /{" "}
          <span className="font-mono">signbridge-admin-dev</span>
        </p>
      </div>
    </div>
  );
}
