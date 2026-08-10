"use client";

import { useEffect, useMemo, useState } from "react";
import type { DigitalOliverWorkspaceState, CaseReview, OliverMarketSnapshot, OliverTab } from "@/lib/digital-oliver";
import { MAG7, OLIVER_RULEBOOK_SUMMARY, selectedCase, updateCase } from "@/lib/digital-oliver";

type Props = {
  state: DigitalOliverWorkspaceState;
  onChange: (next: DigitalOliverWorkspaceState) => void;
};

const tabs: Array<[OliverTab, string]> = [
  ["guidedReview", "Guided Review"],
  ["dailyRanking", "Daily Ranking"],
  ["evidenceLibrary", "Evidence Library"],
  ["statistics", "Statistics"],
  ["export", "Export"],
  ["rulebook", "Rulebook / Method"],
];

const stateOptions = ["Narrow", "Trending Up", "Trending Down", "Wide Up", "Wide Down", "Transitional", "Unclear"];
const locationOptions = ["Favorable", "Neutral / unclear", "Unfavorable", "Extended", "Reclaiming level", "Rejecting level"];
const boxOptions = ["Inside box", "Testing upper edge", "Testing lower edge", "Broke above", "Broke below", "Failed breakout", "Box unclear"];
const powerOptions = ["Bull Elephant", "Bear Elephant", "Bull 180", "Bear 180", "Bottoming Tail", "Topping Tail", "Strong color change", "No meaningful power"];

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="oliver-field"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function Range({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="oliver-field"><span>{label} · {value}/5</span><input type="range" min="1" max="5" value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

function Text({ label, value, onChange, area = false }: { label: string; value: string; onChange: (value: string) => void; area?: boolean }) {
  return <label className="oliver-field"><span>{label}</span>{area ? <textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} /> : <input value={value} onChange={(e) => onChange(e.target.value)} />}</label>;
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="oliver-check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
}

function formatMetric(value: unknown, suffix = "") {
  return value === null || value === undefined || value === "" ? "—" : `${value}${suffix}`;
}

function MarketChart({ snapshot }: { snapshot: OliverMarketSnapshot }) {
  const bars = snapshot.bars;
  const geometry = useMemo(() => {
    if (!bars.length) return null;
    const values = bars.flatMap((bar) => [bar.low, bar.high, bar.sMA20, bar.sMA200, bar.boxHigh, bar.boxLow].filter((value): value is number => typeof value === "number"));
    const low = Math.min(...values);
    const high = Math.max(...values);
    const pad = Math.max((high - low) * 0.08, high * 0.001);
    return { low: low - pad, high: high + pad };
  }, [bars]);

  if (!geometry || !bars.length) return <div className="oliver-chart-empty">No bars returned for this session.</div>;

  const width = 1000;
  const height = 380;
  const top = 16;
  const bottom = 28;
  const chartHeight = height - top - bottom;
  const xStep = width / Math.max(bars.length, 1);
  const candleWidth = Math.max(1.5, Math.min(6, xStep * 0.58));
  const y = (price: number) => top + ((geometry.high - price) / (geometry.high - geometry.low)) * chartHeight;
  const x = (index: number) => index * xStep + xStep / 2;
  const linePath = (key: "sMA20" | "sMA200") => bars.map((bar, index) => typeof bar[key] === "number" ? `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(bar[key] as number).toFixed(1)}` : "").filter(Boolean).join(" ");
  const eventTime = snapshot.candidate.event_time ? new Date(snapshot.candidate.event_time).getTime() : null;
  let eventIndex = -1;
  if (eventTime) {
    let bestDelta = Number.POSITIVE_INFINITY;
    bars.forEach((bar, index) => {
      const delta = Math.abs(new Date(bar.time).getTime() - eventTime);
      if (delta < bestDelta) { bestDelta = delta; eventIndex = index; }
    });
  }

  return (
    <div className="oliver-market-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${snapshot.symbol} ${snapshot.interval} market chart`}>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const yy = top + fraction * chartHeight;
          const price = geometry.high - fraction * (geometry.high - geometry.low);
          return <g key={fraction}><line className="chart-grid" x1="0" x2={width} y1={yy} y2={yy} /><text className="chart-price" x="6" y={yy - 4}>{price.toFixed(2)}</text></g>;
        })}
        {bars.map((bar, index) => {
          const xx = x(index);
          const bull = bar.close >= bar.open;
          const bodyTop = y(Math.max(bar.open, bar.close));
          const bodyBottom = y(Math.min(bar.open, bar.close));
          return <g key={bar.time} className={bull ? "candle bull" : "candle bear"}>
            <line x1={xx} x2={xx} y1={y(bar.high)} y2={y(bar.low)} />
            <rect x={xx - candleWidth / 2} y={bodyTop} width={candleWidth} height={Math.max(1.5, bodyBottom - bodyTop)} />
            {(bar.bullElephant || bar.bearElephant) && <circle className="elephant-marker" cx={xx} cy={bull ? y(bar.low) + 9 : y(bar.high) - 9} r="3.5" />}
          </g>;
        })}
        <path className="sma sma20" d={linePath("sMA20")} />
        <path className="sma sma200" d={linePath("sMA200")} />
        {eventIndex >= 0 && <line className="candidate-line" x1={x(eventIndex)} x2={x(eventIndex)} y1={top} y2={height - bottom} />}
      </svg>
      <div className="chart-legend"><span>20 SMA</span><span>200 SMA</span><span>● Elephant</span><span>Dashed: engine candidate</span></div>
    </div>
  );
}

