"""Sinh dataset landmark GIẢ để smoke-test dây chuyền huấn luyện.

Mỗi lớp một "động tác" hình sin tần số/pha riêng trên các chiều tọa độ tay —
đủ tách biệt để model học được (top-1 phải >> ngẫu nhiên sau vài epoch, nếu không
tức là pipeline có bug). Có đệm frame không-có-tay ở đầu/cuối để test pool NO_SIGN.

    python make_synthetic_data.py --out /tmp/synthetic_landmarks
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

FRAME_DIMS = 144
HAND_DIMS = 126


def make_sequence(rng: np.random.Generator, class_id: int) -> np.ndarray:
    t = rng.integers(35, 70)
    time = np.arange(t)[:, None]
    dims = np.arange(HAND_DIMS)[None, :]
    freq = 0.05 + 0.04 * class_id
    hands = 0.5 + 0.2 * np.sin(freq * time + 0.13 * class_id * dims) + rng.normal(0, 0.02, (t, HAND_DIMS))
    pose = 0.5 + rng.normal(0, 0.01, (t, FRAME_DIMS - HAND_DIMS))
    seq = np.concatenate([hands, pose], axis=1).astype(np.float32)

    # Đầu/cuối video: tay chưa đưa lên (126 chiều đầu = 0) — nguồn cho pool NO_SIGN
    lead, tail = rng.integers(3, 8), rng.integers(3, 8)
    pad_pose = 0.5 + rng.normal(0, 0.01, (lead + tail, FRAME_DIMS - HAND_DIMS))
    pad = np.zeros((lead + tail, FRAME_DIMS), dtype=np.float32)
    pad[:, HAND_DIMS:] = pad_pose
    return np.concatenate([pad[:lead], seq, pad[lead:]], axis=0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--classes", type=int, default=5)
    parser.add_argument("--per-class", type=int, default=24)
    args = parser.parse_args()

    rng = np.random.default_rng(7)
    splits = {"train": args.per_class, "val": max(4, args.per_class // 4), "test": max(4, args.per_class // 4)}
    for split, count in splits.items():
        for c in range(args.classes):
            out_dir = args.out / split / str(c)
            out_dir.mkdir(parents=True, exist_ok=True)
            for i in range(count):
                np.save(out_dir / f"seq_{i:03d}.npy", make_sequence(rng, c))
    print(f"Đã sinh {args.classes} lớp × {splits} vào {args.out}")


if __name__ == "__main__":
    main()
