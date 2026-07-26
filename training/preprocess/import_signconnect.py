"""Import clip ký hiệu từ SignConnect (từ điển VSL quốc gia QIPEDC) vào SignBridge.

Nguồn: huggingface.co/datasets/Lakeserl/SignConnect — 4.362 video của từ điển
ngôn ngữ ký hiệu quốc gia (qipedc.moet.gov.vn, dự án Bộ GD&ĐT/World Bank).
Hậu tố B/N/T trong tên file = biến thể vùng miền Bắc/Nam/Trung (ưu tiên B).

Đi qua API thật của backend (đăng nhập admin → tạo ký hiệu → upload clip) nên
Spring core phải đang chạy. Idempotent: ký hiệu đã có clip thì bỏ qua.

    python import_signconnect.py [--api http://localhost:8080] [--force]
"""

from __future__ import annotations

import argparse
import io
import json
import urllib.request

HF_BASE = "https://huggingface.co/datasets/Lakeserl/SignConnect/resolve/main/Videos"
ADMIN = {"email": "admin@signbridge.vn", "password": "signbridge-admin-dev"}

# (gloss, nghĩa tiếng Việt, chủ đề, file video QIPEDC — None nếu từ điển quốc gia không có)
VOCAB = [
    ("XIN_CHAO", "xin chào", "GREETING", "W00489.mp4"),
    ("TAM_BIET", "tạm biệt", "GREETING", "W03075.mp4"),
    ("XIN_LOI", "xin lỗi", "GREETING", "W03990.mp4"),
    ("BAN", "bạn", "DAILY", "W00110B.mp4"),
    ("KHAM_BENH", "khám bệnh", "MEDICAL", "W01767.mp4"),
    ("GIUP_DO", "giúp đỡ", "DAILY", "W01497B.mp4"),
    ("DAU_BUNG", "đau bụng", "MEDICAL", "D0356.mp4"),
    ("DAU_TAY", "đau tay", "MEDICAL", "D0357.mp4"),
    ("DAU_CHAN", "đau chân", "MEDICAL", "D0358.mp4"),
    ("DAU_MAT", "đau mắt", "MEDICAL", "D0355.mp4"),
    ("SOT", "sốt", "MEDICAL", "W03008.mp4"),
    ("BENH_NHAN", "bệnh nhân", "MEDICAL", "W00248.mp4"),
    ("CHUA_BENH", "chữa bệnh", "MEDICAL", "W00716.mp4"),
    ("KHOE_MANH", "khoẻ mạnh", "MEDICAL", "W01823.mp4"),
    ("BO", "bố", "DAILY", "W00325.mp4"),
    ("CHA_ME", "cha mẹ", "DAILY", "W00482.mp4"),
    ("DI", "đi", "DAILY", "W01190.mp4"),
    ("DI_HOC", "đi học", "DAILY", "W01191.mp4"),
    ("LAM_VIEC", "làm việc", "DAILY", "W01928.mp4"),
    ("MUON", "muốn", "DAILY", "W02221B.mp4"),
    ("DOI", "đợi", "DAILY", "W01304B.mp4"),
    ("HIEU", "hiểu", "DAILY", "W01591B.mp4"),
    ("NGHE", "nghe", "DAILY", "W02353.mp4"),
    ("NOI_CHUYEN", "nói chuyện", "DAILY", "W02523.mp4"),
    ("TEN_LA_GI", "tên là gì", "DAILY", "W03129N.mp4"),
    ("BAO_NHIEU", "bao nhiêu", "DAILY", "W00147.mp4"),
    ("DUNG_KHONG", "đúng không", "DAILY", "D0119B.mp4"),
    ("VUI_MUNG", "vui mừng", "DAILY", "W03889B.mp4"),
    ("CO_GIAO", "cô giáo", "DAILY", "W00812B.mp4"),
    ("TOI_YEU_BAN", "tôi yêu bạn", "DAILY", "W04056B.mp4"),
]


