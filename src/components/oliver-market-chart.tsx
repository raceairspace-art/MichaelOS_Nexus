"use client";

import { useMemo } from "react";
import type { OliverMarketSnapshot } from "@/lib/digital-oliver";

function fmt(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
}

export default function OliverMarketChart({ snapshot }: { snapshot: OliverMarketSnapshot }) {
  const bars = snapshot.bars;
  const c = snapshot.candidate;
  const geometry = useMemo(() => {
    if (!bars.length) return null;
    const levels = [
      c.entry, c.event_low, c.event_high, c.next_obstacle, c.box_high, c.box_low,
      c.prev_close, c.prev_high, c.prev_low, c.prev_late_high, c.prev_late_low,
      c.premarket_high, c.premarket_low,
    ];
    const values = [...bars.flatMap((b) => [b.low, b.high, b.sMA20, b.sMA200, b.boxHigh, b.boxLow]), ...levels]
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const low = Math.min(...values);
    const high = Math.max(...values);
    const pad = Math.max((high - low) * .08, Math.abs(high) * .001);
    return { low: low - pad, high: high + pad };
  }, [bars, c]);

  if (!geometry || !bars.length) return <div className="oliver-chart-empty">No bars returned for this session.</div>;

  const W = 1120, H = 560, top = 24, priceBottom = 430, volumeTop = 448, volumeBottom = 530;
  const xStep = W / bars.length;
  const candleW = Math.max(1.6, Math.min(7, xStep * .56));
  const y = (p: number) => top + ((geometry.high - p) / (geometry.high - geometry.low)) * (priceBottom - top);
  const x = (i: number) => i * xStep + xStep / 2;
  const maxVol = Math.max(...bars.map((b) => typeof b.volume === "number" ? b.volume : 0), 1);
  const vy = (v: number) => volumeBottom - (v / maxVol) * (volumeBottom - volumeTop);
  const path = (key: "sMA20" | "sMA200" | "boxHigh" | "boxLow") => {
    let started = false;
    return bars.map((b, i) => {
      const v = b[key];
      if (typeof v !== "number") { started = false; return ""; }
      const cmd = started ? "L" : "M"; started = true;
      return `${cmd}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    }).filter(Boolean).join(" ");
  };

  const eventMs = c.event_time ? new Date(c.event_time).getTime() : NaN;
  let eventIndex = -1;
  if (Number.isFinite(eventMs)) {
    let delta = Infinity;
    bars.forEach((b, i) => { const d = Math.abs(new Date(b.time).getTime() - eventMs); if (d < delta) { delta = d; eventIndex = i; } });
  }
  const stop = c.direction === "Bull" ? c.event_low : c.event_high;
  const openIndex = bars.findIndex((b) => {
    const d = new Date(b.time);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
    return parts === "09:30";
  });
  const pmIndices = bars.map((b, i) => b.premarket ? i : -1).filter((i) => i >= 0);
  const pmX0 = pmIndices.length ? Math.max(0, x(pmIndices[0]) - xStep / 2) : null;
  const pmX1 = pmIndices.length ? Math.min(W, x(pmIndices[pmIndices.length - 1]) + xStep / 2) : null;
  const structureLookback = snapshot.parameters.structureLookback ?? 12;
  const boxStartIndex = eventIndex >= 0 ? Math.max(0, eventIndex - structureLookback) : -1;

  const levels: Array<{ value?: number | null; label: string; kind: string }> = [
    { value: c.prev_close, label: "Prev close", kind: "ref" },
    { value: c.prev_high, label: "Prev high", kind: "ref" },
    { value: c.prev_low, label: "Prev low", kind: "ref" },
    { value: c.prev_late_high, label: "Prev late high", kind: "soft" },
    { value: c.prev_late_low, label: "Prev late low", kind: "soft" },
    { value: c.premarket_high, label: "Premarket high", kind: "pm" },
    { value: c.premarket_low, label: "Premarket low", kind: "pm" },
    { value: c.entry, label: "Candidate entry", kind: "entry" },
    { value: stop, label: "Structural stop", kind: "stop" },
    { value: c.next_obstacle, label: c.space_r == null ? "Next obstacle" : `Next obstacle · Space ${c.space_r.toFixed(2)}R`, kind: "obstacle" },
  ];

  return <div className="oliver-market-chart rich-chart">
    <div className="chart-status-row">
      <span><b>State</b> {c.state ?? "—"}</span><span><b>Location</b> {c.location_ok ? "Aligned" : "Weak"}</span>
      <span><b>Box</b> {c.box_cleared ? "Cleared" : "Contained / near"}</span><span><b>Power</b> {c.has_elephant ? "Elephant" : "Near-candidate"}</span>
      <span><b>Risk/Space</b> {c.space_r == null ? "Open / unknown" : `${c.space_r.toFixed(2)}R`}</span>
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${snapshot.symbol} Oliver evidence chart`}>
      {[0,.25,.5,.75,1].map((f) => { const yy = top + f * (priceBottom-top); const p = geometry.high - f*(geometry.high-geometry.low); return <g key={f}><line className="chart-grid" x1="0" x2={W} y1={yy} y2={yy}/><text className="chart-price" x="6" y={yy-5}>{p.toFixed(2)}</text></g>; })}
      {pmX0 != null && pmX1 != null && <g><rect className="premarket-zone" x={pmX0} width={pmX1-pmX0} y={top} height={priceBottom-top}/><text className="chart-zone-label" x={pmX0+8} y={top+16}>PREMARKET</text></g>}
      {openIndex >= 0 && <g><line className="market-open-line" x1={x(openIndex)} x2={x(openIndex)} y1={top} y2={volumeBottom}/><text className="chart-zone-label" x={x(openIndex)+5} y={top+16}>MARKET OPEN</text></g>}
      {boxStartIndex >= 0 && eventIndex >= 0 && typeof c.box_low === "number" && typeof c.box_high === "number" && <g><rect className="candidate-box" x={x(boxStartIndex)-xStep/2} width={x(eventIndex)-x(boxStartIndex)+xStep} y={y(c.box_high)} height={Math.max(1,y(c.box_low)-y(c.box_high))}/><text className="box-label" x={x(boxStartIndex)} y={y(c.box_high)-6}>STRUCTURE BOX · {structureLookback} BARS</text></g>}
      <path className="structure-band high" d={path("boxHigh")}/><path className="structure-band low" d={path("boxLow")}/>
      {bars.map((b,i) => { const xx=x(i), bull=b.close>=b.open, bt=y(Math.max(b.open,b.close)), bb=y(Math.min(b.open,b.close)); return <g key={b.time} className={bull?"candle bull":"candle bear"}><line x1={xx} x2={xx} y1={y(b.high)} y2={y(b.low)}/><rect x={xx-candleW/2} y={bt} width={candleW} height={Math.max(1.5,bb-bt)}/>{b.bullElephant && <path className="bull-elephant" d={`M ${xx-6} ${y(b.low)+14} L ${xx+6} ${y(b.low)+14} L ${xx} ${y(b.low)+3} Z`}/>} {b.bearElephant && <path className="bear-elephant" d={`M ${xx-6} ${y(b.high)-14} L ${xx+6} ${y(b.high)-14} L ${xx} ${y(b.high)-3} Z`}/>}</g>; })}
      <path className="sma sma20" d={path("sMA20")}/><path className="sma sma200" d={path("sMA200")}/>
      {levels.map(({value,label,kind}) => typeof value === "number" ? <g key={label} className={`evidence-level ${kind}`}><line x1="0" x2={W} y1={y(value)} y2={y(value)}/><rect className="level-label-bg" x={W-205} y={y(value)-11} width="202" height="17" rx="3"/><text className="level-label" x={W-200} y={y(value)+1}>{label} · {fmt(value)}</text></g> : null)}
      {eventIndex >= 0 && <g className="engine-candidate"><line x1={x(eventIndex)} x2={x(eventIndex)} y1={top} y2={priceBottom}/><path d={`M ${x(eventIndex)} ${y(bars[eventIndex].close)-10} l 4 7 8 1 -6 5 2 8 -8 -4 -8 4 2 -8 -6 -5 8 -1 Z`}/><text x={Math.min(W-190,x(eventIndex)+10)} y={Math.max(top+35,y(bars[eventIndex].high)-28)}>{c.state ?? "Candidate"} · {c.box_cleared ? "BOX CLEAR" : "BOX NEAR"}</text></g>}
      <line className="volume-divider" x1="0" x2={W} y1={volumeTop-8} y2={volumeTop-8}/>
      {bars.map((b,i) => { const v=typeof b.volume==="number"?b.volume:0; return <rect key={`v-${b.time}`} className={b.close>=b.open?"volume-bar bull":"volume-bar bear"} x={x(i)-candleW/2} y={vy(v)} width={candleW} height={Math.max(1,volumeBottom-vy(v))}/>; })}
      <text className="chart-zone-label" x="6" y={volumeTop+8}>VOLUME</text>
    </svg>
    <div className="chart-legend rich"><span className="l20">20 SMA</span><span className="l200">200 SMA</span><span>△ Bull Elephant</span><span>▽ Bear Elephant</span><span>▧ Structure Box</span><span>★ Engine candidate</span><span>Horizontal lines = reference / risk / space levels</span></div>
  </div>;
}
