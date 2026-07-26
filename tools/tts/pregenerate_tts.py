"""Sinh sẵn giọng đọc neural tiếng Việt cho các câu demo.

Vì sao sinh sẵn thay vì gọi lúc chạy:
  1. `speechSynthesis` của trình duyệt đọc tiếng Việt rất máy móc, và trên nhiều
     máy Windows KHÔNG có giọng vi-VN nào — lúc bảo vệ mà máy phòng hội đồng
     thiếu giọng thì phần "nói ra tiếng" coi như mất.
  2. Gọi edge-tts lúc chạy thì phụ thuộc Internet và có thể bị chặn (Microsoft đã
     từng trả 403 cho dịch vụ này). Sinh sẵn ra mp3 nằm trong `public/` thì lúc
     demo chỉ là phát một file tĩnh — không mạng vẫn chạy.
  3. Không tốn quota, không có độ trễ mạng giữa lúc trình diễn.

Câu nào ngoài danh sách sinh sẵn thì web tự lùi về `speechSynthesis` (xem
apps/web/src/lib/neural-tts.ts) — không bao giờ im lặng.

    pip install edge-tts
    python tools/tts/pregenerate_tts.py [--voice vi-VN-HoaiMyNeural] [--force]
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "apps/web/public/tts"
MANIFEST = OUT_DIR / "manifest.json"

EVAL_CASES = ROOT / "training/eval/gloss_sequences.json"
EVAL_RESULT = ROOT / "docs/report/data/sentence-eval.json"

GIONG_MAC_DINH = "vi-VN-HoaiMyNeural"  # giọng nữ miền Bắc, rõ và trung tính

# Câu cố định của giao diện — không sinh ra từ mô hình nhưng vẫn cần đọc lên.
CAU_CO_DINH = [
    "Xin chào, tôi là SignBridge.",
    "Chưa nhận diện được ký hiệu nào.",
    "Mất kết nối tới máy chủ.",
    "Đã kết nối, mời bạn bắt đầu ký hiệu.",
]

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")


def chuan_hoa(text: str) -> str:
    """Khoá tra cứu. PHẢI khớp hàm chuanHoa trong apps/web/src/lib/neural-tts.ts."""
    text = unicodedata.normalize("NFC", text).strip().lower()
    return re.sub(r"\s+", " ", text)


def ten_file(text: str) -> str:
    return hashlib.sha1(chuan_hoa(text).encode("utf-8")).hexdigest()[:12] + ".mp3"


def thu_thap_cau() -> list[str]:
    """Gom câu từ chính bộ đánh giá — đó đúng là những câu hệ thống sẽ nói ra."""
    cau: list[str] = list(CAU_CO_DINH)

    if EVAL_CASES.exists():
        data = json.loads(EVAL_CASES.read_text(encoding="utf-8"))
        cau += [c["cau_tham_chieu"] for c in data["cases"] if c.get("cau_tham_chieu")]
    else:
        print(f"Bỏ qua {EVAL_CASES.name}: chưa có")

    # Câu do hệ thống THẬT sinh ra (chạy training/eval/sentence_eval.py trước để có)
    if EVAL_RESULT.exists():
        rows = json.loads(EVAL_RESULT.read_text(encoding="utf-8"))
        cau += [r["cau_he_thong"] for r in rows if r.get("cau_he_thong")]
    else:
        print(f"Bỏ qua {EVAL_RESULT.name}: chạy training/eval/sentence_eval.py để có câu thật")

    # Bỏ trùng theo khoá chuẩn hoá, giữ nguyên thứ tự và bản viết hoa đầu tiên
    thay: dict[str, str] = {}
    for c in cau:
        k = chuan_hoa(c)
        if k and k not in thay:
            thay[k] = c.strip()
    return list(thay.values())


async def sinh_mot(edge_tts, text: str, voice: str, path: Path) -> int:
    com = edge_tts.Communicate(text, voice)
    await com.save(str(path))
    return path.stat().st_size


async def chay(args) -> int:
    try:
        import edge_tts  # noqa: PLC0415 — phụ thuộc tuỳ chọn, chỉ cần khi sinh lại
    except ImportError:
        sys.exit("Thiếu edge-tts. Chạy: pip install edge-tts")

    cau = thu_thap_cau()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str] = {}
    moi = bo_qua = loi = 0

    print(f"Giọng: {args.voice} · {len(cau)} câu · ra {OUT_DIR.relative_to(ROOT)}\n")

    for text in cau:
        f = ten_file(text)
        path = OUT_DIR / f
        manifest[chuan_hoa(text)] = f

        if path.exists() and path.stat().st_size > 0 and not args.force:
            bo_qua += 1
            continue
        try:
            size = await sinh_mot(edge_tts, text, args.voice, path)
            moi += 1
            print(f"  + {f}  {size / 1024:5.1f} KB  {text}")
        except Exception as e:  # noqa: BLE001 — một câu hỏng không được chặn cả lượt
            loi += 1
            manifest.pop(chuan_hoa(text), None)
            path.unlink(missing_ok=True)
            print(f"  ! LỖI: {text} — {str(e)[:70]}")

    # Xoá file mồ côi để thư mục không phình theo mỗi lần đổi câu mẫu
    hien_co = {p.name for p in OUT_DIR.glob("*.mp3")}
    for thua in hien_co - set(manifest.values()):
        (OUT_DIR / thua).unlink()
        print(f"  - xoá file thừa {thua}")

    MANIFEST.write_text(
        json.dumps({"voice": args.voice, "files": manifest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tong = sum((OUT_DIR / f).stat().st_size for f in manifest.values())
    print(f"\nXong: {moi} mới, {bo_qua} đã có, {loi} lỗi · "
          f"{len(manifest)} câu, tổng {tong / 1024:.0f} KB")
    print(f"Manifest: {MANIFEST.relative_to(ROOT)}")
    return 1 if loi and not manifest else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default=GIONG_MAC_DINH,
                    help="vi-VN-HoaiMyNeural (nữ) hoặc vi-VN-NamMinhNeural (nam)")
    ap.add_argument("--force", action="store_true", help="sinh lại cả câu đã có file")
    return asyncio.run(chay(ap.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
