"""Nhận giọng nói tiếng Việt bằng Gemini — dùng cho tiêu chí "voice-over" của câu 10.26.

Vì sao không dùng Claude: Claude nhận ảnh nhưng không nhận âm thanh, mà tiêu chí này cần
nghe giọng đọc trong video rồi đối chiếu với kịch bản. Gemini nhận thẳng file WAV.

Tên biến môi trường: chấp nhận vài tên phổ biến để khỏi phải sửa cấu hình nếu đặt tên khác.
"""
import base64
import os

import httpx

# Thử lần lượt từng model — Google khai tử model cũ khá thường xuyên (gemini-2.0-flash chết
# tháng 8/2026, trả 404 giữa chừng dù trước đó vẫn chạy). Gặp 404 thì tự chuyển model kế tiếp
# thay vì đánh rớt oan học viên.
MODELS = ("gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-pro")
URL_MAU = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"
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
        # Model 2.5 mặc định BẬT "suy nghĩ nội bộ" và token suy nghĩ TÍNH VÀO maxOutputTokens
        # — nghĩ hết hạn mức là phần lời chép trả về rỗng (candidates[0].content không có
        # parts). Tắt suy nghĩ + nới hạn mức. Model không hỗ trợ trường này thì bỏ qua nó.
        "generationConfig": {"temperature": 0, "maxOutputTokens": 8192,
                             "thinkingConfig": {"thinkingBudget": 0}},
    }
    # 404 = model khai tử, 429/503 = quá tải tạm thời — cả hai đều KHÔNG phải lỗi của học
    # viên, nên thử model kế tiếp (và đảo lại vòng nữa cho nhóm quá tải) thay vì đánh rớt.
    # Đã gặp cả hai ngoài đời thật trong cùng một buổi: 2.0-flash chết 404, 2.5-flash 503.
    loi_cuoi = ""
    for vong in range(2):
        for model in MODELS:
            try:
                with httpx.Client(timeout=180.0) as client:
                    r = client.post(URL_MAU % model, params={"key": khoa}, json=payload)
            except Exception as e:  # noqa: BLE001
                loi_cuoi = "Lỗi mạng khi gọi Gemini: %s" % str(e)[:120]
                continue
            if r.status_code == 404:
                loi_cuoi = "Model %s đã bị Gemini khai tử (404)." % model
                continue
            if r.status_code in (429, 503):
                loi_cuoi = "Gemini đang quá tải (HTTP %s) — thử nộp lại sau ít phút." % r.status_code
                import time
                time.sleep(3 * (vong + 1))
                continue
            if r.status_code != 200:
                return "", "Gemini báo lỗi HTTP %s: %s" % (r.status_code, r.text[:200])
            try:
                d = r.json()
                parts = (d.get("candidates") or [{}])[0].get("content", {}).get("parts") or []
                chu = " ".join(p.get("text", "") for p in parts if isinstance(p, dict)).strip()
            except ValueError:
                loi_cuoi = "Gemini trả về dữ liệu không đọc được (model %s)." % model
                continue
            if chu:
                return chu, ""
            # 200 nhưng không có chữ (hết hạn mức vì suy nghĩ, hoặc bị chặn) — thử model khác.
            ly_do = (d.get("candidates") or [{}])[0].get("finishReason", "?")
            loi_cuoi = "Gemini không trả về lời chép (model %s, finishReason=%s)." % (model, ly_do)
    return "", loi_cuoi or "Không gọi được model Gemini nào."
