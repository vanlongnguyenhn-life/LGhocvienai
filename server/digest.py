"""Bản tổng hợp học tập hằng ngày do Bé Ailai gửi vào nhóm Lark.

- Chạy hoàn toàn trên server (Render) qua một vòng lặp nền -> KHÔNG phụ thuộc máy
  của giáo viên có bật hay không.
- Cấu hình (bật/tắt, giờ gửi, nhóm, lời nhắn từng đợt, các phần hiển thị) lưu trong
  bảng app_settings, chỉnh được trong trang admin.
- Giờ gửi tính theo giờ Việt Nam (UTC+7); mốc thời gian trong DB là UTC.
"""

import asyncio
import json
from datetime import datetime, timezone, timedelta

from .database import get_db
from . import lark_bot

VN_TZ = timezone(timedelta(hours=7))
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
    if now.strftime("%H:%M") < str(cfg.get("send_time", "20:00")):
        return
    try:
        result = await send_digest(cfg)
        save_config({"last_sent_date": today})
        print(f"[digest] sent daily digest {today} to {cfg['chat_id']}: {result}")
    except Exception as e:
        print(f"[digest send error] {e!r}")


async def scheduler_loop():
    """Vòng lặp nền: mỗi phút kiểm tra đã tới giờ gửi trong ngày chưa."""
    print("[digest] scheduler started")
    while True:
        try:
            await _tick()
        except Exception as e:
            print(f"[digest scheduler error] {e!r}")
        await asyncio.sleep(60)
