import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager

DATA_DIR = Path(os.environ["DATA_DIR"]) if os.environ.get("DATA_DIR") else Path(__file__).parent
DB_PATH = DATA_DIR / "agentsee.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT,
    lark_open_id TEXT UNIQUE,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question_code TEXT NOT NULL,
    criterion_key TEXT NOT NULL,
    value_type TEXT NOT NULL,
    value_text TEXT,
    file_path TEXT,
    is_valid INTEGER NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, question_code, criterion_key)
);

CREATE TABLE IF NOT EXISTS reflect_grades (
    user_id INTEGER NOT NULL,
    question_code TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    is_valid INTEGER NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, question_code)
);

CREATE TABLE IF NOT EXISTS question_status (
    user_id INTEGER NOT NULL,
    question_code TEXT NOT NULL,
    status TEXT NOT NULL,
    awarded_points INTEGER NOT NULL DEFAULT 0,
    answer_data TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, question_code)
);

CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lark_chats (
    chat_id TEXT PRIMARY KEY,
    chat_type TEXT,
    last_seen TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_pending_tasks (
    open_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scheduled_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    text TEXT NOT NULL,
    send_at_utc TEXT NOT NULL,
    created_by TEXT,
    sent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    chat_type TEXT,
    sender_open_id TEXT,
    text TEXT,
    reply TEXT,
    error TEXT
);

CREATE TABLE IF NOT EXISTS grading_rubrics (
    question_code TEXT NOT NULL,
    criterion_key TEXT NOT NULL,
    rubric TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (question_code, criterion_key)
);

CREATE TABLE IF NOT EXISTS pi_lab_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    scopes TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pi_lab_phone (
    user_id INTEGER PRIMARY KEY,
    phone TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question_code TEXT NOT NULL,
    filename TEXT NOT NULL,
    is_valid INTEGER NOT NULL,
    reason TEXT,
    ai_graded INTEGER NOT NULL DEFAULT 0,
    local_url TEXT,
    attempt_ok INTEGER NOT NULL DEFAULT 0,
    confirm_code TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS electron_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question_code TEXT NOT NULL,
    main_js_ok INTEGER NOT NULL DEFAULT 0,
    package_json_ok INTEGER NOT NULL DEFAULT 0,
    screenshot_ok INTEGER NOT NULL DEFAULT 0,
    versions_ok INTEGER NOT NULL DEFAULT 0,
    screenshot_filename TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS electron_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question_code TEXT NOT NULL,
    action TEXT NOT NULL,
    params TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    ack_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
"""


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript(SCHEMA)
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(question_status)")]
        if "answer_data" not in cols:
            conn.execute("ALTER TABLE question_status ADD COLUMN answer_data TEXT")
        user_cols = [r["name"] for r in conn.execute("PRAGMA table_info(users)")]
        if "avatar_url" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
        if "approved" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN approved INTEGER NOT NULL DEFAULT 0")
            # Học viên đã tồn tại trước khi bật tính năng duyệt → tự động duyệt để không khóa oan.
            conn.execute("UPDATE users SET approved = 1")
        if "tenant_key" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN tenant_key TEXT")
        if "is_teacher" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN is_teacher INTEGER NOT NULL DEFAULT 0")
        if "api_token" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN api_token TEXT")
        if "secret_code" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN secret_code TEXT")
        ms_cols = [r["name"] for r in conn.execute("PRAGMA table_info(media_submissions)")]
        if ms_cols and "updated_at" not in ms_cols:
            conn.execute("ALTER TABLE media_submissions ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))")
        sub_cols = [r["name"] for r in conn.execute("PRAGMA table_info(submissions)")]
        if "ai_graded" not in sub_cols:
            conn.execute("ALTER TABLE submissions ADD COLUMN ai_graded INTEGER NOT NULL DEFAULT 0")
        rg_cols = [r["name"] for r in conn.execute("PRAGMA table_info(reflect_grades)")]
        if "ai_graded" not in rg_cols:
            conn.execute("ALTER TABLE reflect_grades ADD COLUMN ai_graded INTEGER NOT NULL DEFAULT 0")
            # Câu tự luận đã được AI chấm trước đây (không có dấu 'lỗi kết nối') → coi như đã AI chấm.
            conn.execute("UPDATE reflect_grades SET ai_graded = 1 WHERE reason NOT LIKE '%Không chấm được bằng AI%'")

        # Đánh lại số Bài 6 từ câu 6.7 (bỏ khoảng trống do câu 6.7 cũ đã xoá):
        # 6.8→6.7, 6.9→6.8, 6.10→6.9, 6.11→6.10, 6.12→6.11. Giữ nguyên tiến độ học viên
        # đã làm trước đó bằng cách đổi tên question_code trong mọi bảng liên quan.
        # CASE đánh giá theo giá trị CŨ của từng dòng trong 1 câu lệnh nên không bị đổi
        # chồng lên nhau (6.9 không bị đổi 2 lần thành 6.7). Idempotent: chạy lại vô hại
        # vì sau lần đầu không còn dòng nào mang mã cũ để khớp WHERE nữa.
        migrated_flag = conn.execute(
            "SELECT value FROM app_settings WHERE key = 'migrated_bai6_renumber_20260728'"
        ).fetchone()
        if not migrated_flag:
            rename_case = """
                CASE question_code
                    WHEN '6.12' THEN '6.11'
                    WHEN '6.11' THEN '6.10'
                    WHEN '6.10' THEN '6.9'
                    WHEN '6.9' THEN '6.8'
                    WHEN '6.8' THEN '6.7'
                    ELSE question_code
                END
            """
            # UPDATE OR IGNORE: nếu (user_id, mã mới) đã tồn tại sẵn (dữ liệu rác/orphan từ câu
            # 6.7 giả đã xoá trước đây) thì bỏ qua dòng đó thay vì crash toàn bộ migration —
            # ưu tiên app khởi động thành công cho mọi học viên hơn là chặn đứng vì 1 trường hợp hiếm.
            for table in (
                "question_status",
                "submissions",
                "reflect_grades",
                "media_submissions",
                "electron_submissions",
            ):
                conn.execute(
                    f"UPDATE OR IGNORE {table} SET question_code = ({rename_case}) "
                    f"WHERE question_code IN ('6.8','6.9','6.10','6.11','6.12')"
                )
            conn.execute(
                f"UPDATE OR IGNORE grading_rubrics SET question_code = ({rename_case}) "
                f"WHERE question_code IN ('6.8','6.9','6.10','6.11','6.12')"
            )
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES ('migrated_bai6_renumber_20260728', '1')"
            )
