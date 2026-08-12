"""Ghi vào Google Sheet của học viên bằng service account.

Dùng cho câu 9.23: sau khi học viên qua 9.17, máy chủ tự thêm một trang "Sheet2" vào chính
bảng tính họ vừa tạo và rải 10 mẩu mật thư bằng CHỮ MÀU TRẮNG — nhìn bằng mắt thường không
thấy, phải bôi đen hoặc đổi màu chữ mới hiện. Đây cũng là lý do câu 9.17 bắt share quyền
"Anyone with the link can EDIT": không có quyền ghi thì máy chủ không bỏ mật thư vào được.

Không dùng google-api-python-client cho nhẹ: chỉ mượn phần ký RSA của google-auth rồi tự gọi
REST bằng httpx (vốn đã có sẵn trong dự án). google.auth.transport cần thư viện `requests`
mà dự án không cài, nên tránh luôn.
"""
import json
import os
import time

import httpx

TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://sheets.googleapis.com/v4/spreadsheets"
SCOPE = "https://www.googleapis.com/auth/spreadsheets"
SECRET_SHEET_TITLE = "Sheet2"
SECRET_SHEET_ROWS = 191
SECRET_SHEET_COLS = 26

_token_cache = {"value": None, "expires_at": 0.0}


def _service_account_info():
    raw = (os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON") or "").strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def is_configured() -> bool:
    info = _service_account_info()
    return bool(info and info.get("client_email") and info.get("private_key"))


def service_account_email() -> str:
    info = _service_account_info() or {}
    return info.get("client_email", "")


def _access_token() -> str:
    """Đổi khoá service account lấy access token, có nhớ đệm tới sát hạn."""
    now = time.time()
    if _token_cache["value"] and now < _token_cache["expires_at"] - 60:
        return _token_cache["value"]

    info = _service_account_info()
    if not info:
        raise RuntimeError("Chưa cấu hình GOOGLE_SERVICE_ACCOUNT_JSON.")

    from google.auth import crypt, jwt as gjwt

    signer = crypt.RSASigner.from_service_account_info(info)
    issued = int(now)
    assertion = gjwt.encode(
        signer,
        {
            "iss": info["client_email"],
            "scope": SCOPE,
            "aud": TOKEN_URL,
            "iat": issued,
            "exp": issued + 3600,
        },
    )
    # gjwt.encode trả về BYTES. Đưa thẳng bytes vào form của httpx thì nó mã hoá thành
    # chuỗi repr kiểu b'eyJ...' — cả chữ b lẫn dấu nháy đều bị gửi đi, và Google trả
    # invalid_request. Phải chuyển sang str trước.
    if isinstance(assertion, bytes):
        assertion = assertion.decode("ascii")
    with httpx.Client(timeout=25.0) as client:
        resp = client.post(
            TOKEN_URL,
            data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
        )
    if resp.status_code != 200:
        raise RuntimeError("Google từ chối cấp token (HTTP %s): %s" % (resp.status_code, resp.text[:200]))
    data = resp.json()
    _token_cache["value"] = data["access_token"]
    _token_cache["expires_at"] = now + float(data.get("expires_in", 3600))
    return _token_cache["value"]


def _call(client, method: str, url: str, token: str, payload=None):
    resp = client.request(method, url, headers={"Authorization": "Bearer " + token}, json=payload)
    if resp.status_code >= 400:
        raise RuntimeError("Google Sheets báo lỗi (HTTP %s): %s" % (resp.status_code, resp.text[:300]))
    return resp.json()


def _cell_to_index(cell: str):
    """A1 -> (0, 0); Z191 -> (190, 25). Trả (rowIndex, columnIndex) đếm từ 0."""
    letters = "".join(ch for ch in cell if ch.isalpha()).upper()
    digits = "".join(ch for ch in cell if ch.isdigit())
    col = 0
    for ch in letters:
        col = col * 26 + (ord(ch) - ord("A") + 1)
    return int(digits) - 1, col - 1


def write_secret_sheet(spreadsheet_id: str, entries: list, decoys: list = ()) -> dict:
    """Tạo (hoặc dùng lại) trang Sheet2 rồi rải mật thư vào đó.

    entries: 10 mẩu THẬT — ghi bằng chữ TRẮNG, nhìn thẳng không thấy.
    decoys:  hàng trăm mẩu GIẢ cùng định dạng — ghi bằng chữ đen bình thường.

    Vì sao cần mẩu giả: chữ trắng chỉ giấu được với MẮT NGƯỜI. Agent xuất sheet ra CSV là
    thấy ngay đúng 10 ô có chữ — lộ hết. Trộn thêm vài trăm mẩu giả y hệt về hình thức thì
    bản CSV (vốn không mang định dạng) cho ra một đống mã không phân biệt được; muốn lọc ra
    đúng 10 mẩu thật thì phải đọc tới MÀU CHỮ, tức phải xuất XLSX hoặc hỏi API định dạng.
    """
    token = _access_token()
    with httpx.Client(timeout=40.0) as client:
        meta = _call(client, "GET", f"{API}/{spreadsheet_id}?fields=sheets.properties", token)
        sheet_id = None
        for sh in meta.get("sheets", []):
            props = sh.get("properties", {})
            if props.get("title") == SECRET_SHEET_TITLE:
                sheet_id = props.get("sheetId")
                break

        if sheet_id is None:
            created = _call(
                client, "POST", f"{API}/{spreadsheet_id}:batchUpdate", token,
                {"requests": [{"addSheet": {"properties": {
                    "title": SECRET_SHEET_TITLE,
                    "gridProperties": {"rowCount": SECRET_SHEET_ROWS, "columnCount": SECRET_SHEET_COLS},
                }}}]},
            )
            sheet_id = created["replies"][0]["addSheet"]["properties"]["sheetId"]

        def o(cell: str, code: str, mau: dict) -> dict:
            row, col = _cell_to_index(cell)
            return {
                "updateCells": {
                    "start": {"sheetId": sheet_id, "rowIndex": row, "columnIndex": col},
                    "rows": [{"values": [{
                        "userEnteredValue": {"stringValue": code},
                        "userEnteredFormat": {"textFormat": {"foregroundColor": mau}},
                    }]}],
                    "fields": "userEnteredValue,userEnteredFormat.textFormat.foregroundColor",
                }
            }

        TRANG = {"red": 1, "green": 1, "blue": 1}
        DEN = {"red": 0, "green": 0, "blue": 0}
        # Xoá sạch trang trước khi ghi lại: mỗi lần nộp 9.17 là một bộ mã hoàn toàn mới, không
        # để sót mã cũ nằm lẫn vào (web tham khảo cũng làm vậy — ô thử của lần trước biến mất).
        requests = [{"updateCells": {
            "range": {"sheetId": sheet_id},
            "fields": "userEnteredValue,userEnteredFormat",
        }}]
        requests += [o(d["cell"], d["code"], DEN) for d in decoys]
        requests += [o(e["cell"], e["code"], TRANG) for e in entries]
        # Ghi theo từng đợt: vài trăm yêu cầu trong một lần gọi dễ chạm giới hạn của Google.
        for i in range(0, len(requests), 200):
            _call(client, "POST", f"{API}/{spreadsheet_id}:batchUpdate", token,
                  {"requests": requests[i:i + 200]})
    return {"ok": True, "so_manh": len(entries), "so_manh_gia": len(decoys)}