def api(base: str, path: str, payload=None, token: str | None = None, method=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as res:
        return json.load(res)


def upload_clip(base: str, sign_id: int, token: str, video: bytes, filename: str):
    boundary = "----signbridge"
    body = io.BytesIO()
    body.write(f"--{boundary}\r\n".encode())
    body.write(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode())
    body.write(b"Content-Type: video/mp4\r\n\r\n")
    body.write(video)
    body.write(f"\r\n--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        f"{base}/api/signs/{sign_id}/clip", data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}",
                 "Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as res:
        return json.load(res)


def strip_diacritics(text: str) -> str:
    import unicodedata
    text = text.replace("đ", "d").replace("Đ", "D")
    decomposed = unicodedata.normalize("NFD", text)
    return "".join(c for c in decomposed if unicodedata.category(c) != "Mn")


def make_gloss(label: str, taken: set[str]) -> str:
    import re
    slug = re.sub(r"[^A-Z0-9]+", "_", strip_diacritics(label).upper()).strip("_")[:60] or "TU"
    gloss, n = slug, 2
    while gloss in taken:
        gloss, n = f"{slug}_{n}", n + 1
    taken.add(gloss)
    return gloss


_EXISTING_GLOSSES: set[str] = set()


def full_vocab() -> list[tuple[str, str, str, str]]:
    """Toàn bộ kho QIPEDC: mỗi từ một clip (ưu tiên biến thể B > không hậu tố > N > T)."""
    import csv
    import io as _io
    with urllib.request.urlopen(
            "https://huggingface.co/datasets/Lakeserl/SignConnect/resolve/main/Text/label.csv") as res:
        rows = list(csv.DictReader(_io.TextIOWrapper(res, encoding="utf-8")))
    by_label: dict[str, list[str]] = {}
    for r in rows:
        by_label.setdefault(r["LABEL"].strip(), []).append(r["VIDEO"].strip())

    def preference(video: str) -> int:
        stem = video.rsplit(".", 1)[0]
        return {"B": 0, "N": 2, "T": 3}.get(stem[-1], 1)

    # Seed bằng gloss ĐÃ CÓ trong DB — chạy lại sau khi bị ngắt sẽ không đụng slug cũ
    taken: set[str] = set(_EXISTING_GLOSSES)
    vocab = []
    for label, videos in sorted(by_label.items()):
        video = sorted(videos, key=preference)[0]
        vocab.append((make_gloss(label, taken), label, "TUDIEN", video))
    return vocab


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8080")
    parser.add_argument("--force", action="store_true", help="Upload lại cả clip đã có")
    parser.add_argument("--all", action="store_true",
                        help="Import TOÀN BỘ kho QIPEDC (~3.300 từ, chạy 1-2 giờ) thay vì bộ khởi đầu")
    args = parser.parse_args()

    token = api(args.api, "/api/auth/login", ADMIN)["token"]
    existing = {s["gloss"]: s for s in api(args.api, "/api/signs")}
    _EXISTING_GLOSSES.update(existing)

    vocab = VOCAB
    if args.all:
        existing_meanings = {s["meaningVi"].strip().lower() for s in existing.values()}
        seen_meanings: set[str] = set()
        vocab = []
        for g, m, c, v in full_vocab():
            key = m.strip().lower()
            if key not in existing_meanings and key not in seen_meanings:
                seen_meanings.add(key)
                vocab.append((g, m, c, v))
        print(f"Chế độ --all: {len(vocab)} từ mới cần import")

    done = skipped = failed = 0
    for gloss, meaning, category, video_file in vocab:
        sign = existing.get(gloss)
        if sign is None:
            try:
                sign = api(args.api, "/api/signs",
                           {"gloss": gloss, "meaningVi": meaning, "category": category}, token)
                if not args.all:
                    print(f"+ Tạo ký hiệu {gloss} ({meaning})")
            except Exception as e:  # noqa: BLE001 — trùng slug từ đợt chạy dở → bỏ qua, đi tiếp
                print(f"✗ Không tạo được {gloss} ({meaning}): {e}")
                failed += 1
                continue
        if video_file is None:
            continue
        if sign.get("clipUrl") and not args.force:
            skipped += 1
            continue
        try:
            with urllib.request.urlopen(f"{HF_BASE}/{video_file}") as res:
                video = res.read()
            upload_clip(args.api, sign["id"], token, video, video_file)
            done += 1
            if not args.all or done % 100 == 0:
                print(f"✓ [{done}] {gloss}: {video_file} ({len(video)//1024} KB)")
        except Exception as e:  # noqa: BLE001 — báo lỗi từng clip, không dừng cả đợt
            print(f"✗ {gloss}: {video_file} LỖI — {e}")
            failed += 1

    print(f"\nXong: {done} clip mới, {skipped} bỏ qua (đã có), {failed} lỗi")


if __name__ == "__main__":
    main()
