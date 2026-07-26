"""Trích landmark từ video Multi-VSL bằng MediaPipe Tasks Python.

QUAN TRỌNG: dùng CÙNG file model .task với browser
(apps/web/public/models/hand_landmarker.task + pose_landmarker_lite.task)
để phân bố landmark giữa huấn luyện và suy luận thật đồng nhất.

Chạy trên Colab (khuyến nghị — gần dữ liệu trên Drive) hoặc local:
    pip install mediapipe==0.10.21 opencv-python numpy
    python extract_landmarks.py --videos <thư mục video> --out <thư mục .npz>

TODO tuần 2-3:
  1. Đọc CSV split label_1_200 (center view) từ repo Multi-VSL
  2. Với mỗi video: đọc frame bằng OpenCV → HandLandmarker + PoseLandmarker
     (VIDEO mode) → vector 144 chiều/frame (khớp TranslateDemo.tsx)
  3. Chuẩn hóa: tâm = trung điểm vai, chia cho khoảng cách vai; thiếu tay → 0
  4. Lưu mỗi video một mảng (T, 144) vào file .npz theo gloss
  5. Xóa video ngay sau khi trích để tiết kiệm disk Colab
"""

if __name__ == "__main__":
    raise SystemExit(
        "Skeleton — sẽ hoàn thiện ở tuần 2-3 theo TODO trong docstring. "
        "Xem training/README.md cho pipeline đầy đủ."
    )
