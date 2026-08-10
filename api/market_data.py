from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

import pandas as pd

try:
    from .config import DATA_DIR
except ImportError:
    from config import DATA_DIR


NY_TZ = "America/New_York"
REGULAR_OPEN_MINUTE = 9 * 60 + 30
REGULAR_CLOSE_MINUTE = 16 * 60
YAHOO_CHART_HOSTS = ("query1.finance.yahoo.com", "query2.finance.yahoo.com")


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
                x[col] = pd.to_datetime(x[col], errors="coerce")
                x = x.set_index(col)
                break
    if not isinstance(x.index, pd.DatetimeIndex):
        raise ValueError("Market data requires a DatetimeIndex.")

    # Yahoo intraday timestamps are exchange-local when they arrive naive.
    # Treating those values as UTC shifts the regular session by four/five
    # hours and can make a valid frame appear to contain no market-hours data.
    if x.index.tz is None:
        x.index = x.index.tz_localize(NY_TZ, ambiguous="infer", nonexistent="shift_forward")

    required = [c for c in ("Open", "High", "Low", "Close") if c in x.columns]
    if required:
        x = x.dropna(subset=required, how="all")
    return x[~x.index.duplicated(keep="last")].sort_index()


def _regular_mask(df: pd.DataFrame) -> pd.Series:
    if df.empty:
        return pd.Series(False, index=df.index, dtype=bool)
    x = normalize_index(df)
    idx = x.index.tz_convert(NY_TZ)
    mins = idx.hour * 60 + idx.minute
    return pd.Series((mins >= REGULAR_OPEN_MINUTE) & (mins < REGULAR_CLOSE_MINUTE), index=x.index)


def has_regular_session(df: pd.DataFrame) -> bool:
    if df is None or df.empty:
        return False
    try:
        return bool(_regular_mask(df).any())
    except Exception:
        return False


def load_cached(symbol: str, interval: str) -> pd.DataFrame:
    path = cache_path(symbol, interval)
    if not path.exists():
        return pd.DataFrame()
    try:
        frame = pd.read_csv(path, index_col=0, parse_dates=True)
        frame.index = pd.to_datetime(frame.index, errors="coerce")
        frame = frame.loc[~frame.index.isna()]
        return normalize_index(frame)
    except Exception:
        # An ephemeral cache should never be allowed to brick the application.
        try:
            path.unlink(missing_ok=True)
        except Exception:
            pass
        return pd.DataFrame()


def save_cache(symbol: str, interval: str, df: pd.DataFrame) -> Path:
    normalized = normalize_index(df)
    if not has_regular_session(normalized):
        raise RuntimeError(f"Refusing to cache {symbol} {interval}: no regular-session bars.")
    path = cache_path(symbol, interval)
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized.to_csv(path)
    return path


def merge_cache(old: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame:
    if old is None or old.empty or not has_regular_session(old):
        return normalize_index(new)
    if new is None or new.empty:
        return normalize_index(old)

    old = normalize_index(old)
    new = normalize_index(new)
    today_ny = pd.Timestamp.now(tz=NY_TZ).date()
    old_dates = pd.Index(old.index.tz_convert(NY_TZ).date)
    new_dates = pd.Index(new.index.tz_convert(NY_TZ).date)
    old_hist = old.loc[old_dates < today_ny]
    old_live = old.loc[old_dates >= today_ny]
    new_hist = new.loc[new_dates < today_ny]
    new_live = new.loc[new_dates >= today_ny]
    historical = pd.concat([old_hist, new_hist])
    historical = historical[~historical.index.duplicated(keep="first")]
    live = pd.concat([old_live, new_live])
    live = live[~live.index.duplicated(keep="last")]
    return pd.concat([historical, live]).sort_index()


def _period_candidates(interval: str, requested: str) -> list[str]:
    # Keep the requested period first, then progressively smaller windows that
    # Yahoo accepts more reliably for intraday bars.
    ordered = [requested]
    if interval == "1m":
        ordered.extend(["7d", "5d", "1d"])
    else:
        ordered.extend(["60d", "30d", "10d", "5d"])
    result: list[str] = []
    for period in ordered:
        if period and period not in result:
            result.append(period)
    return result


def _download_call(symbol: str, interval: str, period: str, prepost: bool) -> pd.DataFrame:
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
        timeout=12,
    )
    if frame is None or frame.empty:
        raise RuntimeError("empty yf.download response")
    return normalize_index(frame)


