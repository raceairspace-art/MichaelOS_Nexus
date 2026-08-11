"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DigitalOliverWorkspace from "@/components/digital-oliver-workspace";
import styles from "@/components/oliver-day-controller.module.css";
import {
  MAG7,
  ensureCasesForDate,
  selectedCase,
  updateCase,
  type DayReview,
  type DigitalOliverWorkspaceState,
  type OliverAiReview,
  type OliverModelSettings,
  type OliverSymbol,
} from "@/lib/digital-oliver";

type Props = {
  state: DigitalOliverWorkspaceState;
  onChange: (next: DigitalOliverWorkspaceState) => void;
};

type RankState = "idle" | "loading" | "complete" | "error";

type DayExt = DayReview & {
  aiBestSymbol?: OliverSymbol | "";
  aiSecondSymbol?: OliverSymbol | "";
  aiNoTradeDay?: boolean;
  aiWinnerReason?: string;
  aiSeparationReason?: string;
  aiConfidence?: number;
  aiRankState?: RankState;
  aiRankError?: string;
  aiRankModelVersion?: string;
  aiRankTimeframe?: "1m" | "5m" | "15m";
  aiRankGeneratedAt?: string;
};

type EngineReview = {
  score?: number;
  overallGrade?: string;
  wouldTrade?: string;
  oliverInterest?: string;
  direction?: string;
  strongestReason?: string;
  biggestConcern?: string;
};

type EngineDay = {
  reviews: Array<{ symbol: OliverSymbol; review: EngineReview }>;
  ranking: {
    bestSymbol: OliverSymbol | "NO_TRADE";
    secondSymbol: OliverSymbol | "NO_TRADE";
    noTradeDay: boolean;
    winnerReason: string;
    separationReason: string;
    confidence: number;
  };
};

type RankPayload = {
  bestSymbol: OliverSymbol | "NO_TRADE";
  secondSymbol: OliverSymbol | "NO_TRADE";
  noTradeDay: boolean;
  winnerReason: string;
  separationReason: string;
  confidence: number;
  generatedAt: string;
  modelVersion: string;
  timeframe: "1m" | "5m" | "15m";
};

const symbols = Object.keys(MAG7) as OliverSymbol[];
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

function blankDay(date: string): DayExt {
  return {
    sessionDate: date,
    bestSymbol: "",
    secondSymbol: "",
    noTradeDay: false,
    daySummary: "",
    winnerReason: "",
    separationReason: "",
    confidence: 3,
    locked: false,
    aiBestSymbol: "",
    aiSecondSymbol: "",
    aiNoTradeDay: false,
    aiWinnerReason: "",
    aiSeparationReason: "",
    aiConfidence: 3,
    aiRankState: "idle",
    aiRankError: "",
  };
}

function dayFor(state: DigitalOliverWorkspaceState, date: string): DayExt {
  return (state.days.find((item) => item.sessionDate === date) as DayExt | undefined) ?? blankDay(date);
}

function setDay(state: DigitalOliverWorkspaceState, date: string, patch: Partial<DayExt>) {
  const existing = dayFor(state, date);
  const next = { ...existing, ...patch };
  const found = state.days.some((item) => item.sessionDate === date);
  return {
    ...state,
    days: found
      ? state.days.map((item) => (item.sessionDate === date ? (next as DayReview) : item))
      : [...state.days, next as DayReview],
    updatedAt: new Date().toISOString(),
  };
}

function freshAi(
  review: OliverAiReview | null | undefined,
  settings: OliverModelSettings,
  timeframe: DigitalOliverWorkspaceState["selectedTimeframe"],
) {
  return Boolean(review && review.modelVersion === settings.version && review.timeframe === timeframe);
}

function addSettings(query: URLSearchParams, settings: OliverModelSettings) {
  for (const [key, value] of Object.entries(settings)) {
    if (key !== "version") query.set(key, String(value));
  }
}

