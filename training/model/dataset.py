"""Dataset landmark VSL cho huấn luyện.

Cấu trúc dữ liệu vào (sinh bởi preprocess/extract_landmarks.py hoặc collect_to_npy.py):
    root/{train|val|test}/{label}/{video}.npy   — mảng (T, 144) float32

Vector 144 chiều: [tay trái 21×3 | tay phải 21×3 | vai-khuỷu-cổ tay 6×3],
thiếu tay → 0 (khớp apps/web/src/lib/landmarks.ts — KHÔNG được đổi một phía).

Các quyết định thiết kế (rút từ review đối kháng — xem PLAN.md):
- Mọi augmentation lấy ngẫu nhiên từ stream np.random TOÀN CỤC: PyTorch tự reseed
  stream này cho từng DataLoader worker theo từng epoch. KHÔNG giữ random.Random
  trong instance — worker fork sẽ nhân bản và lặp đúng một chuỗi mỗi epoch.
- NO_SIGN tổng hợp từ các RUN LIÊN TỤC frame không-tay ở ĐẦU/CUỐI video (tay chưa
  đưa lên / đã hạ xuống) — không lấy frame rời rạc giữa video (mất dấu tracking)
  và không ghép i.i.d. (pose nhảy loạn, model học sai đặc trưng).
- Time-warp có "lính gác tay ma": không nội suy tọa độ vắt qua frame không-tay
  (0 nghĩa là "không có tay", nội suy tuyến tính sẽ bịa ra bàn tay lơ lửng).
- Augment thêm dịch/scale toàn khung (mô phỏng vị trí đứng/khoảng cách camera khác).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

FRAME_DIMS = 144
HAND_DIMS = 126  # 2 tay × 21 điểm × 3
NUM_POINTS = FRAME_DIMS // 3
NO_SIGN_LABEL = "NO_SIGN"
MIN_RUN = 4  # run không-tay tối thiểu để đưa vào pool NO_SIGN


def _label_sort_key(label: str):
    return (0, int(label)) if label.isdigit() else (1, label)


def discover_labels(split_dir: Path) -> list[str]:
    labels = sorted((d.name for d in split_dir.iterdir() if d.is_dir()), key=_label_sort_key)
    if not labels:
        raise SystemExit(f"Không có thư mục nhãn nào trong {split_dir}")
    return labels


def _hands_absent(frames: np.ndarray) -> np.ndarray:
    """Mask (T,) — True tại frame không có tay nào."""
    return np.abs(frames[:, :HAND_DIMS]).sum(axis=1) < 1e-6


def _boundary_runs(frames: np.ndarray) -> list[np.ndarray]:
    """Run không-tay liên tục ở đầu và cuối video (loại mất-dấu giữa video)."""
    absent = _hands_absent(frames)
    runs = []
    lead = int(np.argmax(~absent)) if (~absent).any() else len(absent)
    if lead >= MIN_RUN:
        runs.append(frames[:lead].copy())
    tail = int(np.argmax(~absent[::-1])) if (~absent).any() else 0
    if tail >= MIN_RUN:
        runs.append(frames[len(frames) - tail :].copy())
    return runs


class VslSequenceDataset(Dataset):
    """Mỗi mẫu: (x: (T, 144) float32, mask: (T,) bool valid, y: int)."""

    def __init__(
        self,
        split_dir: Path,
        labels: list[str],
        window: int = 32,
        train: bool = False,
        no_sign_per_class: int = 0,
        seed: int = 42,
        no_sign_pool_size: int = 400,
    ):
        self.window = window
        self.train = train
        self.labels = labels + [NO_SIGN_LABEL]
        self.no_sign_index = len(self.labels) - 1

        label_to_index = {lb: i for i, lb in enumerate(labels)}
        self.items: list[tuple[Path, int]] = []
        for label_dir in sorted((d for d in split_dir.iterdir() if d.is_dir()),
                                key=lambda d: _label_sort_key(d.name)):
            if label_dir.name in label_to_index:
                for f in sorted(label_dir.glob("*.npy")):
                    self.items.append((f, label_to_index[label_dir.name]))
        if not self.items:
            raise SystemExit(f"Không có file .npy nào trong {split_dir}")

        # Pool run không-tay: lấy mẫu NGẪU NHIÊN CÓ SEED trên TOÀN BỘ items
        # (không lấy "200 file đầu" — thiên lệch lớp/người ký và đổi theo filesystem)
        pool_rng = np.random.default_rng(seed)
        indices = pool_rng.choice(len(self.items),
                                  size=min(no_sign_pool_size, len(self.items)), replace=False)
        self.no_sign_runs: list[np.ndarray] = []
        for i in indices:
            self.no_sign_runs.extend(_boundary_runs(np.load(self.items[i][0]).astype(np.float32)))
        if not self.no_sign_runs:
            self.no_sign_runs = [np.zeros((self.window, FRAME_DIMS), np.float32)]

        self.num_no_sign = no_sign_per_class * max(1, len(labels)) if no_sign_per_class > 0 else 0

    def __len__(self) -> int:
        return len(self.items) + self.num_no_sign

    def __getitem__(self, index: int):
        if index >= len(self.items):
            # train: stream worker-safe; eval: cố định theo index để so sánh được giữa các run
            rng = (np.random.default_rng(np.random.randint(1 << 31)) if self.train
                   else np.random.default_rng(index))
            return self._synthesize_no_sign(rng)

        path, label = self.items[index]
        frames = np.load(path).astype(np.float32)
        if self.train:
            frames = self._augment(frames)
        x, mask = self._fit_window(frames)
        return torch.from_numpy(x), torch.from_numpy(mask), label

    # ------------------------------------------------------------------
    def no_sign_batch(self, count: int, seed: int = 123) -> torch.Tensor:
        """Batch NO_SIGN cố định cho đánh giá riêng (không trộn vào top-1 thật)."""
        rng = np.random.default_rng(seed)
        windows = [self._synthesize_no_sign(rng)[0] for _ in range(count)]
        return torch.stack(windows)

    def _fit_window(self, frames: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        t = len(frames)
        if t >= self.window:
            if self.train:
                # Ưu tiên cửa sổ chứa nội dung ký hiệu: chọn start sao cho cửa sổ
                # chồng lấn vùng có tay (không thì mẫu "cả cửa sổ trống tay" mang nhãn thật)
                present = ~_hands_absent(frames)
                if present.any():
                    first, last = int(np.argmax(present)), t - 1 - int(np.argmax(present[::-1]))
                    lo = max(0, first - self.window // 2)
                    hi = min(t - self.window, max(lo, last - self.window // 2))
                    start = int(np.random.randint(lo, hi + 1))
                else:
                    start = int(np.random.randint(0, t - self.window + 1))
            else:
                start = (t - self.window) // 2
            x = frames[start : start + self.window]
            mask = np.ones(self.window, dtype=bool)
        else:
            x = np.zeros((self.window, FRAME_DIMS), dtype=np.float32)
            x[:t] = frames
            mask = np.zeros(self.window, dtype=bool)
            mask[:t] = True
        return np.ascontiguousarray(x), mask

    def _augment(self, frames: np.ndarray) -> np.ndarray:
        # 1. Co giãn thời gian, có lính gác "tay ma": nội suy cả indicator có-tay
        #    (từng tay), chỗ nào indicator < 1 (vắt qua frame trống) thì xóa block tay đó
        if np.random.random() < 0.5 and len(frames) > 4:
            factor = np.random.uniform(0.8, 1.2)
            new_t = max(4, int(len(frames) * factor))
            old_idx = np.linspace(0, len(frames) - 1, num=new_t)
            base = np.arange(len(frames))
            warped = np.stack(
                [np.interp(old_idx, base, frames[:, d]) for d in range(FRAME_DIMS)], axis=1
            ).astype(np.float32)
            for lo, hi in ((0, 63), (63, 126)):
                present = (np.abs(frames[:, lo:hi]).sum(axis=1) > 1e-6).astype(np.float32)
                indicator = np.interp(old_idx, base, present)
                warped[indicator < 0.999, lo:hi] = 0.0
            frames = warped

        frames = frames.copy()

        # 2. Dịch + scale toàn khung trên (x, y) — mô phỏng đứng lệch/gần/xa camera.
        #    Chỉ áp lên điểm CÓ MẶT (điểm 0 = vắng, phải giữ nguyên 0).
        points = frames.reshape(len(frames), NUM_POINTS, 3)
        present = np.abs(points).sum(axis=2) > 1e-6
        scale = np.random.uniform(0.85, 1.15)
        tx, ty = np.random.uniform(-0.1, 0.1, size=2)
        xy = points[:, :, :2]
        transformed = (xy - 0.5) * scale + 0.5 + np.array([tx, ty], dtype=np.float32)
        points[:, :, :2] = np.where(present[:, :, None], transformed, xy)
        frames = points.reshape(len(frames), FRAME_DIMS)

        # 3. Jitter Gauss trên tọa độ khác 0
        nonzero = frames != 0
        frames[nonzero] += np.random.normal(0, 0.01, size=int(nonzero.sum())).astype(np.float32)

        # 4. Rơi frame: mô phỏng MediaPipe mất dấu tay vài frame
        drop = np.random.random(len(frames)) < 0.05
        frames[drop, :HAND_DIMS] = 0.0
        return frames.astype(np.float32)

    def _synthesize_no_sign(self, rng: np.random.Generator):
        """Cửa sổ NO_SIGN = đoạn LIÊN TỤC từ một run không-tay (lặp vòng nếu run ngắn)."""
        run = self.no_sign_runs[int(rng.integers(0, len(self.no_sign_runs)))]
        if len(run) >= self.window:
            start = int(rng.integers(0, len(run) - self.window + 1))
            x = run[start : start + self.window].copy()
        else:
            reps = -(-self.window // len(run))  # ceil
            x = np.tile(run, (reps, 1))[: self.window].copy()
        nonzero = x != 0
        x[nonzero] += rng.normal(0, 0.005, size=int(nonzero.sum())).astype(np.float32)
        mask = np.ones(self.window, dtype=bool)
        return torch.from_numpy(np.ascontiguousarray(x)), torch.from_numpy(mask), self.no_sign_index