def _history_call(symbol: str, interval: str, period: str, prepost: bool) -> pd.DataFrame:
    yf = _yf()
    frame = yf.Ticker(symbol).history(
        period=period,
        interval=interval,
        auto_adjust=False,
        prepost=prepost,
        actions=False,
        timeout=12,
    )
    if frame is None or frame.empty:
        raise RuntimeError("empty Ticker.history response")
    return normalize_index(frame)


def _direct_chart_call(symbol: str, interval: str, period: str, prepost: bool) -> pd.DataFrame:
    """Fetch Yahoo's chart JSON directly, bypassing yfinance session/crumb state."""
    params = {
        "range": period,
        "interval": interval,
        "includePrePost": "true" if prepost else "false",
        "events": "div,splits",
        "includeAdjustedClose": "false",
    }
    errors: list[str] = []
    for host in YAHOO_CHART_HOSTS:
        url = f"https://{host}/v8/finance/chart/{quote(symbol)}?{urlencode(params)}"
        req = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
                "Accept": "application/json,text/plain,*/*",
                "Accept-Language": "en-US,en;q=0.9",
                "Cache-Control": "no-cache",
            },
        )
        try:
            with urlopen(req, timeout=12) as response:
                payload = json.loads(response.read().decode("utf-8"))
            chart = payload.get("chart") or {}
            if chart.get("error"):
                raise RuntimeError(str(chart["error"]))
            results = chart.get("result") or []
            if not results:
                raise RuntimeError("Yahoo chart result was empty")
            result = results[0]
            timestamps = result.get("timestamp") or []
            indicators = result.get("indicators") or {}
            quotes = indicators.get("quote") or []
            if not timestamps or not quotes:
                raise RuntimeError("Yahoo chart response contained no quote bars")
            quote_data = quotes[0]
            length = len(timestamps)
            def values(name: str):
                vals = quote_data.get(name) or []
                return list(vals[:length]) + [None] * max(0, length - len(vals))
            frame = pd.DataFrame(
                {
                    "Open": values("open"),
                    "High": values("high"),
                    "Low": values("low"),
                    "Close": values("close"),
                    "Volume": values("volume"),
                },
                index=pd.to_datetime(timestamps, unit="s", utc=True),
            )
            frame.index.name = "Datetime"
            frame = normalize_index(frame)
            if frame.empty:
                raise RuntimeError("Yahoo chart bars normalized to an empty frame")
            return frame
        except Exception as exc:
            errors.append(f"{host}: {exc}")
    raise RuntimeError("; ".join(errors))


def download_recent(symbol: str, interval: str, period: str, prepost: bool = True) -> pd.DataFrame:
    errors: list[str] = []
    for candidate_period in _period_candidates(interval, period):
        # Direct chart JSON is deliberately first: it avoids yfinance's cookie
        # and crumb state, which can be unreliable from ephemeral serverless IPs.
        for include_prepost in (prepost, False):
            for method in (_direct_chart_call, _download_call, _history_call):
                try:
                    frame = method(symbol, interval, candidate_period, include_prepost)
                    if has_regular_session(frame):
                        return frame
                    errors.append(f"{method.__name__} {candidate_period} prepost={include_prepost}: no regular bars")
                except Exception as exc:
                    errors.append(f"{method.__name__} {candidate_period} prepost={include_prepost}: {exc}")
    detail = "; ".join(errors[-9:])
    raise RuntimeError(f"No usable Yahoo intraday data returned for {symbol} ({interval}). {detail}")


def refresh_symbol(symbol: str, interval: str, period: str, prepost: bool = True) -> pd.DataFrame:
    old = load_cached(symbol, interval)
    new = download_recent(symbol, interval, period, prepost)
    merged = merge_cache(old, new)
    if not has_regular_session(merged):
        raise RuntimeError(f"Downloaded {symbol} ({interval}) but could not identify regular-session bars.")
    save_cache(symbol, interval, merged)
    return merged


def ensure_symbol(symbol: str, interval: str, period: str, refresh: bool = False) -> pd.DataFrame:
    cached = load_cached(symbol, interval)
    cache_usable = has_regular_session(cached)
    if refresh or not cache_usable:
        try:
            return refresh_symbol(symbol, interval, period, True)
        except Exception:
            if cache_usable:
                return cached
            raise
    return cached


def session_dates(df: pd.DataFrame) -> list[date]:
    if df is None or df.empty:
        return []
    x = normalize_index(df)
    mask = _regular_mask(x)
    regular = x.loc[mask]
    if regular.empty:
        return []
    ridx = regular.index.tz_convert(NY_TZ)
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
