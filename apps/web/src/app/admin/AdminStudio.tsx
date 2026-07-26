"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/landmarks";
import { authHeader, useAuth } from "@/lib/auth";
import RecordClipModal from "./RecordClipModal";

/**
 * Trang quản trị từ điển: bảng ~3.300 ký hiệu (tìm kiếm + phân trang client
 * 50 dòng/trang — KHÔNG render tất cả), tạo/sửa/xóa ký hiệu, quay clip trong
 * modal. Guard client-side: chưa đăng nhập hoặc không phải ADMIN → về /login.
 */

type Sign = { id: number; gloss: string; meaningVi: string; category: string; clipUrl: string | null };

const PAGE_SIZE = 50;

/** "cảm ơn" → "CAM_ON": bỏ dấu, viết hoa, ký tự lạ thành "_". */
function normalizeGloss(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export default function AdminStudio() {
  const router = useRouter();
  const { auth, ready, logout } = useAuth();
  const isAdmin = ready && auth?.role === "ADMIN";

  const [signs, setSigns] = useState<Sign[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");

  // Form tạo mới
  const [newGloss, setNewGloss] = useState("");
  const [newMeaning, setNewMeaning] = useState("");
  const [newCategory, setNewCategory] = useState("TUDIEN");

  // Dòng đang sửa
  const [editing, setEditing] = useState<{ id: number; meaningVi: string; category: string } | null>(null);

  // Modal
  const [recordSign, setRecordSign] = useState<Sign | null>(null);
  const [previewClip, setPreviewClip] = useState<{ sign: Sign; url: string } | null>(null);

  // Guard: chờ đọc xong localStorage (ready) rồi mới quyết định đá về /login
  useEffect(() => {
    if (ready && (!auth || auth.role !== "ADMIN")) {
      router.replace("/login");
    }
  }, [ready, auth, router]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/signs`)
      .then((r) => r.json())
      .then((list: Sign[]) => {
        // Mới nhất lên đầu — từ admin tự thêm nổi lên trên 3.300 từ import sẵn
        if (!cancelled) setSigns([...list].sort((a, b) => b.id - a.id));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const filtered = useMemo(() => {
    if (!signs) return [];
    const q = query.trim().toLowerCase();
    return signs.filter(
      (s) => q === "" || s.meaningVi.toLowerCase().includes(q) || s.gloss.toLowerCase().includes(q)
    );
  }, [signs, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function applyUpdate(updated: Sign) {
    setSigns((prev) => (prev ? prev.map((s) => (s.id === updated.id ? updated : s)) : prev));
  }

  /**
   * Token hết hạn giữa phiên: PHẢI xóa session localStorage rồi mới về /login —
   * chỉ hiện thông báo thì /login thấy role ADMIN cũ sẽ bounce ngược về /admin,
   * người dùng không có cách đăng nhập lại.
   */
  function handleAuthError() {
    logout();
    router.replace("/login");
  }

  async function createSign() {
    const gloss = normalizeGloss(newGloss);
    const meaningVi = newMeaning.trim();
    const category = newCategory.trim().toUpperCase() || "TUDIEN";
    if (!gloss || !meaningVi) {
      setMessage("❌ Cần nhập cả gloss và nghĩa tiếng Việt.");
      return;
    }
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/signs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ gloss, meaningVi, category }),
      });
      if (res.status === 409) throw new Error(`Gloss "${gloss}" đã tồn tại`);
      if (res.status === 401 || res.status === 403) {
        handleAuthError();
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created: Sign = await res.json();
      setSigns((prev) => (prev ? [created, ...prev] : [created]));
      setNewGloss("");
      setNewMeaning("");
      setQuery("");
      setPage(0);
      setMessage(`✅ Đã thêm "${created.meaningVi}" (${created.gloss}) — giờ quay clip cho nó.`);
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : e}`);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const meaningVi = editing.meaningVi.trim();
    const category = editing.category.trim().toUpperCase();
    if (!meaningVi || !category) {
      setMessage("❌ Nghĩa và chủ đề không được để trống.");
      return;
    }
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/signs/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ meaningVi, category }),
      });
      if (res.status === 401 || res.status === 403) {
        handleAuthError();
        return;
      }
      if (res.status === 404) throw new Error("Ký hiệu không còn tồn tại");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Sign = await res.json();
      applyUpdate(updated);
      setEditing(null);
      setMessage(`✅ Đã sửa "${updated.meaningVi}".`);
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : e}`);
    }
  }

  async function deleteSign(sign: Sign) {
    if (!window.confirm(`Xóa "${sign.meaningVi}" (${sign.gloss})? Clip mẫu (nếu có) cũng bị xóa.`)) {
      return;
    }
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/signs/${sign.id}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (res.status === 401 || res.status === 403) {
        handleAuthError();
        return;
      }
      if (res.status === 404) throw new Error("Ký hiệu không còn tồn tại");
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
      setSigns((prev) => (prev ? prev.filter((s) => s.id !== sign.id) : prev));
      setMessage(`✅ Đã xóa "${sign.meaningVi}".`);
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : e}`);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Đang kiểm tra phiên đăng nhập…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Quản trị từ điển</h1>
          <p className="text-sm text-zinc-400">
            {signs
              ? `${signs.length.toLocaleString("vi")} ký hiệu · ${signs
                  .filter((s) => s.clipUrl)
                  .length.toLocaleString("vi")} có clip`
              : loadError
                ? "Không kết nối được backend :8080."
                : "Đang tải từ điển…"}{" "}
            — {auth?.name}
          </p>
        </div>
        <button
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
        >
          Đăng xuất
        </button>
      </div>

      <div className="mb-4 rounded-xl bg-zinc-900 p-4">
        <p className="mb-2 text-sm font-medium text-zinc-300">Thêm ký hiệu mới</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={newGloss}
            onChange={(e) => setNewGloss(e.target.value)}
            placeholder="Gloss (VD: CAM_ON)"
            className="w-44 rounded-lg bg-zinc-800 px-3 py-2 font-mono text-sm outline-none ring-emerald-500 focus:ring-2"
          />
          <input
            value={newMeaning}
            onChange={(e) => setNewMeaning(e.target.value)}
            placeholder="Nghĩa tiếng Việt (VD: cảm ơn)"
            className="w-56 rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
          />
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createSign()}
            placeholder="Chủ đề (VD: GREETING)"
            className="w-44 rounded-lg bg-zinc-800 px-3 py-2 font-mono text-sm outline-none ring-emerald-500 focus:ring-2"
          />
          <button
            onClick={createSign}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
          >
            + Thêm
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Gloss tự chuẩn hóa (bỏ dấu, viết hoa, “ ” → “_”). Gloss không đổi được sau khi tạo —
          dataset tham chiếu theo gloss.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Tìm theo nghĩa hoặc gloss…"
          className="w-80 rounded-lg bg-zinc-900 px-3 py-2 outline-none ring-emerald-500 focus:ring-2"
        />
        <span className="text-sm text-zinc-500">
          {filtered.length.toLocaleString("vi")} kết quả · trang {safePage + 1}/{totalPages}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹ Trước
          </button>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            disabled={safePage >= totalPages - 1}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Sau ›
          </button>
        </div>
      </div>

      {message && <p className="mb-3 text-sm">{message}</p>}

      <div className="overflow-x-auto rounded-xl bg-zinc-900">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400">
              <th className="px-4 py-3 font-medium">Gloss</th>
              <th className="px-4 py-3 font-medium">Nghĩa tiếng Việt</th>
              <th className="px-4 py-3 font-medium">Chủ đề</th>
              <th className="px-4 py-3 font-medium">Clip</th>
              <th className="px-4 py-3 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((s) => (
              <tr key={s.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40">
                <td className="px-4 py-2 font-mono text-emerald-400">{s.gloss}</td>
                {editing?.id === s.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        value={editing.meaningVi}
                        onChange={(e) => setEditing({ ...editing, meaningVi: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        className="w-full rounded-lg bg-zinc-800 px-2 py-1 outline-none ring-emerald-500 focus:ring-2"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={editing.category}
                        onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        className="w-32 rounded-lg bg-zinc-800 px-2 py-1 font-mono outline-none ring-emerald-500 focus:ring-2"
                      />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2">{s.meaningVi}</td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-400">{s.category}</td>
                  </>
                )}
                <td className="px-4 py-2">
                  {s.clipUrl ? (
                    <button
                      onClick={() =>
                        setPreviewClip({ sign: s, url: `${API_BASE}${s.clipUrl}?v=${Date.now()}` })
                      }
                      className="rounded-lg bg-zinc-800 px-2.5 py-1 text-emerald-400 hover:bg-zinc-700"
                    >
                      ▶ Xem
                    </button>
                  ) : (
                    <button
                      onClick={() => setRecordSign(s)}
                      className="rounded-lg bg-sky-700 px-2.5 py-1 hover:bg-sky-600"
                    >
                      🎥 Quay clip
                    </button>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {editing?.id === s.id ? (
                    <>
                      <button
                        onClick={saveEdit}
                        className="mr-2 rounded-lg bg-emerald-600 px-2.5 py-1 hover:bg-emerald-500"
                      >
                        Lưu
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded-lg bg-zinc-800 px-2.5 py-1 hover:bg-zinc-700"
                      >
                        Hủy
                      </button>
                    </>
                  ) : (
                    <>
                      {s.clipUrl && (
                        <button
                          onClick={() => setRecordSign(s)}
                          className="mr-2 rounded-lg bg-zinc-800 px-2.5 py-1 hover:bg-zinc-700"
                          title="Quay clip thay thế"
                        >
                          🎥
                        </button>
                      )}
                      <button
                        onClick={() => setEditing({ id: s.id, meaningVi: s.meaningVi, category: s.category })}
                        className="mr-2 rounded-lg bg-zinc-800 px-2.5 py-1 hover:bg-zinc-700"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => deleteSign(s)}
                        className="rounded-lg bg-zinc-800 px-2.5 py-1 text-red-400 hover:bg-red-900/40"
                      >
                        Xóa
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  {signs ? "Không thấy ký hiệu nào khớp." : loadError ? "Không tải được từ điển." : "Đang tải…"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {recordSign && (
        <RecordClipModal
          sign={recordSign}
          onClose={() => setRecordSign(null)}
          onUploaded={(updated) => {
            applyUpdate(updated);
            setRecordSign(null);
            setMessage(`✅ Đã lưu clip cho "${updated.meaningVi}".`);
          }}
          onAuthError={handleAuthError}
        />
      )}

      {previewClip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewClip(null)}
        >
          <div
            className="w-full max-w-xl rounded-xl bg-zinc-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-300">
                “{previewClip.sign.meaningVi}” —{" "}
                <span className="font-mono text-emerald-400">{previewClip.sign.gloss}</span>
              </p>
              <button
                onClick={() => setPreviewClip(null)}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
              >
                ✕ Đóng
              </button>
            </div>
            <video src={previewClip.url} controls autoPlay loop className="w-full rounded-lg bg-zinc-800" />
          </div>
        </div>
      )}
    </div>
  );
}
