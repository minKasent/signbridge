"""Chuyển mẫu tự thu (trang /collect) sang cây .npy cho train.py.

Nguồn: storage/dataset/{GLOSS}/{uuid}.json.gz — hai định dạng đều đọc được:
  - mới: {"gloss","signer","fps","frames": [[144 số]...]}
  - cũ:  [[144 số]...] (mảng thô, không có signer)

Split: nếu đủ ≥3 người ký → tách theo NGƯỜI KÝ (signer-independent — chuẩn khoa học);
ít hơn thì chia 70/15/15 theo mẫu trong từng gloss (kèm cảnh báo ghi vào README của output).

    python collect_to_npy.py --src ../../storage/dataset --out ../data/collected
"""

from __future__ import annotations

import argparse
import gzip
import json
import random
from collections import defaultdict
from pathlib import Path

import numpy as np

FRAME_DIMS = 144


def read_sample(path: Path) -> tuple[np.ndarray, str]:
    """Trả về (frames (T,144) float32, signer)."""
    with gzip.open(path, "rt", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        frames, signer = data["frames"], data.get("signer", "unknown")
    else:
        frames, signer = data, "unknown"
    arr = np.asarray(frames, dtype=np.float32)
    if arr.ndim != 2 or arr.shape[1] != FRAME_DIMS:
        raise ValueError(f"{path.name}: shape {arr.shape} — cần (T, {FRAME_DIMS})")
    return arr, signer


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", type=Path, required=True, help="storage/dataset")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    # samples[gloss] = [(path, signer)]
    samples: dict[str, list[tuple[Path, str]]] = defaultdict(list)
    skipped = 0
    for gloss_dir in sorted(p for p in args.src.iterdir() if p.is_dir()):
        for f in sorted(gloss_dir.glob("*.json.gz")):
            try:
                _, signer = read_sample(f)
                samples[gloss_dir.name].append((f, signer))
            except (ValueError, json.JSONDecodeError, OSError) as e:
                skipped += 1
                print(f"Bỏ qua {f}: {e}")

    if not samples:
        raise SystemExit(f"Không có mẫu hợp lệ nào trong {args.src}")

    signers = sorted({s for items in samples.values() for _, s in items})
    total = sum(len(v) for v in samples.values())
    print(f"{total} mẫu, {len(samples)} gloss, {len(signers)} người ký: {signers}")

    rng = random.Random(args.seed)
    if len(signers) >= 3:
        # Signer-independent: dành 1 người cho val, 1 người cho test
        shuffled = signers[:]
        rng.shuffle(shuffled)
        val_signer, test_signer = shuffled[0], shuffled[1]
        print(f"Split theo người ký — val: {val_signer}, test: {test_signer}, train: còn lại")

        def split_of(_index: int, _count: int, signer: str) -> str:
            if signer == val_signer:
                return "val"
            if signer == test_signer:
                return "test"
            return "train"
    else:
        print("⚠️ Dưới 3 người ký — chia 70/15/15 theo mẫu (KHÔNG signer-independent; "
              "accuracy sẽ lạc quan hơn thực tế, ghi rõ trong báo cáo)")

        def split_of(index: int, count: int, _signer: str) -> str:
            if index < max(1, int(count * 0.7)):
                return "train"
            if index < max(2, int(count * 0.85)):
                return "val"
            return "test"

    counts: dict[str, int] = defaultdict(int)
    for gloss, items in samples.items():
        rng.shuffle(items)
        for i, (path, signer) in enumerate(items):
            split = split_of(i, len(items), signer)
            arr, _ = read_sample(path)
            out_file = args.out / split / gloss / (path.stem.replace(".json", "") + ".npy")
            out_file.parent.mkdir(parents=True, exist_ok=True)
            np.save(out_file, arr)
            counts[split] += 1

    print(f"Xong → {args.out} | " + " | ".join(f"{s}: {c}" for s, c in sorted(counts.items()))
          + (f" | bỏ qua {skipped} file lỗi" if skipped else ""))
    print("Train: python ../model/train.py --data", args.out, "--out <kết_quả>")


if __name__ == "__main__":
    main()
