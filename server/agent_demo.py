"""Chatbot Demo (V1-V4) của Bài 11 — bot tên Bé Ailai — bốn phiên bản là bốn nấc tiến hoá của một Agent.

    V1  chatbot dò TỪ KHOÁ, không có mô hình ngôn ngữ — trả lời theo kịch bản cài sẵn.
    V2  chatbot gọi MÔ HÌNH NGÔN NGỮ LỚN, trả lời linh hoạt nhưng chưa có tay chân.
    V3  V2 + 7 CÔNG CỤ, trong đó 4 cái chạy được và 3 cái luôn báo hỏng (chính chỗ hỏng này
        mới là bài học của câu 11.16/11.17).
    V4  V3 + công cụ tạo danh thiếp từ hồ sơ thật của học viên trong lớp.

Học viên phải chat THẬT thì bốn câu 11.9 / 11.11 / 11.15 / 11.18 mới qua: mọi dấu vết (từ khoá đã
thử, chủ đề đã chat, tool đã kích hoạt) do máy chủ tự ghi khi xử lý tin nhắn, trình duyệt không
khai hộ được — cùng nguyên tắc "không tin client" như các câu agent_media/gws_task.

Module này chỉ chứa LOGIC; phần định tuyến HTTP nằm ở main.py để tránh vòng lặp import.
"""

import json
import os
import re
import unicodedata
from pathlib import Path

import httpx

BASE_DIR = Path(__file__).resolve().parent.parent
KHO_HINH = BASE_DIR / "assets" / "kho-hinh"
KHO_VANBAN = BASE_DIR / "assets" / "kho-vanban"

DUOI_HINH = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
DUOI_VANBAN = {".pdf", ".doc", ".docx", ".xls", ".xlsx"}

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

# CỐ ĐỊNH, KHÔNG lấy từ biến môi trường: câu 11.13 bắt học viên đọc đúng tên mã model này trong
# mục Cấu hình của widget rồi gõ lại, nên nó phải trùng khít với đáp án trong answer_manifest.
# Đổi model ở đây thì PHẢI đổi luôn đáp án câu 11.13 trong data.js.
MODEL_DEMO = "claude-haiku-4-5-20251001"

# ===================== V1: chatbot dò từ khoá =====================

# Mỗi chủ đề nhiều biến thể từ khoá (có dấu / không dấu / tiếng Anh) để học viên phải thử nhiều
# lần mới đủ 5 — đúng tinh thần "chatbot chỉ hiểu đúng những gì được cài sẵn".
CHU_DE_V1 = [
    {
        "ma": "chao_hoi",
        "chu_de": "Chào hỏi",
        "tu_khoa": ["hi", "hello", "chào", "chao", "xin chào", "xinchao", "alo"],
        "tra_loi": "Em Ailai xin chào anh chị 👋",
    },
    {
        "ma": "suc_khoe",
        "chu_de": "Sức khoẻ",
        "tu_khoa": ["sức khoẻ", "sức khỏe", "suckhoe", "health", "khoẻ mạnh", "thể dục", "thể thao"],
        "tra_loi": "Anh chị cần em tư vấn gì về sức khoẻ ạ?",
    },
    {
        "ma": "nghe_nghiep",
        "chu_de": "Nghề nghiệp",
        "tu_khoa": ["giáo viên", "công chức", "ceo", "kỹ sư", "tư vấn", "nghề nghiệp", "bác sĩ"],
        "tra_loi": "Anh chị muốn em tư vấn gì về nghề nghiệp này ạ?",
    },
]

TRA_LOI_KHONG_HIEU = "Em chưa được cài đặt câu trả lời cho câu này ạ."

# Số từ khoá KHÁC NHAU cần thử cho mỗi chủ đề (câu 11.9 yêu cầu ít nhất 5 câu chat mỗi chủ đề).
TU_KHOA_MOI_CHU_DE = 5
# Câu 11.11: mỗi chủ đề ít nhất 1 câu chat.
CHAT_MOI_CHU_DE_V2 = 1


def _thuong(s: str) -> str:
    return (s or "").lower()


