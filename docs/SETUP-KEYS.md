# Hướng dẫn đăng ký tài khoản & lấy API key

> Tất cả đều **miễn phí**, không cần thẻ tín dụng (trừ mục tùy chọn cuối).
> Key lấy xong điền vào file `.env` (copy từ `.env.example`). **Không bao giờ commit `.env` lên git.**

---

## 1. Google AI Studio — Gemini API key (BẮT BUỘC)

Dùng để: LLM ghép chuỗi gloss thành câu tiếng Việt tự nhiên. Miễn phí (Flash tier).

1. Mở https://aistudio.google.com và đăng nhập bằng tài khoản Google.
2. Nhấn nút **"Get API key"** (góc trái trên hoặc trong menu).
3. Nhấn **"Create API key"** → chọn **"Create API key in new project"** (nếu chưa có project).
4. Copy chuỗi key hiện ra (dạng `AIza...`) → dán vào `.env`: `GEMINI_API_KEY=AIza...`
5. Xem hạn mức miễn phí thực tế của tài khoản bạn tại: https://aistudio.google.com/rate-limit
   (con số không công bố cố định — khoảng ~10 request/phút, 250-1500 request/ngày).

⚠️ Lưu ý: free tier của Gemini có thể dùng dữ liệu bạn gửi để cải thiện sản phẩm Google —
không gửi dữ liệu cá nhân nhạy cảm. Với đồ án thì không vấn đề.

## 2. Weights & Biases — log thí nghiệm ML (BẮT BUỘC từ tuần 4)

Dùng để: lưu biểu đồ loss/accuracy của mọi lần train — nguồn hình cho chương 4 báo cáo.

1. Mở https://wandb.ai và nhấn **Sign up**.
2. **Đăng ký bằng email trường (.edu.vn)** nếu có → được nâng cấp **academic plan miễn phí**
   (tính năng Pro + 200GB). Nếu không có email trường, tài khoản thường vẫn đủ dùng (100GB).
3. Sau khi đăng nhập, lấy API key tại: https://wandb.ai/authorize
4. Copy key → dán vào `.env`: `WANDB_API_KEY=...`
5. Trong notebook Colab, đăng nhập bằng:
   ```python
   import wandb
   wandb.login(key="KEY_CỦA_BẠN")  # hoặc đặt biến môi trường WANDB_API_KEY
   ```

## 3. Kaggle — GPU miễn phí + lưu dataset (BẮT BUỘC từ tuần 3)

Dùng để: train model trên GPU T4/P100 miễn phí (~30 giờ/tuần), lưu bộ landmark đã trích.

1. Mở https://www.kaggle.com → **Register** (đăng ký bằng Google cho nhanh).
2. **Xác minh số điện thoại** (bắt buộc để dùng GPU): vào https://www.kaggle.com/settings
   → mục **Phone verification** → nhập số → nhập mã OTP.
3. Lấy API token (giao diện mới 2026): https://www.kaggle.com/settings → tab **API Tokens**
   → **"Generate New Token"** → copy token dạng `KGAT_...`.
4. ✅ ĐÃ SETUP: token đã lưu tại `C:\Users\khoa\.kaggle\access_token` và trong `.env`
   (biến `KAGGLE_API_TOKEN`) — CLI kaggle tự đọc.
5. Bật GPU trong notebook Kaggle: **Settings** (bên phải) → **Accelerator** → **GPU T4 x2**.

## 4. Google Colab — GPU miễn phí thứ hai (BẮT BUỘC từ tuần 3)

Dùng để: train + tiền xử lý gần dữ liệu trên Google Drive (Multi-VSL nằm trên Drive).

1. Không cần đăng ký gì — mở https://colab.research.google.com bằng tài khoản Google là chạy.
2. Bật GPU: menu **Runtime** → **Change runtime type** → **Hardware accelerator: T4 GPU** → Save.
3. Mount Drive trong notebook (để đọc dataset):
   ```python
   from google.colab import drive
   drive.mount("/content/drive")
   ```

## 5. HuggingFace — tải dataset & model (BẮT BUỘC từ tuần 2)

Dùng để: tải VOYA_VSL (dataset fallback), PhoWhisper (ASR tiếng Việt).

1. Mở https://huggingface.co/join → đăng ký bằng email → xác nhận email.
2. Lấy token tại: https://huggingface.co/settings/tokens
3. Nhấn **"Create new token"** → Token type chọn **Read** → đặt tên `signbridge` → **Create**.
4. Copy token (dạng `hf_...`) → dán vào `.env`: `HF_TOKEN=hf_...`

## 6. GitHub — repo + CI miễn phí (BẮT BUỘC ngay tuần này)

