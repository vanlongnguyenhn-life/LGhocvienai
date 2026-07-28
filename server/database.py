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
        sub_cols = [r["name"] for r in conn.execute("PRAGMA table_info(submissions)")]
        if "ai_graded" not in sub_cols:
            conn.execute("ALTER TABLE submissions ADD COLUMN ai_graded INTEGER NOT NULL DEFAULT 0")
        rg_cols = [r["name"] for r in conn.execute("PRAGMA table_info(reflect_grades)")]
        if "ai_graded" not in rg_cols:
            conn.execute("ALTER TABLE reflect_grades ADD COLUMN ai_graded INTEGER NOT NULL DEFAULT 0")
            # Câu tự luận đã được AI chấm trước đây (không có dấu 'lỗi kết nối') → coi như đã AI chấm.
            conn.execute("UPDATE reflect_grades SET ai_graded = 1 WHERE reason NOT LIKE '%Không chấm được bằng AI%'")