def _bo_dau(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", _thuong(s)) if unicodedata.category(c) != "Mn")


def tra_loi_v1(tin_nhan: str):
    """Trả về (câu trả lời, [(mã chủ đề, từ khoá trúng), ...]).

    So khớp NGUYÊN VĂN (chỉ hạ chữ thường, không bỏ dấu): "chào" và "chao" là hai từ khoá khác
    nhau — có vậy học viên mới thấy rõ chatbot kiểu này mù trước mọi biến thể chưa được khai báo.
    """
    van_ban = _thuong(tin_nhan)
    trung = []
    tra_loi = None
    for nhom in CHU_DE_V1:
        for tu in nhom["tu_khoa"]:
            if _thuong(tu) in van_ban:
                trung.append((nhom["ma"], tu))
                if tra_loi is None:
                    tra_loi = nhom["tra_loi"]
    return (tra_loi or TRA_LOI_KHONG_HIEU), trung


def phan_loai_chu_de(tin_nhan: str):
    """Xếp một tin nhắn vào 1 trong 3 chủ đề của câu 11.11 (hoặc None nếu ngoài chủ đề).

    Bắt bằng từ khoá đã bỏ dấu, rộng hơn hẳn bảng của V1: V2 dùng mô hình ngôn ngữ nên học viên
    có quyền viết tự nhiên, không phải gõ trúng từ khoá cài sẵn.
    """
    van_ban = _bo_dau(tin_nhan)
    bang = {
        "chao_hoi": ["chao", "hi", "hello", "alo", "lam quen", "ban ten", "em ten", "gioi thieu"],
        "suc_khoe": ["suc khoe", "khoe", "benh", "met", "ngu", "an uong", "the duc", "the thao",
                     "giam can", "dinh duong", "stress", "bac si", "health"],
        "nghe_nghiep": ["nghe nghiep", "cong viec", "nghe", "giao vien", "cong chuc", "ceo", "ky su",
                        "tu van", "lam viec", "career", "job", "luong", "thang tien", "tuyen dung"],
    }
    for ma, cac_tu in bang.items():
        if any(tu in van_ban for tu in cac_tu):
            return ma
    return None


# ===================== Công cụ (tool) của V3 / V4 =====================


def _liet_ke(thu_muc: Path, duoi: set) -> list:
    if not thu_muc.exists():
        return []
    return sorted([p for p in thu_muc.iterdir() if p.is_file() and p.suffix.lower() in duoi], key=lambda p: p.name)


def _url_hinh(ten: str) -> str:
    return f"/assets/kho-hinh/{ten}"


# Ba công cụ dưới đây CỐ TÌNH luôn hỏng. Đây không phải lỗi: câu 11.16 bắt học viên nhận ra
# việc nào Agent làm được / không, câu 11.17 bắt giải thích vì sao — có tool thì làm được, không
# có (hoặc tool hỏng) thì chịu. Đừng "sửa" chúng thành chạy được.
LOI_CHUA_CO_CONG_CU = "Công cụ này chưa được trang bị cho em (hoặc đang lỗi), nên em chưa làm được việc này ạ."

CONG_CU = {
    "count_images": {
        "mo_ta": "Đếm tổng số file hình trong kho hình của lớp.",
        "nhan": "Đếm hình ảnh",
        "tham_so": {},
    },
    "show_images": {
        "mo_ta": "Hiện gallery toàn bộ hình trong kho hình của lớp.",
        "nhan": "Hiện gallery hình",
        "tham_so": {},
    },
    "count_docs": {
        "mo_ta": "Đếm tổng số file văn bản (PDF, DOC, DOCX, XLS, XLSX) trong kho văn bản của lớp.",
        "nhan": "Đếm file văn bản",
        "tham_so": {},
    },
    "show_docs": {
        "mo_ta": "Liệt kê danh sách file văn bản trong kho văn bản của lớp.",
        "nhan": "Hiện danh sách văn bản",
        "tham_so": {},
    },
    "delete_image": {
        "mo_ta": "Xoá một file hình khỏi kho hình.",
        "nhan": "Yêu cầu xoá hình",
        "tham_so": {"ten_file": {"type": "string", "description": "Tên file hình cần xoá"}},
    },
    "delete_doc": {
        "mo_ta": "Xoá một file văn bản khỏi kho văn bản.",
        "nhan": "Yêu cầu xoá file văn bản",
        "tham_so": {"ten_file": {"type": "string", "description": "Tên file văn bản cần xoá"}},
    },
    "get_class_age_stats": {
        "mo_ta": "Thống kê độ tuổi trung bình của học viên lớp ALG.",
        "nhan": "Hỏi thống kê tuổi lớp ALG",
        "tham_so": {},
    },
    "create_business_card": {
        "mo_ta": "Tạo danh thiếp (card visit) cho chính học viên đang trò chuyện, lấy từ hồ sơ của họ trong lớp ALG.",
        "nhan": "Tạo danh thiếp",
        "tham_so": {"chuc_danh": {"type": "string", "description": "Chức danh muốn in trên danh thiếp (nếu học viên có nêu)"}},
    },
}

CONG_CU_HONG = {"delete_image", "delete_doc", "get_class_age_stats"}
CONG_CU_V3 = ["count_images", "show_images", "count_docs", "show_docs", "delete_image", "delete_doc", "get_class_age_stats"]
CONG_CU_V4 = CONG_CU_V3 + ["create_business_card"]


def chay_cong_cu(ten: str, tham_so: dict, user: dict):
    """Chạy một tool, trả về (kết quả dạng chữ cho LLM đọc, dữ liệu kèm để giao diện vẽ)."""
    if ten in CONG_CU_HONG:
        return LOI_CHUA_CO_CONG_CU, None

    if ten == "count_images":
        return f"Kho hình có {len(_liet_ke(KHO_HINH, DUOI_HINH))} file.", None
    if ten == "show_images":
        ds = [p.name for p in _liet_ke(KHO_HINH, DUOI_HINH)]
        return (
            f"Kho hình có {len(ds)} file: " + ", ".join(ds),
            {"loai": "gallery", "hinh": [{"ten": t, "url": _url_hinh(t)} for t in ds]},
        )
    if ten == "count_docs":
        return f"Kho văn bản có {len(_liet_ke(KHO_VANBAN, DUOI_VANBAN))} file.", None
    if ten == "show_docs":
        ds = [p.name for p in _liet_ke(KHO_VANBAN, DUOI_VANBAN)]
        return (
            f"Kho văn bản có {len(ds)} file: " + ", ".join(ds),
            {"loai": "danh_sach_file", "file": ds},
        )
    if ten == "create_business_card":
        the = {
            "loai": "danh_thiep",
            "ho_ten": (user.get("display_name") or user.get("username") or "Học viên ALG").strip(),
            "email": (user.get("email") or "").strip(),
            "lop": "ALG — Học Viện AI Life Group",
            "chuc_danh": str(tham_so.get("chuc_danh") or "").strip()[:60],
            "anh": user.get("avatar_url") or "",
        }
        tom_tat = f"Đã tạo danh thiếp cho {the['ho_ten']}" + (f" ({the['email']})" if the["email"] else "")
        return tom_tat, the
    return LOI_CHUA_CO_CONG_CU, None


def _mo_ta_tool_cho_llm(ten: str) -> dict:
    c = CONG_CU[ten]
    return {
        "name": ten,
        "description": c["mo_ta"],
        "input_schema": {"type": "object", "properties": c["tham_so"], "required": []},
    }


# ===================== Gọi mô hình ngôn ngữ (V2 / V3 / V4) =====================

LOI_NHAC_HE_THONG = (
    "Bạn là \"Bé Ailai\", trợ lý AI của lớp học ALG - Học Viện AI Life Group. Bạn xưng \"em\" và gọi "
    "người dùng là \"anh/chị\". Trả lời ngắn gọn, thân thiện, bằng tiếng Việt. "
    "Bạn CHỈ làm được những việc mà công cụ được trang bị cho phép: nếu người dùng nhờ một việc mà "
    "bạn không có công cụ, hoặc công cụ báo lỗi, hãy nói thật là chưa làm được và nêu rõ mình đang "
    "có những công cụ nào — TUYỆT ĐỐI không bịa kết quả, không tự nghĩ ra số liệu."
)

LOI_NHAC_KHONG_TOOL = (
    "Bạn KHÔNG được trang bị bất kỳ công cụ nào: không đọc được file, không xem được dữ liệu lớp "
    "học, không tạo được danh thiếp. Bạn chỉ trò chuyện bằng ngôn ngữ thuần tuý."
)


def san_sang() -> bool:
    return bool(ANTHROPIC_API_KEY)


def _goi_llm(messages: list, tools: list | None, he_thong: str) -> dict | None:
    if not ANTHROPIC_API_KEY:
        return None
    goi = {"model": MODEL_DEMO, "max_tokens": 900, "system": he_thong, "messages": messages}
    if tools:
        goi["tools"] = tools
    try:
        resp = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=goi,
            timeout=60.0,
        )
        if resp.status_code != 200:
            print(f"[agent_demo] status={resp.status_code} body={resp.text[:300]}")
            return None
        return resp.json()
    except Exception as e:  # pragma: no cover - lỗi mạng
        print(f"[agent_demo] loi goi LLM: {e}")
        return None


