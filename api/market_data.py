from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd

try:
    from .config import DATA_DIR
except ImportError:
    from config import DATA_DIR


def _yf():
    import yfinance as yf
    return yf


def cache_path(symbol: str, interval: str) -> Path:
    return DATA_DIR / interval / f"{symbol}.csv"


def normalize_index(df: pd.DataFrame) -> pd.DataFrame:
    x = df.copy()
    if isinstance(x.columns, pd.MultiIndex):
        fields = {"Open", "High", "Low", "Close", "Volume"}
        if set(x.columns.get_level_values(0)) & fields:
            x.columns = x.columns.get_level_values(0)
        elif set(x.columns.get_level_values(1)) & fields:
            x.columns = x.columns.get_level_values(1)
    if not isinstance(x.index, pd.DatetimeIndex):
        for col in ("Datetime", "Date"):
            if col in x.columns:
                x[col] = pd.to_datetime(x[col], utc=True, errors="coerce")
                x = x.set_index(col)
                break
    if not isinstance(x.index, pd.DatetimeIndex):
        raise ValueError("Market data requires a DatetimeIndex.")
    if x.index.tz is None:
        x.index = x.index.tz_localize("UTC")
    return x.sort_index()


def load_cached(symbol: str, interval: str) -> pd.DataFrame:
    path = cache_path(symbol, interval)
    if not path.exists():
        return pd.DataFrame()
    frame = pd.read_csv(path, index_col=0, parse_dates=True)
    frame.index = pd.to_datetime(frame.index, utc=True)
    return normalize_index(frame)


def save_cache(symbol: str, interval: str, df: pd.DataFrame) -> Path:
    path = cache_path(symbol, interval)
    path.parent.mkdir(parents=True, exist_ok=True)
    normalize_index(df).to_csv(path)
    return path


def merge_cache(old: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame:
    if old is None or old.empty:
        return normalize_index(new)
    if new is None or new.empty:
        return normalize_index(old)

    old = normalize_index(old)
    new = normalize_index(new)
    today_ny = pd.Timestamp.now(tz="America/New_York").date()
    old_dates = pd.Index(old.index.tz_convert("America/New_York").date)
    new_dates = pd.Index(new.index.tz_convert("America/New_York").date)
    old_hist = old.loc[old_dates < today_ny]
    old_live = old.loc[old_dates >= today_ny]
    new_hist = new.loc[new_dates < today_ny]
    new_live = new.loc[new_dates >= today_ny]
    historical = pd.concat([old_hist, new_hist])
    historical = historical[~historical.index.duplicated(keep="first")]
    live = pd.concat([old_live, new_live])
    live = live[~live.index.duplicated(keep="last")]
    return pd.concat([historical, live]).sort_index()


def download_recent(symbol: str, interval: str, period: str, prepost: bool = True) -> pd.DataFrame:
    yf = _yf()
    frame = yf.download(
        symbol,
        period=period,
        interval=interval,
        auto_adjust=False,
        prepost=prepost,
        progress=False,
        threads=False,
        multi_level_index=False,
    )
    if frame is None or frame.empty:
        raise RuntimeError(f"No Yahoo Finance data returned for {symbol} ({interval}).")
    return normalize_index(frame)


def refresh_symbol(symbol: str, interval: str, period: str, prepost: bool = True) -> pd.DataFrame:
    old = load_cached(symbol, interval)
    new = download_recent(symbol, interval, period, prepost)
    merged = merge_cache(old, new)
    save_cache(symbol, interval, merged)
    return merged


def ensure_symbol(symbol: str, interval: str, period: str, refresh: bool = False) -> pd.DataFrame:
    cached = load_cached(symbol, interval)
    if refresh or cached.empty:
        try:
            return refresh_symbol(symbol, interval, period, True)
        except Exception:
            if not cached.empty:
                return cached
            raise
    return cached


def session_dates(df: pd.DataFrame) -> list[date]:
    if df.empty:
        return []
    idx = df.index.tz_convert("America/New_York")
    mins = idx.hour * 60 + idx.minute
    regular = df.loc[(mins >= 570) & (mins < 960)]
    ridx = regular.index.tz_convert("America/New_York")
    return sorted(set(ridx.date))


def common_recent_sessions(frames: dict[str, pd.DataFrame], count: int = 5) -> list[date]:
    counts: dict[date, int] = {}
    for frame in frames.values():
        for session in session_dates(frame):
            counts[session] = counts.get(session, 0) + 1
    if not counts:
        return []
    threshold = max(1, (len(frames) + 1) // 2)
    eligible = sorted(d for d, n in counts.items() if n >= threshold)
    return eligible[-count:]
