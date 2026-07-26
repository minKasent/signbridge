"use client";

import { Suspense, useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Cửa đăng nhập DUY NHẤT của hệ thống — trước sprint 2 có ba form rời rạc (/login,
 * form nội tuyến trong /record, và modal quay clip). Trang cần quyền thì chuyển tới
 * đây kèm `?next=`, đăng nhập xong quay lại đúng chỗ đang làm.
 *
 * Chỉ ADMIN mới được tự chuyển đi: tài khoản USER đăng nhập xong vẫn đứng lại đây
 * kèm thông báo, tránh vòng lặp /login → /admin → /login với guard bên kia.
 * KHÔNG in tài khoản dev lên trang (lỗi bảo mật đã sửa ở sprint 1).
 */

/** Chỉ nhận đường dẫn nội bộ — `?next=https://…` là lỗ chuyển hướng mở. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/admin";
  return raw;
}

function LoginFormInner() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { auth, ready, login, logout } = useAuth();

  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Đã có phiên ADMIN mà vào /login → đi tiếp luôn, không bắt đăng nhập lại
  useEffect(() => {
    if (ready && auth?.role === "ADMIN") router.replace(next);
  }, [ready, auth, router, next]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      if (user.role !== "ADMIN") {
        setError("Tài khoản này không có quyền quản trị.");
      } else {
        router.replace(next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sai email hoặc mật khẩu");
    }
    setSubmitting(false);
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-6 py-12">
      <Card className="w-full">
        <CardHeader>
          <span className="flex items-center gap-2 text-lg font-semibold">
            <span
              className="grid size-9 place-items-center rounded-xl bg-primary font-bold text-primary-foreground"
              aria-hidden
            >
              S
            </span>
            Sign<span className="-ml-2 text-primary">Bridge</span>
          </span>
          <CardTitle className="mt-2 flex items-center gap-2 text-xl">
            <ShieldCheck className="size-5 text-primary" aria-hidden />
            Đăng nhập quản trị
          </CardTitle>
          <CardDescription>
            {next === "/admin"
              ? "Khu vực quản lý từ điển ký hiệu — cần tài khoản có quyền ADMIN."
              : "Trang bạn vừa mở cần quyền ADMIN. Đăng nhập rồi hệ thống đưa bạn về đúng chỗ đó."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor={emailId}>Email</Label>
              <Input
                id={emailId}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error !== "" ? true : undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={passwordId}>Mật khẩu</Label>
              <div className="relative">
                <Input
                  id={passwordId}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error !== "" ? true : undefined}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </Button>
              </div>
            </div>

            {error !== "" ? (
              <p role="alert" aria-live="assertive" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Đang đăng nhập…
                </>
              ) : (
                <>
                  <LogIn aria-hidden />
                  Đăng nhập
                </>
              )}
            </Button>
          </form>

          {ready && auth && auth.role !== "ADMIN" ? (
            <div className="mt-4 rounded-xl bg-muted p-3 text-sm text-muted-foreground">
              Đang đăng nhập là <span className="font-medium text-foreground">{auth.email}</span>{" "}
              (quyền {auth.role}) — không đủ quyền vào khu vực quản trị.{" "}
              <Button variant="link" size="sm" className="h-auto px-0" onClick={logout}>
                Đăng xuất
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginForm() {
  // useSearchParams cần ranh giới Suspense khi trang được kết xuất tĩnh
  return (
    <Suspense>
      <LoginFormInner />
    </Suspense>
  );
}
