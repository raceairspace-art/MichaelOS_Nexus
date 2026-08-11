from __future__ import annotations

import json
import math
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import pandas as pd

try:
    from .config import MAG7
    from .market_data import ensure_symbol, merge_cache, session_dates
    from .oliver_decision import decision_review
    from .oliver_engine import OliverParams, add_features, best_case, day_slice, outcome_for_case
    from .oliver_store import configured as store_configured, latest_fetch_day, load_bars as load_durable_bars, save_bars as save_durable_bars
except ImportError:
    from config import MAG7
    from market_data import ensure_symbol, merge_cache, session_dates
    from oliver_decision import decision_review
    from oliver_engine import OliverParams, add_features, best_case, day_slice, outcome_for_case
    from oliver_store import configured as store_configured, latest_fetch_day, load_bars as load_durable_bars, save_bars as save_durable_bars

NY_TZ = "America/New_York"


def _period(interval: str) -> str:
    return "7d" if interval == "1m" else "60d"


def _clean(value):
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, (bool, int, float, str)):
        return value
    return str(value)


def _bars(frame: pd.DataFrame) -> list[dict]:
    fields = ["Open", "High", "Low", "Close", "Volume", "SMA20", "SMA200", "BoxHigh", "BoxLow", "BullElephant", "BearElephant", "Premarket"]
    rows = []
    for ts, row in frame.iterrows():
        item = {"time": ts.isoformat()}
        for field in fields:
            if field in frame.columns:
                item[field[0].lower() + field[1:]] = _clean(row[field])
        rows.append(item)
    return rows


def _case_ref(session_date, symbol: str) -> str:
    return f"DO-{session_date:%Y%m%d}-{symbol}"


def _num(query, key, default, cast=float):
    raw = query.get(key, [None])[0]
    if raw in (None, ""):
        return default
    try:
        return cast(raw)
    except (TypeError, ValueError):
        return default


def _params(query) -> OliverParams:
    defaults = OliverParams()
    return OliverParams(
        fast_sma=_num(query, "fastSma", defaults.fast_sma, int),
        slow_sma=_num(query, "slowSma", defaults.slow_sma, int),
        atr_len=_num(query, "atrLen", defaults.atr_len, int),
        slope_lookback=_num(query, "slopeLookback", defaults.slope_lookback, int),
        narrow_sep_atr=_num(query, "narrowSepAtr", defaults.narrow_sep_atr),
        wide_sep_atr=_num(query, "wideSepAtr", defaults.wide_sep_atr),
        trend_slope_atr=_num(query, "trendSlopeAtr", defaults.trend_slope_atr),
        location_atr=_num(query, "locationAtr", defaults.location_atr),
        elephant_lookback=_num(query, "elephantLookback", defaults.elephant_lookback, int),
        elephant_range_mult=_num(query, "elephantRangeMult", defaults.elephant_range_mult),
        elephant_body_ratio=_num(query, "elephantBodyRatio", defaults.elephant_body_ratio),
        elephant_strong_close=_num(query, "elephantStrongClose", defaults.elephant_strong_close),
        elephant_max_opposite_wick=_num(query, "elephantMaxOppositeWick", defaults.elephant_max_opposite_wick),
        opening_window_minutes=_num(query, "openingWindowMinutes", defaults.opening_window_minutes, int),
        premarket_start_hour=_num(query, "premarketStartHour", defaults.premarket_start_hour, int),
        structure_lookback=_num(query, "structureLookback", defaults.structure_lookback, int),
        min_space_r=_num(query, "minSpaceR", defaults.min_space_r),
    )