def _gop_chu(khoi: list) -> str:
    return "\n".join(b.get("text", "") for b in khoi if b.get("type") == "text").strip()


def tra_loi_llm(ver: str, lich_su: list, tin_nhan: str, user: dict):
    """Chạy trọn một lượt hội thoại có gọi tool.

    Trả về (câu trả lời, [tên tool đã chạy], [dữ liệu kèm để vẽ]). Đây chính là vòng lặp mà câu
    11.22 bắt học viên sắp xếp: gộp prompt + danh sách tool -> gửi LLM -> LLM đòi gọi tool ->
    chương trình chạy tool -> gộp kết quả -> gửi lại LLM -> LLM chốt câu trả lời.
    """
    ten_tools = {"v3": CONG_CU_V3, "v4": CONG_CU_V4}.get(ver, [])
    tools = [_mo_ta_tool_cho_llm(t) for t in ten_tools] or None
    he_thong = LOI_NHAC_HE_THONG + ("" if tools else "\n" + LOI_NHAC_KHONG_TOOL)

    messages = [{"role": m["role"], "content": m["content"]} for m in lich_su]
    messages.append({"role": "user", "content": tin_nhan})

    da_goi, kem_theo = [], []
    for _ in range(4):  # tối đa 4 vòng, đủ cho mọi kịch bản của bài học mà không sợ lặp vô tận
        data = _goi_llm(messages, tools, he_thong)
        if data is None:
            return None, da_goi, kem_theo
        khoi = data.get("content", [])
        if data.get("stop_reason") != "tool_use":
            return _gop_chu(khoi) or "(em chưa nghĩ ra câu trả lời ạ)", da_goi, kem_theo

        messages.append({"role": "assistant", "content": khoi})
        ket_qua = []
        for b in khoi:
            if b.get("type") != "tool_use":
                continue
            ten = b.get("name", "")
            da_goi.append(ten)
            chu, du_lieu = chay_cong_cu(ten, b.get("input") or {}, user)
            if du_lieu:
                kem_theo.append(du_lieu)
            ket_qua.append({"type": "tool_result", "tool_use_id": b.get("id"), "content": chu})
        messages.append({"role": "user", "content": ket_qua})

    return "Em thử mãi mà chưa xong việc này, anh chị nhắn lại giúp em nhé.", da_goi, kem_theo


