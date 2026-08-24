"""Bản tổng hợp học tập hằng ngày do Bé Ailai gửi vào nhóm Lark.

- Chạy hoàn toàn trên server (Render) qua một vòng lặp nền -> KHÔNG phụ thuộc máy
  của giáo viên có bật hay không.
- Cấu hình (bật/tắt, giờ gửi, nhóm, lời nhắn từng đợt, các phần hiển thị) lưu trong
  bảng app_settings, chỉnh được trong trang admin.
- Giờ gửi tính theo giờ Việt Nam (UTC+7); mốc thời gian trong DB là UTC.
"""

import asyncio
import json
import re
from datetime import datetime, timezone, timedelta
from functools import lru_cache
from pathlib import Path

from .database import get_db
from . import lark_bot

VN_TZ = timezone(timedelta(hours=7))
# Mã câu của Bài 1 đến Bài 13 (các câu chặn mang mã "gate..." nên không lọt vào đây).
MA_BAI_1_13 = re.compile(r"^([1-9]|1[0-3])\.")
SETTINGS_KEY = "daily_digest"
DONE_STATUSES = ("done", "correct")

DEFAULT_INTRO = (
    "Chào cả nhà, Bé Ailai xin gửi bản tổng hợp học tập của lớp hôm nay ạ. "
    "Cả nhà cùng xem và giữ nhịp học đều mỗi ngày nhé!"
)

DEFAULT_CONFIG = {
    "enabled": False,          # mặc định tắt, giáo viên tự bật trong admin
    "send_time": "20:00",      # giờ VN, HH:MM
    "chat_id": "",             # nhóm nhận (chọn trong admin)
    "intro_message": DEFAULT_INTRO,
    "show_overview": True,
    "show_leaderboard": True,
    "show_inactive": True,
    "top_n": 5,
    "inactive_days": 3,
    "total_questions": 210,     # tổng số câu toàn khoá (để tính "đã hoàn thành khoá")
    "last_sent_date": "",       # ngày VN gần nhất đã gửi (chống gửi trùng)
}

# ===================== NHẮC HỌC VIÊN KHÔNG HOẠT ĐỘNG (17h hằng ngày) =====================
INACTIVE_KEY = "inactive_reminder"
DEFAULT_INACTIVE = {
    "enabled": True,           # bật sẵn theo yêu cầu (nhắc cố định mỗi ngày)
    "send_time": "17:00",      # giờ VN
    "chat_id": "",             # để trống = tự dùng nhóm Bé đã ghi nhớ
    "lookback_hours": 24,      # không học/làm bài trong bao nhiêu giờ qua thì bị nhắc
    "intro_message": "",       # để trống = dùng lời mặc định của Bé
    "last_sent_date": "",
}


def get_inactive_config() -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (INACTIVE_KEY,)).fetchone()
    cfg = dict(DEFAULT_INACTIVE)
    if row:
        try:
            cfg.update(json.loads(row["value"]))
        except Exception:
            pass
    return cfg


def save_inactive_config(patch: dict) -> dict:
    cfg = get_inactive_config()
    cfg.update(patch or {})
    with get_db() as conn:
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
            (INACTIVE_KEY, json.dumps(cfg, ensure_ascii=False)),
        )
    return cfg


