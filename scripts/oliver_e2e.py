#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA"]
TIMEFRAME = "5m"
MODEL_VERSION = "Oliver E2E smoke"


def request_json(url: str, *, method: str = "GET", payload: dict | None = None, timeout: int = 45) -> dict:
    data = None
    headers = {"Accept": "application/json", "User-Agent": "MichaelOS-Oliver-E2E/1.0"}
    if payload is not None:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"HTTP {response.status}: {body[:1000]}")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} {url}: {body[:2000]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error calling {url}: {exc}") from exc


def market_url(base_url: str, symbol: str, session_date: str | None = None) -> str:
    query = {"symbol": symbol, "interval": TIMEFRAME, "phase": "decision", "refresh": "1"}
    if session_date:
        query["date"] = session_date
    return f"{base_url.rstrip('/')}/api/oliver_market?{urllib.parse.urlencode(query)}"


def validate_market(symbol: str, market: dict, expected_date: str | None = None) -> None:
    if market.get("symbol") != symbol:
        raise RuntimeError(f"{symbol}: market response symbol mismatch: {market.get('symbol')!r}")
    if market.get("phase") != "decision":
        raise RuntimeError(f"{symbol}: expected decision phase, got {market.get('phase')!r}")
    bars = market.get("bars")
    if not isinstance(bars, list) or not bars:
        raise RuntimeError(f"{symbol}: decision response has no bars")
    if market.get("outcome") is not None:
        raise RuntimeError(f"{symbol}: decision response leaked outcome data")
    if expected_date and market.get("sessionDate") != expected_date:
        raise RuntimeError(
            f"{symbol}: requested {expected_date}, server returned {market.get('sessionDate')}; day comparison would be invalid"
        )


def review_payload(symbol: str, market: dict) -> dict:
    return {
        "symbol": symbol,
        "sessionDate": market.get("sessionDate"),
        "timeframe": TIMEFRAME,
        "decisionTime": market.get("decisionTime"),
        "modelVersion": MODEL_VERSION,
        "parameters": market.get("parameters") or {},
        "candidate": market.get("candidate") or {},
        "bars": (market.get("bars") or [])[-500:],
    }


def validate_review(symbol: str, response: dict) -> dict:
    review = response.get("review")
    if not isinstance(review, dict):
        raise RuntimeError(f"{symbol}: AI review response missing review object: {response}")
    for field in ("overallGrade", "wouldTrade", "direction", "overallQuality", "confidence", "rationale"):
        if field not in review:
            raise RuntimeError(f"{symbol}: AI review missing {field}: {review}")
    return review


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: oliver_e2e.py <deployment-base-url>", file=sys.stderr)
        return 2
    base_url = sys.argv[1].rstrip("/")
    print(f"Digital Oliver E2E against {base_url}")

    print("[1/4] Resolve a real trading session from AAPL")
    aapl_market = request_json(market_url(base_url, "AAPL"), timeout=60)
    validate_market("AAPL", aapl_market)
    session_date = aapl_market.get("sessionDate")
    if not isinstance(session_date, str) or not session_date:
        raise RuntimeError("AAPL market response did not provide sessionDate")
    print(f"      session={session_date}, bars={len(aapl_market['bars'])}, decisionTime={aapl_market.get('decisionTime')}")

    print("[2/4] Market decision snapshots for all seven symbols")
    markets: dict[str, dict] = {"AAPL": aapl_market}
    for symbol in SYMBOLS[1:]:
        market = request_json(market_url(base_url, symbol, session_date), timeout=60)
        validate_market(symbol, market, session_date)
        markets[symbol] = market
        print(f"      PASS {symbol}: bars={len(market['bars'])}, decisionTime={market.get('decisionTime')}")

    print("[3/4] Frozen AI review for all seven symbols")
    reviews = []
    review_url = f"{base_url}/api/oliver-ai-review"
    for symbol in SYMBOLS:
        started = time.time()
        response = request_json(review_url, method="POST", payload=review_payload(symbol, markets[symbol]), timeout=60)
        review = validate_review(symbol, response)
        reviews.append({"symbol": symbol, "review": review})
        print(
            f"      PASS {symbol}: grade={review.get('overallGrade')} trade={review.get('wouldTrade')} "
            f"quality={review.get('overallQuality')}/5 ({time.time()-started:.1f}s)"
        )

    print("[4/4] Comparative daily ranking")
    rank_url = f"{base_url}/api/oliver-ai-rank"
    ranking_response = request_json(
        rank_url,
        method="POST",
        payload={
            "sessionDate": session_date,
            "timeframe": TIMEFRAME,
            "modelVersion": MODEL_VERSION,
            "reviews": reviews,
        },
        timeout=60,
    )
    ranking = ranking_response.get("ranking")
    if not isinstance(ranking, dict):
        raise RuntimeError(f"Daily rank response missing ranking object: {ranking_response}")
    if ranking.get("bestSymbol") not in SYMBOLS + ["NO_TRADE"]:
        raise RuntimeError(f"Invalid daily winner: {ranking}")
    print(
        f"      PASS daily rank: #1={ranking.get('bestSymbol')} #2={ranking.get('secondSymbol')} "
        f"noTrade={ranking.get('noTradeDay')}"
    )
    print("E2E PASS: market -> 7 AI reviews -> daily ranking")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"E2E FAIL: {exc}", file=sys.stderr)
        raise
