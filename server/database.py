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

CREATE TABLE IF NOT EXISTS secret_code_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question_code TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Mật thư học viên gửi "bạn Mít" (câu 9.24) — sent_at dùng để mô phỏng nhịp
-- gửi → chờ → bạn Mít đọc (sau PI_LAB_LETTER_READ_DELAY_S giây).
CREATE TABLE IF NOT EXISTS pi_lab_letters (
    user_id INTEGER PRIMARY KEY,
    sent_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- GWS Lab (câu 9.16-9.22): dữ liệu nhiệm vụ sinh riêng cho từng học viên (dòng "vàng" 9.17,
-- danh sách bạn 9.20...) + started_at để chấm giới hạn thời gian.
CREATE TABLE IF NOT EXISTS gws_tasks (
    user_id INTEGER NOT NULL,
    question_code TEXT NOT NULL,
    payload TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, question_code),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Nhật ký các lần Agent nộp bài GWS — lần gần nhất ĐẠT là điều kiện để /api/submit-question
-- công nhận câu, server không tin bất kỳ trạng thái nào client tự khai.
CREATE TABLE IF NOT EXISTS gws_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    question_code TEXT NOT NULL,
    url TEXT,
    ok INTEGER NOT NULL DEFAULT 0,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Câu 9.21: các bạn cùng lớp chấm chéo bộ slide của nhau.
-- Khoá chính (chủ bài, người chấm) => mỗi người chỉ có đúng 1 phiếu cho một bài, chấm lại thì
-- ghi đè chứ không cộng thêm lượt.
CREATE TABLE IF NOT EXISTS peer_reviews (
    subject_user_id INTEGER NOT NULL,
    grader_user_id INTEGER NOT NULL,
    info_score INTEGER NOT NULL,
    avatars_score INTEGER NOT NULL,
    design_score INTEGER NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (subject_user_id, grader_user_id),
    FOREIGN KEY (subject_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (grader_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Bài 11: chatbot demo "Mầm Fake" (4 phiên bản). Lịch sử chat lưu server để học viên quay lại
-- vẫn thấy hội thoại cũ, giống hệt widget của web tham khảo.
CREATE TABLE IF NOT EXISTS demo_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    ver TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'Cuộc trò chuyện mới',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS demo_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    extra TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES demo_conversations(id) ON DELETE CASCADE
);

-- Dấu vết học viên THỰC SỰ đã làm gì trong widget: từ khoá đã thử (V1), chủ đề đã chat (V2),
-- tool đã kích hoạt (V3/V4). Đây là căn cứ duy nhất để chấm 11.9/11.11/11.15/11.18 — máy chủ tự
-- ghi khi xử lý tin nhắn, trình duyệt không khai hộ được.
-- Câu 11.6: học viên nhắn "/help <mã cá nhân>" cho Bé Mầm trong nhóm lớp. Mỗi lần nhắn đúng mã
-- ghi một dòng ở đây; câu chỉ mở khi có lệnh trong vòng 24 giờ (nhắn lâu rồi thì nhắn lại).
CREATE TABLE IF NOT EXISTS help_pings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lark_open_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS demo_progress (
    user_id INTEGER NOT NULL,
    ver TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, ver, kind, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
"""


# Thời gian tối đa chờ khi CSDL đang bị khoá bởi request khác, trước khi báo lỗi.
# Mặc định của Python chỉ 5 giây — quá ngắn: khi nhiều học viên nộp bài cùng lúc (nhất là trên
# đĩa mạng chậm của Render), request nộp bài bị bung lỗi 500 sau đúng ~5 giây và học viên MẤT
# BÀI. Nới rộng để chờ tới lượt thay vì bỏ cuộc.
DB_TIMEOUT_S = 30


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=DB_TIMEOUT_S)
    conn.row_factory = sqlite3.Row
    # busy_timeout phải đặt lại ở mức SQLite (tham số timeout ở trên không phủ hết mọi trường hợp).
    conn.execute(f"PRAGMA busy_timeout = {DB_TIMEOUT_S * 1000}")
    # Với WAL, ghi không cần fsync mỗi lần commit vẫn an toàn trước sự cố tiến trình — nhanh hơn
    # nhiều lần trên đĩa mạng, giảm hẳn thời gian giữ khoá.
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        # WAL: người đọc và người ghi KHÔNG chặn nhau nữa. Ở chế độ mặc định (delete), mỗi lượt
        # tải tiến độ đều chặn lượt nộp bài đang chạy và ngược lại — đây là nguyên nhân chính gây
        # lỗi lưu ngắt quãng khi đông người học. Chỉ cần đặt 1 lần, SQLite ghi vào header của file.
        mode = conn.execute("PRAGMA journal_mode = WAL").fetchone()[0]
        # In ra log khởi động để kiểm chứng được trên máy chủ thật: nếu vì lý do nào đó ổ đĩa
        # không hỗ trợ WAL, SQLite âm thầm giữ nguyên chế độ cũ và lỗi khoá sẽ quay lại.
        print(f"[db] journal_mode = {mode} | busy_timeout = {DB_TIMEOUT_S}s | path = {DB_PATH}", flush=True)
        if mode.lower() != "wal":
            print("[db] CANH BAO: khong bat duoc WAL — se de bi loi khoa khi dong nguoi nop bai.", flush=True)
        conn.executescript(SCHEMA)
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(question_status)")]
        if "answer_data" not in cols:
            conn.execute("ALTER TABLE question_status ADD COLUMN answer_data TEXT")
        user_cols = [r["name"] for r in conn.execute("PRAGMA table_info(users)")]
        if "avatar_url" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
        if "email" not in user_cols:
            # Email tài khoản Lark — do công ty cấp, KHÔNG dùng để chấm câu 9.16.
            conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
        if "gws_email" not in user_cols:
            # Tài khoản Google học viên dùng xuyên suốt Bài 9 (Gmail cá nhân cũng được).
            # Giáo viên nhập sẵn trong /admin, hoặc để trống thì câu 9.16 tự khoá tài khoản
            # đầu tiên script phát hiện được. Khoá rồi thì các lần sau phải đúng tài khoản đó.
            conn.execute("ALTER TABLE users ADD COLUMN gws_email TEXT")
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
        if "pi_lab_friendship_code" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN pi_lab_friendship_code TEXT")
        if "pi_lab_phrase" not in user_cols:
            conn.execute("ALTER TABLE users ADD COLUMN pi_lab_phrase TEXT")
        ms_cols = [r["name"] for r in conn.execute("PRAGMA table_info(media_submissions)")]
        if ms_cols and "updated_at" not in ms_cols:
            conn.execute("ALTER TABLE media_submissions ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))")
        if ms_cols and "friendship_code" not in ms_cols:
            conn.execute("ALTER TABLE media_submissions ADD COLUMN friendship_code TEXT")
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
