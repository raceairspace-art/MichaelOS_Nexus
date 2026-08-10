"use client";

import type { DigitalOliverWorkspaceState, CaseReview, OliverTab } from "@/lib/digital-oliver";
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

export default function DigitalOliverWorkspace({ state, onChange }: Props) {
  const current = selectedCase(state);
  const patchCase = (patch: Partial<CaseReview>) => onChange(updateCase(state, current.caseId, patch));
  const locked = state.cases.filter((item) => item.locked).length;

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
              <button key={item.caseId} className={item.caseId === current.caseId ? "active" : ""} onClick={() => onChange({ ...state, selectedCaseId: item.caseId })}>
                <strong>{item.symbol}</strong><span>{MAG7[item.symbol]}</span><i>{item.locked ? "Locked" : item.reviewState.replace("_", " ")}</i>
              </button>
            ))}
          </aside>

          <div className="oliver-case-main">
            <div className="oliver-case-head">
              <div><span className="case-ref">{current.caseRef}</span><h2>{current.symbol} · {MAG7[current.symbol]}</h2><p>{current.sessionDate}</p></div>
              <div className="timeframe-group">
                {(["5m", "15m", "1m"] as const).map((tf) => <button key={tf} className={state.selectedTimeframe === tf ? "active" : ""} onClick={() => onChange({ ...state, selectedTimeframe: tf })}>{tf}</button>)}
              </div>
            </div>

            <div className="oliver-chart-placeholder">
              <div>
                <strong>Market chart adapter not connected yet</strong>
                <p>The original app’s cached OHLCV, Plotly chart, 20/200 SMAs, Structure Box, Space, entry/stop, premarket levels, Elephant markers, and volume will plug into this surface next. No market evidence is being fabricated during migration.</p>
              </div>
              <span>{state.selectedTimeframe} · {state.fullDay ? "full day" : "decision window"}</span>
            </div>

            <div className="oliver-section">
              <div className="section-heading"><span>1</span><div><h3>Oliver Rulebook Checklist</h3><p>Record what the chart shows before revealing outcome.</p></div></div>
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
              <div className="section-heading"><span>3</span><div><h3>Michael + Nexus Discussion</h3><p>The AI panel already has this case and review in context.</p></div></div>
              <div className="oliver-grid two">
                <Text area label="Michael's analysis" value={current.michaelAnalysis} onChange={(v) => patchCase({ michaelAnalysis: v })} />
                <Text area label="Nexus / ChatGPT analysis" value={current.chatgptAnalysis} onChange={(v) => patchCase({ chatgptAnalysis: v })} />
              </div>
              <Text area label="Combined conclusion / where we agree or disagree" value={current.combinedConclusion} onChange={(v) => patchCase({ combinedConclusion: v })} />
              <Text label="What did we learn?" value={current.lesson} onChange={(v) => patchCase({ lesson: v })} />
              <div className="lock-row">
                <Checkbox label="Lock interpretation" checked={current.locked} onChange={(v) => patchCase({ locked: v, reviewState: v ? "complete" : "in_progress" })} />
                <span>{current.locked ? "Outcome may be revealed once market-data migration is connected." : "Outcome remains hidden until lock."}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {state.activeTab === "dailyRanking" && <div className="oliver-empty"><strong>Daily Ranking migrated structurally</strong><p>The original workflow requires all seven case interpretations for a day to be locked before ranking. That gating will become active when real dated market cases are supplied by the market-data adapter.</p></div>}

      {state.activeTab === "evidenceLibrary" && <div className="oliver-library">{state.cases.map((item) => <div key={item.caseId}><strong>{item.caseRef}</strong><span>{item.symbol} · {item.overallGrade} · {item.oliverInterest}</span><p>{item.combinedConclusion || item.michaelAnalysis || "No saved interpretation yet."}</p></div>)}</div>}

      {state.activeTab === "statistics" && <div className="oliver-empty"><strong>Statistics preserved as a migration boundary</strong><p>The original statistics depend on real engine outcomes and locked evidence. We will port those calculations after the market-data and engine adapter is connected.</p></div>}

      {state.activeTab === "export" && <div className="oliver-empty"><strong>Export workflow preserved</strong><p>The Python application exports current-case packages, draft week snapshots, and final locked week packages. Nexus already gives the AI direct structured context, so case-package download becomes optional rather than the primary collaboration mechanism. Permanent research export will return when server persistence is connected.</p></div>}

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
