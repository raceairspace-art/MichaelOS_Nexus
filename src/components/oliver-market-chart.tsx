"use client";

import { useMemo, useRef, useState } from "react";
import type { OliverMarketSnapshot } from "@/lib/digital-oliver";

function fmt(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
}

function compactVolume(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function marketTime(value: string, includeDate = false) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    ...(includeDate ? { month: "short", day: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function OliverMarketChart({ snapshot }: { snapshot: OliverMarketSnapshot }) {
  const bars = snapshot.bars;
  const c = snapshot.candidate;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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

  const W = 1160, H = 615;
  const plotLeft = 58, plotRight = 1060, top = 24, priceBottom = 435;
  const volumeTop = 456, volumeBottom = 545, timeAxisY = 574;
  const plotWidth = plotRight - plotLeft;
  const xStep = plotWidth / bars.length;
  const candleW = Math.max(1.6, Math.min(7, xStep * .56));
  const y = (p: number) => top + ((geometry.high - p) / (geometry.high - geometry.low)) * (priceBottom - top);
  const x = (i: number) => plotLeft + i * xStep + xStep / 2;
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
    bars.forEach((b, i) => {
      const d = Math.abs(new Date(b.time).getTime() - eventMs);
      if (d < delta) { delta = d; eventIndex = i; }
    });
  }

  const stop = c.direction === "Bull" ? c.event_low : c.event_high;
  const openIndex = bars.findIndex((b) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(b.time));
    return parts === "09:30";
  });
  const pmIndices = bars.map((b, i) => b.premarket ? i : -1).filter((i) => i >= 0);
  const pmX0 = pmIndices.length ? Math.max(plotLeft, x(pmIndices[0]) - xStep / 2) : null;
  const pmX1 = pmIndices.length ? Math.min(plotRight, x(pmIndices[pmIndices.length - 1]) + xStep / 2) : null;
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
    { value: c.next_obstacle, label: c.space_r == null ? "Next obstacle" : `Next obstacle · ${c.space_r.toFixed(2)}R`, kind: "obstacle" },
  ];

  const timeTickCount = bars.length < 20 ? 5 : 7;
  const timeTickIndexes = Array.from({ length: timeTickCount }, (_, i) => Math.round(i * (bars.length - 1) / (timeTickCount - 1)));
  const hovered = hoveredIndex == null ? null : bars[hoveredIndex];

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * W;
    if (svgX < plotLeft || svgX > plotRight) { setHoveredIndex(null); return; }
    const index = Math.max(0, Math.min(bars.length - 1, Math.floor((svgX - plotLeft) / xStep)));
    setHoveredIndex(index);
  }

  return <div className="oliver-market-chart rich-chart">
    <div className="chart-status-row">
      <span><b>State</b> {c.state ?? "—"}</span><span><b>Location</b> {c.location_ok ? "Aligned" : "Weak"}</span>
      <span><b>Box</b> {c.box_cleared ? "Cleared" : "Contained / near"}</span><span><b>Power</b> {c.has_elephant ? "Elephant" : "Near-candidate"}</span>
      <span><b>Risk/Space</b> {c.space_r == null ? "Open / unknown" : `${c.space_r.toFixed(2)}R`}</span>
    </div>

    <div className="chart-hover-readout" aria-live="polite">
      {hovered ? <>
        <strong>{marketTime(hovered.time, true)} ET</strong>
        <span>O <b>{fmt(hovered.open)}</b></span><span>H <b>{fmt(hovered.high)}</b></span><span>L <b>{fmt(hovered.low)}</b></span><span>C <b>{fmt(hovered.close)}</b></span><span>Vol <b>{compactVolume(hovered.volume)}</b></span>
        {hovered.bullElephant && <em>Bull Elephant</em>}{hovered.bearElephant && <em>Bear Elephant</em>}
      </> : <span className="hover-hint">Hover over a candle to inspect OHLC and volume.</span>}
    </div>

    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${snapshot.symbol} Oliver evidence chart`} onMouseMove={handleMouseMove} onMouseLeave={() => setHoveredIndex(null)}>
      {[0,.25,.5,.75,1].map((f) => {
        const yy = top + f * (priceBottom-top);
        const p = geometry.high - f*(geometry.high-geometry.low);
        return <g key={f}><line className="chart-grid" x1={plotLeft} x2={plotRight} y1={yy} y2={yy}/><line className="price-tick" x1={plotRight} x2={plotRight+5} y1={yy} y2={yy}/><text className="chart-price right" x={plotRight+10} y={yy+3}>{p.toFixed(2)}</text></g>;
      })}
      <line className="axis-line" x1={plotRight} x2={plotRight} y1={top} y2={priceBottom}/>
      <line className="axis-line" x1={plotLeft} x2={plotRight} y1={volumeBottom+4} y2={volumeBottom+4}/>

      {timeTickIndexes.map((i) => <g key={`t-${i}`}><line className="time-tick" x1={x(i)} x2={x(i)} y1={volumeBottom+4} y2={volumeBottom+10}/><text className="chart-time" x={x(i)} y={timeAxisY}>{marketTime(bars[i].time)}</text></g>)}
      <text className="axis-title price-axis-title" x={W-12} y={top+4}>PRICE</text>
      <text className="axis-title time-axis-title" x={(plotLeft+plotRight)/2} y={H-8}>TIME · EASTERN</text>

      {pmX0 != null && pmX1 != null && <g><rect className="premarket-zone" x={pmX0} width={pmX1-pmX0} y={top} height={priceBottom-top}/><text className="chart-zone-label" x={pmX0+8} y={top+16}>PREMARKET</text></g>}
      {openIndex >= 0 && <g><line className="market-open-line" x1={x(openIndex)} x2={x(openIndex)} y1={top} y2={volumeBottom}/><text className="chart-zone-label" x={x(openIndex)+5} y={top+16}>MARKET OPEN</text></g>}
      {boxStartIndex >= 0 && eventIndex >= 0 && typeof c.box_low === "number" && typeof c.box_high === "number" && <g><rect className="candidate-box" x={x(boxStartIndex)-xStep/2} width={x(eventIndex)-x(boxStartIndex)+xStep} y={y(c.box_high)} height={Math.max(1,y(c.box_low)-y(c.box_high))}/><text className="box-label" x={x(boxStartIndex)} y={y(c.box_high)-6}>STRUCTURE BOX · {structureLookback} BARS</text></g>}
      <path className="structure-band high" d={path("boxHigh")}/><path className="structure-band low" d={path("boxLow")}/>

      {bars.map((b,i) => {
        const xx=x(i), bull=b.close>=b.open, bt=y(Math.max(b.open,b.close)), bb=y(Math.min(b.open,b.close));
        return <g key={b.time} className={`${bull?"candle bull":"candle bear"}${hoveredIndex===i?" hovered":""}`}>
          <line x1={xx} x2={xx} y1={y(b.high)} y2={y(b.low)}/><rect x={xx-candleW/2} y={bt} width={candleW} height={Math.max(1.5,bb-bt)}/>
          {b.bullElephant && <path className="bull-elephant" d={`M ${xx-6} ${y(b.low)+14} L ${xx+6} ${y(b.low)+14} L ${xx} ${y(b.low)+3} Z`}/>} 
          {b.bearElephant && <path className="bear-elephant" d={`M ${xx-6} ${y(b.high)-14} L ${xx+6} ${y(b.high)-14} L ${xx} ${y(b.high)-3} Z`}/>} 
        </g>;
      })}
      <path className="sma sma20" d={path("sMA20")}/><path className="sma sma200" d={path("sMA200")}/>

      {levels.map(({value,label,kind}) => typeof value === "number" ? <g key={label} className={`evidence-level ${kind}`}><line x1={plotLeft} x2={plotRight} y1={y(value)} y2={y(value)}/><rect className="level-label-bg" x={plotRight-205} y={y(value)-11} width="202" height="17" rx="3"/><text className="level-label" x={plotRight-200} y={y(value)+1}>{label} · {fmt(value)}</text></g> : null)}

      {eventIndex >= 0 && <g className="engine-candidate"><line x1={x(eventIndex)} x2={x(eventIndex)} y1={top} y2={priceBottom}/><path d={`M ${x(eventIndex)} ${y(bars[eventIndex].close)-10} l 4 7 8 1 -6 5 2 8 -8 -4 -8 4 2 -8 -6 -5 8 -1 Z`}/><text x={Math.min(plotRight-190,x(eventIndex)+10)} y={Math.max(top+35,y(bars[eventIndex].high)-28)}>{c.state ?? "Candidate"} · {c.box_cleared ? "BOX CLEAR" : "BOX NEAR"}</text></g>}

      {hoveredIndex != null && <g className="hover-crosshair"><line x1={x(hoveredIndex)} x2={x(hoveredIndex)} y1={top} y2={volumeBottom}/><line x1={plotLeft} x2={plotRight} y1={y(bars[hoveredIndex].close)} y2={y(bars[hoveredIndex].close)}/><rect x={plotRight+4} y={y(bars[hoveredIndex].close)-10} width="62" height="18" rx="3"/><text x={plotRight+9} y={y(bars[hoveredIndex].close)+3}>{fmt(bars[hoveredIndex].close)}</text></g>}

      <line className="volume-divider" x1={plotLeft} x2={plotRight} y1={volumeTop-8} y2={volumeTop-8}/>
      {bars.map((b,i) => { const v=typeof b.volume==="number"?b.volume:0; return <rect key={`v-${b.time}`} className={b.close>=b.open?"volume-bar bull":"volume-bar bear"} x={x(i)-candleW/2} y={vy(v)} width={candleW} height={Math.max(1,volumeBottom-vy(v))}/>; })}
      <text className="chart-zone-label" x={plotLeft+5} y={volumeTop+8}>VOLUME</text>
    </svg>

    <div className="chart-legend rich" aria-label="Chart legend">
      <span className="legend-title">Legend</span>
      <span><i className="legend-swatch line sma20-swatch"/>20 SMA</span>
      <span><i className="legend-swatch line sma200-swatch"/>200 SMA</span>
      <span><i className="legend-swatch box-swatch"/>Structure Box</span>
      <span><i className="legend-symbol bull-elephant-symbol">▲</i>Bull Elephant</span>
      <span><i className="legend-symbol bear-elephant-symbol">▼</i>Bear Elephant</span>
      <span><i className="legend-symbol candidate-symbol">★</i>Engine candidate</span>
      <span><i className="legend-swatch line entry-swatch"/>Candidate entry</span>
      <span><i className="legend-swatch line stop-swatch"/>Structural stop</span>
      <span><i className="legend-swatch line obstacle-swatch"/>Next obstacle / Space</span>
      <span><i className="legend-swatch line pm-swatch"/>Premarket high / low</span>
      <span><i className="legend-swatch line ref-swatch"/>Prior-session reference</span>
      <span><i className="legend-swatch zone-swatch"/>Premarket session</span>
      <span><i className="legend-swatch open-swatch"/>Market open</span>
      <span><i className="legend-swatch volume-swatch"/>Volume</span>
    </div>
  </div>;
}
