"use client";

import { useMemo, useState } from "react";

const SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA"] as const;
const WORKSPACE_KEY = "michaelos-nexus-digital-oliver-v2";

type Line = { at: string; level: "info" | "pass" | "fail"; text: string };

function now() { return new Date().toLocaleTimeString(); }

async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch {}
  if (!response.ok) {
    const detail = data?.error || data?.detail?.error || text || `HTTP ${response.status}`;
    throw new Error(`HTTP ${response.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  if (!data) throw new Error(`HTTP ${response.status}: response was not JSON`);
  return data;
}

function settingsQuery(settings: Record<string, unknown>) {
  const q = new URLSearchParams();
  Object.entries(settings || {}).forEach(([key, value]) => {
    if (key !== "version" && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")) q.set(key, String(value));
  });
  return q;
}

export default function OliverDiagnosticsPage() {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [result, setResult] = useState<"idle" | "pass" | "fail">("idle");

  const summary = useMemo(() => {
    if (result === "pass") return "PASS — the live production pipeline completed market → 7 AI reviews → daily ranking.";
    if (result === "fail") return "FAIL — the last red line is the first broken stage.";
    return "This test runs through the same authenticated production APIs used by Digital Oliver.";
  }, [result]);

  function add(level: Line["level"], text: string) {
    setLines(current => [...current, { at: now(), level, text }]);
  }

  async function run() {
    if (running) return;
    setRunning(true);
    setLines([]);
    setResult("idle");
    try {
      add("info", "1/5 OpenAI transport + structured-output health check");
      const health = await jsonFetch("/api/oliver-ai-health", { cache: "no-store" });
      add("pass", `OpenAI health passed · model ${health.model}`);

      let stored: any = {};
      try { stored = JSON.parse(localStorage.getItem(WORKSPACE_KEY) || "{}"); } catch {}
      const timeframe = ["1m", "5m", "15m"].includes(stored.selectedTimeframe) ? stored.selectedTimeframe : "5m";
      const modelSettings = stored.modelSettings || {};
      const modelVersion = typeof modelSettings.version === "string" ? modelSettings.version : "Oliver diagnostics";
      const storedDate = /^\d{4}-\d{2}-\d{2}$/.test(stored.selectedDate || "") ? stored.selectedDate : "";

      add("info", `2/5 Market decision snapshot · ${timeframe}${storedDate ? ` · requested ${storedDate}` : ""}`);
      const baseSettings = settingsQuery(modelSettings);
      const firstQuery = new URLSearchParams(baseSettings);
      firstQuery.set("symbol", "AAPL"); firstQuery.set("interval", timeframe); firstQuery.set("phase", "decision");
      if (storedDate) firstQuery.set("date", storedDate);
      const first = await jsonFetch(`/api/oliver_market?${firstQuery}`, { cache: "no-store" });
      if (!Array.isArray(first.bars) || !first.bars.length) throw new Error("AAPL market response contains no decision bars.");
      if (first.outcome != null) throw new Error("AAPL decision response leaked outcome data.");
      const sessionDate = first.sessionDate;
      add("pass", `AAPL market passed · ${sessionDate} · ${first.bars.length} bars · decision ${first.decisionTime || "window cutoff"}`);

      add("info", "3/5 Market snapshots for all seven symbols");
      const markets: Record<string, any> = { AAPL: first };
      for (const symbol of SYMBOLS.slice(1)) {
        const q = new URLSearchParams(baseSettings);
        q.set("symbol", symbol); q.set("interval", timeframe); q.set("phase", "decision"); q.set("date", sessionDate);
        const market = await jsonFetch(`/api/oliver_market?${q}`, { cache: "no-store" });
        if (market.sessionDate !== sessionDate) throw new Error(`${symbol} returned ${market.sessionDate} instead of ${sessionDate}.`);
        if (!Array.isArray(market.bars) || !market.bars.length) throw new Error(`${symbol} returned no decision bars.`);
        markets[symbol] = market;
        add("pass", `${symbol} market passed · ${market.bars.length} bars`);
      }

      add("info", "4/5 Frozen AI reviews for all seven symbols");
      const reviews: Array<{ symbol: string; review: any }> = [];
      for (const symbol of SYMBOLS) {
        const market = markets[symbol];
        const body = {
          symbol,
          sessionDate,
          timeframe,
          decisionTime: market.decisionTime ?? null,
          modelVersion,
          parameters: market.parameters || {},
          candidate: market.candidate || {},
          bars: (market.bars || []).slice(-500),
        };
        const started = performance.now();
        const response = await jsonFetch("/api/oliver-ai-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.review) throw new Error(`${symbol} AI response had no review object.`);
        reviews.push({ symbol, review: response.review });
        add("pass", `${symbol} AI passed · ${response.review.overallGrade} · ${response.review.wouldTrade} · ${((performance.now() - started) / 1000).toFixed(1)}s`);
      }

      add("info", "5/5 Comparative daily ranking");
      const rank = await jsonFetch("/api/oliver-ai-rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionDate, timeframe, modelVersion, reviews }),
      });
      if (!rank.ranking) throw new Error("Daily ranking response had no ranking object.");
      add("pass", `Daily rank passed · #1 ${rank.ranking.bestSymbol} · #2 ${rank.ranking.secondSymbol} · noTrade=${rank.ranking.noTradeDay}`);
      setResult("pass");
    } catch (error) {
      add("fail", error instanceof Error ? error.message : String(error));
      setResult("fail");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0a0d10", color: "#ece9e2", padding: "40px", fontFamily: "var(--font-geist-sans), sans-serif" }}>
      <section style={{ maxWidth: 960, margin: "0 auto" }}>
        <span style={{ color: "#d9b67a", fontSize: 11, letterSpacing: ".12em" }}>DIGITAL OLIVER · PRODUCTION DIAGNOSTICS</span>
        <h1 style={{ margin: "10px 0 6px", fontSize: 34 }}>End-to-end system test</h1>
        <p style={{ color: "#9299a3", lineHeight: 1.6, maxWidth: 760 }}>{summary}</p>
        <button onClick={() => void run()} disabled={running} style={{ margin: "18px 0", border: "1px solid #66583f", borderRadius: 9, background: running ? "#17191d" : "#d9b67a", color: running ? "#aaa" : "#18130c", padding: "10px 16px", fontWeight: 700, cursor: running ? "default" : "pointer" }}>
          {running ? "Running full production test…" : "Run full production E2E test"}
        </button>
        <div style={{ border: "1px solid #292d33", borderRadius: 12, overflow: "hidden", background: "#0d1014" }}>
          {!lines.length && <div style={{ padding: 20, color: "#777f89" }}>No test run yet.</div>}
          {lines.map((line, index) => (
            <div key={`${line.at}-${index}`} style={{ display: "grid", gridTemplateColumns: "80px 56px 1fr", gap: 10, padding: "10px 14px", borderTop: index ? "1px solid #20242a" : "none", fontFamily: "var(--font-geist-mono), monospace", fontSize: 12 }}>
              <span style={{ color: "#69717a" }}>{line.at}</span>
              <strong style={{ color: line.level === "pass" ? "#77c69b" : line.level === "fail" ? "#e07f7f" : "#d9b67a" }}>{line.level.toUpperCase()}</strong>
              <span style={{ color: line.level === "fail" ? "#f0a5a5" : "#c2c6cc", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{line.text}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 16, color: "#69717a", fontSize: 11 }}>The test uses your current saved Digital Oliver timeframe, date, and model settings when available. It intentionally never requests outcome data.</p>
      </section>
    </main>
  );
}
