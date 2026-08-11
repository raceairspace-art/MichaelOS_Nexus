from __future__ import annotations

import json
import os
import time
from http.cookies import SimpleCookie
from urllib.request import Request, urlopen

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://mutgmifeyabrbjjmjfoq.supabase.co").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_2Q0OFkqsDdxSwrx3NIneYg_QX4V3152")
ALLOWED_USER_ID = os.environ.get("NEXUS_ALLOWED_USER_ID", "e1be1dc8-0745-482f-9c2f-d425f69ddf34")
ACCESS_COOKIE = "michaelos_nexus_access"
_VERIFY_CACHE: dict[str, float] = {}


def _bypass(handler) -> bool:
    expected = os.environ.get("VERCEL_AUTOMATION_BYPASS_SECRET", "")
    if not expected:
        return False
    return handler.headers.get("x-michaelos-automation-bypass", "") == expected or handler.headers.get("x-vercel-protection-bypass", "") == expected


def _access_token(handler) -> str:
    raw = handler.headers.get("Cookie", "")
    if not raw:
        return ""
    try:
        cookies = SimpleCookie(); cookies.load(raw)
        morsel = cookies.get(ACCESS_COOKIE)
        return morsel.value if morsel else ""
    except Exception:
        return ""


def _verify_token(token: str) -> bool:
    if not token:
        return False
    now = time.time(); expires = _VERIFY_CACHE.get(token, 0)
    if expires > now:
        return True
    req = Request(f"{SUPABASE_URL}/auth/v1/user", headers={"apikey":SUPABASE_PUBLISHABLE_KEY,"Authorization":f"Bearer {token}","Accept":"application/json","User-Agent":"MichaelOS-Nexus-Python-Auth/1.0"})
    try:
        with urlopen(req, timeout=6) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if payload.get("id") != ALLOWED_USER_ID:
            return False
        _VERIFY_CACHE[token] = now + 300
        if len(_VERIFY_CACHE) > 128:
            for key, value in list(_VERIFY_CACHE.items()):
                if value <= now: _VERIFY_CACHE.pop(key, None)
        return True
    except Exception:
        return False


def authorized(handler) -> bool:
    return _bypass(handler) or _verify_token(_access_token(handler))


def send_unauthorized(handler):
    body = b'{"error":"Authentication required."}'
    handler.send_response(401)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers(); handler.wfile.write(body)
