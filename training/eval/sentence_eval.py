"""Đánh giá chất lượng khâu ghép câu: chuỗi gloss VSL → câu tiếng Việt.

Đây là số liệu cho chương 4 báo cáo. Ba lớp đo, từ khách quan đến chủ quan:

  1. ĐO TỰ ĐỘNG (không cần ai chấm) — kiểm được đúng/sai bằng luật:
     - phủ nội dung : mọi gloss có xuất hiện trong câu không (không bỏ sót ý)
     - không bịa    : câu có thêm danh/động từ lạ không có trong gloss không
     - đúng dạng    : đúng MỘT câu, có dấu kết, không xuống dòng, không giải thích
     - lặp gloss    : nhóm E — mô hình có gộp gloss lặp lại không

  2. LLM CHẤM (tham khảo, có thể tái lập) — Likert 1-5 trên 3 trục, temperature 0.

  3. NGƯỜI CHẤM (số liệu chính thức của báo cáo) — script sinh sẵn phiếu chấm
     `phieu-cham.csv` với cột trống để người thật điền. LLM tự chấm mình thì
     không đủ tin cậy để đưa vào báo cáo như kết quả chính.

Prompt hệ thống được ĐỌC THẲNG từ SentenceComposer.java, không chép lại — nếu
prompt production đổi mà đây không đổi thì con số đánh giá là số của một hệ
thống không tồn tại.

    python training/eval/sentence_eval.py [--limit N] [--no-judge]
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Console Windows mặc định cp1252, in tiếng Việt là ném UnicodeEncodeError.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
COMPOSER_JAVA = ROOT / "apps/core/src/main/java/vn/signbridge/translation/SentenceComposer.java"
CASES_JSON = Path(__file__).with_name("gloss_sequences.json")
OUT_DIR = ROOT / "docs/report/data"
OUT_JSON = OUT_DIR / "sentence-eval.json"

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
MODEL = "gemini-flash-latest"


class HetQuotaNgay(RuntimeError):
    """Cạn quota theo NGÀY — chờ thêm vô ích, phải dừng và chạy lại hôm sau."""

# Nghĩa tiếng Việt của từng gloss — dùng để kiểm "phủ nội dung" và "không bịa".
# Mỗi gloss có nhiều biến thể chấp nhận được (câu tự nhiên hay đổi từ).
GLOSS_WORDS: dict[str, list[str]] = {
    "XIN_CHAO": ["chào"],
    "TAM_BIET": ["tạm biệt", "chào"],
    "XIN_LOI": ["xin lỗi"],
    "CAM_ON": ["cảm ơn", "cám ơn"],
    "TOI": ["tôi", "em", "mình"],
    "BAN": ["bạn", "cậu"],
    "BAC_SI": ["bác sĩ"],
    "CO_GIAO": ["cô giáo", "cô"],
    "BENH_NHAN": ["bệnh nhân"],
    "CHA_ME": ["bố mẹ", "cha mẹ", "ba mẹ"],
    "BO": ["bố", "ba", "cha"],
    "DAU": ["đau"],
    "DAU_BUNG": ["đau bụng"],
    "DAU_TAY": ["đau tay"],
    "DAU_CHAN": ["đau chân"],
    "DAU_MAT": ["đau mắt"],
    "SOT": ["sốt"],
    "KHAM_BENH": ["khám bệnh", "khám"],
    "CHUA_BENH": ["chữa bệnh", "chữa", "điều trị"],
    "KHOE_MANH": ["khoẻ", "khỏe"],
    "GIUP_DO": ["giúp đỡ", "giúp"],
    "MUON": ["muốn", "cần"],
    "DOI": ["đợi", "chờ"],
    "HIEU": ["hiểu"],
    "NGHE": ["nghe"],
    "NOI_CHUYEN": ["nói chuyện", "nói"],
    "DI": ["đi"],
    "DI_HOC": ["đi học", "học"],
    "LAM_VIEC": ["làm việc", "đi làm", "làm"],
    "TEN_LA_GI": ["tên"],
    "BAO_NHIEU": ["bao nhiêu", "mấy"],
    "DUNG_KHONG": ["đúng không", "không", "phải không", "chứ"],
    "VUI_MUNG": ["vui", "mừng"],
    "TOI_YEU_BAN": ["yêu"],
}

# Hư từ + đại từ mà mô hình ĐƯỢC PHÉP thêm: ngữ pháp VSL vốn lược bỏ chúng, thêm
# vào chính là việc cần làm. Từ ngoài danh sách này mà không thuộc gloss nào thì
# tính là "bịa thêm nội dung".
FUNCTION_WORDS = {
    "là", "bị", "của", "với", "cho", "và", "rồi", "được", "đã", "đang", "sẽ",
    "một", "các", "những", "này", "kia", "đó", "ạ", "nhé", "nhá", "vậy", "thì",
    "ở", "tại", "về", "từ", "đến", "để", "mà", "hay", "hoặc", "cũng", "rất",
    "quá", "lắm", "không", "có", "phải", "vẫn", "còn", "nữa", "đi", "gì", "sao",
    "ơi", "à", "ừ", "dạ", "vâng", "xin", "làm", "thấy", "cùng", "nên", "hãy",
    "tôi", "bạn", "em", "anh", "chị", "mình", "chúng", "ta", "họ", "nó",
    # tiểu từ cuối câu + từ chỉ hướng/thể — tiếng Việt bắt buộc có, VSL lược bỏ
    "đây", "ấy", "nha", "thôi", "luôn", "ngay", "nào", "hả", "chứ", "cả",
    "hơi", "khá", "thật", "đều", "vừa", "mới", "chưa", "ra", "vào", "lên",
    "xuống", "sang", "qua", "lại", "giúp",
}

SENTENCE_END = ".!?…"


# ---------------------------------------------------------------- tiện ích


def doc_system_prompt() -> str:
    """Bóc text block SYSTEM_PROMPT khỏi SentenceComposer.java.

    Java text block bỏ khoảng trắng thừa tính theo dòng thụt ít nhất, nên ở đây
    cũng phải bỏ y hệt — nếu không, prompt gửi đi sẽ khác prompt production.
    """
    src = COMPOSER_JAVA.read_text(encoding="utf-8")
    m = re.search(r'SYSTEM_PROMPT\s*=\s*"""\r?\n(.*?)"""', src, re.S)
    if not m:
        sys.exit(f"Không tìm thấy SYSTEM_PROMPT trong {COMPOSER_JAVA}")
    lines = m.group(1).split("\n")
    lines = [l.rstrip("\r") for l in lines]
    indents = [len(l) - len(l.lstrip()) for l in lines if l.strip()]
    cut = min(indents) if indents else 0
    return "\n".join(l[cut:] if len(l) >= cut else l for l in lines).strip()


def doc_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("Thiếu GEMINI_API_KEY (đặt trong .env ở gốc repo hoặc biến môi trường).")


def goi_gemini(key: str, system: str, user: str, temperature: float) -> str:
    """Gọi Gemini, tự lùi khi bị giới hạn tốc độ.

    Gói miễn phí giới hạn theo PHÚT, nên khi dính 429 phải chờ hàng chục giây chứ
    không phải vài giây — lùi 3s như trước là chắc chắn dính lại lần nữa.
    """
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"parts": [{"text": user}]}],
        "generationConfig": {"temperature": temperature, "maxOutputTokens": 500},
    }
    data_bytes = json.dumps(body).encode()
    url = GEMINI_URL.format(model=MODEL, key=key)

    for attempt in range(6):
        req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                data = json.load(res)
            parts = data["candidates"][0]["content"]["parts"]
            return parts[0]["text"].strip()
        except urllib.error.HTTPError as e:
            if e.code == 429:
                # Phân biệt HAI loại 429: vượt số request/phút (chờ là qua) và cạn quota
                # theo NGÀY (chờ bao lâu cũng vô ích). Trước đây gộp làm một nên mỗi ca
                # đốt 5 phút backoff vô nghĩa rồi mới bỏ cuộc.
                than = e.read().decode("utf-8", "replace")
                if "PerDay" in than or "per day" in than.lower():
                    raise HetQuotaNgay(than[:200]) from e
            if e.code not in (429, 500, 502, 503) or attempt == 5:
                raise
            cho = e.headers.get("Retry-After")
            giay = int(cho) if (cho or "").isdigit() else (20 if e.code == 429 else 5) * (attempt + 1)
            print(f"       (HTTP {e.code} — chờ {giay}s rồi thử lại, lần {attempt + 2}/6)", flush=True)
            time.sleep(giay)
    return ""


def chuan_hoa(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower().strip())


def tach_tu(s: str) -> list[str]:
    return re.findall(r"[^\W\d_]+", chuan_hoa(s), re.UNICODE)


# ------------------------------------------------------- đo tự động (lớp 1)


def do_tu_dong(case: dict, cau: str) -> dict:
    glosses = case["glosses"]
    thap = chuan_hoa(cau)

    thieu = []
    for g in dict.fromkeys(glosses):  # bỏ trùng, giữ thứ tự
        bien_the = GLOSS_WORDS.get(g, [])
        if not any(b in thap for b in bien_the):
            thieu.append(g)
    phu_noi_dung = len(thieu) == 0

    tu_duoc_phep = set(FUNCTION_WORDS)
    for g in glosses:
        for b in GLOSS_WORDS.get(g, []):
            tu_duoc_phep.update(tach_tu(b))
    tu_la = [t for t in tach_tu(cau) if t not in tu_duoc_phep]
    khong_bia = len(tu_la) == 0

    mot_cau = (
        "\n" not in cau.strip()
        and cau.strip().endswith(tuple(SENTENCE_END))
        and cau.count(".") + cau.count("!") + cau.count("?") <= 1
    )

    # Nhóm E: gloss lặp phải được gộp, không được lặp từ trong câu
    lap_tu = False
    if len(glosses) != len(set(glosses)):
        tu = tach_tu(cau)
        lap_tu = any(tu[i] == tu[i + 1] for i in range(len(tu) - 1))

    return {
        "phu_noi_dung": phu_noi_dung,
        "gloss_thieu": thieu,
        "khong_bia": khong_bia,
        "tu_la": tu_la,
        "mot_cau": mot_cau,
        "lap_tu": lap_tu,
    }


# --------------------------------------------------------- LLM chấm (lớp 2)

JUDGE_PROMPT = """Bạn là giám khảo chấm chất lượng dịch ngôn ngữ ký hiệu tiếng Việt (VSL).
Người dùng đưa: chuỗi gloss VSL, câu tiếng Việt do hệ thống sinh ra, và một câu tham chiếu.
Chấm câu hệ thống theo thang Likert 1-5 trên ĐÚNG BA trục:

- dung_y      : có đúng ý của chuỗi gloss không (5 = đúng hoàn toàn, 1 = sai nghĩa)
- ngu_phap    : câu tiếng Việt có đúng ngữ pháp không (5 = chuẩn, 1 = sai nặng)
- tu_nhien    : người Việt có nói như vậy không (5 = rất tự nhiên, 1 = máy móc)

Câu tham chiếu CHỈ để tham khảo — diễn đạt khác mà vẫn đúng ý thì KHÔNG bị trừ điểm.
Chỉ trả về đúng một dòng JSON, không giải thích, không markdown:
{"dung_y": <1-5>, "ngu_phap": <1-5>, "tu_nhien": <1-5>, "nhan_xet": "<tối đa 12 từ>"}"""


def llm_cham(key: str, case: dict, cau: str) -> dict:
    user = (
        f"gloss: {' / '.join(case['glosses'])}\n"
        f"câu hệ thống: {cau}\n"
        f"câu tham chiếu: {case['cau_tham_chieu']}"
    )
    raw = goi_gemini(key, JUDGE_PROMPT, user, temperature=0.0)
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        return {"dung_y": None, "ngu_phap": None, "tu_nhien": None, "nhan_xet": "không đọc được"}
    try:
        d = json.loads(m.group(0))
    except json.JSONDecodeError:
        return {"dung_y": None, "ngu_phap": None, "tu_nhien": None, "nhan_xet": "JSON hỏng"}
    return {
        "dung_y": d.get("dung_y"),
        "ngu_phap": d.get("ngu_phap"),
        "tu_nhien": d.get("tu_nhien"),
        "nhan_xet": str(d.get("nhan_xet", ""))[:60],
    }


# ------------------------------------------------------------------ chạy


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="chỉ chạy N ca đầu (để thử nhanh)")
    ap.add_argument("--judge", action="store_true",
                    help="bật LLM chấm (tốn GẤP ĐÔI quota — mặc định tắt)")
    ap.add_argument("--force", action="store_true", help="chạy lại cả ca đã có kết quả")
    ap.add_argument("--sleep", type=float, default=7.0,
                    help="giãn cách giữa hai lượt gọi API, giây (gói miễn phí ~10 req/phút)")
    args = ap.parse_args()

    key = doc_api_key()
    system = doc_system_prompt()
    cases = json.loads(CASES_JSON.read_text(encoding="utf-8"))["cases"]
    if args.limit:
        cases = cases[: args.limit]

    # Chạy tiếp được: quota miễn phí của Gemini tính theo NGÀY nên bộ 30 ca thường
    # không chạy hết trong một lượt. Nạp lại kết quả cũ và chỉ làm ca còn thiếu.
    da_co: dict[int, dict] = {}
    if OUT_JSON.exists() and not args.force:
        try:
            da_co = {r["id"]: r for r in json.loads(OUT_JSON.read_text(encoding="utf-8"))
                     if r.get("cau_he_thong")}
        except (json.JSONDecodeError, KeyError, TypeError):
            da_co = {}

    con_thieu = [c for c in cases if c["id"] not in da_co]
    print(f"Prompt hệ thống đọc từ {COMPOSER_JAVA.name} ({len(system)} ký tự)")
    print(f"Model: {MODEL} · {len(cases)} ca · đã có {len(da_co)} · cần chạy {len(con_thieu)}")
    print(f"LLM chấm: {'BẬT' if args.judge else 'tắt (thêm --judge để bật)'}\n")

    ket_qua = [da_co[c["id"]] for c in cases if c["id"] in da_co]
    for i, case in enumerate(con_thieu):
        if i:
            time.sleep(args.sleep)
        gloss_line = " / ".join(case["glosses"])
        t0 = time.monotonic()
        try:
            cau = goi_gemini(key, system, gloss_line, temperature=0.2)
            cau = cau.strip().splitlines()[0].strip() if cau.strip() else ""
        except HetQuotaNgay:
            print(f"\n  Đã cạn quota miễn phí trong NGÀY. Dừng ở ca #{case['id']}.")
            print(f"  Kết quả {len(ket_qua)} ca đã lưu — chạy lại lệnh này ngày mai để làm tiếp.")
            break
        except Exception as e:  # noqa: BLE001 — ghi lỗi vào bảng thay vì dừng cả lượt chạy
            cau = ""
            print(f"  [{case['id']:2}] LỖI ghép câu: {str(e)[:80]}", flush=True)
        do_tre_ms = int((time.monotonic() - t0) * 1000)

        tu_dong = do_tu_dong(case, cau) if cau else {}
        cham = {}
        if cau and args.judge:
            time.sleep(args.sleep)
            try:
                cham = llm_cham(key, case, cau)
            except Exception as e:  # noqa: BLE001 — mất điểm chấm không được làm hỏng cả lượt
                print(f"  [{case['id']:2}] LỖI chấm: {str(e)[:80]}", flush=True)

        dat = tu_dong.get("phu_noi_dung") and tu_dong.get("khong_bia") and tu_dong.get("mot_cau")
        print(f"  [{case['id']:2}] {'✓' if dat else '✗'} {gloss_line:44} → {cau}", flush=True)
        if tu_dong.get("gloss_thieu"):
            print(f"       thiếu ý: {', '.join(tu_dong['gloss_thieu'])}", flush=True)
        if tu_dong.get("tu_la"):
            print(f"       từ lạ:  {', '.join(tu_dong['tu_la'])}", flush=True)

        if cau:
            ket_qua.append({**case, "cau_he_thong": cau, "do_tre_ms": do_tre_ms, **tu_dong, **cham})
            # Ghi NGAY sau mỗi ca. Lần chạy trước bị dừng giữa chừng vì hết quota và
            # mất trắng 10 ca đã gọi API xong — sẽ không để lặp lại.
            ghi_ket_qua(ket_qua)

    if not ket_qua:
        print("\nChưa có ca nào chạy được. Hết quota thì mai chạy lại — script tự chạy tiếp.")
        return 1

    ghi_ket_qua(ket_qua)
    viet_phieu_cham(ket_qua)
    viet_bao_cao(ket_qua, system, tong_ca=len(cases))
    thieu = len(cases) - len(ket_qua)
    print(f"\nĐã ghi: {OUT_DIR}/sentence-eval.{{json,md}} và phieu-cham.csv")
    if thieu:
        print(f"CÒN THIẾU {thieu}/{len(cases)} ca (hết quota). Chạy lại lệnh này để làm nốt.")
    return 0


def ghi_ket_qua(rows: list[dict]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def viet_phieu_cham(rows: list[dict]) -> None:
    """Phiếu để người thật chấm — 3 cột điểm để trống."""
    with (OUT_DIR / "phieu-cham.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "chuoi_gloss", "cau_he_thong", "dung_y_1_5", "ngu_phap_1_5", "tu_nhien_1_5"])
        for r in rows:
            w.writerow([r["id"], " / ".join(r["glosses"]), r["cau_he_thong"], "", "", ""])


def viet_bao_cao(rows: list[dict], system: str, tong_ca: int) -> None:
    n = len(rows)
    dem = lambda k: sum(1 for r in rows if r.get(k))  # noqa: E731
    # Chỉ tính ca gọi thành công ngay: ca phải thử lại đã cộng cả thời gian nằm chờ
    # giới hạn tốc độ, đưa vào là số độ trễ sai hoàn toàn.
    tre = [r["do_tre_ms"] for r in rows if r.get("cau_he_thong") and r.get("do_tre_ms", 0) < 15000]
    diem = {
        t: [r[t] for r in rows if isinstance(r.get(t), (int, float))]
        for t in ("dung_y", "ngu_phap", "tu_nhien")
    }

    L = [
        "# Đánh giá chất lượng khâu ghép câu (gloss → tiếng Việt)",
        "",
        "> Sinh tự động bởi `training/eval/sentence_eval.py`. **Không sửa tay** — chạy lại script.",
        "",
        f"- Bộ kiểm thử: **{tong_ca} chuỗi gloss** (`training/eval/gloss_sequences.json`)",
        f"- Đã chạy được: **{n}/{tong_ca} ca**"
        + ("" if n == tong_ca else "  ⚠️ chưa đủ — hết quota miễn phí, chạy lại script để làm nốt"),
        f"- Mô hình: `{MODEL}`, temperature 0.2",
        f"- Prompt: đọc trực tiếp từ `SentenceComposer.java` ({len(system)} ký tự) — không chép lại",
        "",
        "## 1. Đo tự động",
        "",
        "| Chỉ số | Kết quả | Ý nghĩa |",
        "|---|---|---|",
        f"| Phủ nội dung | **{dem('phu_noi_dung')}/{n}** ({dem('phu_noi_dung')*100//n}%) | câu chứa đủ ý của mọi gloss |",
        f"| Không bịa thêm | **{dem('khong_bia')}/{n}** ({dem('khong_bia')*100//n}%) | không có danh/động từ ngoài gloss |",
        f"| Đúng dạng một câu | **{dem('mot_cau')}/{n}** ({dem('mot_cau')*100//n}%) | một câu, có dấu kết, không giải thích |",
        "",
    ]
    if tre:
        L += [
            f"Độ trễ gọi LLM: trung vị **{int(statistics.median(tre))} ms**, "
            f"nhỏ nhất {min(tre)} ms, lớn nhất {max(tre)} ms "
            f"(đo qua Internet, đã có cache nên câu lặp lại gần như tức thì).",
            "",
        ]

    if any(diem.values()):
        L += [
            "## 2. LLM chấm (tham khảo)",
            "",
            "| Trục | Trung bình | Trung vị |",
            "|---|---|---|",
        ]
        ten = {"dung_y": "Đúng ý", "ngu_phap": "Ngữ pháp", "tu_nhien": "Tự nhiên"}
        for t, v in diem.items():
            if v:
                L.append(f"| {ten[t]} | **{statistics.mean(v):.2f}**/5 | {statistics.median(v):.1f} |")
        L += [
            "",
            "⚠️ Đây là mô hình tự chấm chính mình nên **không dùng làm kết quả chính** của báo cáo;",
            "chỉ dùng để sàng nhanh các ca kém. Số liệu chính lấy từ phiếu người chấm (mục 3).",
            "",
        ]

    L += [
        "## 3. Phiếu người chấm",
        "",
        "`phieu-cham.csv` đã sinh sẵn với 3 cột điểm để trống. Quy trình: ≥3 người chấm độc lập",
        "trên thang Likert 1-5, lấy trung bình, báo cáo kèm độ đồng thuận.",
        "",
        "## 4. Chi tiết từng ca",
        "",
        "| # | Chuỗi gloss | Câu hệ thống sinh ra | Phủ ý | Không bịa | 1 câu |",
        "|---|---|---|:--:|:--:|:--:|",
    ]
    tick = lambda b: "✓" if b else "✗"  # noqa: E731
    for r in rows:
        L.append(
            f"| {r['id']} | `{' / '.join(r['glosses'])}` | {r['cau_he_thong']} | "
            f"{tick(r.get('phu_noi_dung'))} | {tick(r.get('khong_bia'))} | {tick(r.get('mot_cau'))} |"
        )

    kem = [r for r in rows if not (r.get("phu_noi_dung") and r.get("khong_bia") and r.get("mot_cau"))]
    if kem:
        L += ["", "## 5. Ca chưa đạt — phân tích", ""]
        for r in kem:
            ly_do = []
            if r.get("gloss_thieu"):
                ly_do.append(f"thiếu ý của gloss `{', '.join(r['gloss_thieu'])}`")
            if r.get("tu_la"):
                ly_do.append(f"thêm từ ngoài gloss: *{', '.join(r['tu_la'])}*")
            if not r.get("mot_cau"):
                ly_do.append("không đúng dạng một câu")
            L.append(f"- **#{r['id']}** `{' / '.join(r['glosses'])}` → “{r['cau_he_thong']}” — {'; '.join(ly_do)}")

    (OUT_DIR / "sentence-eval.md").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