def _cutoff_utc(hours: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")


@lru_cache(maxsize=1)
def ma_cau_den_bai_13() -> tuple[str, ...]:
    """Mã mọi câu THẬT từ Bài 1 đến Bài 13 — mốc "đã học hết phần đang mở".

    Bỏ các câu chặn (gate): chúng được thiết kế để không ai qua được, tính vào thì chẳng học
    viên nào đạt mốc và ai cũng bị nhắc mãi.
    """
    thu_muc = Path(__file__).parent
    with open(thu_muc / "question_order.json", encoding="utf-8") as f:
        thu_tu = json.load(f)
    with open(thu_muc / "answer_manifest.json", encoding="utf-8") as f:
        bang_cham = json.load(f)
    return tuple(
        q["code"] for q in thu_tu
        if MA_BAI_1_13.match(q["code"]) and (bang_cham.get(q["code"]) or {}).get("type") != "gate"
    )


def get_inactive_students(lookback_hours: int) -> list[dict]:
    """Học viên (đã đăng ký, không phải giáo viên) KHÔNG có thao tác nộp câu nào trong N giờ qua.
    Lưu ý: câu SAI vẫn được tính là 'có làm' (question_status ghi cả status='wrong').

    Ai đã làm xong sạch Bài 1→13 thì KHÔNG nhắc nữa: họ hết bài để học (Bài 14 đang xây dựng),
    nhắc tiếp chỉ là gọi tên oan giữa nhóm lớp.
    """
    cutoff = _cutoff_utc(lookback_hours)
    ma_cau = ma_cau_den_bai_13()
    cho_trong = ",".join("?" * len(ma_cau))
    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT u.id, u.display_name, u.lark_open_id, MAX(qs.updated_at) AS last_act,
                   COUNT(DISTINCT CASE
                       WHEN qs.status IN ('done', 'correct') AND qs.question_code IN ({cho_trong})
                       THEN qs.question_code END) AS xong_den_13
            FROM users u
            LEFT JOIN question_status qs ON qs.user_id = u.id
            WHERE u.approved = 1 AND u.lark_open_id IS NOT NULL
              AND COALESCE(u.is_teacher, 0) = 0 AND u.created_at < ?
            GROUP BY u.id
            HAVING (last_act IS NULL OR last_act < ?) AND xong_den_13 < ?
            """,
            (*ma_cau, cutoff, cutoff, len(ma_cau)),
        ).fetchall()
    return [dict(r) for r in rows]


def build_inactive_text(cfg: dict):
    """Trả nội dung tin nhắc (kèm tag các bạn không hoạt động), hoặc None nếu không có ai cần nhắc."""
    hours = int(cfg.get("lookback_hours") or 24)
    students = get_inactive_students(hours)
    if not students:
        return None
    mentions = "".join(f'<at user_id="{s["lark_open_id"]}"></at> ' for s in students if s["lark_open_id"])
    intro = (cfg.get("intro_message") or "").strip()
    body = intro or (
        f"Bé Ailai điểm danh cuối ngày ạ. Các bạn được nhắc tên phía trên trong {hours} giờ qua chưa "
        "vào học/làm bài. Cả nhà tranh thủ vào làm vài câu nhé — mỗi ngày một chút là tiến bộ rất nhanh! "
        f"Vào học tại: {lark_bot.SITE_URL}"
    )
    return (mentions + "\n" + body).strip()


# ===================== CẤU HÌNH =====================

def get_config() -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (SETTINGS_KEY,)).fetchone()
    cfg = dict(DEFAULT_CONFIG)
    if row:
        try:
            cfg.update(json.loads(row["value"]))
        except Exception:
            pass
    return cfg


def save_config(patch: dict) -> dict:
    cfg = get_config()
    cfg.update(patch or {})
    with get_db() as conn:
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
            (SETTINGS_KEY, json.dumps(cfg, ensure_ascii=False)),
        )
    return cfg


# ===================== TIỆN ÍCH THỜI GIAN =====================

def vn_now() -> datetime:
    return datetime.now(VN_TZ)


def _vn_today_start_utc() -> str:
    """Mốc 00:00 hôm nay (giờ VN) quy đổi sang chuỗi UTC để so với updated_at trong DB."""
    start_vn = vn_now().replace(hour=0, minute=0, second=0, microsecond=0)
    return start_vn.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _time_to_send(send_time_str, now, window_min: int = 90) -> str:
    """Quyết định gửi theo giờ hẹn: 'wait' (chưa tới giờ) | 'send' (trong cửa sổ) | 'missed' (đã quá cửa sổ).
    Tránh việc server khởi động muộn (sau giờ hẹn) rồi gửi luôn vào giờ linh tinh."""
    try:
        hh, mm = [int(x) for x in str(send_time_str).split(":")[:2]]
    except Exception:
        return "missed"
    target = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    delta_min = (now - target).total_seconds() / 60
    if delta_min < 0:
        return "wait"
    if delta_min > window_min:
        return "missed"
    return "send"


def _days_since_utc(ts: str | None) -> float:
    if not ts:
        return float("inf")
    try:
        dt = datetime.strptime(ts[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except Exception:
        return float("inf")
    return (datetime.now(timezone.utc) - dt).total_seconds() / 86400.0


# ===================== DỰNG NỘI DUNG =====================

def _gather_stats(cfg: dict) -> dict:
    total_q = int(cfg.get("total_questions") or 210)
    inactive_days = int(cfg.get("inactive_days") or 3)
    today_start = _vn_today_start_utc()

    with get_db() as conn:
        total_students = conn.execute("SELECT COUNT(*) c FROM users WHERE approved = 1").fetchone()["c"]
        active_today = conn.execute(
            "SELECT COUNT(DISTINCT qs.user_id) c FROM question_status qs "
            "JOIN users u ON u.id = qs.user_id "
            "WHERE u.approved = 1 AND qs.updated_at >= ?",
            (today_start,),
        ).fetchone()["c"]
        done_today = conn.execute(
            "SELECT COUNT(*) c FROM question_status qs "
            "JOIN users u ON u.id = qs.user_id "
            "WHERE u.approved = 1 AND qs.status IN ('done', 'correct') AND qs.updated_at >= ?",
            (today_start,),
        ).fetchone()["c"]
        rows = conn.execute(
            """
            SELECT u.id, u.display_name, u.created_at,
                   COUNT(CASE WHEN qs.status IN ('done', 'correct') THEN 1 END) AS done_count,
                   COALESCE(SUM(qs.awarded_points), 0) AS points,
                   MAX(qs.updated_at) AS last_activity
            FROM users u
            LEFT JOIN question_status qs ON qs.user_id = u.id
            WHERE u.approved = 1
            GROUP BY u.id
            """
        ).fetchall()

    students = [dict(r) for r in rows]
    completed_course = sum(1 for s in students if s["done_count"] >= total_q and total_q > 0)

    leaderboard = sorted(
        [s for s in students if s["done_count"] > 0 or s["points"] > 0],
        key=lambda s: (s["points"], s["done_count"]),
        reverse=True,
    )
    inactive = [
        s for s in students
        if s["done_count"] < total_q and _days_since_utc(s["last_activity"] or s["created_at"]) >= inactive_days
    ]
    inactive.sort(key=lambda s: _days_since_utc(s["last_activity"] or s["created_at"]), reverse=True)

    return {
        "total_students": total_students,
        "active_today": active_today,
        "done_today": done_today,
        "completed_course": completed_course,
        "leaderboard": leaderboard,
        "inactive": inactive,
        "total_q": total_q,
        "inactive_days": inactive_days,
    }


def build_digest_text(cfg: dict) -> str:
    st = _gather_stats(cfg)
    parts: list[str] = []

    intro = (cfg.get("intro_message") or "").strip()
    if intro:
        parts.append(intro)

    date_str = vn_now().strftime("%d/%m/%Y")

    if cfg.get("show_overview", True):
        lines = [
            f"📊 TỔNG QUAN LỚP HÔM NAY ({date_str})",
            f"• Sĩ số lớp: {st['total_students']} học viên",
            f"• Hoạt động hôm nay: {st['active_today']} bạn",
            f"• Số câu hoàn thành hôm nay: {st['done_today']} câu",
            f"• Đã hoàn thành khoá: {st['completed_course']} bạn",
        ]
        parts.append("\n".join(lines))

    if cfg.get("show_leaderboard", True):
        top_n = int(cfg.get("top_n") or 5)
        top = st["leaderboard"][:top_n]
        if top:
            medals = ["🥇", "🥈", "🥉"]
            lines = [f"🏆 BẢNG XẾP HẠNG (Top {len(top)})"]
            for i, s in enumerate(top):
                rank = medals[i] if i < 3 else f"{i + 1}."
                lines.append(f"{rank} {s['display_name']} — {s['done_count']} câu · {s['points']}đ")
            parts.append("\n".join(lines))

    if cfg.get("show_inactive", True):
        inactive_days = st["inactive_days"]
        inactive = st["inactive"]
        if inactive:
            shown = inactive[:10]
            lines = [f"⏰ CHƯA HOẠT ĐỘNG (từ {inactive_days} ngày trở lên) — cả nhà tiếp sức nhé"]
            for s in shown:
                d = _days_since_utc(s["last_activity"] or s["created_at"])
                dtxt = "chưa bắt đầu" if d == float("inf") else f"{int(d)} ngày"
                lines.append(f"• {s['display_name']} ({dtxt})")
            extra = len(inactive) - len(shown)
            if extra > 0:
                lines.append(f"• …và {extra} bạn khác")
            parts.append("\n".join(lines))
        else:
            parts.append("⏰ Cả lớp đều đang học đều tay, không ai bị bỏ lại — tuyệt vời!")

    parts.append("— Bé Ailai · Học Viện AI Life Group")
    return "\n\n".join(parts)


# ===================== GỬI =====================

async def send_digest(cfg: dict, chat_id: str | None = None):
    target = chat_id or cfg.get("chat_id")
    if not target:
        raise RuntimeError("Chưa chọn nhóm nhận bản tổng hợp.")
    text = build_digest_text(cfg)
    return await lark_bot.send_text(target, text)


# ===================== LỊCH NỀN =====================

async def _tick():
    cfg = get_config()
    if not cfg.get("enabled") or not cfg.get("chat_id"):
        return
    now = vn_now()
    today = now.strftime("%Y-%m-%d")
    if cfg.get("last_sent_date") == today:
        return
    decision = _time_to_send(cfg.get("send_time", "20:00"), now)
    if decision == "wait":
        return
    if decision == "missed":
        save_config({"last_sent_date": today})  # lỡ cửa sổ → bỏ qua hôm nay, gửi đúng giờ ngày mai
        return
    try:
        result = await send_digest(cfg)
        save_config({"last_sent_date": today})
        print(f"[digest] sent daily digest {today} to {cfg['chat_id']}: {result}")
    except Exception as e:
        print(f"[digest send error] {e!r}")


async def _tick_inactive():
    cfg = get_inactive_config()
    if not cfg.get("enabled"):
        return
    chat_id = (cfg.get("chat_id") or "").strip() or lark_bot.get_group_chat_id()
    if not chat_id:
        return
    now = vn_now()
    today = now.strftime("%Y-%m-%d")
    if cfg.get("last_sent_date") == today:
        return
    decision = _time_to_send(cfg.get("send_time", "17:00"), now)
    if decision == "wait":
        return
    if decision == "missed":
        save_inactive_config({"last_sent_date": today})  # lỡ cửa sổ → bỏ qua hôm nay, đúng giờ ngày mai
        print(f"[inactive] {today}: quá cửa sổ gửi (server lên muộn), bỏ qua hôm nay.")
        return
    text = build_inactive_text(cfg)
    if not text:
        save_inactive_config({"last_sent_date": today})  # cả lớp đều học → bỏ qua, không gửi
        print(f"[inactive] {today}: cả lớp đều có hoạt động, không cần nhắc.")
        return
    try:
        result = await lark_bot.send_text(chat_id, text)
        save_inactive_config({"last_sent_date": today})
        print(f"[inactive] sent reminder {today} to {chat_id}: {result}")
    except Exception as e:
        print(f"[inactive send error] {e!r}")


async def scheduler_loop():
    """Vòng lặp nền: mỗi phút kiểm tra đã tới giờ gửi trong ngày chưa."""
    print("[digest] scheduler started")
    while True:
        try:
            await _tick()
        except Exception as e:
            print(f"[digest scheduler error] {e!r}")
        try:
            await _tick_inactive()
        except Exception as e:
            print(f"[inactive scheduler error] {e!r}")
        try:
            await lark_bot.send_due_scheduled()  # gửi các tin giáo viên đã hẹn giờ
        except Exception as e:
            print(f"[scheduled tick error] {e!r}")
        await asyncio.sleep(60)
