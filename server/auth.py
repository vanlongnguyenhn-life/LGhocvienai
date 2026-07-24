import re
import secrets
import bcrypt

from .database import get_db

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.\-]{3,32}$")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("utf-8"))
    except ValueError:
        return False


def validate_username(username: str) -> str | None:
    if not USERNAME_RE.match(username or ""):
        return "Tên đăng nhập phải 3-32 ký tự, chỉ gồm chữ/số/._- (không dấu, không khoảng trắng)."
    return None


def validate_password(password: str) -> str | None:
    if not password or len(password) < 6:
        return "Mật khẩu cần tối thiểu 6 ký tự."
    return None


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with get_db() as conn:
        conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    return token


def get_user_by_session(token: str | None):
    if not token:
        return None
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.username, u.display_name, u.avatar_url, u.approved
            FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
    return dict(row) if row else None


def delete_session(token: str):
    with get_db() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def create_admin_session(admin_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with get_db() as conn:
        conn.execute("INSERT INTO admin_sessions (token, admin_id) VALUES (?, ?)", (token, admin_id))
    return token


def get_admin_by_session(token: str | None):
    if not token:
        return None
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT a.id, a.username
            FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
    return dict(row) if row else None


def delete_admin_session(token: str):
    with get_db() as conn:
        conn.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))
