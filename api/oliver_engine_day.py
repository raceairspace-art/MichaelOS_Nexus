from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

try:
    from .config import MAG7
    from .oliver_decision import decision_review
    from .oliver_engine import add_features, best_case
    from .oliver_market import _load_market, _params
    from .oliver_store import save_engine_ranking, save_engine_review
except ImportError:
    from config import MAG7
    from oliver_decision import decision_review
    from oliver_engine import add_features, best_case
    from oliver_market import _load_market, _params
    from oliver_store import save_engine_ranking, save_engine_review

SYMBOLS = list(MAG7.keys())


def _rank(reviews: list[dict]) -> dict:
    eligible = sorted(
        reviews,
        key=lambda item: (
            1 if item["review"].get("wouldTrade") == "Yes" else 0,
            1 if item["review"].get("oliverInterest") == "Yes" else 0,
            float(item["review"].get("score") or 0),
            int(item["review"].get("confidence") or 0),
        ),
        reverse=True,
    )
    actionable = [item for item in eligible if item["review"].get("wouldTrade") in ("Yes", "Maybe") and float(item["review"].get("score") or 0) >= 55]
    if not actionable:
        return {
            "bestSymbol": "NO_TRADE",
            "secondSymbol": "NO_TRADE",
            "noTradeDay": True,
            "winnerReason": "No symbol cleared the deterministic Oliver tradeability threshold.",
            "separationReason": "All seven cases were rejected or remained below the minimum actionable score.",
            "confidence": 5,
        }
    best = actionable[0]
    second = actionable[1] if len(actionable) > 1 else None
    gap = float(best["review"].get("score") or 0) - (float(second["review"].get("score") or 0) if second else 0)
    confidence = 5 if gap >= 15 else 4 if gap >= 8 else 3
    return {
        "bestSymbol": best["symbol"],
        "secondSymbol": second["symbol"] if second else "NO_TRADE",
        "noTradeDay": False,
        "winnerReason": f"{best['symbol']} has the strongest encoded Oliver profile at {best['review'].get('score', 0):.1f}/100: {best['review'].get('strongestReason', '')}",
        "separationReason": f"Score separation to the runner-up is {gap:.1f} points." if second else "No second symbol met the actionable threshold.",
        "confidence": confidence,
    }


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
            interval = query.get("interval", ["5m"])[0]
            requested_date = query.get("date", [""])[0]
            model_version = query.get("modelVersion", ["Oliver v0.1"])[0]
            if interval not in {"1m", "5m", "15m"}:
                self._send(400, {"error": "Unsupported timeframe."}); return
            if not requested_date:
                self._send(400, {"error": "A trading date is required."}); return

            params = _params(query)
            reviews = []
            actual_date = None
            for symbol in SYMBOLS:
                raw, _ = _load_market(symbol, interval, requested_date, False)
                features = add_features(raw, params)
                available_dates = sorted(set(features.LocalDate))
                requested_obj = None
                for d in available_dates:
                    if d.isoformat() == requested_date:
                        requested_obj = d
                        break
                if requested_obj is None:
                    self._send(409, {"error": f"{symbol} has no stored/available market session for {requested_date}."}); return
                actual_date = requested_obj.isoformat()
                candidate = best_case(features, requested_obj, params)
                review = decision_review(candidate, params.min_space_r)
                decision_time = candidate.get("event_time")
                save_engine_review(actual_date, symbol, interval, model_version, decision_time, candidate, review)
                reviews.append({"symbol": symbol, "review": review, "candidate": {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in candidate.items()}})

            ranking = _rank(reviews)
            save_engine_ranking(actual_date or requested_date, interval, model_version, reviews, ranking)
            self._send(200, {
                "sessionDate": actual_date or requested_date,
                "timeframe": interval,
                "modelVersion": model_version,
                "reviews": reviews,
                "ranking": ranking,
                "source": "Deterministic Oliver Decision Engine",
            })
        except Exception as exc:
            self._send(500, {"error": f"Oliver Decision Engine day review failed: {exc}"})
