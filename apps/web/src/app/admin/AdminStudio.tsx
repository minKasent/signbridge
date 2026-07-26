"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowUpNarrowWide,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  SearchX,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { API_BASE } from "@/lib/landmarks";
import { authHeader, useAuth } from "@/lib/auth";
import {
  buildSearchIndex,
  categoryLabel,
  clipSrc,
  normalizeGloss,
  searchSigns,
  useSigns,
  type Sign,
} from "@/app/dictionary/sign";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Bàn làm việc quản trị từ điển: bảng ~3.331 ký hiệu (tìm kiếm bỏ dấu, sắp xếp,
 * phân trang 50 dòng), thêm/sửa/xóa và quay clip.
 *
 * Hộp thoại quay clip nạp động: nó kéo theo lõi MediaRecorder + xử lý camera mà
 * phần lớn phiên quản trị không mở tới (quy tắc bundle-dynamic-imports).
 */
const RecordClipDialog = dynamic(() => import("./RecordClipDialog"), { ssr: false });

const PAGE_SIZE = 50;

type SortMode = "moi-nhat" | "gloss" | "nghia" | "thieu-clip";

const SORT_LABELS: Record<SortMode, string> = {
  "moi-nhat": "Mới nhất",
  gloss: "Gloss A → Z",
  nghia: "Nghĩa A → Z",
  "thieu-clip": "Thiếu clip trước",
};

function sortSigns(signs: Sign[], mode: SortMode): Sign[] {
  const sorted = [...signs];
  switch (mode) {
    case "gloss":
      return sorted.sort((a, b) => a.gloss.localeCompare(b.gloss, "vi"));
    case "nghia":
      return sorted.sort((a, b) => a.meaningVi.localeCompare(b.meaningVi, "vi"));
    case "thieu-clip":
      return sorted.sort(
        (a, b) =>
          Number(Boolean(a.clipUrl)) - Number(Boolean(b.clipUrl)) ||
          a.meaningVi.localeCompare(b.meaningVi, "vi")
      );
    default:
      return sorted.sort((a, b) => b.id - a.id);
  }
}

/** aria-sort để trình đọc màn hình biết bảng đang xếp theo cột nào. */
function ariaSort(mode: SortMode, column: SortMode): "ascending" | "none" {
  return mode === column ? "ascending" : "none";
}

/**
 * Đầu cột bấm được để đổi cách sắp xếp — đổi bằng chuột/bàn phím ngay tại bảng,
 * không phải đi tìm ô "Sắp xếp" (ô đó vẫn còn vì "Mới nhất" không thuộc cột nào).
 */
function SortableHead({
  column,
  sort,
  onSort,
  children,
}: {
  column: SortMode;
  sort: SortMode;
  onSort: (mode: SortMode) => void;
  children: React.ReactNode;
}) {
  const active = sort === column;
  return (
    <TableHead aria-sort={ariaSort(sort, column)} className="p-0">
      <Button
        variant="ghost"
        size="sm"
        className="h-10 w-full justify-start rounded-none px-3 font-medium"
        onClick={() => onSort(column)}
        aria-label={`Sắp xếp theo ${SORT_LABELS[column]}`}
      >
        {children}
        <ArrowUpNarrowWide
          className={active ? "text-primary" : "text-muted-foreground/40"}
          aria-hidden
        />
      </Button>
    </TableHead>
  );
}

