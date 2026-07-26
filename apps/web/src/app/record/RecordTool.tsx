"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, LogOut, Plus, RefreshCw, SearchX, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/landmarks";
import { authHeader, useAuth } from "@/lib/auth";
import { categoryLabel, normalizeGloss, useSigns, type Sign } from "@/app/dictionary/sign";
import ClipRecorder, { type RecorderPhase } from "./ClipRecorder";
import SignPicker from "./SignPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Luồng NHANH để quay bù clip cho những từ Từ điển quốc gia còn thiếu:
 * Chọn từ → Quay → Xem lại & lưu, rồi chọn từ tiếp theo (camera vẫn sáng).
 *
 * Vì sao GIỮ /record khi /admin đã có hộp thoại quay clip (quyết định A4):
 *  - /dictionary gắn liên kết sâu `?sign=GLOSS` cho từng từ thiếu clip; mở thẳng
 *    tới đây nhanh hơn là mở cả bàn làm việc quản trị rồi tìm lại dòng đó.
 *  - Hai luồng khác mục đích: /admin sửa dữ liệu, /record quay hàng loạt.
 *  - Không còn trùng lặp mã: cả hai dùng chung <ClipRecorder>, và trang này KHÔNG
 *    còn form đăng nhập riêng — chưa đăng nhập thì chuyển sang /login?next=…
 */

const RECORD_CATEGORY = "TUDIEN";

type StepState = "done" | "current" | "todo";

