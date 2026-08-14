"""Nhận giọng nói tiếng Việt bằng Gemini — dùng cho tiêu chí "voice-over" của câu 10.26.

Vì sao không dùng Claude: Claude nhận ảnh nhưng không nhận âm thanh, mà tiêu chí này cần
nghe giọng đọc trong video rồi đối chiếu với kịch bản. Gemini nhận thẳng file WAV.

Tên biến môi trường: chấp nhận vài tên phổ biến để khỏi phải sửa cấu hình nếu đặt tên khác.
"""
import base64
import os

import httpx

MODEL = "gemini-2.0-flash"
URL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % MODEL
TEN_BIEN = ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GEMINI_API_KEY", "GEMINI_KEY")
GIOI_HAN_BYTES = 18 * 1024 * 1024   # Gemini nhận dữ liệu nhúng tối đa khoảng 20MB


def _khoa() -> str:
    for ten in TEN_BIEN:
        v = (os.getenv(ten) or "").strip()
        if v:
            return v
    return ""


def is_configured() -> bool:
    return bool(_khoa())


def nhan_giong(duong_dan_wav: str) -> tuple:
    """Nghe file WAV, trả (transcript, lỗi). transcript rỗng nếu hụt.

    Chỉ yêu cầu chép lại lời, KHÔNG cho Gemini tự phán đúng/sai — việc đối chiếu từ khoá do
    máy chủ tự làm, để kết quả chấm không phụ thuộc vào tâm trạng của mô hình.
    """
    khoa = _khoa()
    if not khoa:
        return "", "Máy chủ chưa cấu hình khoá Gemini."
    try:
        with open(duong_dan_wav, "rb") as f:
            data = f.read()
    except OSError as e:
        return "", "Không đọc được file tiếng: %s" % e
    if not data:
        return "", "File tiếng rỗng."
    if len(data) > GIOI_HAN_BYTES:
        return "", "Đoạn tiếng quá dài để nhận dạng (%.1f MB)." % (len(data) / 1048576)

    payload = {
        "contents": [{"parts": [
            {"text": "Chép lại NGUYÊN VĂN toàn bộ lời nói tiếng Việt trong đoạn âm thanh này. "
                     "Chỉ trả về phần lời, không thêm bình luận, không thêm dấu thời gian. "
                     "Nếu không nghe thấy lời nói nào thì trả về đúng chữ: (không có lời nói)"},
            {"inline_data": {"mime_type": "audio/wav", "data": base64.b64encode(data).decode()}},
        ]}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 4096},
    }
    try:
        with httpx.Client(timeout=180.0) as client:
            r = client.post(URL, params={"key": khoa}, json=payload)
    except Exception as e:  # noqa: BLE001
        return "", "Lỗi mạng khi gọi Gemini: %s" % str(e)[:120]
    if r.status_code != 200:
        return "", "Gemini báo lỗi HTTP %s: %s" % (r.status_code, r.text[:200])
    try:
        d = r.json()
        parts = d["candidates"][0]["content"]["parts"]
        return " ".join(p.get("text", "") for p in parts).strip(), ""
    except (KeyError, IndexError, ValueError):
        return "", "Gemini trả về dữ liệu không đọc được."
