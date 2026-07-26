# Training — huấn luyện model nhận diện ký hiệu

Toàn bộ huấn luyện chạy trên **Google Colab / Kaggle (GPU miễn phí)**.
Máy local chỉ chạy tiền xử lý nhẹ và serve model ONNX đã export.

## Pipeline (theo khuyến nghị đã xác minh 07/2026)

```
Multi-VSL 200 (video, chỉ view chính diện)
  → trích landmark MỘT LẦN bằng MediaPipe Tasks Python
    (CÙNG file model .task với browser — xem quy tắc bên dưới)
  → lưu .npz/.parquet (~vài trăm MB) — từ đây KHÔNG đụng video nữa
  → train Transformer trên chuỗi landmark (Colab, log W&B)
  → export ONNX → apps/ml nạp chạy
```

## Quy tắc sống còn: train/deploy phải cùng bộ trích đặc trưng

Browser dùng `hand_landmarker.task` + `pose_landmarker_lite.task`
(bản 0.10.35, đã vendor trong `apps/web/public/models/`).
Khi trích landmark từ video huấn luyện **phải dùng đúng các file .task đó**
qua MediaPipe Tasks Python API — KHÔNG dùng API cũ `mp.solutions.holistic`
(phân bố landmark khác → model rớt accuracy âm thầm khi chạy thật).

Vector đặc trưng 144 chiều (khớp `apps/web/.../TranslateDemo.tsx`):
`[tay trái 21×3 | tay phải 21×3 | vai-khuỷu-cổ tay 6×3]`, thiếu tay → điền 0.

## Nguồn dữ liệu

| Nguồn | Link | Ghi chú |
|---|---|---|
| Multi-VSL (WACV 2025) — chính | github.com/Etdihatthoc/Multi-VSL_WACV_2025 | Drive công khai trong README repo; dùng subset `label_1_200`, view center; KHÔNG có file LICENSE → trích dẫn paper + nên email tác giả |
| VOYA_VSL — fallback | huggingface.co/datasets/Kateht/VOYA_VSL | 161 lớp, keypoint sẵn (60×1605), MIT, tải từng lớp bằng `hf_hub_download` |
| SPOTER — code tham khảo | github.com/matyasbohacek/spoter | Transformer pose-based đơn giản nhất để bắt đầu (Apache-2.0) |
| Kaggle GISLR 1st place | github.com/hoyso48/Google---Isolated-Sign-Language-Recognition-1st-place-solution | Kiến trúc 1D-CNN + Transformer — đích đến của model chính |

## Model & real-time (đã chốt sau xác minh)

- Model: **Transformer trên landmark** (bắt đầu từ SPOTER, nâng cấp theo GISLR 1st place). KHÔNG dùng GCN (phức tạp, lợi ích nhỏ ở 100-200 gloss).
- Train với lớp **"NO_SIGN"** (nền, tay nghỉ) — bắt buộc cho real-time.
- Sliding window khi suy luận: window 16-32 frame, stride 2-4, ngưỡng softmax ~0.7,
  vote N cửa sổ liên tiếp trước khi chốt gloss (tài liệu trích dẫn: arXiv 2302.07693).
- Split theo NGƯỜI KÝ (signer-independent) — không random split (thổi phồng accuracy).
- Log mọi thí nghiệm lên Weights & Biases (đăng ký academic plan — xem docs/SETUP-KEYS.md).

## Thư mục

- `preprocess/` — script trích landmark từ video (chạy Colab hoặc local)
- `experiments/` — notebook huấn luyện, mỗi thí nghiệm một file, tên: `exp01_baseline_lstm.ipynb`...
- `data/` — landmark đã trích (gitignored, sync qua Google Drive/Kaggle Datasets)