export default function DigitalOliverWorkspaceComplete({ state, onChange }: Props) {
  const stateRef = useRef(state);
  stateRef.current = state;

  const current = selectedCase(state);
  const date = state.selectedDate;
  const day = dayFor(state, date);
  const [engineDay, setEngineDay] = useState<EngineDay | null>(null);
  const [engineState, setEngineState] = useState<RankState>("idle");
  const [engineError, setEngineError] = useState("");
  const [manualAiState, setManualAiState] = useState<RankState>("idle");
  const [manualAiError, setManualAiError] = useState("");

  const dayCases = useMemo(
    () => symbols.map((symbol) => state.cases.find((item) => item.sessionDate === date && item.symbol === symbol)),
    [state.cases, date],
  );
  const freshCount = dayCases.filter((item) => freshAi(item?.aiReview, state.modelSettings, state.selectedTimeframe)).length;
  const aiRankFresh =
    day.aiRankState === "complete" &&
    day.aiRankModelVersion === state.modelSettings.version &&
    day.aiRankTimeframe === state.selectedTimeframe;

  useEffect(() => {
    if (!validDate(date)) return;
    const ensured = ensureCasesForDate(state, date);
    if (ensured !== state) onChange(ensured);
  }, [date, state.cases.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!validDate(date)) return;
    const controller = new AbortController();
    setEngineState("loading");
    setEngineError("");
    const query = new URLSearchParams({
      date,
      interval: state.selectedTimeframe,
      modelVersion: state.modelSettings.version,
    });
    addSettings(query, state.modelSettings);

    void fetch(`/api/oliver_engine_day?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Oliver Decision Engine could not score the day.");
        if (!controller.signal.aborted) {
          setEngineDay(data as EngineDay);
          setEngineState("complete");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setEngineError(error instanceof Error ? error.message : "Oliver Decision Engine failed.");
          setEngineState("error");
        }
      });

    return () => controller.abort();
  }, [date, state.selectedTimeframe, state.modelSettings.version]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runNexusDayReview() {
    if (!validDate(date) || manualAiState === "loading") return;
    setManualAiState("loading");
    setManualAiError("");

    let working = ensureCasesForDate(stateRef.current, date);
    stateRef.current = working;
    onChange(working);

    try {
      const completed: Array<{ symbol: OliverSymbol; review: OliverAiReview }> = [];

      for (const symbol of symbols) {
        const target = working.cases.find((item) => item.sessionDate === date && item.symbol === symbol);
        if (!target) throw new Error(`Missing ${symbol} case for ${date}.`);

        if (freshAi(target.aiReview, working.modelSettings, working.selectedTimeframe)) {
          completed.push({ symbol, review: target.aiReview as OliverAiReview });
          continue;
        }

        working = updateCase(working, target.caseId, { aiReviewState: "loading", aiReviewError: "" });
        stateRef.current = working;
        onChange(working);

        const query = new URLSearchParams({
          symbol,
          interval: working.selectedTimeframe,
          date,
          phase: "decision",
        });
        addSettings(query, working.modelSettings);

        const marketResponse = await fetch(`/api/oliver_market?${query}`);
        const market = await marketResponse.json();
        if (!marketResponse.ok) throw new Error(market.error || `Market evidence failed for ${symbol}.`);

        const reviewResponse = await fetch("/api/oliver-ai-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol,
            sessionDate: market.sessionDate || date,
            timeframe: working.selectedTimeframe,
            decisionTime: market.decisionTime ?? null,
            modelVersion: working.modelSettings.version,
            parameters: market.parameters ?? {},
            candidate: market.candidate ?? {},
            bars: Array.isArray(market.bars) ? market.bars.slice(-500) : [],
            manual: true,
          }),
        });
        const result = await reviewResponse.json();
        if (!reviewResponse.ok) throw new Error(result.error || `Nexus review failed for ${symbol}.`);

        const review = result.review as OliverAiReview;
        working = stateRef.current;
        working = updateCase(working, target.caseId, {
          aiReviewState: "complete",
          aiReviewError: "",
          aiReview: review,
        });
        stateRef.current = working;
        onChange(working);
        completed.push({ symbol, review });
      }

      working = stateRef.current;
      working = setDay(working, date, { aiRankState: "loading", aiRankError: "" });
      stateRef.current = working;
      onChange(working);

      const rankResponse = await fetch("/api/oliver-ai-rank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionDate: date,
          timeframe: working.selectedTimeframe,
          modelVersion: working.modelSettings.version,
          reviews: completed,
          manual: true,
        }),
      });
      const rankJson = await rankResponse.json();
      if (!rankResponse.ok) throw new Error(rankJson.error || "Nexus could not rank the day.");
      const rank = rankJson.ranking as RankPayload;

      working = stateRef.current;
      working = setDay(working, date, {
        aiRankState: "complete",
        aiRankError: "",
        aiBestSymbol: rank.bestSymbol === "NO_TRADE" ? "" : rank.bestSymbol,
        aiSecondSymbol: rank.secondSymbol === "NO_TRADE" ? "" : rank.secondSymbol,
        aiNoTradeDay: rank.noTradeDay,
        aiWinnerReason: rank.winnerReason,
        aiSeparationReason: rank.separationReason,
        aiConfidence: rank.confidence,
        aiRankGeneratedAt: rank.generatedAt,
        aiRankModelVersion: rank.modelVersion,
        aiRankTimeframe: rank.timeframe,
      });
      stateRef.current = working;
      onChange(working);
      setManualAiState("complete");
    } catch (error) {
      working = stateRef.current;
      for (const item of working.cases.filter((caseItem) => caseItem.sessionDate === date && caseItem.aiReviewState === "loading")) {
        working = updateCase(working, item.caseId, {
          aiReviewState: "error",
          aiReviewError: error instanceof Error ? error.message : "Nexus review failed.",
        });
      }
      working = setDay(working, date, {
        aiRankState: "error",
        aiRankError: error instanceof Error ? error.message : "Nexus could not rank the day.",
      });
      stateRef.current = working;
      onChange(working);
      setManualAiError(error instanceof Error ? error.message : "Nexus review failed.");
      setManualAiState("error");
    }
  }

  function agreeWithAi() {
    const working = stateRef.current;
    const target = selectedCase(working);
    const ai = target.aiReview;
    if (!ai || target.locked || !freshAi(ai, working.modelSettings, working.selectedTimeframe)) return;

    const next = updateCase(working, target.caseId, {
      reviewState: "in_progress",
      stateClassification: ai.stateClassification,
      locationClassification: ai.locationClassification,
      boxStatus: ai.boxStatus,
      stateQuality: ai.stateQuality,
      locationQuality: ai.locationQuality,
      premarketContextQuality: ai.premarketContextQuality,
      spaceQuality: ai.spaceQuality,
      riskQuality: ai.riskQuality,
      overallQuality: ai.overallQuality,
      structureBoxRelevant: ai.structureBoxRelevant,
      boxCleared: ai.boxCleared,
      trendAlignment: ai.trendAlignment,
      volumeConfirmation: ai.volumeConfirmation,
      priorCloseRelevant: ai.priorCloseRelevant,
      priorRangeRelevant: ai.priorRangeRelevant,
      priorHighLowRelevant: ai.priorHighLowRelevant,
      sma20Relevant: ai.sma20Relevant,
      sma200Relevant: ai.sma200Relevant,
      powerTypes: [...ai.powerTypes],
      oliverInterest: ai.oliverInterest,
      wouldTrade: ai.wouldTrade,
      direction: ai.direction,
      setupType: ai.setupType,
      overallGrade: ai.overallGrade,
      confidence: ai.confidence,
      strongestReason: ai.strongestReason,
      biggestConcern: ai.biggestConcern,
    });
    stateRef.current = next;
    onChange(next);
  }

  function selectSymbol(symbol: OliverSymbol) {
    let next = ensureCasesForDate(stateRef.current, date);
    const target = next.cases.find((item) => item.sessionDate === date && item.symbol === symbol);
    if (!target) return;
    next = { ...next, selectedCaseId: target.caseId, marketSnapshot: null, updatedAt: new Date().toISOString() };
    stateRef.current = next;
    onChange(next);
  }

  function chooseHuman(symbol: OliverSymbol) {
    let next = stateRef.current;
    const currentDay = dayFor(next, date);
    const removing = currentDay.bestSymbol === symbol;
    next = setDay(next, date, {
      bestSymbol: removing ? "" : symbol,
      noTradeDay: false,
      secondSymbol: currentDay.secondSymbol === symbol ? "" : currentDay.secondSymbol,
    });
    stateRef.current = next;
    onChange(next);
  }

  function setHumanSecond(symbol: string) {
    let next = stateRef.current;
    const currentDay = dayFor(next, date);
    next = setDay(next, date, {
      secondSymbol: symbol as OliverSymbol | "",
      noTradeDay: false,
      bestSymbol: currentDay.bestSymbol === symbol ? "" : currentDay.bestSymbol,
    });
    stateRef.current = next;
    onChange(next);
  }

  function toggleHumanNoTrade() {
    let next = stateRef.current;
    const currentDay = dayFor(next, date);
    next = setDay(next, date, {
      noTradeDay: !currentDay.noTradeDay,
      bestSymbol: "",
      secondSymbol: "",
    });
    stateRef.current = next;
    onChange(next);
  }

  const engineMap = new Map((engineDay?.reviews ?? []).map((item) => [item.symbol, item.review]));
  const currentAiFresh = freshAi(current.aiReview, state.modelSettings, state.selectedTimeframe);

  const starMatrix = state.activeTab === "guidedReview" && validDate(date) ? (
    <section className={styles.starMatrix}>
      <div className={styles.starMatrixHead}>
        <div><span>DAILY PICKS</span><strong>{date}</strong></div>
        <div><span>Engine</span><span>Human</span><span>Nexus</span></div>
      </div>
      <div className={styles.starMatrixGrid}>
        {symbols.map((symbol) => {
          const caseItem = state.cases.find((item) => item.sessionDate === date && item.symbol === symbol);
          const selected = current.symbol === symbol;
          const humanBest = day.bestSymbol === symbol && !day.noTradeDay;
          const humanSecond = day.secondSymbol === symbol && !day.noTradeDay;
          const aiBest = aiRankFresh && day.aiBestSymbol === symbol && !day.aiNoTradeDay;
          const aiSecond = aiRankFresh && day.aiSecondSymbol === symbol && !day.aiNoTradeDay;
          const engineBest = engineDay?.ranking.bestSymbol === symbol && !engineDay.ranking.noTradeDay;
          const engineSecond = engineDay?.ranking.secondSymbol === symbol && !engineDay.ranking.noTradeDay;
          const engineReview = engineMap.get(symbol);
          return (
            <div className={`${styles.starMatrixRow} ${selected ? styles.selected : ""}`} key={symbol}>
              <button className={styles.symbolButton} onClick={() => selectSymbol(symbol)}>
                <strong>{symbol}</strong><span>{MAG7[symbol]}</span>
                <i>{caseItem?.locked ? "Locked" : engineReview ? `Engine ${engineReview.overallGrade ?? "—"} · ${Math.round(engineReview.score ?? 0)}` : "Engine pending"}</i>
              </button>
              <span title="Oliver Decision Engine ranking" className={`${styles.star} ${engineBest ? styles.aiStarOn : ""}`}>{engineSecond && !engineBest ? <b>2</b> : engineBest ? "★" : "☆"}</span>
              <button title="Human daily winner" className={`${styles.star} ${humanBest ? styles.starOn : ""}`} onClick={() => chooseHuman(symbol)}>{humanSecond && !humanBest ? <b>2</b> : humanBest ? "★" : "☆"}</button>
              <span title="Nexus daily winner" className={`${styles.star} ${aiBest ? styles.aiStarOn : ""}`}>{aiSecond && !aiBest ? <b>2</b> : aiBest ? "★" : "☆"}</span>
            </div>
          );
        })}
      </div>
      <div className={styles.starMatrixFooter}>
        <span>Engine {engineState === "complete" ? "7/7" : engineState === "loading" ? "scoring…" : "unavailable"}</span>
        <span>Nexus saved {freshCount}/7</span>
        <button disabled={manualAiState === "loading" || !validDate(date)} onClick={() => void runNexusDayReview()}>
          {manualAiState === "loading" ? "Running Nexus review…" : freshCount === 7 && aiRankFresh ? "Nexus review saved · run only if needed" : "Run Nexus review for this day"}
        </button>
        {currentAiFresh && <button disabled={current.locked} title="Copy the saved Nexus assessment into Michael's editable fields" onClick={agreeWithAi}>I agree with AI</button>}
        {(manualAiError || engineError) && <span>{manualAiError || engineError}</span>}
      </div>
    </section>
  ) : null;

  return (
    <div className={`${styles.wrapper} ${state.activeTab === "dailyRanking" ? styles.rankMode : ""}`}>
      {starMatrix}
      {state.activeTab === "dailyRanking" && validDate(date) && (
        <section className={styles.dailyPanel}>
          <div className={styles.dailyTitle}>
            <div><span>DAILY RANKING · {date}</span><h2>Oliver Engine vs Michael vs Nexus</h2></div>
            <div><span>Nexus saved</span><strong>{freshCount}/7</strong></div>
          </div>
          <div className={styles.rankColumns}>
            <div>
              <h3>Oliver Decision Engine</h3>
              {engineDay ? <>
                <div className={styles.rankPick}><span>#1</span><strong>{engineDay.ranking.noTradeDay ? "NO TRADE" : engineDay.ranking.bestSymbol}</strong></div>
                <div className={styles.rankPick}><span>#2</span><strong>{engineDay.ranking.noTradeDay ? "—" : engineDay.ranking.secondSymbol}</strong></div>
                <p>{engineDay.ranking.winnerReason}</p><p className={styles.muted}>{engineDay.ranking.separationReason}</p>
              </> : <p>{engineState === "loading" ? "Scoring all seven cases…" : engineError || "Engine ranking unavailable."}</p>}
            </div>
            <div>
              <h3>Michael</h3>
              <div className={styles.rankPick}><span>#1</span><strong>{day.noTradeDay ? "NO TRADE" : day.bestSymbol || "—"}</strong></div>
              <label><span>#2</span><select disabled={day.noTradeDay} value={day.secondSymbol} onChange={(event) => setHumanSecond(event.target.value)}><option value="">—</option>{symbols.filter((symbol) => symbol !== day.bestSymbol).map((symbol) => <option key={symbol}>{symbol}</option>)}</select></label>
              <button className={day.noTradeDay ? styles.activeButton : ""} onClick={toggleHumanNoTrade}>{day.noTradeDay ? "✓ Human: No trade" : "Mark human no-trade day"}</button>
            </div>
            <div>
              <h3>Nexus · optional</h3>
              {aiRankFresh ? <>
                <div className={styles.rankPick}><span>#1</span><strong>{day.aiNoTradeDay ? "NO TRADE" : day.aiBestSymbol || "—"}</strong></div>
                <div className={styles.rankPick}><span>#2</span><strong>{day.aiNoTradeDay ? "—" : day.aiSecondSymbol || "—"}</strong></div>
                <p>{day.aiWinnerReason}</p><p className={styles.muted}>{day.aiSeparationReason}</p>
              </> : <>
                <p>No OpenAI call is made automatically. Run Nexus manually only when its independent judgment is useful.</p>
                <button disabled={manualAiState === "loading"} onClick={() => void runNexusDayReview()}>{manualAiState === "loading" ? "Running…" : "Run Nexus review for this day"}</button>
              </>}
            </div>
          </div>
        </section>
      )}
      <DigitalOliverWorkspace state={state} onChange={onChange} />
    </div>
  );
}
