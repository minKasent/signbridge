# VSL400 — manifest công khai (chờ quyền tải dữ liệu)

Nguồn: github.com/Wbao176/Vietnamese_Sign_Language_Project (bên thứ ba đã được cấp dataset).
Dataset gốc: Zenodo record **17943574** (CC-BY-4.0, restricted — đã gửi request) —
paper "VSL400: A Multi-view Dataset for Vietnamese Word-Level Sign Language Recognition"
(DOI 10.22541/au.177075292.21810740): 24.753 lượt ký × 3 góc quay, 400 gloss, 28 người ký.

| File | Nội dung |
|---|---|
| `label_map.json` | 400 tên ký hiệu tiếng Việt → id 0-399 ("Anh"→0, "Bác sĩ"→11...) |
| `train/val/test.csv` | 17.104 / 2.885 / 4.764 dòng: video_id, signer_id, fps, resolution, gloss, num_frames, length_seconds |

⚠️ **Split này KHÔNG signer-independent** (cả 26 người ký xuất hiện ở cả 3 split — kiểm
chứng 26/07/2026). Khi có dữ liệu: **tự chia lại theo signer_id** (giữ nguyên tỷ lệ
~70/12/18, dành trọn vài người ký cho val/test) trước khi trích landmark bằng
`preprocess/extract_landmarks.py` — nếu dùng nguyên split công khai thì accuracy sẽ
lạc quan giả tạo và mất tính so sánh khoa học.

Điểm cộng lớn so với Multi-VSL: có sẵn **tên gloss tiếng Việt** → nối thẳng vào
module dictionary + prompt LLM ghép câu, không phải xin ánh xạ nhãn.
