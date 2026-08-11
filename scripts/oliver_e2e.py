#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA"]
TIMEFRAME = "5m"
MODEL_VERSION = "Oliver E2E smoke"


def request_json(url: str, *, method: str = "GET", payload: dict | None = None, timeout: int = 90) -> dict:
    data = None
    headers = {"Accept": "application/json", "User-Agent": "MichaelOS-Oliver-E2E/2.0"}
    bypass = os.environ.get("VERCEL_AUTOMATION_BYPASS_SECRET", "")
    if bypass:
        headers["x-vercel-protection-bypass"] = bypass
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
    query = {"symbol": symbol, "interval": TIMEFRAME, "phase": "decision"}
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
        raise RuntimeError(f"{symbol}: requested {expected_date}, server returned {market.get('sessionDate')}")
    if not isinstance(market.get("engineReview"), dict):
        raise RuntimeError(f"{symbol}: deterministic Oliver Decision Engine review missing")


def review_payload(symbol: str, market: dict, manual: bool) -> dict:
    return {
        "symbol": symbol,
        "sessionDate": market.get("sessionDate"),
        "timeframe": TIMEFRAME,
        "decisionTime": market.get("decisionTime"),
        "modelVersion": MODEL_VERSION,
        "parameters": market.get("parameters") or {},
        "candidate": market.get("candidate") or {},
        "bars": (market.get("bars") or [])[-500:],
        "manual": manual,
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
    print(f"Digital Oliver persistence/cost E2E against {base_url}")
    print(f"Vercel automation bypass secret {'is present (value hidden)' if os.environ.get('VERCEL_AUTOMATION_BYPASS_SECRET') else 'is NOT present'}.")

    print("[1/6] Resolve a trading session and verify deterministic engine")
    aapl = request_json(market_url(base_url, "AAPL"))
    validate_market("AAPL", aapl)
    session_date = aapl.get("sessionDate")
    if not session_date:
        raise RuntimeError("AAPL did not provide sessionDate")
    if not aapl.get("durableStoreConfigured"):
        raise RuntimeError("Durable Oliver store is not configured in this Preview deployment")
    print(f"      session={session_date}, engine={aapl['engineReview'].get('overallGrade')} score={aapl['engineReview'].get('score')}")

    print("[2/6] Market snapshots for all seven on the same session")
    markets = {"AAPL": aapl}
    for symbol in SYMBOLS[1:]:
        market = request_json(market_url(base_url, symbol, session_date))
        validate_market(symbol, market, session_date)
        markets[symbol] = market
        print(f"      PASS {symbol}: bars={len(market['bars'])}, engine={market['engineReview'].get('overallGrade')}")

    print("[3/6] Deterministic all-seven daily ranking")
    q = urllib.parse.urlencode({"date": session_date, "interval": TIMEFRAME, "modelVersion": MODEL_VERSION})
    engine_day = request_json(f"{base_url}/api/oliver_engine_day?{q}")
    if len(engine_day.get("reviews") or []) != 7 or not isinstance(engine_day.get("ranking"), dict):
        raise RuntimeError(f"Engine day response incomplete: {engine_day}")
    print(f"      PASS engine rank: #1={engine_day['ranking'].get('bestSymbol')} #2={engine_day['ranking'].get('secondSymbol')}")

    print("[4/6] Manually create or reuse seven Nexus reviews")
    reviews = []
    review_url = f"{base_url}/api/oliver-ai-review"
    for symbol in SYMBOLS:
        started = time.time()
        response = request_json(review_url, method="POST", payload=review_payload(symbol, markets[symbol], True))
        review = validate_review(symbol, response)
        reviews.append({"symbol": symbol, "review": review})
        print(f"      PASS {symbol}: grade={review.get('overallGrade')} cached={response.get('cached')} ({time.time()-started:.1f}s)")

    print("[5/6] Prove duplicate review requests are cache hits without OpenAI")
    for symbol in SYMBOLS:
        response = request_json(review_url, method="POST", payload=review_payload(symbol, markets[symbol], False))
        validate_review(symbol, response)
        if response.get("cached") is not True:
            raise RuntimeError(f"{symbol}: duplicate review was not served from durable cache")
    print("      PASS all seven duplicate requests returned cached=true")

    print("[6/6] Manual daily Nexus ranking, then prove ranking cache hit")
    rank_url = f"{base_url}/api/oliver-ai-rank"
    rank_payload = {"sessionDate": session_date, "timeframe": TIMEFRAME, "modelVersion": MODEL_VERSION, "reviews": reviews, "manual": True}
    ranking_response = request_json(rank_url, method="POST", payload=rank_payload)
    ranking = ranking_response.get("ranking")
    if not isinstance(ranking, dict):
        raise RuntimeError(f"Daily rank response missing ranking: {ranking_response}")
    cached_rank_payload = {**rank_payload, "manual": False}
    cached_ranking = request_json(rank_url, method="POST", payload=cached_rank_payload)
    if cached_ranking.get("cached") is not True:
        raise RuntimeError("Duplicate daily Nexus ranking was not served from durable cache")
    print(f"      PASS Nexus rank: #1={ranking.get('bestSymbol')} #2={ranking.get('secondSymbol')} cached replay=true")
    print("E2E PASS: durable market -> deterministic engine -> manual Nexus -> zero-cost duplicate cache")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"E2E FAIL: {exc}", file=sys.stderr)
        raise