export default function DigitalOliverWorkspace({ state, onChange }: Props) {
  const current = selectedCase(state);
  const patchCase = (patch: Partial<CaseReview>) => onChange(updateCase(state, current.caseId, patch));
  const locked = state.cases.filter((item) => item.locked).length;
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");

  async function loadMarket(refresh = false, signal?: AbortSignal) {
    setMarketLoading(true);
    setMarketError("");
    try {
      const params = new URLSearchParams({
        symbol: current.symbol,
        interval: state.selectedTimeframe,
        fullDay: state.fullDay ? "1" : "0",
        refresh: refresh ? "1" : "0",
      });
      if (/^\d{4}-\d{2}-\d{2}$/.test(current.sessionDate)) params.set("date", current.sessionDate);
      const response = await fetch(`/api/oliver_market?${params}`, { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Market engine could not load this case.");
      const snapshot: OliverMarketSnapshot = { ...data, loadedAt: new Date().toISOString() };
      const withCase = updateCase(state, current.caseId, { caseRef: snapshot.caseRef, sessionDate: snapshot.sessionDate });
      onChange({ ...withCase, marketSnapshot: snapshot, updatedAt: new Date().toISOString() });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMarketError(error instanceof Error ? error.message : "Market engine failed.");
    } finally {
      setMarketLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadMarket(false, controller.signal);
    return () => controller.abort();
    // Reload when the selected instrument or chart mode changes. Session date is
    // intentionally omitted because the first successful load replaces the migration placeholder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.symbol, state.selectedTimeframe, state.fullDay]);

  const snapshot = state.marketSnapshot?.symbol === current.symbol && state.marketSnapshot.interval === state.selectedTimeframe ? state.marketSnapshot : null;
  const engine = snapshot?.candidate;

  return (
    <section className="oliver-workspace">
      <div className="oliver-titlebar">
        <div>
          <span className="eyebrow">ACTIVE WORKSPACE</span>
          <h1>Digital Oliver</h1>
          <p>State → Location → Structure Box → Space → Power → Risk → rank → lock → validate</p>
        </div>
        <div className="oliver-progress"><strong>{locked}/{state.cases.length}</strong><span>cases locked</span></div>
      </div>

      <nav className="oliver-tabs">
        {tabs.map(([key, label]) => <button key={key} className={state.activeTab === key ? "active" : ""} onClick={() => onChange({ ...state, activeTab: key, updatedAt: new Date().toISOString() })}>{label}</button>)}
      </nav>

      {state.activeTab === "guidedReview" && (
        <div className="oliver-review">
          <aside className="oliver-case-rail">
            <small>CASE QUEUE</small>
            {state.cases.map((item) => (
              <button key={item.caseId} className={item.caseId === current.caseId ? "active" : ""} onClick={() => onChange({ ...state, selectedCaseId: item.caseId, marketSnapshot: null })}>
                <strong>{item.symbol}</strong><span>{MAG7[item.symbol]}</span><i>{item.locked ? "Locked" : item.reviewState.replace("_", " ")}</i>
              </button>
            ))}
          </aside>

          <div className="oliver-case-main">
            <div className="oliver-case-head">
              <div><span className="case-ref">{current.caseRef}</span><h2>{current.symbol} · {MAG7[current.symbol]}</h2><p>{current.sessionDate}</p></div>
              <div className="timeframe-group">
                {(["5m", "15m", "1m"] as const).map((tf) => <button key={tf} className={state.selectedTimeframe === tf ? "active" : ""} onClick={() => onChange({ ...state, selectedTimeframe: tf, marketSnapshot: null })}>{tf}</button>)}
                <button className={state.fullDay ? "active" : ""} onClick={() => onChange({ ...state, fullDay: !state.fullDay, marketSnapshot: null })}>Full day</button>
                <button onClick={() => void loadMarket(true)}>Refresh</button>
              </div>
            </div>

            <div className="oliver-chart-shell">
              {marketLoading && <div className="oliver-chart-empty"><strong>Loading real market evidence…</strong><span>Python market-data + Oliver engine</span></div>}
              {!marketLoading && marketError && <div className="oliver-chart-empty error"><strong>Market engine unavailable</strong><span>{marketError}</span></div>}
              {!marketLoading && !marketError && snapshot && <MarketChart snapshot={snapshot} />}
              {!marketLoading && !marketError && !snapshot && <div className="oliver-chart-empty">Waiting for market engine.</div>}
            </div>

            {engine?.has_data && (
              <div className="engine-evidence">
                <div><span>Engine score</span><strong>{formatMetric(engine.score)}</strong></div>
                <div><span>Direction</span><strong>{formatMetric(engine.direction)}</strong></div>
                <div><span>State</span><strong>{formatMetric(engine.state)}</strong></div>
                <div><span>Space</span><strong>{formatMetric(engine.space_r, engine.space_r == null ? "" : "R")}</strong></div>
                <div><span>Structure Box</span><strong>{engine.box_cleared ? "Cleared" : "Contained / near"}</strong></div>
                <p>{engine.reason}</p>
              </div>
            )}

            <div className="oliver-section">
              <div className="section-heading"><span>1</span><div><h3>Oliver Rulebook Checklist</h3><p>Engine evidence above is separate from your judgment below. Record what you see before revealing outcome.</p></div></div>
              <div className="oliver-grid three">
                <Select label="State" value={current.stateClassification} options={stateOptions} onChange={(v) => patchCase({ stateClassification: v, reviewState: "in_progress" })} />
                <Select label="Location" value={current.locationClassification} options={locationOptions} onChange={(v) => patchCase({ locationClassification: v, reviewState: "in_progress" })} />
                <Select label="Structure Box" value={current.boxStatus} options={boxOptions} onChange={(v) => patchCase({ boxStatus: v, reviewState: "in_progress" })} />
              </div>
              <div className="oliver-grid three compact">
                <Range label="State quality" value={current.stateQuality} onChange={(v) => patchCase({ stateQuality: v })} />
                <Range label="Location quality" value={current.locationQuality} onChange={(v) => patchCase({ locationQuality: v })} />
                <Range label="Space quality" value={current.spaceQuality} onChange={(v) => patchCase({ spaceQuality: v })} />
                <Range label="Premarket/open" value={current.premarketContextQuality} onChange={(v) => patchCase({ premarketContextQuality: v })} />
                <Range label="Risk quality" value={current.riskQuality} onChange={(v) => patchCase({ riskQuality: v })} />
                <Range label="Overall quality" value={current.overallQuality} onChange={(v) => patchCase({ overallQuality: v })} />
              </div>
              <div className="oliver-check-grid">
                <Checkbox label="Clear structure box identified" checked={current.structureBoxRelevant} onChange={(v) => patchCase({ structureBoxRelevant: v })} />
                <Checkbox label="Price cleared the box" checked={current.boxCleared} onChange={(v) => patchCase({ boxCleared: v })} />
                <Checkbox label="Trend aligned" checked={current.trendAlignment} onChange={(v) => patchCase({ trendAlignment: v })} />
                <Checkbox label="Volume confirms" checked={current.volumeConfirmation} onChange={(v) => patchCase({ volumeConfirmation: v })} />
                <Checkbox label="Previous close relevant" checked={current.priorCloseRelevant} onChange={(v) => patchCase({ priorCloseRelevant: v })} />
                <Checkbox label="Previous high/low relevant" checked={current.priorHighLowRelevant} onChange={(v) => patchCase({ priorHighLowRelevant: v })} />
                <Checkbox label="Prior late-day range relevant" checked={current.priorRangeRelevant} onChange={(v) => patchCase({ priorRangeRelevant: v })} />
                <Checkbox label="20 SMA relevant" checked={current.sma20Relevant} onChange={(v) => patchCase({ sma20Relevant: v })} />
                <Checkbox label="200 SMA relevant" checked={current.sma200Relevant} onChange={(v) => patchCase({ sma200Relevant: v })} />
              </div>
              <div className="power-pills">
                {powerOptions.map((power) => {
                  const active = current.powerTypes.includes(power);
                  return <button key={power} className={active ? "active" : ""} onClick={() => patchCase({ powerTypes: active ? current.powerTypes.filter((item) => item !== power) : [...current.powerTypes.filter((item) => item !== "No meaningful power"), power] })}>{power}</button>;
                })}
              </div>
            </div>

            <div className="oliver-section">
              <div className="section-heading"><span>2</span><div><h3>Our Oliver Judgment</h3><p>Keep human judgment separate from engine evidence.</p></div></div>
              <div className="oliver-grid three">
                <Select label="Would Oliver be interested?" value={current.oliverInterest} options={["Unreviewed", "Yes", "Maybe", "No"]} onChange={(v) => patchCase({ oliverInterest: v as CaseReview["oliverInterest"] })} />
                <Select label="Would Oliver actually trade it?" value={current.wouldTrade} options={["Unreviewed", "Yes", "Maybe", "No"]} onChange={(v) => patchCase({ wouldTrade: v as CaseReview["wouldTrade"] })} />
                <Select label="Direction" value={current.direction} options={["Long", "Short", "None / unclear"]} onChange={(v) => patchCase({ direction: v as CaseReview["direction"] })} />
                <Select label="Setup family" value={current.setupType} options={["Unclassified", "Elephant Bar", "Bull/Bear 180", "Power Tail", "Location/State only", "No valid setup", "Other"]} onChange={(v) => patchCase({ setupType: v })} />
                <Select label="Overall grade" value={current.overallGrade} options={["A+", "A", "B", "C", "Reject"]} onChange={(v) => patchCase({ overallGrade: v as CaseReview["overallGrade"] })} />
                <Range label="Confidence" value={current.confidence} onChange={(v) => patchCase({ confidence: v })} />
              </div>
              <Text label="Biggest reason FOR the trade" value={current.strongestReason} onChange={(v) => patchCase({ strongestReason: v })} />
              <Text label="Biggest concern" value={current.biggestConcern} onChange={(v) => patchCase({ biggestConcern: v })} />
            </div>

            <div className="oliver-section">
              <div className="section-heading"><span>3</span><div><h3>Michael + Nexus Discussion</h3><p>Nexus receives the selected case, your review, and the live Python engine snapshot automatically.</p></div></div>
              <div className="oliver-grid two">
                <Text area label="Michael's analysis" value={current.michaelAnalysis} onChange={(v) => patchCase({ michaelAnalysis: v })} />
                <Text area label="Nexus / ChatGPT analysis" value={current.chatgptAnalysis} onChange={(v) => patchCase({ chatgptAnalysis: v })} />
              </div>
              <Text area label="Combined conclusion / where we agree or disagree" value={current.combinedConclusion} onChange={(v) => patchCase({ combinedConclusion: v })} />
              <Text label="What did we learn?" value={current.lesson} onChange={(v) => patchCase({ lesson: v })} />
              <div className="lock-row">
                <Checkbox label="Lock interpretation" checked={current.locked} onChange={(v) => patchCase({ locked: v, reviewState: v ? "complete" : "in_progress" })} />
                <span>{current.locked && snapshot?.outcome ? `Outcome available: ${formatMetric(snapshot.outcome.mfe_r, "R MFE")} · ${formatMetric(snapshot.outcome.mae_r, "R MAE")}` : "Outcome remains separated until interpretation lock."}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {state.activeTab === "dailyRanking" && <div className="oliver-empty"><strong>Daily Ranking migrated structurally</strong><p>The original workflow requires all seven case interpretations for a day to be locked before ranking. The current market adapter now supplies real dated cases; the next persistence slice will expand the queue from one current session to the full 35-case weekly cycle.</p></div>}

      {state.activeTab === "evidenceLibrary" && <div className="oliver-library">{state.cases.map((item) => <div key={item.caseId}><strong>{item.caseRef}</strong><span>{item.symbol} · {item.overallGrade} · {item.oliverInterest}</span><p>{item.combinedConclusion || item.michaelAnalysis || "No saved interpretation yet."}</p></div>)}</div>}

      {state.activeTab === "statistics" && <div className="oliver-empty"><strong>Statistics connected to the engine boundary</strong><p>Real case outcomes are now returned by the Python engine. Aggregate statistics remain gated until the full weekly case queue and durable evidence persistence are migrated.</p></div>}

      {state.activeTab === "export" && <div className="oliver-empty"><strong>Export workflow preserved</strong><p>The Python application exports current-case packages, draft week snapshots, and final locked week packages. Nexus now has direct structured market context, so export is for permanent evidence rather than basic AI collaboration. Durable research export returns with server persistence.</p></div>}

      {state.activeTab === "rulebook" && (
        <div className="oliver-rulebook">
          <h2>Digital Oliver Rulebook workflow</h2>
          <p>{OLIVER_RULEBOOK_SUMMARY.purpose}</p>
          <div className="rule-hierarchy">{OLIVER_RULEBOOK_SUMMARY.hierarchy.map((item, index) => <span key={item}>{index + 1}. {item}</span>)}</div>
          <h3>Evidence discipline</h3><p>{OLIVER_RULEBOOK_SUMMARY.evidenceDiscipline}</p>
          <h3>Current encoded model scope</h3><ul>{OLIVER_RULEBOOK_SUMMARY.modelScope.encoded.map((item) => <li key={item}>{item}</li>)}</ul>
          <h3>Planned model work</h3><ul>{OLIVER_RULEBOOK_SUMMARY.modelScope.planned.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
