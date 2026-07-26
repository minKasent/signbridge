"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Play, RefreshCw, SearchX, Video, X } from "lucide-react";
import { buildSearchIndex, categoryLabel, clipSrc, searchSigns, useSigns, type Sign } from "./sign";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Kho tra cứu 3.331 ký hiệu. Hai điều quyết định trang này dùng được hay không:
 *  1. KHÔNG nhúng hàng chục thẻ <video> — mỗi thẻ chỉ là ô bấm, clip phát trong
 *     một hộp thoại duy nhất (trước sprint 2: 48 <video> cùng lúc, mỗi thẻ một
 *     kết nối tới máy chủ).
 *  2. Tìm kiếm bỏ dấu và chạy trên giá trị hoãn (useDeferredValue) nên gõ vẫn mượt.
 */

const ALL_CATEGORIES = "ALL";
const PAGE_STEP = 24;

export default function DictionaryBrowser() {
  const { signs, loading, failed, reload } = useSigns();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [onlyWithClip, setOnlyWithClip] = useState(false);
  const [preview, setPreview] = useState<Sign | null>(null);
  // Số thẻ đang hiện, GẮN với bộ lọc sinh ra nó: đổi bộ lọc là tự về 24 thẻ đầu
  // mà không cần effect setState (effect như vậy gây thêm một vòng render).
  const [shownState, setShownState] = useState({ key: "", count: PAGE_STEP });

  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  const index = useMemo(() => buildSearchIndex(signs ?? []), [signs]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const sign of signs ?? []) seen.add(sign.category);
    return Array.from(seen).sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), "vi"));
  }, [signs]);

  const filtered = useMemo(() => {
    const found = searchSigns(index, deferredQuery);
    if (category === ALL_CATEGORIES && !onlyWithClip) return found;
    return found.filter(
      (sign) =>
        (category === ALL_CATEGORIES || sign.category === category) &&
        (!onlyWithClip || sign.clipUrl !== null)
    );
  }, [index, deferredQuery, category, onlyWithClip]);

  const filterKey = `${deferredQuery}|${category}|${onlyWithClip}`;
  const visible = shownState.key === filterKey ? shownState.count : PAGE_STEP;
  const shown = filtered.slice(0, visible);
  const withClipCount = useMemo(
    () => (signs ?? []).reduce((total, sign) => total + (sign.clipUrl ? 1 : 0), 0),
    [signs]
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Từ điển ký hiệu VSL</h1>
        <p className="text-muted-foreground">
          {signs
            ? `${signs.length.toLocaleString("vi")} ký hiệu · ${withClipCount.toLocaleString("vi")} có clip mẫu — nguồn: Từ điển Ngôn ngữ Ký hiệu quốc gia (qipedc.moet.gov.vn)`
            : "Tra cứu kho ký hiệu của Từ điển Ngôn ngữ Ký hiệu quốc gia."}
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor="dictionary-search">Tìm ký hiệu</Label>
          <div className="relative">
            <Input
              id="dictionary-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="VD: đau bụng, cô giáo, cam on…"
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
          <Label htmlFor="dictionary-category">Chủ đề</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="dictionary-category" className="w-48">
              <SelectValue placeholder="Tất cả chủ đề" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>Tất cả chủ đề</SelectItem>
              {categories.map((value) => (
                <SelectItem key={value} value={value}>
                  {categoryLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant={onlyWithClip ? "secondary" : "outline"}
          size="lg"
          aria-pressed={onlyWithClip}
          onClick={() => setOnlyWithClip((v) => !v)}
        >
          <Play aria-hidden />
          Chỉ từ có clip
        </Button>
      </div>

      {/* Vùng thông báo LUÔN nằm trong DOM. Trước đây `aria-live` chỉ gắn ở dòng đếm
          kết quả — mà dòng đó bị gỡ khỏi cây khi rơi vào trạng thái rỗng, nên đúng lúc
          cần báo "không tìm thấy" thì trình đọc màn hình lại im. Live region bị unmount
          rồi mount lại thì không phát được gì. */}
      <p role="status" aria-live="polite" className="sr-only">
        {loading
          ? "Đang tải từ điển"
          : failed
            ? "Không tải được từ điển"
            : filtered.length === 0
              ? query !== ""
                ? `Không tìm thấy ký hiệu nào khớp “${query}”`
                : "Không có ký hiệu nào khớp bộ lọc"
              : `${filtered.length.toLocaleString("vi")} kết quả`}
      </p>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border p-4">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
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
                {signs !== null && signs.length === 0
                  ? "Từ điển chưa có ký hiệu nào"
                  : query !== ""
                    ? `Không tìm thấy “${query}”`
                    : "Không có ký hiệu nào khớp bộ lọc"}
              </p>
              <p className="text-sm text-muted-foreground">
                {signs !== null && signs.length === 0
                  ? "Máy chủ trả về danh sách rỗng — kho QIPEDC có thể chưa được nhập. Người quản trị thêm ký hiệu ở trang Quản trị từ điển."
                  : "Tìm kiếm đã bỏ qua dấu (gõ “cam on” vẫn ra “cảm ơn”) — thử từ khác, hoặc bỏ bộ lọc chủ đề / clip."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {query !== "" ? (
                <Button variant="outline" onClick={() => setQuery("")}>
                  <X aria-hidden />
                  Xóa từ khóa
                </Button>
              ) : null}
              {category !== ALL_CATEGORIES || onlyWithClip ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setCategory(ALL_CATEGORIES);
                    setOnlyWithClip(false);
                  }}
                >
                  Bỏ bộ lọc
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Không đặt aria-live ở đây nữa: vùng thông báo dùng chung phía trên đã lo,
              để cả hai thì trình đọc màn hình đọc trùng hai lần. */}
          <p className="mb-3 text-sm text-muted-foreground">
            {filtered.length.toLocaleString("vi")} kết quả — đang xem{" "}
            {shown.length.toLocaleString("vi")}
          </p>

          <ul
            className={cn(
              "grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
              isStale && "opacity-70"
            )}
          >
            {shown.map((sign) => (
              <li key={sign.id}>
                <SignCard sign={sign} onPlay={() => setPreview(sign)} />
              </li>
            ))}
          </ul>

          {shown.length < filtered.length ? (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShownState({ key: filterKey, count: visible + PAGE_STEP })}
              >
                Tải thêm {Math.min(PAGE_STEP, filtered.length - shown.length)} ký hiệu
              </Button>
            </div>
          ) : null}
        </>
      )}

      <Dialog open={preview !== null} onOpenChange={(open) => (open ? null : setPreview(null))}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.meaningVi ?? ""}</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{preview?.gloss ?? ""}</span>
              {preview ? ` · ${categoryLabel(preview.category)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <video
              key={preview.id}
              src={clipSrc(preview) ?? undefined}
              width={640}
              height={480}
              controls
              autoPlay
              loop
              playsInline
              aria-label={`Clip ký hiệu ${preview.meaningVi}`}
              className="aspect-video w-full rounded-lg bg-black object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Thẻ ký hiệu: chỉ là ô bấm, KHÔNG chứa <video> — clip phát trong hộp thoại chung. */
function SignCard({ sign, onPlay }: { sign: Sign; onPlay: () => void }) {
  const hasClip = sign.clipUrl !== null;

  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="space-y-3 p-4">
        {hasClip ? (
          <button
            type="button"
            onClick={onPlay}
            aria-label={`Xem clip ký hiệu ${sign.meaningVi}`}
            className="group relative grid aspect-video w-full place-items-center overflow-hidden rounded-lg bg-muted transition-colors hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="grid size-12 place-items-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-110">
              <Play className="size-6" aria-hidden />
            </span>
          </button>
        ) : (
          <div className="grid aspect-video w-full place-items-center rounded-lg border border-dashed border-border bg-muted/40">
            <BookOpen className="size-6 text-muted-foreground" aria-hidden />
          </div>
        )}

        <div className="space-y-1">
          <p className="font-medium leading-snug">{sign.meaningVi}</p>
          <p className="truncate font-mono text-sm text-muted-foreground">{sign.gloss}</p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline">{categoryLabel(sign.category)}</Badge>
          {hasClip ? (
            <Badge variant="secondary">Có clip</Badge>
          ) : (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/record?sign=${encodeURIComponent(sign.gloss)}`}>
                <Video aria-hidden />
                Quay clip
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