# ===================== Bảng tiêu chí của 4 câu bài tập =====================

# Câu nào soi phiên bản nào. Dùng cả ở giao diện (hiện bảng tiêu chí) lẫn lúc chấm.
CAU_THEO_VER = {"11.9": "v1", "11.11": "v2", "11.15": "v3", "11.18": "v4"}
VER_THEO_CAU = {v: k for k, v in CAU_THEO_VER.items()}


def tien_do(conn, user_id: int, ver: str) -> dict:
    rows = conn.execute(
        "SELECT kind, name, count FROM demo_progress WHERE user_id = ? AND ver = ?",
        (user_id, ver),
    ).fetchall()
    ra = {}
    for r in rows:
        ra.setdefault(r["kind"], {})[r["name"]] = r["count"]
    return ra


def ghi_tien_do(conn, user_id: int, ver: str, kind: str, name: str):
    conn.execute(
        """
        INSERT INTO demo_progress (user_id, ver, kind, name, count, updated_at)
        VALUES (?, ?, ?, ?, 1, datetime('now'))
        ON CONFLICT(user_id, ver, kind, name)
        DO UPDATE SET count = count + 1, updated_at = datetime('now')
        """,
        (user_id, ver, kind, name),
    )


def trang_thai_bai_tap(conn, user_id: int, ver: str) -> dict:
    """Bảng tiêu chí sống của câu bài tập gắn với phiên bản này (cùng dáng với /api/media-status)."""
    td = tien_do(conn, user_id, ver)
    tieu_chi = []

    if ver == "v1":
        da_thu = td.get("tu_khoa", {})
        for nhom in CHU_DE_V1:
            dem = sum(1 for tu in nhom["tu_khoa"] if f"{nhom['ma']}|{tu}" in da_thu)
            can = min(TU_KHOA_MOI_CHU_DE, len(nhom["tu_khoa"]))
            tieu_chi.append({
                "title": f"Chủ đề {nhom['chu_de']}",
                "detail": f"{min(dem, can)}/{can} từ khoá khác nhau đã thử",
                "ok": dem >= can,
            })
    elif ver == "v2":
        dem_theo = td.get("chu_de", {})
        for nhom in CHU_DE_V1:
            dem = dem_theo.get(nhom["ma"], 0)
            tieu_chi.append({
                "title": f"Chủ đề {nhom['chu_de']}",
                "detail": f"{dem}/{CHAT_MOI_CHU_DE_V2} câu chat",
                "ok": dem >= CHAT_MOI_CHU_DE_V2,
            })
    elif ver in ("v3", "v4"):
        da_goi = td.get("tool", {})
        can_co = CONG_CU_V3 if ver == "v3" else ["create_business_card"]
        for ten in can_co:
            dem = da_goi.get(ten, 0)
            tieu_chi.append({
                "title": CONG_CU[ten]["nhan"],
                "detail": f"đã yêu cầu {dem} lần" if dem else "chưa yêu cầu",
                "ok": dem >= 1,
            })

    return {
        "ver": ver,
        "question_code": VER_THEO_CAU.get(ver, ""),
        "criteria": tieu_chi,
        "is_correct": bool(tieu_chi) and all(t["ok"] for t in tieu_chi),
    }


