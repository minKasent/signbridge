"use client";

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleDashed, Search } from "lucide-react";
import { buildSearchIndex, searchSigns, type Sign } from "@/app/dictionary/sign";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Chọn ký hiệu trong kho 3.331 mục: hộp tìm kiếm + danh sách kết quả theo đúng
 * mẫu combobox của ARIA (điều hướng bằng ↑ ↓, chọn bằng Enter, đóng bằng Escape).
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

export function SignPicker({ signs, value, onSelect, missingClipFirst = true, className }: Props) {
  const inputId = useId();
  const listId = useId();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
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

  // Danh sách đổi thì con trỏ về đầu, không trỏ vào chỉ số đã biến mất
  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery, signs]);

  // Giữ mục đang chọn trong tầm nhìn khi dùng bàn phím
  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.children[activeIndex];
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function choose(sign: Sign) {
    onSelect(sign);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((prev) => (prev + step + options.length) % options.length);
      return;
    }
    if (event.key === "Enter") {
      const picked = options[activeIndex];
      if (open && picked) {
        event.preventDefault();
        choose(picked);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const activeOption = open ? options[activeIndex] : undefined;

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
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${listId}-${activeOption.id}` : undefined}
          autoComplete="off"
          value={query}
          placeholder="VD: cảm ơn, bác sĩ, cam on…"
          className="pl-9"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
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
              onMouseDown={(e) => {
                // mousedown thay vì click: click xảy ra sau blur, lúc đó danh sách đã đóng
                e.preventDefault();
                choose(sign);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                i === activeIndex && "bg-muted",
                selected && "bg-primary/15 text-foreground"
              )}
            >
              <span className="min-w-0">
                <span className="block truncate">{sign.meaningVi}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">{sign.gloss}</span>
              </span>
              {sign.clipUrl ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-primary" aria-hidden />
                  có clip
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <CircleDashed className="size-3.5" aria-hidden />
                  chưa có
                </span>
              )}
            </li>
          );
        })}
        {options.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Không có ký hiệu nào khớp “{query}”. Tìm không phụ thuộc dấu — thử từ khác, hoặc thêm từ
            mới bên dưới.
          </li>
        ) : null}
      </ul>

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {options.length > 0
          ? `${options.length}${options.length === MAX_OPTIONS ? "+" : ""} kết quả — dùng ↑ ↓ rồi Enter để chọn`
          : "Không có kết quả"}
      </p>
    </div>
  );
}

export default SignPicker;
