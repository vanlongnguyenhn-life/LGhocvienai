import re

# Magic-byte signatures for common image formats — real content sniffing,
# not just "a file was attached".
IMAGE_SIGNATURES = [
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpg"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
    (b"RIFF", "webp"),  # followed by "WEBP" at offset 8, checked separately
]

MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8MB
MIN_IMAGE_BYTES = 100  # reject empty/near-empty files

URL_RE = re.compile(
    r"^https?://"
    r"(localhost|(\d{1,3}\.){3}\d{1,3}|[\w-]+(\.[\w-]+)+)"
    r"(:\d{1,5})?"
    r"(/[^\s]*)?$",
    re.IGNORECASE,
)
LOCAL_PATH_RE = re.compile(r"^([a-zA-Z]:[\\/]|\.{1,2}[\\/]|/)[^\s]{2,}$")


def sniff_image_format(data: bytes) -> str | None:
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    for sig, fmt in IMAGE_SIGNATURES:
        if data.startswith(sig):
            return fmt
    return None


def validate_image(data: bytes) -> tuple[bool, str]:
    if len(data) < MIN_IMAGE_BYTES:
        return False, "File quá nhỏ, không giống một ảnh thật."
    if len(data) > MAX_IMAGE_BYTES:
        return False, "File vượt quá 8MB."
    fmt = sniff_image_format(data)
    if not fmt:
        return False, "Không nhận diện được định dạng ảnh (cần PNG/JPEG/GIF/WEBP thật, không chỉ đổi tên đuôi file)."
    return True, f"Ảnh hợp lệ ({fmt.upper()})"


def validate_url(value: str) -> tuple[bool, str]:
    value = (value or "").strip()
    if URL_RE.match(value):
        return True, "Địa chỉ URL hợp lệ"
    if LOCAL_PATH_RE.match(value):
        return True, "Đường dẫn cục bộ hợp lệ"
    return False, "Cần một URL bắt đầu bằng http(s):// hoặc một đường dẫn cục bộ hợp lệ (ví dụ C:/... hoặc /home/...)."


def validate_text(value: str, min_length: int = 20) -> tuple[bool, str]:
    value = (value or "").strip()
    if len(value) < min_length:
        return False, f"Cần tối thiểu {min_length} ký tự có nội dung thật."
    unique_ratio = len(set(value.lower().replace(" ", ""))) / max(len(value.replace(" ", "")), 1)
    if unique_ratio < 0.15:
        return False, "Nội dung có vẻ là ký tự lặp lại, chưa phải câu trả lời thật."
    return True, "Nội dung hợp lệ"
