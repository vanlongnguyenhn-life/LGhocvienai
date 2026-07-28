"""Chấm các câu KHÔNG trắc nghiệm bằng AI (Claude): chữ, ảnh (vision), và link (mở trang đọc nội dung).

Nguyên tắc an toàn:
- Chỉ chấm bằng AI SAU khi đã qua kiểm tra định dạng cơ bản (ảnh thật / URL hợp lệ / đủ độ dài).
- Nếu gọi AI thất bại → trả None để nơi gọi tự quyết (thường là tạm chấp nhận theo luật + đánh dấu chấm lại).
- Mở link: chặn địa chỉ nội bộ/loopback (chống SSRF), giới hạn thời gian và dung lượng.
"""

import base64
import ipaddress
import json
import os
import re
import socket
from urllib.parse import urlparse

import httpx

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
GRADER_MODEL = os.environ.get("GRADER_MODEL", "claude-haiku-4-5-20251001")

SYSTEM = (
    "Bạn là trợ giảng chấm MINH CHỨNG bài tập thực hành cho khoá học về Coding Agent. "
    "Bạn được cho: (1) bối cảnh đề bài, (2) TIÊU CHÍ ĐÚNG mà minh chứng cần thoả, (3) minh chứng học "
    "viên nộp (một đoạn chữ, một ảnh, hoặc nội dung một trang web). Hãy đánh giá minh chứng có thoả tiêu "
    "chí không. Tinh thần: khoá học rèn học viên tự làm nên chấp nhận mọi minh chứng HỢP LÝ, đúng chủ đề, "
    "cho thấy học viên thực sự đã làm; chỉ đánh RỚT nếu minh chứng rõ ràng lạc đề, trống rỗng, giả/spam, "
    "hoặc không liên quan tới tiêu chí. KHÔNG bắt bẻ tiểu tiết. "
    'Trả lời DUY NHẤT một JSON, không kèm chữ nào khác: {"valid": true/false, "reason": "..."} '
    "(reason ngắn gọn tiếng Việt, dưới 25 từ)."
)


def is_configured() -> bool:
    return bool(ANTHROPIC_API_KEY)


def _parse_verdict(data: dict):
    txt = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
    m = re.search(r"\{.*\}", txt, re.S)
    if m:
        txt = m.group(0)
    obj = json.loads(txt)
    return bool(obj.get("valid")), str(obj.get("reason", ""))[:200]


def _rubric_block(context: str, rubric: str) -> str:
    parts = []
    if context:
        parts.append("BỐI CẢNH ĐỀ BÀI:\n" + context.strip())
    parts.append("TIÊU CHÍ ĐÚNG cần thoả:\n" + (rubric or "(không có mô tả — hãy đánh giá tính hợp lý chung)").strip())
    return "\n\n".join(parts)


def _post(messages: list) -> dict | None:
    if not ANTHROPIC_API_KEY:
        return None
    try:
        resp = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": GRADER_MODEL, "max_tokens": 200, "system": SYSTEM, "messages": messages},
            timeout=45.0,
        )
        if resp.status_code != 200:
            print(f"[ai_grader] status={resp.status_code} body={resp.text[:300]}")
            return None
        return resp.json()
    except Exception as e:
        print(f"[ai_grader post error] {e!r}")
        return None


def grade_text(context: str, rubric: str, answer: str):
    """Chấm minh chứng dạng chữ. Trả (valid, reason) hoặc None nếu lỗi AI."""
    user = _rubric_block(context, rubric) + "\n\nMINH CHỨNG (chữ) học viên nộp:\n" + (answer or "")
    data = _post([{"role": "user", "content": user}])
    if not data:
        return None
    try:
        return _parse_verdict(data)
    except Exception as e:
        print(f"[ai_grader parse error] {e!r}")
        return None


def grade_image(context: str, rubric: str, image_bytes: bytes, media_type: str):
    """Chấm minh chứng dạng ảnh bằng AI vision. Trả (valid, reason) hoặc None nếu lỗi AI."""
    if not image_bytes:
        return None
    b64 = base64.b64encode(image_bytes).decode("ascii")
    content = [
        {"type": "text", "text": _rubric_block(context, rubric) + "\n\nMINH CHỨNG là ẢNH dưới đây. Ảnh có thoả tiêu chí không?"},
        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
    ]
    data = _post([{"role": "user", "content": content}])
    if not data:
        return None
    try:
        return _parse_verdict(data)
    except Exception as e:
        print(f"[ai_grader parse error] {e!r}")
        return None


# ===================== MỞ LINK AN TOÀN (chống SSRF) =====================

def _is_public_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        return False
    for info in infos:
        ip = info[4][0]
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False
        if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast or addr.is_unspecified:
            return False
    return True


def can_grade_url(url: str) -> bool:
    """URL có thể mở từ server để AI chấm nội dung không (public http/https, không phải nội bộ/localhost)."""
    try:
        p = urlparse((url or "").strip())
    except Exception:
        return False
    return p.scheme in ("http", "https") and bool(p.hostname) and _is_public_host(p.hostname)


def fetch_url_text(url: str):
    """Mở link công khai, trả (ok, text_hoặc_lý_do_lỗi). Chặn địa chỉ nội bộ, giới hạn dung lượng/thời gian."""
    try:
        parsed = urlparse((url or "").strip())
    except Exception:
        return False, "URL không hợp lệ."
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False, "Chỉ hỗ trợ link http(s) công khai."
    if not _is_public_host(parsed.hostname):
        return False, "Link trỏ tới địa chỉ nội bộ/không công khai nên không kiểm tra được."
    try:
        with httpx.Client(timeout=12.0, follow_redirects=False, headers={"User-Agent": "AILG-Grader/1.0"}) as client:
            resp = client.get(url)
        if resp.status_code >= 400:
            return False, f"Không mở được trang (mã {resp.status_code})."
        if resp.status_code in (301, 302, 303, 307, 308):
            return False, "Link chuyển hướng — chưa đọc được nội dung để chấm."
        raw = resp.text[:200000]
    except Exception as e:
        return False, f"Không tải được nội dung link ({type(e).__name__})."
    # Bóc thẻ HTML thô để lấy chữ đọc được.
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", raw)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return True, text[:4000]


def grade_url(context: str, rubric: str, url: str):
    """Chấm minh chứng dạng link: mở trang, đọc nội dung, rồi AI đánh giá. Trả (valid, reason) hoặc None."""
    ok, content = fetch_url_text(url)
    if not ok:
        # Không đọc được (link nội bộ/localhost/hỏng...) → để nơi gọi tự quyết (giữ theo kiểm tra
        # định dạng), KHÔNG đánh rớt oan vì nhiều câu yêu cầu địa chỉ cục bộ không thể mở từ server.
        return None
    user = (
        _rubric_block(context, rubric)
        + f"\n\nMINH CHỨNG là LINK: {url}\nNội dung đọc được từ trang (đã bóc chữ):\n{content}"
    )
    data = _post([{"role": "user", "content": user}])
    if not data:
        return None
    try:
        return _parse_verdict(data)
    except Exception as e:
        print(f"[ai_grader parse error] {e!r}")
        return None
