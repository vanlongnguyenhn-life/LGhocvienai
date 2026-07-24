import os
import secrets
import time
import urllib.parse

import httpx

LARK_DOMAIN = os.environ.get("LARK_DOMAIN", "https://open.larksuite.com")
LARK_APP_ID = os.environ.get("LARK_APP_ID", "")
LARK_APP_SECRET = os.environ.get("LARK_APP_SECRET", "")
LARK_REDIRECT_URI = os.environ.get("LARK_REDIRECT_URI", "http://localhost:5173/api/auth/lark/callback")

_app_token_cache = {"token": None, "expires_at": 0}


def is_configured() -> bool:
    return bool(LARK_APP_ID and LARK_APP_SECRET)


def build_authorize_url(state: str) -> str:
    params = {
        "app_id": LARK_APP_ID,
        "redirect_uri": LARK_REDIRECT_URI,
        "state": state,
    }
    return f"{LARK_DOMAIN}/open-apis/authen/v1/index?" + urllib.parse.urlencode(params)


async def get_app_access_token() -> str:
    now = time.time()
    if _app_token_cache["token"] and _app_token_cache["expires_at"] > now + 30:
        return _app_token_cache["token"]

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{LARK_DOMAIN}/open-apis/auth/v3/app_access_token/internal",
            json={"app_id": LARK_APP_ID, "app_secret": LARK_APP_SECRET},
        )
        data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(f"Lark app_access_token error: {data}")

    _app_token_cache["token"] = data["app_access_token"]
    _app_token_cache["expires_at"] = now + data.get("expire", 7200)
    return _app_token_cache["token"]


async def exchange_code_for_user(code: str) -> dict:
    """Trả về dict {open_id, name, avatar_url, email} từ tài khoản Lark đã xác thực."""
    app_token = await get_app_access_token()
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{LARK_DOMAIN}/open-apis/authen/v1/access_token",
            headers={"Authorization": f"Bearer {app_token}"},
            json={"grant_type": "authorization_code", "code": code},
        )
        data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(f"Lark access_token error: {data}")

    d = data["data"]
    return {
        "open_id": d.get("open_id"),
        "name": d.get("name") or d.get("en_name") or "Lark User",
        "avatar_url": d.get("avatar_url"),
        "email": d.get("email"),
    }


def new_state_token() -> str:
    return secrets.token_urlsafe(24)
