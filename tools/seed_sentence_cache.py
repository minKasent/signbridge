"""Sinh tệp mồi cache ghép câu cho SentenceComposer.

Vì sao cần: gói Gemini miễn phí chỉ cho **20 lượt/ngày** cho mỗi mô hình
(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, xem
docs/report/data/rui-ro-quota-llm.md). Chạy thử vài lượt trước buổi bảo vệ là cạn,
và giữa buổi demo phần "mô hình ngôn ngữ ghép câu tự nhiên" sẽ tụt xuống lớp ghép
dự phòng — đúng thứ cần chứng minh thì lại không chứng minh được.

Mồi sẵn cache khử được cả hai vấn đề cùng lúc:
  1. Chuỗi gloss dùng khi demo không gọi API lần nào → không đụng hạn mức.
  2. Bỏ luôn ~2,9 giây chờ mạng mỗi câu (số đo trong sentence-eval.md) — trên máy
     chiếu, gần ba giây im lặng là rất lâu.

Câu mồi KHÔNG phải viết tay: lấy đúng đầu ra mà mô hình đã sinh ra thật trong
`docs/report/data/sentence-eval.json`. Muốn thêm câu thì chạy
`training/eval/sentence_eval.py` cho nhiều ca hơn rồi chạy lại script này.

    python tools/seed_sentence_cache.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NGUON = ROOT / "docs/report/data/sentence-eval.json"
DICH = ROOT / "apps/core/src/main/resources/sentence-cache-seed.json"

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")


def main() -> int:
    if not NGUON.exists():
        sys.exit(f"Chưa có {NGUON.relative_to(ROOT)} — chạy training/eval/sentence_eval.py trước.")

    rows = json.loads(NGUON.read_text(encoding="utf-8"))
    # Khóa PHẢI khớp SentenceComposer.compose: String.join("/", glosses)
    seed = {
        "/".join(r["glosses"]): r["cau_he_thong"]
        for r in rows
        if r.get("cau_he_thong") and r.get("glosses")
    }

    DICH.parent.mkdir(parents=True, exist_ok=True)
    DICH.write_text(json.dumps(seed, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Đã ghi {len(seed)} cặp gloss → câu vào {DICH.relative_to(ROOT)}")
    for k, v in list(seed.items())[:5]:
        print(f"  {k}  ->  {v}")
    if len(seed) > 5:
        print(f"  … và {len(seed) - 5} cặp nữa")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