1. Nếu chưa có tài khoản: https://github.com/join
2. Tạo repo mới: https://github.com/new → tên `signbridge` →
   **khuyến nghị để PUBLIC** (repo public được GitHub Actions CI **không giới hạn phút chạy**;
   repo private chỉ có 2.000 phút/tháng). Không tick "Add README" (đã có sẵn).
3. Push code lên (chạy trong `d:\Khoa\DATN`):
   ```powershell
   git remote add origin https://github.com/<username>/signbridge.git
   git add -A
   git commit -m "Khung du an SignBridge: Next.js + Spring Modulith + FastAPI"
   git push -u origin main
   ```
   Lần đầu push, Git sẽ mở browser để đăng nhập GitHub — làm theo hướng dẫn là xong.

## 7. Dataset Multi-VSL — KHÔNG cần key (tải từ tuần 2)

Hai link Google Drive **công khai** (nằm trong README của repo
https://github.com/Etdihatthoc/Multi-VSL_WACV_2025 — link trực tiếp đây):

- **Video dataset**: https://drive.google.com/drive/folders/1yUU1m2hy_CjaXDDoR_6i9Y3T1XL2pD4C
- **Checkpoint model**: https://drive.google.com/drive/folders/1l820AALsFHOxnFVQiJR82eNkKVTv91mj

Cách thêm vào Drive của bạn (để Colab đọc được, KHÔNG tốn dung lượng Drive):

1. Mở link video ở trên (đăng nhập Google sẵn).
2. Nhìn **tên folder ở thanh trên cùng** → nhấn vào **mũi tên ▾ cạnh tên folder**
   → chọn **"Sắp xếp" (Organize)** → **"Thêm lối tắt" (Add shortcut)**
   → chọn **"Drive của tôi"** → **Thêm**.
   (Giao diện cũ: chuột phải vào tên folder → "Thêm lối tắt vào Drive".)
3. Làm tương tự với link checkpoint.
4. Xong — trên Colab sau khi mount Drive, dataset nằm ở
   `/content/drive/MyDrive/<tên folder lối tắt>`.
3. **Chỉ lấy subset 200 gloss, view chính diện (center)** — danh sách file nằm trong
   `data/label_1_200/` của repo. Đừng tải cả 84.000 video (~hàng chục GB).
4. Trích dẫn trong báo cáo: paper WACV 2025 "Sign Language Recognition: A Large-Scale
   Multi-View Dataset and Comprehensive Evaluation". Repo không có file LICENSE —
   nên gửi email cho nhóm tác giả xin xác nhận dùng cho mục đích học thuật (mẫu email
   mình sẽ soạn giúp khi bạn cần).

## 8. edge-tts — giọng đọc tiếng Việt, KHÔNG cần key (tuần 8)

- Cài: `pip install edge-tts` — dùng giọng `vi-VN-HoaiMyNeural` (nữ) / `vi-VN-NamMinhNeural` (nam).
- ⚠️ Dịch vụ này thỉnh thoảng bị Microsoft chặn 403 → chiến lược của dự án là
  **sinh sẵn file MP3 cho các câu/gloss thường dùng** và cache lại, chỉ gọi live cho câu mới.

## 9. Web Speech API — nhận dạng giọng nói, KHÔNG cần key (tuần 10)

- Có sẵn trong Chrome, hỗ trợ tiếng Việt. Từ Chrome 139+ còn chạy **on-device** (offline).
- Trước ngày demo: mở `chrome://components` trên máy demo để chắc chắn gói ngôn ngữ
  nhận dạng giọng nói đã tải sẵn.

---

## (Tùy chọn — có thẻ tín dụng mới làm được, KHÔNG bắt buộc)

- **Google Cloud TTS**: 1 triệu ký tự WaveNet miễn phí/tháng, giọng vi-VN chất lượng cao,
  nhưng phải bật billing bằng thẻ. Chỉ cân nhắc nếu edge-tts không ổn định.
- **Claude API (Anthropic)**: không có free tier; dự phòng nếu Gemini đổi hạn mức
  (mỗi lần ghép câu tốn ~vài chục đồng). Code đã thiết kế để đổi LLM chỉ bằng config.

## Checklist tổng

- [ ] Gemini API key → `.env`
- [ ] W&B key (email trường nếu có) → `.env`
- [ ] Kaggle + xác minh SĐT + `kaggle.json`
- [ ] Thử mở Colab, bật GPU T4
- [ ] HuggingFace token → `.env`
- [ ] Tạo repo GitHub PUBLIC + push code
- [ ] Add shortcut 2 folder Drive của Multi-VSL
