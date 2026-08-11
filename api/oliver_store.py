from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pandas as pd

DEFAULT_SUPABASE_URL = "https://mutgmifeyabrbjjmjfoq.supabase.co"
NY_TZ = "America/New_York"


def _config():
    return (os.getenv("SUPABASE_URL", DEFAULT_SUPABASE_URL).rstrip("/"), os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))


def configured() -> bool:
    return bool(_config()[1])


def _request(path: str, method: str = "GET", payload=None, prefer: str | None = None):
    url, key = _config()
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured")
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = None if payload is None else json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
    req = Request(f"{url}/rest/v1/{path}", data=data, headers=headers, method=method)
    with urlopen(req, timeout=15) as response:
        body = response.read().decode("utf-8")
        return json.loads(body) if body else None


def stable_hash(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")).hexdigest()


def load_bars(symbol: str, interval: str) -> pd.DataFrame:
    if not configured():
        return pd.DataFrame()
    query = urlencode({"symbol": f"eq.{symbol}", "interval": f"eq.{interval}", "select": "ts,open,high,low,close,volume", "order": "ts.asc"})
    rows = _request(f"oliver_market_bars?{query}") or []
    if not rows:
        return pd.DataFrame()
    frame = pd.DataFrame(rows)
    frame["ts"] = pd.to_datetime(frame["ts"], utc=True, errors="coerce")
    frame = frame.dropna(subset=["ts"]).set_index("ts")
    frame.index.name = "Datetime"
    frame = frame.rename(columns={"open":"Open","high":"High","low":"Low","close":"Close","volume":"Volume"})
    return frame[["Open","High","Low","Close","Volume"]].sort_index()


def latest_fetch_day(symbol: str, interval: str):
    if not configured():
        return None
    query = urlencode({"symbol": f"eq.{symbol}", "interval": f"eq.{interval}", "select": "fetched_at", "order": "fetched_at.desc", "limit": "1"})
    rows = _request(f"oliver_market_sessions?{query}") or []
    if not rows:
        return None
    value = pd.Timestamp(rows[0]["fetched_at"])
    return value.tz_convert(NY_TZ).date() if value.tzinfo else value.tz_localize("UTC").tz_convert(NY_TZ).date()


def save_bars(symbol: str, interval: str, df: pd.DataFrame) -> None:
    if not configured() or df is None or df.empty:
        return
    x = df.copy()
    idx = x.index.tz_convert(NY_TZ) if x.index.tz is not None else x.index.tz_localize(NY_TZ)
    rows = []
    for ts, row in x.iterrows():
        local_ts = pd.Timestamp(ts).tz_convert(NY_TZ) if pd.Timestamp(ts).tzinfo else pd.Timestamp(ts).tz_localize(NY_TZ)
        item = {
            "symbol": symbol, "interval": interval, "ts": pd.Timestamp(ts).isoformat(), "session_date": local_ts.date().isoformat(),
            "open": None if pd.isna(row.get("Open")) else float(row["Open"]), "high": None if pd.isna(row.get("High")) else float(row["High"]),
            "low": None if pd.isna(row.get("Low")) else float(row["Low"]), "close": None if pd.isna(row.get("Close")) else float(row["Close"]),
            "volume": None if pd.isna(row.get("Volume")) else float(row["Volume"]), "source": "yahoo",
        }
        if all(item[k] is not None for k in ("open","high","low","close")):
            rows.append(item)
    for start in range(0, len(rows), 500):
        _request("oliver_market_bars?on_conflict=symbol,interval,ts", "POST", rows[start:start+500], "resolution=ignore-duplicates,return=minimal")

    today = pd.Timestamp.now(tz=NY_TZ).date()
    local_dates = pd.Index(idx.date)
    sessions = []
    for session_date in sorted(set(local_dates)):
        session = x.loc[local_dates == session_date]
        if session.empty:
            continue
        sessions.append({"symbol":symbol,"interval":interval,"session_date":session_date.isoformat(),"complete":session_date<today,"first_ts":session.index.min().isoformat(),"last_ts":session.index.max().isoformat(),"bar_count":int(len(session)),"provider":"yahoo","fetched_at":datetime.utcnow().isoformat()+"Z"})
    if sessions:
        _request("oliver_market_sessions?on_conflict=symbol,interval,session_date", "POST", sessions, "resolution=merge-duplicates,return=minimal")


def save_engine_review(session_date: str, symbol: str, timeframe: str, model_version: str, decision_time, candidate: dict, review: dict) -> None:
    if not configured():
        return
    key = f"engine|{session_date}|{symbol}|{timeframe}|{model_version}|{decision_time or 'none'}"
    input_hash = stable_hash({"candidate": candidate, "modelVersion": model_version, "timeframe": timeframe})
    row = {"review_key":key,"session_date":session_date,"symbol":symbol,"timeframe":timeframe,"model_version":model_version,"decision_time":None if decision_time is None else str(decision_time),"input_hash":input_hash,"review":review,"generated_at":datetime.utcnow().isoformat()+"Z"}
    _request("oliver_engine_reviews?on_conflict=review_key", "POST", row, "resolution=merge-duplicates,return=minimal")


def save_engine_ranking(session_date: str, timeframe: str, model_version: str, reviews: list[dict], ranking: dict) -> None:
    if not configured():
        return
    key = f"engine|{session_date}|{timeframe}|{model_version}"
    row = {"ranking_key":key,"session_date":session_date,"timeframe":timeframe,"model_version":model_version,"source":"engine","input_hash":stable_hash(reviews),"ranking":ranking,"generated_at":datetime.utcnow().isoformat()+"Z"}
    _request("oliver_daily_rankings?on_conflict=ranking_key", "POST", row, "resolution=merge-duplicates,return=minimal")
