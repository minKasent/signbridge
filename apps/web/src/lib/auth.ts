"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "./landmarks";

/**
 * Auth phía client: JWT lưu localStorage (đủ cho công cụ nội bộ của đồ án;
 * nếu mở public thì chuyển sang httpOnly cookie — ghi chú ở chương bảo mật).
 */

const TOKEN_KEY = "signbridge.token";
const USER_KEY = "signbridge.user";

export type AuthUser = { email: string; name: string; role: string };

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? "Sai email hoặc mật khẩu" : `Lỗi ${res.status}`);
  }
  const data = await res.json();
  localStorage.setItem(TOKEN_KEY, data.token);
  const user: AuthUser = { email: data.email, name: data.name, role: data.role };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  try {
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Hook phiên đăng nhập cho client component. `ready` = đã đọc xong localStorage
 * sau hydrate — guard trang admin phải chờ ready mới quyết định redirect,
 * không thì lần render đầu (auth còn null) sẽ đá nhầm người đã đăng nhập.
 */
export function useAuth() {
  const [auth, setAuth] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // queueMicrotask: không setState đồng bộ trong effect, không lệch hydration
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setAuth(getUser());
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const doLogin = useCallback(async (email: string, password: string) => {
    const user = await login(email, password);
    setAuth(user);
    return user;
  }, []);

  const doLogout = useCallback(() => {
    logout();
    setAuth(null);
  }, []);

  return { auth, ready, login: doLogin, logout: doLogout };
}
