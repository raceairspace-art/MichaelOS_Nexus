"use client";

import {
  ArrowUp,
  Check,
  ChevronDown,
  CircleDot,
  Eye,
  History,
  Layers3,
  MessageSquareText,
  MousePointer2,
  RotateCcw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { FormEvent, useState } from "react";
import {
  initialOliver,
  moods,
  palettes,
  scenes,
  type OliverPatch,
  type OliverState,
  type Proposal,
} from "@/lib/nexus";

type Activity = { actor: "you" | "nexus"; text: string };

const starters = [
  "Make Oliver feel more focused",
  "Move him into a late-night studio",
  "Give the scene more energy",
];

const paletteLabels: Record<OliverState["palette"], string> = {
  amber: "Warm amber",
  indigo: "Deep indigo",
  mint: "Quiet mint",
  rose: "Electric rose",
};

function describePatch(patch: OliverPatch) {
  return Object.entries(patch)
    .map(([key, value]) => `${key} → ${value}`)
    .join(" · ");
}

export default function Home() {
  const [oliver, setOliver] = useState(initialOliver);
  const [selected, setSelected] = useState("Digital Oliver");
  const [prompt, setPrompt] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState<Activity[]>([
    { actor: "nexus", text: "I’m here with the full Oliver workspace in view." },
    { actor: "you", text: "Opened Digital Oliver in the shared workspace." },
  ]);

  const contextSummary = `${oliver.scene} · ${oliver.mood} · energy ${oliver.energy}/5`;

  function updateWorkspace(patch: OliverPatch, label: string) {
    setOliver((current) => ({ ...current, ...patch }));
    setActivity((current) => [{ actor: "you" as const, text: label }, ...current].slice(0, 8));
  }

  async function askNexus(text: string) {
    const nextPrompt = text.trim();
    if (!nextPrompt || loading) return;

    setPrompt("");
    setError("");
    setProposal(null);
    setLoading(true);
    setActivity((current) => [{ actor: "you" as const, text: nextPrompt }, ...current].slice(0, 8));

    try {
      const response = await fetch("/api/collaborate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: nextPrompt,
          workspace: oliver,
          selection: selected,
          recentActivity: activity.map((item) => `${item.actor}: ${item.text}`),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nexus could not respond.");

      setProposal(data);
      setActivity((current) => [
        { actor: "nexus" as const, text: `Proposed: ${describePatch(data.changes)}` },
        ...current,
      ].slice(0, 8));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Nexus could not respond.");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void askNexus(prompt);
  }

  function applyProposal() {
    if (!proposal) return;
    setOliver((current) => ({ ...current, ...proposal.changes }));
    setActivity((current) => [
      { actor: "you" as const, text: `Applied Nexus proposal: ${describePatch(proposal.changes)}` },
      ...current,
    ].slice(0, 8));
    setProposal(null);
  }

  function resetWorkspace() {
    setOliver(initialOliver);
    setProposal(null);
    setActivity((current) => [{ actor: "you" as const, text: "Reset Oliver to the opening state." }, ...current].slice(0, 8));
  }

  return (
    <main className={`app-shell palette-${oliver.palette}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span>N</span></div>
          <div>
            <div className="brand-name">MichaelOS <strong>Nexus</strong></div>
            <div className="brand-subtitle">Shared intelligence workspace</div>
          </div>
        </div>

        <div className="object-switcher" aria-label="Current workspace object">
          <span className="object-avatar">O</span>
          <span><small>Working on</small>{oliver.name}</span>
          <ChevronDown size={15} />
        </div>

        <div className="presence">
          <div className="presence-faces" aria-label="Michael and Nexus are present">
            <span className="face michael">M</span>
            <span className="face nexus"><Sparkles size={13} /></span>
          </div>
          <div><strong>2 present</strong><span>Michael + Nexus</span></div>
          <span className="live-dot" />
        </div>
      </header>

      <section className="context-ribbon" aria-label="Shared context status">
        <div className="context-live"><Eye size={14} /><strong>Nexus sees what you see</strong></div>
        <div className="context-items">
          <span><CircleDot size={12} /> {selected}</span>
          <span><Layers3 size={12} /> Entire workspace</span>
          <span><History size={12} /> Recent changes</span>
        </div>
        <div className="context-state">{contextSummary}</div>
      </section>

      <div className="workspace-grid">
        <aside className="rail" aria-label="Workspace tools">
          <button className="rail-button active" aria-label="Select"><MousePointer2 size={18} /></button>
          <button className="rail-button" aria-label="Layers"><Layers3 size={18} /></button>
          <button className="rail-button" aria-label="Comments"><MessageSquareText size={18} /></button>
          <div className="rail-spacer" />
          <button className="rail-button" onClick={resetWorkspace} aria-label="Reset workspace"><RotateCcw size={18} /></button>
        </aside>

        <section className="canvas-column">
          <div className="canvas-header">
            <div>
              <span className="eyebrow">Shared object / V1</span>
              <h1>Digital Oliver</h1>
            </div>
            <div className="canvas-actions">
              <button className="quiet-button"><History size={15} /> Version 01</button>
              <button className="quiet-button"><span className="autosave-dot" /> Saved</button>
            </div>
          </div>

          <div className="canvas-stage">
            <div className="grid-lines" />
            <button
              className={`oliver-object ${selected === "Digital Oliver" ? "selected" : ""}`}
              onClick={() => setSelected("Digital Oliver")}
              aria-label="Select Digital Oliver"
            >
              <div className="selection-label"><MousePointer2 size={12} /> Nexus is looking here</div>
              <span className="selection-handle tl" /><span className="selection-handle tr" />
              <span className="selection-handle bl" /><span className="selection-handle br" />
              <div className="oliver-shadow" />
              <div className="oliver-glow" />
              <div className="oliver-body">
                <div className="oliver-antenna"><span /></div>
                <div className="oliver-face">
                  <span className="eye left" /><span className="eye right" />
                  <span className={`mouth mood-${oliver.mood}`} />
                </div>
                <div className="oliver-core"><Sparkles size={24} /></div>
              </div>
            </button>

            <div className="scene-card scene-name">
              <small>Scene</small><strong>{oliver.scene}</strong>
            </div>
            <button type="button" className="scene-card scene-focus" onClick={() => setSelected("Oliver's focus")}>
              <small>Current focus</small><p>{oliver.focus}</p>
            </button>
            <div className="energy-meter" aria-label={`Energy ${oliver.energy} out of 5`}>
              <small>Energy</small>
              <div>{[1, 2, 3, 4, 5].map((step) => <span key={step} className={step <= oliver.energy ? "filled" : ""} />)}</div>
            </div>
          </div>

          <div className="inspector-bar">
            <label>
              <span>Mood</span>
              <select value={oliver.mood} onChange={(e) => updateWorkspace({ mood: e.target.value as OliverState["mood"] }, `Changed Oliver’s mood to ${e.target.value}.`)}>
                {moods.map((mood) => <option key={mood}>{mood}</option>)}
              </select>
            </label>
            <label>
              <span>Scene</span>
              <select value={oliver.scene} onChange={(e) => updateWorkspace({ scene: e.target.value as OliverState["scene"] }, `Moved Oliver to the ${e.target.value}.`)}>
                {scenes.map((scene) => <option key={scene}>{scene}</option>)}
              </select>
            </label>
            <div className="palette-picker">
              <span>Palette</span>
              <div>{palettes.map((palette) => (
                <button key={palette} title={paletteLabels[palette]} aria-label={paletteLabels[palette]} className={`swatch ${palette} ${oliver.palette === palette ? "selected" : ""}`} onClick={() => updateWorkspace({ palette }, `Changed the palette to ${paletteLabels[palette]}.`)} />
              ))}</div>
            </div>
            <label className="energy-control">
              <span>Energy <strong>{oliver.energy}</strong></span>
              <input type="range" min="1" max="5" value={oliver.energy} onChange={(e) => updateWorkspace({ energy: Number(e.target.value) }, `Set Oliver’s energy to ${e.target.value}.`)} />
            </label>
          </div>
        </section>

        <aside className="ai-panel">
          <div className="ai-header">
            <div className="ai-identity"><span><Sparkles size={18} /></span><div><strong>Nexus</strong><small>Beside you, in context</small></div></div>
            <span className="ai-status"><i /> Ready</span>
          </div>

          <div className="conversation">
            <div className="ai-message opening">
              <div className="message-icon"><Eye size={14} /></div>
              <div>
                <p>I’m with you in <strong>{oliver.scene}</strong>. Oliver feels <strong>{oliver.mood}</strong>, and you currently have <strong>{selected}</strong> selected.</p>
                <span>I already have the workspace context—you don’t need to explain the screen.</span>
              </div>
            </div>

            {!proposal && !loading && (
              <div className="starter-block">
                <small>Try shaping the object together</small>
                {starters.map((starter) => <button key={starter} onClick={() => void askNexus(starter)}><WandSparkles size={14} />{starter}</button>)}
              </div>
            )}

            {loading && (
              <div className="thinking-card">
                <span className="thinking-orb"><Sparkles size={17} /></span>
                <div><strong>Looking at Oliver…</strong><span>Reading the object, selection, and recent changes</span></div>
                <i /><i /><i />
              </div>
            )}

            {proposal && (
              <div className="proposal-card">
                <div className="proposal-kicker"><Sparkles size={13} /> A thought, in context {proposal.source === "demo" && <span>Demo mode</span>}</div>
                <p>{proposal.message}</p>
                <div className="observation"><Eye size={14} /><span><small>What I noticed</small>{proposal.observation}</span></div>
                <div className="change-list">
                  {Object.entries(proposal.changes).map(([key, value]) => (
                    <div key={key}><span>{key}</span><strong>{String(value)}</strong></div>
                  ))}
                </div>
                <p className="rationale">{proposal.rationale}</p>
                <div className="proposal-actions">
                  <button className="apply-button" onClick={applyProposal}><Check size={15} /> Apply to Oliver</button>
                  <button className="dismiss-button" onClick={() => setProposal(null)}>Not this</button>
                </div>
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <div className="activity-thread">
              <small>Shared activity</small>
              {activity.slice(0, 4).map((item, index) => (
                <div key={`${item.text}-${index}`} className={item.actor}>
                  <span>{item.actor === "you" ? "M" : <Sparkles size={10} />}</span>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <form className="composer" onSubmit={submit}>
            <div className="composer-context"><CircleDot size={11} /> Talking about: {selected}</div>
            <div className="composer-box">
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Shape Oliver with Nexus…" rows={2} onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void askNexus(prompt); }
              }} />
              <button type="submit" disabled={!prompt.trim() || loading} aria-label="Send to Nexus"><ArrowUp size={17} /></button>
            </div>
            <p><Sparkles size={11} /> Nexus receives the live object context with every message</p>
          </form>
        </aside>
      </div>
    </main>
  );
}
