"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleDashed, Search } from "lucide-react";
import { buildSearchIndex, searchSigns, type Sign } from "@/app/dictionary/sign";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Chọn ký hiệu trong kho 3.331 mục: hộp tìm kiếm + danh sách kết quả theo mẫu
 * combobox của ARIA — điều hướng bằng ↑ ↓, chọn bằng Enter, Escape xóa từ khóa.
 *
 * Danh sách LUÔN hiển thị (đây là bảng chọn của một trang công việc, không phải
 * ô tìm kiếm thu gọn), nên `aria-expanded` luôn là true: nói "collapsed" trong khi
 * danh sách đang nằm ngay đó là dối trình đọc màn hình.
 *
 * Không dùng `<select>` vì 3.331 <option> khiến trình duyệt treo và không tìm được
 * theo nghĩa tiếng Việt; không cài `cmdk` vì thêm dependency phải sửa `package.json`
 * — file dùng chung bị cấm sửa trực tiếp (Plan-multi-agent §3.2).
 */

const MAX_OPTIONS = 40;

type Props = {
  signs: Sign[];
  value: Sign | null;
  onSelect: (sign: Sign) => void;
  /** Xếp ký hiệu chưa có clip lên đầu — đó là việc cần làm trước. */
  missingClipFirst?: boolean;
  className?: string;
};

export function SignPicker({
  signs,
  value,
  onSelect,
  missingClipFirst = true,
  className,
}: Props) {
  const inputId = useId();
  const listId = useId();

  const [query, setQuery] = useState("");
  // Con trỏ bàn phím GẮN với từ khóa sinh ra nó: gõ thêm chữ là tự về mục đầu,
  // không cần effect setState và không bao giờ trỏ vào chỉ số đã biến mất.
  const [cursor, setCursor] = useState({ key: "", index: 0 });
  const listRef = useRef<HTMLUListElement>(null);

  // Gõ vào ô tìm phải mượt kể cả khi lọc 3.331 mục (quy tắc rerender-use-deferred-value)
  const deferredQuery = useDeferredValue(query);
  const index = useMemo(() => buildSearchIndex(signs), [signs]);

  const options = useMemo(() => {
    const found = searchSigns(index, deferredQuery);
    if (missingClipFirst) {
      found.sort((a, b) => Number(Boolean(a.clipUrl)) - Number(Boolean(b.clipUrl)));
    }
    return found.slice(0, MAX_OPTIONS);
  }, [index, deferredQuery, missingClipFirst]);

  const isStale = query !== deferredQuery;

  const cursorKey = `${deferredQuery}|${signs.length}`;
  const activeIndex = Math.min(
    cursor.key === cursorKey ? cursor.index : 0,
    Math.max(0, options.length - 1)
  );
  const activeOption = options[activeIndex];

  function moveCursor(index: number) {
    setCursor({ key: cursorKey, index });
  }

  // Giữ mục đang chọn trong tầm nhìn khi dùng bàn phím
  useEffect(() => {
    const active = listRef.current?.children[activeIndex];
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function choose(sign: Sign) {
    onSelect(sign);
    setQuery("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      moveCursor((activeIndex + step + options.length) % options.length);
      return;
    }
    if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      choose(activeOption);
      return;
    }
    // Escape trong combobox = xóa nội dung đang gõ (mẫu ARIA APG)
    if (event.key === "Escape" && query !== "") {
      event.preventDefault();
      setQuery("");
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={inputId}>Tìm ký hiệu cần quay</Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={inputId}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${listId}-${activeOption.id}` : undefined}
          autoComplete="off"
          value={query}
          placeholder="VD: cảm ơn, bác sĩ, cam on…"
          className="pl-9"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Kết quả tìm ký hiệu"
        className={cn(
          "max-h-64 overflow-y-auto rounded-xl border border-border bg-card p-1",
          options.length === 0 && "hidden",
          isStale && "opacity-70"
        )}
      >
        {options.map((sign, i) => {
          const selected = value?.id === sign.id;
          return (
            <li
              key={sign.id}
              id={`${listId}-${sign.id}`}
              role="option"
              aria-selected={selected}
              // onClick (không phải onMouseDown): điều khiển bằng giọng nói và
              // trình đọc màn hình phát sinh sự kiện click, không phát sinh mousedown.
              // Danh sách luôn hiển thị nên không sợ blur làm mất mục trước khi click.
              onClick={() => choose(sign)}
              onMouseEnter={() => moveCursor(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                // Con trỏ bàn phím cần thấy được: chỉ đổi nền là ~1.7:1, thêm viền
                i === activeIndex && "bg-muted ring-2 ring-ring/60",
                selected && "bg-primary/15 text-foreground"
              )}
            >
              <span className="min-w-0">
                <span className="block truncate">{sign.meaningVi}</span>
                <span className="block truncate font-mono text-sm text-muted-foreground">
                  {sign.gloss}
                </span>
              </span>
              {sign.clipUrl ? (
                <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-primary" aria-hidden />
                  có clip
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                  <CircleDashed className="size-4" aria-hidden />
                  chưa có
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {options.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Không có ký hiệu nào khớp “{query}”. Tìm kiếm không phụ thuộc dấu — thử từ khác, hoặc
          thêm từ mới bên dưới.
        </p>
      ) : null}

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {options.length > 0
          ? `${options.length}${options.length === MAX_OPTIONS ? "+" : ""} kết quả — dùng ↑ ↓ rồi Enter để chọn`
          : "Không có kết quả"}
      </p>
    </div>
  );
}

export default SignPicker;