function RecordToolInner() {
  const router = useRouter();
  const preselect = useSearchParams().get("sign") ?? "";
  const { auth, ready, logout } = useAuth();
  const isAdmin = ready && auth?.role === "ADMIN";

  const { signs, loading, failed, reload, upsert, prepend } = useSigns(isAdmin);

  // `choice` là lựa chọn NGƯỜI DÙNG đã bấm; null nghĩa là chưa bấm gì nên còn
  // theo từ trong liên kết sâu ?sign=. Dẫn xuất trong render, không đồng bộ bằng
  // effect setState (effect như vậy gây thêm vòng render và dễ ghi đè lựa chọn).
  const [choice, setChoice] = useState<{ sign: Sign | null } | null>(null);
  const [phase, setPhase] = useState<RecorderPhase>("starting");
  const [savedId, setSavedId] = useState<number | null>(null);
  const [newWord, setNewWord] = useState("");
  const [creating, setCreating] = useState(false);

  // Guard: chờ đọc xong localStorage rồi mới quyết định; giữ lại `?sign=` để sau
  // khi đăng nhập người dùng quay về đúng từ đang định quay.
  useEffect(() => {
    if (!ready || (auth && auth.role === "ADMIN")) return;
    const target = preselect === "" ? "/record" : `/record?sign=${encodeURIComponent(preselect)}`;
    router.replace(`/login?next=${encodeURIComponent(target)}`);
  }, [ready, auth, router, preselect]);

  // Mở từ liên kết sâu /record?sign=GLOSS (nút "Quay clip" ở /dictionary)
  const preselected = useMemo(
    () => (preselect === "" ? null : (signs ?? []).find((sign) => sign.gloss === preselect) ?? null),
    [signs, preselect]
  );
  const selected = choice ? choice.sign : preselected;

  const missingClipCount = useMemo(
    () => (signs ?? []).reduce((sum, sign) => sum + (sign.clipUrl ? 0 : 1), 0),
    [signs]
  );

  function handleAuthError() {
    logout();
    toast.error("Phiên đăng nhập đã hết hạn", { description: "Hãy đăng nhập lại để tiếp tục." });
    router.replace("/login?next=/record");
  }

  async function createSign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const meaningVi = newWord.trim();
    const gloss = normalizeGloss(meaningVi);
    if (meaningVi === "" || gloss === "") {
      toast.error("Chưa nhập được từ mới", { description: "Hãy nhập nghĩa tiếng Việt của từ." });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/signs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ gloss, meaningVi, category: RECORD_CATEGORY }),
      });
      if (res.status === 401 || res.status === 403) {
        handleAuthError();
        return;
      }
      if (res.status === 409) throw new Error(`Gloss “${gloss}” đã có trong từ điển`);
      if (!res.ok) throw new Error(`Máy chủ trả lỗi ${res.status}`);
      const created: Sign = await res.json();
      prepend(created);
      setChoice({ sign: created });
      setNewWord("");
      toast.success(`Đã thêm “${created.meaningVi}”`, { description: "Giờ quay clip cho từ này." });
    } catch (e) {
      toast.error("Không thêm được từ mới", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setCreating(false);
    }
  }

  const handlePhaseChange = useCallback((next: RecorderPhase) => setPhase(next), []);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-hidden />
        <p className="mt-3 text-muted-foreground" aria-live="polite">
          Đang kiểm tra phiên đăng nhập…
        </p>
      </div>
    );
  }

  const reviewing = phase === "preview" || phase === "uploading";
  const justSaved = selected !== null && savedId === selected.id;

  const steps: { label: string; hint: string; state: StepState }[] = [
    {
      label: "Chọn từ",
      hint: selected ? selected.meaningVi : "Tìm từ còn thiếu clip",
      state: selected ? "done" : "current",
    },
    {
      label: "Quay 3 giây",
      hint: selected ? "Đếm ngược 3-2-1 rồi ra ký hiệu" : "Chọn từ trước đã",
      state: !selected ? "todo" : reviewing ? "done" : "current",
    },
    {
      label: "Xem lại & lưu",
      hint: justSaved ? "Đã lưu vào từ điển" : "Không ưng thì quay lại",
      state: justSaved ? "done" : reviewing ? "current" : "todo",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quay clip từ điển</h1>
          <p className="text-muted-foreground">
            Quay bù clip cho những từ Từ điển quốc gia còn thiếu
            {signs ? ` — còn ${missingClipCount.toLocaleString("vi")} từ chưa có clip` : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin">
              <Settings2 aria-hidden />
              Bàn quản trị
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              logout();
              router.replace("/login");
            }}
          >
            <LogOut aria-hidden />
            Đăng xuất
          </Button>
        </div>
      </header>

      <ol className="mb-6 grid gap-3 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li
            key={step.label}
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 transition-colors",
              step.state === "current"
                ? "border-primary/60 bg-primary/10"
                : step.state === "done"
                  ? "border-border bg-card"
                  : "border-dashed border-border bg-card/40"
            )}
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold",
                step.state === "done"
                  ? "bg-primary text-primary-foreground"
                  : step.state === "current"
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              )}
            >
              {step.state === "done" ? <CheckCircle2 className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{step.label}</span>
              <span className="block truncate text-sm text-muted-foreground">{step.hint}</span>
            </span>
          </li>
        ))}
      </ol>

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="aspect-[4/3] w-full" />
        </div>
      ) : failed ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <SearchX className="size-8 text-destructive" aria-hidden />
            <div role="alert">
              <p className="font-medium">Không tải được từ điển</p>
              <p className="text-sm text-muted-foreground">
                Không gọi được máy chủ ở cổng 8080. Hãy chạy Spring core rồi thử lại.
              </p>
            </div>
            <Button onClick={reload}>
              <RefreshCw aria-hidden />
              Thử lại
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4">
                <SignPicker
                  signs={signs ?? []}
                  value={selected}
                  onSelect={(sign) => setChoice({ sign })}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Từ chưa có trong từ điển?</CardTitle>
                <CardDescription>
                  Thêm rồi quay ngay. Gloss tự sinh:{" "}
                  <span className="font-mono">{normalizeGloss(newWord) || "—"}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={createSign} className="space-y-2" noValidate>
                  <Label htmlFor="record-new-word">Nghĩa tiếng Việt</Label>
                  <div className="flex gap-2">
                    <Input
                      id="record-new-word"
                      value={newWord}
                      onChange={(e) => setNewWord(e.target.value)}
                      placeholder="VD: cảm ơn"
                      autoComplete="off"
                    />
                    <Button type="submit" variant="secondary" disabled={creating}>
                      {creating ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
                      Thêm
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {selected ? (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">Đang quay: “{selected.meaningVi}”</CardTitle>
                    <CardDescription>
                      <span className="font-mono">{selected.gloss}</span> ·{" "}
                      {categoryLabel(selected.category)}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {justSaved ? (
                      <Badge>
                        <CheckCircle2 aria-hidden />
                        Đã lưu clip
                      </Badge>
                    ) : selected.clipUrl !== null ? (
                      <Badge variant="secondary">Đã có clip — quay sẽ thay thế</Badge>
                    ) : (
                      <Badge variant="destructive">Chưa có clip</Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setChoice({ sign: null });
                        setSavedId(null);
                      }}
                    >
                      Đổi từ khác
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ClipRecorder
                  key={selected.id}
                  sign={selected}
                  onPhaseChange={handlePhaseChange}
                  onAuthError={handleAuthError}
                  onUploaded={(updated) => {
                    upsert(updated);
                    setChoice({ sign: updated });
                    setSavedId(updated.id);
                    toast.success(`Đã lưu clip cho “${updated.meaningVi}”`, {
                      description: "Chọn từ khác ở cột bên trái để quay tiếp.",
                    });
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                <div className="grid size-12 place-items-center rounded-full bg-muted">
                  <Plus className="size-6 text-muted-foreground" aria-hidden />
                </div>
                <div>
                  <p className="font-medium">Chọn một từ để bật camera</p>
                  <p className="text-sm text-muted-foreground">
                    Danh sách bên trái xếp từ chưa có clip lên đầu — đó là việc cần làm trước.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default function RecordTool() {
  // useSearchParams cần ranh giới Suspense khi trang được kết xuất tĩnh
  return (
    <Suspense>
      <RecordToolInner />
    </Suspense>
  );
}