def dat_yeu_cau(conn, user_id: int, question_code: str) -> bool:
    ver = CAU_THEO_VER.get(question_code)
    if not ver:
        return False
    return bool(trang_thai_bai_tap(conn, user_id, ver)["is_correct"])


def thong_tin_phien_ban(ver: str) -> dict:
    ten = {
        "v1": ("Chatbot Demo (V1)", "Chatbot dò từ khoá — chưa có mô hình ngôn ngữ"),
        "v2": ("Chatbot Demo (V2)", "Chatbot dùng mô hình ngôn ngữ lớn — chưa có công cụ"),
        "v3": ("Chatbot Demo (V3)", "Mô hình ngôn ngữ lớn + 7 công cụ"),
        "v4": ("Chatbot Demo (V4)", "Mô hình ngôn ngữ lớn + 8 công cụ (có tạo danh thiếp)"),
    }.get(ver, ("Chatbot Demo", ""))
    return {
        "ver": ver,
        "ten": ten[0],
        "mo_ta": ten[1],
        # V1 chạy bằng luật if-else nên KHÔNG có model — chính chỗ này là đáp án câu 11.13 khi
        # học viên mở Cấu hình của V3.
        "model": "" if ver == "v1" else MODEL_DEMO,
        "tools": [] if ver in ("v1", "v2") else (CONG_CU_V3 if ver == "v3" else CONG_CU_V4),
    }