export default function AdminStudio() {
  const router = useRouter();
  const { auth, ready, logout } = useAuth();
  const isAdmin = ready && auth?.role === "ADMIN";

  const { signs, loading, failed, reload, upsert, prepend, remove } = useSigns(isAdmin);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("moi-nhat");
  const [onlyMissingClip, setOnlyMissingClip] = useState(false);
  // Trang hiện tại GẮN với bộ lọc sinh ra nó: đổi tìm kiếm/sắp xếp là tự về trang
  // 1, không cần effect setState (effect như vậy tạo thêm một vòng render).
  const [pageState, setPageState] = useState({ key: "", page: 0 });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Sign | null>(null);
  const [deleting, setDeleting] = useState<Sign | null>(null);
  const [recording, setRecording] = useState<Sign | null>(null);
  const [previewing, setPreviewing] = useState<Sign | null>(null);
  const [busy, setBusy] = useState(false);
  // Số lần clip của mỗi ký hiệu bị thay: dùng làm tham số né cache, KHÔNG dùng
  // Date.now() (khóa/URL sinh từ thời điểm là nguồn lỗi đã bắt ở sprint 1)
  const [clipVersions, setClipVersions] = useState<Record<number, number>>({});

  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  // Guard: chờ đọc xong localStorage rồi mới quyết định — đá sớm sẽ đá cả người đã đăng nhập
  useEffect(() => {
    if (ready && (!auth || auth.role !== "ADMIN")) {
      router.replace("/login?next=/admin");
    }
  }, [ready, auth, router]);

  const index = useMemo(() => buildSearchIndex(signs ?? []), [signs]);

  const filtered = useMemo(() => {
    const found = searchSigns(index, deferredQuery);
    const scoped = onlyMissingClip ? found.filter((sign) => sign.clipUrl === null) : found;
    return sortSigns(scoped, sort);
  }, [index, deferredQuery, onlyMissingClip, sort]);

  const filterKey = `${deferredQuery}|${onlyMissingClip}|${sort}`;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Kẹp lại cả khi xóa bớt ký hiệu làm số trang giảm xuống dưới trang đang xem
  const safePage = Math.min(pageState.key === filterKey ? pageState.page : 0, totalPages - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const goToPage = (next: number) => setPageState({ key: filterKey, page: next });

  const total = signs?.length ?? 0;
  const withClip = useMemo(
    () => (signs ?? []).reduce((sum, sign) => sum + (sign.clipUrl ? 1 : 0), 0),
    [signs]
  );
  const clipPercent = total === 0 ? 0 : Math.round((withClip / total) * 100);

  /**
   * Token hết hạn giữa phiên: PHẢI xóa session rồi mới về /login — chỉ hiện thông
   * báo thì /login thấy role ADMIN cũ trong localStorage sẽ bật ngược về /admin.
   */
  function handleAuthError() {
    logout();
    toast.error("Phiên đăng nhập đã hết hạn", { description: "Hãy đăng nhập lại để tiếp tục." });
    router.replace("/login?next=/admin");
  }

  async function createSign(gloss: string, meaningVi: string, category: string) {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/signs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ gloss, meaningVi, category }),
      });
      if (res.status === 401 || res.status === 403) {
        handleAuthError();
        return;
      }
      if (res.status === 409) throw new Error(`Gloss “${gloss}” đã có trong từ điển`);
      if (!res.ok) throw new Error(`Máy chủ trả lỗi ${res.status}`);
      const created: Sign = await res.json();
      prepend(created);
      setCreating(false);
      setQuery("");
      setSort("moi-nhat");
      toast.success(`Đã thêm “${created.meaningVi}”`, {
        description: "Bước tiếp theo: quay clip mẫu cho ký hiệu này.",
        action: { label: "Quay clip", onClick: () => setRecording(created) },
      });
    } catch (e) {
      toast.error("Không thêm được ký hiệu", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(sign: Sign, meaningVi: string, category: string) {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/signs/${sign.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ meaningVi, category }),
      });
      if (res.status === 401 || res.status === 403) {
        handleAuthError();
        return;
      }
      if (res.status === 404) throw new Error("Ký hiệu không còn tồn tại — hãy tải lại danh sách");
      if (!res.ok) throw new Error(`Máy chủ trả lỗi ${res.status}`);
      const updated: Sign = await res.json();
      upsert(updated);
      setEditing(null);
      toast.success(`Đã lưu “${updated.meaningVi}”`);
    } catch (e) {
      toast.error("Không lưu được thay đổi", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(sign: Sign) {
    setBusy(true);
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
      if (!res.ok && res.status !== 204) throw new Error(`Máy chủ trả lỗi ${res.status}`);
      remove(sign.id);
      setDeleting(null);
      toast.success(`Đã xóa “${sign.meaningVi}”`);
    } catch (e) {
      toast.error("Không xóa được ký hiệu", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

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

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quản trị từ điển</h1>
          <p className="text-muted-foreground">
            Thêm, sửa, xóa ký hiệu và quay clip mẫu — đang đăng nhập: {auth?.name}
          </p>
        </div>
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
      </header>

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-4 py-4">
          <div className="min-w-56 flex-1">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <p className="text-sm text-muted-foreground">Tiến độ clip mẫu</p>
              <p className="text-2xl font-semibold tabular-nums">
                {withClip.toLocaleString("vi")}
                <span className="text-base font-normal text-muted-foreground">
                  /{total.toLocaleString("vi")} ký hiệu
                </span>
              </p>
            </div>
            <Progress value={clipPercent} aria-label={`Đã có clip cho ${clipPercent}% ký hiệu`} />
          </div>
          <Button size="lg" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Thêm ký hiệu
          </Button>
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor="admin-search">Tìm ký hiệu</Label>
          <div className="relative">
            <Input
              id="admin-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Theo nghĩa hoặc gloss, không cần dấu…"
              autoComplete="off"
              className="pr-9"
            />
            {query !== "" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Xóa từ khóa tìm kiếm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setQuery("")}
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-sort">Sắp xếp</Label>
          <Select value={sort} onValueChange={(value) => setSort(value as SortMode)}>
            <SelectTrigger id="admin-sort" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {SORT_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant={onlyMissingClip ? "secondary" : "outline"}
          size="lg"
          aria-pressed={onlyMissingClip}
          onClick={() => setOnlyMissingClip((v) => !v)}
        >
          <Video aria-hidden />
          Chỉ ký hiệu thiếu clip
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2" aria-live="polite" aria-busy>
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
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
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <SearchX className="size-8 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">
                {query !== "" ? `Không tìm thấy “${query}”` : "Không còn ký hiệu nào khớp bộ lọc"}
              </p>
              <p className="text-sm text-muted-foreground">
                {onlyMissingClip
                  ? "Bộ lọc “thiếu clip” đang bật — có thể mọi ký hiệu khớp đều đã có clip."
                  : "Tìm kiếm đã bỏ qua dấu. Thử từ khác hoặc thêm ký hiệu mới."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {query !== "" ? (
                <Button variant="outline" onClick={() => setQuery("")}>
                  <X aria-hidden />
                  Xóa từ khóa
                </Button>
              ) : null}
              {onlyMissingClip ? (
                <Button variant="outline" onClick={() => setOnlyMissingClip(false)}>
                  Bỏ lọc thiếu clip
                </Button>
              ) : null}
              <Button onClick={() => setCreating(true)}>
                <Plus aria-hidden />
                Thêm ký hiệu
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className={isStale ? "opacity-70 transition-opacity" : "transition-opacity"}>
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead column="gloss" sort={sort} onSort={setSort}>
                      Gloss
                    </SortableHead>
                    <SortableHead column="nghia" sort={sort} onSort={setSort}>
                      Nghĩa tiếng Việt
                    </SortableHead>
                    <TableHead>Chủ đề</TableHead>
                    <SortableHead column="thieu-clip" sort={sort} onSort={setSort}>
                      Clip mẫu
                    </SortableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((sign) => (
                    <TableRow key={sign.id}>
                      <TableCell className="font-mono text-primary">{sign.gloss}</TableCell>
                      <TableCell className="font-medium">{sign.meaningVi}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{categoryLabel(sign.category)}</Badge>
                      </TableCell>
                      <TableCell>
                        {sign.clipUrl !== null ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewing(sign)}
                            aria-label={`Xem clip ký hiệu ${sign.meaningVi}`}
                          >
                            <Play aria-hidden />
                            Xem
                          </Button>
                        ) : (
                          <Badge variant="destructive">Chưa có</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setRecording(sign)}
                            aria-label={
                              sign.clipUrl !== null
                                ? `Quay clip thay thế cho ${sign.meaningVi}`
                                : `Quay clip cho ${sign.meaningVi}`
                            }
                          >
                            <Video aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditing(sign)}
                            aria-label={`Sửa ký hiệu ${sign.meaningVi}`}
                          >
                            <Pencil aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive"
                            onClick={() => setDeleting(sign)}
                            aria-label={`Xóa ký hiệu ${sign.meaningVi}`}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {filtered.length.toLocaleString("vi")} ký hiệu · trang {safePage + 1}/{totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => goToPage(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
              >
                <ChevronLeft aria-hidden />
                Trước
              </Button>
              <Button
                variant="outline"
                onClick={() => goToPage(Math.min(totalPages - 1, safePage + 1))}
                disabled={safePage >= totalPages - 1}
              >
                Sau
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}

      <SignFormDialog
        key={editing ? `edit-${editing.id}` : creating ? "create" : "closed"}
        mode={editing ? "edit" : "create"}
        open={creating || editing !== null}
        sign={editing}
        busy={busy}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={(values) =>
          editing
            ? saveEdit(editing, values.meaningVi, values.category)
            : createSign(values.gloss, values.meaningVi, values.category)
        }
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => (open ? null : setDeleting(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 className="text-destructive" aria-hidden />
            </AlertDialogMedia>
            <AlertDialogTitle>Xóa ký hiệu “{deleting?.meaningVi}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Ký hiệu <span className="font-mono">{deleting?.gloss}</span> sẽ bị xóa khỏi từ điển
              {deleting?.clipUrl !== null ? " CÙNG VỚI clip mẫu đã quay" : ""}. Thao tác này không
              hoàn lại được.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Giữ lại</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={(event) => {
                // Giữ hộp thoại mở tới khi API trả lời, không thì lỗi hiện ra sau
                // khi mọi thứ đã đóng và người dùng tưởng đã xóa xong
                event.preventDefault();
                if (deleting) confirmDelete(deleting);
              }}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              Xóa ký hiệu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {recording !== null ? (
        <RecordClipDialog
          sign={recording}
          onClose={() => setRecording(null)}
          onAuthError={handleAuthError}
          onUploaded={(updated) => {
            upsert(updated);
            setClipVersions((prev) => ({ ...prev, [updated.id]: (prev[updated.id] ?? 0) + 1 }));
            setRecording(null);
            toast.success(`Đã lưu clip cho “${updated.meaningVi}”`, {
              action: { label: "Xem lại", onClick: () => setPreviewing(updated) },
            });
          }}
        />
      ) : null}

      <Dialog
        open={previewing !== null}
        onOpenChange={(open) => (open ? null : setPreviewing(null))}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{previewing?.meaningVi ?? ""}</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{previewing?.gloss ?? ""}</span> · clip mẫu đang dùng
            </DialogDescription>
          </DialogHeader>
          {previewing ? (
            <video
              key={`${previewing.id}-${clipVersions[previewing.id] ?? 0}`}
              src={clipSrc(previewing, clipVersions[previewing.id] ?? 0) ?? undefined}
              width={640}
              height={480}
              controls
              autoPlay
              loop
              playsInline
              aria-label={`Clip ký hiệu ${previewing.meaningVi}`}
              className="aspect-video w-full rounded-lg bg-black object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type FormValues = { gloss: string; meaningVi: string; category: string };

/**
 * Form thêm/sửa ký hiệu. Gloss chỉ nhập được khi TẠO — dataset gán nhãn mẫu theo
 * gloss nên đổi gloss là mồ côi toàn bộ mẫu đã thu (backend cũng chặn).
 */
function SignFormDialog({
  mode,
  open,
  sign,
  busy,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  open: boolean;
  sign: Sign | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: FormValues) => void;
}) {
  const [meaningVi, setMeaningVi] = useState(sign?.meaningVi ?? "");
  const [category, setCategory] = useState(sign?.category ?? "TUDIEN");
  const [gloss, setGloss] = useState(sign?.gloss ?? "");
  const [glossEdited, setGlossEdited] = useState(false);
  const [error, setError] = useState("");

  // Gloss gợi ý theo nghĩa cho tới khi người dùng tự sửa nó
  const suggestedGloss = mode === "create" && !glossEdited ? normalizeGloss(meaningVi) : gloss;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedMeaning = meaningVi.trim();
    const finalGloss = normalizeGloss(mode === "create" ? suggestedGloss : gloss);
    const finalCategory = category.trim().toUpperCase();
    if (trimmedMeaning === "") {
      setError("Hãy nhập nghĩa tiếng Việt của ký hiệu.");
      return;
    }
    if (finalCategory === "") {
      setError("Hãy nhập chủ đề, ví dụ GREETING hoặc TUDIEN.");
      return;
    }
    if (mode === "create" && finalGloss === "") {
      setError("Gloss trống sau khi chuẩn hóa — hãy nhập gloss bằng chữ và số.");
      return;
    }
    setError("");
    onSubmit({ gloss: finalGloss, meaningVi: trimmedMeaning, category: finalCategory });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Thêm ký hiệu mới" : "Sửa ký hiệu"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Dùng khi Từ điển quốc gia còn thiếu từ này. Thêm xong thì quay clip mẫu cho nó."
              : "Gloss không sửa được — dataset đã gán nhãn theo gloss."}
          </DialogDescription>
        </DialogHeader>

        <form id="sign-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="sign-meaning">Nghĩa tiếng Việt</Label>
            <Input
              id="sign-meaning"
              value={meaningVi}
              onChange={(e) => setMeaningVi(e.target.value)}
              placeholder="VD: cảm ơn"
              autoComplete="off"
              autoFocus
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sign-gloss">Gloss (nhãn dataset)</Label>
            <Input
              id="sign-gloss"
              value={mode === "create" ? suggestedGloss : gloss}
              onChange={(e) => {
                setGlossEdited(true);
                setGloss(e.target.value);
              }}
              readOnly={mode === "edit"}
              aria-readonly={mode === "edit" ? true : undefined}
              className="font-mono"
              autoComplete="off"
            />
            <p className="text-sm text-muted-foreground">
              {mode === "create"
                ? "Tự chuẩn hóa: bỏ dấu, viết hoa, khoảng trắng thành “_”."
                : "Gloss là khóa liên kết với mẫu dataset nên không đổi được."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sign-category">Chủ đề</Label>
            <Input
              id="sign-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="VD: GREETING, MEDICAL, TUDIEN"
              className="font-mono"
              autoComplete="off"
              required
            />
          </div>

          {error !== "" ? (
            <p role="alert" aria-live="assertive" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Hủy
          </Button>
          <Button type="submit" form="sign-form" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {mode === "create" ? "Thêm ký hiệu" : "Lưu thay đổi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