def _decision_frame(features: pd.DataFrame, session_date, params: OliverParams, candidate: dict) -> tuple[pd.DataFrame, object | None]:
    day = day_slice(features, session_date)
    visible = day[(day.LocalMinute >= params.premarket_start_hour * 60) & (day.LocalMinute < 960)]
    event_time = candidate.get("event_time")
    if event_time is None:
        regular = visible[visible.LocalMinute >= 570]
        if regular.empty:
            return visible, None
        step_minutes = 5
        if len(regular.index) > 1:
            delta = regular.index[1] - regular.index[0]
            step_minutes = max(1, int(delta.total_seconds() // 60))
        cutoff = regular.index[min(len(regular) - 1, max(0, int(params.opening_window_minutes / step_minutes) - 1))]
        return visible.loc[visible.index <= cutoff], cutoff
    cutoff = pd.Timestamp(event_time)
    return visible.loc[visible.index <= cutoff], cutoff


def _load_market(symbol: str, interval: str, requested_date: str, refresh: bool) -> tuple[pd.DataFrame, str]:
    durable = pd.DataFrame()
    durable_sessions = []
    if store_configured():
        try:
            durable = load_durable_bars(symbol, interval)
            durable_sessions = session_dates(durable)
        except Exception:
            durable = pd.DataFrame()
            durable_sessions = []

    requested = None
    if requested_date:
        try:
            requested = datetime.strptime(requested_date, "%Y-%m-%d").date()
        except ValueError:
            requested = None

    today_ny = pd.Timestamp.now(tz=NY_TZ).date()
    durable_fresh_today = False
    if store_configured() and not durable.empty:
        try:
            durable_fresh_today = latest_fetch_day(symbol, interval) == today_ny
        except Exception:
            durable_fresh_today = False

    if not refresh and not durable.empty:
        if requested is not None and requested in durable_sessions:
            return durable, "Supabase durable market store"
        if requested is None and durable_fresh_today:
            return durable, "Supabase durable market store"

    fetched = ensure_symbol(symbol, interval, _period(interval), refresh=True if (refresh or durable.empty or requested not in durable_sessions) else False)
    if store_configured():
        try:
            save_durable_bars(symbol, interval, fetched)
            combined = merge_cache(durable, fetched) if not durable.empty else fetched
            return combined, "Supabase durable market store + Yahoo incremental refresh"
        except Exception:
            pass
    return fetched, "ephemeral Vercel cache fallback"


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "private, max-age=30")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            symbol = query.get("symbol", ["AAPL"])[0].upper()
            interval = query.get("interval", ["5m"])[0]
            requested_date = query.get("date", [""])[0]
            refresh = query.get("refresh", ["0"])[0] == "1"
            phase = query.get("phase", ["decision"])[0]

            if symbol not in MAG7:
                self._send(400, {"error": "Unsupported symbol."}); return
            if interval not in {"1m", "5m", "15m"}:
                self._send(400, {"error": "Unsupported timeframe."}); return
            if phase not in {"decision", "outcome"}:
                self._send(400, {"error": "Unsupported replay phase."}); return

            raw, cache_label = _load_market(symbol, interval, requested_date, refresh)
            available = session_dates(raw)
            if not available:
                self._send(502, {"error": f"No regular-session market data available for {symbol}."}); return

            session_date = None
            if requested_date:
                try:
                    parsed = datetime.strptime(requested_date, "%Y-%m-%d").date()
                    if parsed in available:
                        session_date = parsed
                except ValueError:
                    pass
            if session_date is None:
                session_date = available[-1]

            params = _params(query)
            features = add_features(raw, params)
            candidate = best_case(features, session_date, params)
            engine_review = decision_review(candidate, params.min_space_r)
            decision_frame, decision_time = _decision_frame(features, session_date, params, candidate)

            if phase == "decision":
                chart_frame = decision_frame
                outcome = None
            else:
                day = day_slice(features, session_date)
                chart_frame = day[(day.LocalMinute >= params.premarket_start_hour * 60) & (day.LocalMinute < 960)]
                outcome = outcome_for_case(features, session_date, candidate)

            self._send(200, {
                "source": "Digital Oliver Python engine",
                "symbol": symbol,
                "company": MAG7[symbol],
                "interval": interval,
                "sessionDate": session_date.isoformat(),
                "caseRef": _case_ref(session_date, symbol),
                "availableSessions": [d.isoformat() for d in available],
                "phase": phase,
                "decisionTime": _clean(decision_time),
                "candidate": {key: _clean(value) for key, value in candidate.items()},
                "engineReview": engine_review,
                "outcome": None if outcome is None else {key: _clean(value) for key, value in outcome.items()},
                "bars": _bars(chart_frame),
                "parameters": {
                    "fastSma": params.fast_sma, "slowSma": params.slow_sma, "atrLen": params.atr_len,
                    "slopeLookback": params.slope_lookback, "narrowSepAtr": params.narrow_sep_atr,
                    "wideSepAtr": params.wide_sep_atr, "trendSlopeAtr": params.trend_slope_atr,
                    "locationAtr": params.location_atr, "elephantLookback": params.elephant_lookback,
                    "elephantRangeMult": params.elephant_range_mult, "elephantBodyRatio": params.elephant_body_ratio,
                    "elephantStrongClose": params.elephant_strong_close, "elephantMaxOppositeWick": params.elephant_max_opposite_wick,
                    "openingWindowMinutes": params.opening_window_minutes, "premarketStartHour": params.premarket_start_hour,
                    "structureLookback": params.structure_lookback, "minSpaceR": params.min_space_r,
                },
                "cache": cache_label,
                "durableStoreConfigured": store_configured(),
            })
        except Exception as exc:
            self._send(500, {"error": f"Digital Oliver market engine failed: {exc}"})
