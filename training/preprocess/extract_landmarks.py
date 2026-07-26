"""Trích landmark từ video VSL bằng MediaPipe Tasks Python.

QUY TẮC SỐNG CÒN (xem training/README.md): dùng CÙNG file model .task với browser
(apps/web/public/models/) và CÙNG cấu trúc vector 144 chiều với apps/web/src/lib/landmarks.ts:
    [tay trái 21×3 | tay phải 21×3 | vai-khuỷu-cổ tay 6×3], thiếu tay → 0,
    làm tròn 4 chữ số (khớp browser).

Chạy trên Colab (khuyến nghị) hoặc máy có GPU:
    pip install mediapipe opencv-python numpy tqdm

    python extract_landmarks.py \
        --videos /content/drive/MyDrive/datn/Videos_demo \
        --csv    /content/Multi-VSL_WACV_2025/data/label_1_200/train_center.csv \
        --models /content/signbridge/apps/web/public/models \
        --out    /content/drive/MyDrive/datn/landmarks/train

Kết quả: out/{label}/{tên_video}.npy — mảng float32 (T, 144), kèm out/index.csv.
Resume-safe: file đã có thì bỏ qua — chạy lại thoải mái khi Colab rớt phiên.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import cv2
import numpy as np
from tqdm import tqdm

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# Điểm pose thân trên: vai, khuỷu tay, cổ tay (trái + phải) — khớp landmarks.ts
UPPER_BODY_POSE = [11, 12, 13, 14, 15, 16]
FRAME_DIMS = 144


def build_landmarkers(models_dir: Path):
    hand_options = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(models_dir / "hand_landmarker.task")),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_hands=2,
    )
    pose_options = mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(models_dir / "pose_landmarker_lite.task")),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=1,
    )
    return (
        mp_vision.HandLandmarker.create_from_options(hand_options),
        mp_vision.PoseLandmarker.create_from_options(pose_options),
    )


def build_frame(hand_result, pose_result) -> np.ndarray:
    """Bản sao 1:1 của buildFrame trong apps/web/src/lib/landmarks.ts."""
    frame = np.zeros(FRAME_DIMS, dtype=np.float32)
    for i, landmarks in enumerate(hand_result.hand_landmarks):
        handedness = hand_result.handedness[i][0].category_name if hand_result.handedness else "Left"
        offset = 0 if handedness == "Left" else 63
        for j, p in enumerate(landmarks):
            frame[offset + j * 3 : offset + j * 3 + 3] = (
                round(p.x, 4), round(p.y, 4), round(p.z, 4))
    if pose_result.pose_landmarks:
        pose = pose_result.pose_landmarks[0]
        for j, idx in enumerate(UPPER_BODY_POSE):
            p = pose[idx]
            frame[126 + j * 3 : 126 + j * 3 + 3] = (
                round(p.x, 4), round(p.y, 4), round(p.z, 4))
    return frame


# MediaPipe VIDEO mode bắt buộc timestamp tăng đơn điệu TRÊN CÙNG một landmarker —
# reset về 0 ở video kế tiếp là văng lỗi. Dùng đồng hồ toàn cục chạy xuyên các video.
_CLOCK_MS = 0


def extract_video(video_path: Path, hand, pose) -> np.ndarray | None:
    global _CLOCK_MS
    _CLOCK_MS += 1000  # nhảy 1s giữa các video → tracker không "kéo" tay video trước sang
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return None
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step_ms = max(1, int(1000 / fps))
    frames: list[np.ndarray] = []
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        _CLOCK_MS += step_ms
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        hand_result = hand.detect_for_video(image, _CLOCK_MS)
        pose_result = pose.detect_for_video(image, _CLOCK_MS)
        frames.append(build_frame(hand_result, pose_result))
    cap.release()
    return np.stack(frames) if frames else None


def read_rows(csv_path: Path, video_col: str, label_col: str) -> list[tuple[str, str]]:
    """Đọc CSV split của Multi-VSL. Tự dò cột nếu tên mặc định không khớp."""
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames or []
        if video_col not in fields:
            candidates = [c for c in fields if "video" in c.lower() or "path" in c.lower() or "file" in c.lower()]
            if not candidates:
                raise SystemExit(f"Không tìm thấy cột video trong {fields} — truyền --video-col")
            video_col = candidates[0]
        if label_col not in fields:
            candidates = [c for c in fields if "label" in c.lower() or "gloss" in c.lower() or "class" in c.lower()]
            if not candidates:
                raise SystemExit(f"Không tìm thấy cột label trong {fields} — truyền --label-col")
            label_col = candidates[0]
        print(f"Dùng cột video='{video_col}', label='{label_col}'")
        return [(row[video_col], str(row[label_col])) for row in reader]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--videos", type=Path, required=True, help="Thư mục chứa video")
    parser.add_argument("--csv", type=Path, required=True, help="File split CSV (label_1_200)")
    parser.add_argument("--models", type=Path, required=True, help="Thư mục chứa *.task (dùng chung với web)")
    parser.add_argument("--out", type=Path, required=True, help="Thư mục ghi .npy")
    # Mặc định khớp CSV của Multi-VSL (cột: name,label,video_lb_id)
    parser.add_argument("--video-col", default="name")
    parser.add_argument("--label-col", default="label")
    args = parser.parse_args()

    rows = read_rows(args.csv, args.video_col, args.label_col)
    print(f"{len(rows)} video trong split")
    args.out.mkdir(parents=True, exist_ok=True)

    hand, pose = build_landmarkers(args.models)
    index_rows, skipped, failed = [], 0, 0

    for video_rel, label in tqdm(rows, unit="video"):
        video_path = args.videos / video_rel if not Path(video_rel).is_absolute() else Path(video_rel)
        out_file = args.out / label / (Path(video_rel).stem + ".npy")
        if out_file.exists():
            skipped += 1
            continue
        if not video_path.exists():
            failed += 1
            continue
        data = extract_video(video_path, hand, pose)
        if data is None or len(data) == 0:
            failed += 1
            continue
        out_file.parent.mkdir(parents=True, exist_ok=True)
        np.save(out_file, data)
        index_rows.append((str(out_file.relative_to(args.out)), label, len(data)))

    with open(args.out / "index.csv", "a", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(index_rows)

    print(f"Xong: {len(index_rows)} trích mới, {skipped} bỏ qua (đã có), {failed} lỗi/thiếu file")


if __name__ == "__main__":
    main()
