from __future__ import annotations

import json
import math
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import pandas as pd

try:
    from .config import MAG7
    from .market_data import ensure_symbol, session_dates
    from .oliver_engine import OliverParams, add_features, best_case, day_slice, outcome_for_case, visible_slice
except ImportError:
    from config import MAG7
    from market_data import ensure_symbol, session_dates
    from oliver_engine import OliverParams, add_features, best_case, day_slice, outcome_for_case, visible_slice


def _period(interval: str) -> str:
    return "7d" if interval == "1m" else "1mo"


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
    fields = [
        "Open", "High", "Low", "Close", "Volume", "SMA20", "SMA200",
        "BoxHigh", "BoxLow", "BullElephant", "BearElephant", "Premarket",
    ]
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


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            symbol = query.get("symbol", ["AAPL"])[0].upper()
            interval = query.get("interval", ["5m"])[0]
            requested_date = query.get("date", [""])[0]
            full_day = query.get("fullDay", ["0"])[0] == "1"
            refresh = query.get("refresh", ["0"])[0] == "1"

            if symbol not in MAG7:
                self._send(400, {"error": "Unsupported symbol."})
                return
            if interval not in {"1m", "5m", "15m"}:
                self._send(400, {"error": "Unsupported timeframe."})
                return

            raw = ensure_symbol(symbol, interval, _period(interval), refresh=refresh)
            available = session_dates(raw)
            if not available:
                self._send(502, {"error": f"No regular-session market data available for {symbol}."})
                return

            session_date = None
            if requested_date and requested_date != "Market data not connected":
                try:
                    parsed = datetime.strptime(requested_date, "%Y-%m-%d").date()
                    if parsed in available:
                        session_date = parsed
                except ValueError:
                    pass
            if session_date is None:
                session_date = available[-1]

            params = OliverParams()
            features = add_features(raw, params)
            candidate = best_case(features, session_date, params)
            outcome = outcome_for_case(features, session_date, candidate)
            chart_frame = day_slice(features, session_date) if full_day else visible_slice(features, session_date, params)

            candidate_json = {key: _clean(value) for key, value in candidate.items()}
            payload = {
                "source": "Digital Oliver Python engine",
                "symbol": symbol,
                "company": MAG7[symbol],
                "interval": interval,
                "sessionDate": session_date.isoformat(),
                "caseRef": _case_ref(session_date, symbol),
                "availableSessions": [d.isoformat() for d in available[-20:]],
                "candidate": candidate_json,
                "outcome": {key: _clean(value) for key, value in outcome.items()},
                "bars": _bars(chart_frame),
                "parameters": {
                    "fastSma": params.fast_sma,
                    "slowSma": params.slow_sma,
                    "structureLookback": params.structure_lookback,
                    "minSpaceR": params.min_space_r,
                    "openingWindowMinutes": params.opening_window_minutes,
                },
                "cache": "ephemeral /tmp cache on Vercel",
            }
            self._send(200, payload)
        except Exception as exc:
            self._send(500, {"error": f"Digital Oliver market engine failed: {exc}"})
