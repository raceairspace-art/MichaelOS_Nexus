export const MAG7 = {
  AAPL: "Apple", MSFT: "Microsoft", NVDA: "NVIDIA", AMZN: "Amazon",
  META: "Meta", GOOGL: "Alphabet", TSLA: "Tesla",
} as const;

export type OliverSymbol = keyof typeof MAG7;
export type OliverTab = "guidedReview" | "modelSettings" | "dailyRanking" | "evidenceLibrary" | "statistics" | "export" | "rulebook";
export type ReviewState = "unreviewed" | "in_progress" | "complete";
export type AiReviewState = "idle" | "loading" | "complete" | "error";

export type OliverModelSettings = {
  version: string;
  fastSma: number;
  slowSma: number;
  atrLen: number;
  slopeLookback: number;
  narrowSepAtr: number;
  wideSepAtr: number;
  trendSlopeAtr: number;
  locationAtr: number;
  elephantLookback: number;
  elephantRangeMult: number;
  elephantBodyRatio: number;
  elephantStrongClose: number;
  elephantMaxOppositeWick: number;
  openingWindowMinutes: number;
  premarketStartHour: number;
  structureLookback: number;
  minSpaceR: number;
};

export const DEFAULT_MODEL_SETTINGS: OliverModelSettings = {
  version: "Oliver v0.1",
  fastSma: 20,
  slowSma: 200,
  atrLen: 14,
  slopeLookback: 5,
  narrowSepAtr: 0.5,
  wideSepAtr: 2.0,
  trendSlopeAtr: 0.08,
  locationAtr: 0.6,
  elephantLookback: 20,
  elephantRangeMult: 1.5,
  elephantBodyRatio: 0.7,
  elephantStrongClose: 0.75,
  elephantMaxOppositeWick: 0.2,
  openingWindowMinutes: 90,
  premarketStartHour: 4,
  structureLookback: 12,
  minSpaceR: 1.5,
};

export type OliverMarketBar = {
  time: string; open: number; high: number; low: number; close: number; volume: number | null;
  sMA20: number | null; sMA200: number | null; boxHigh: number | null; boxLow: number | null;
  bullElephant: boolean; bearElephant: boolean; premarket: boolean;
};

export type OliverEngineCandidate = {
  has_data: boolean; has_elephant?: boolean; score?: number | null; direction?: string; event_time?: string | null;
  state?: string; location_ok?: boolean; box_high?: number | null; box_low?: number | null; box_cleared?: boolean;
  inside_box?: boolean; space_r?: number | null; next_obstacle?: number | null; entry?: number | null;
  event_low?: number | null; event_high?: number | null; prev_close?: number | null; prev_high?: number | null;
  prev_low?: number | null; prev_late_high?: number | null; prev_late_low?: number | null;
  premarket_high?: number | null; premarket_low?: number | null; reason?: string;
};

export type OliverMarketSnapshot = {
  source: string; symbol: OliverSymbol; company: string; interval: "1m" | "5m" | "15m";
  sessionDate: string; caseRef: string; availableSessions: string[]; candidate: OliverEngineCandidate;
  phase: "decision" | "outcome"; decisionTime: string | null;
  outcome: Record<string, number | boolean | null> | null; bars: OliverMarketBar[]; parameters: Record<string, number>;
  cache: string; loadedAt: string;
};

export type OliverAiReview = {
  generatedAt: string;
  model: string;
  modelVersion: string;
  timeframe: "1m" | "5m" | "15m";
  decisionTime: string | null;
  stateClassification: string;
  locationClassification: string;
  boxStatus: string;
  stateQuality: number;
  locationQuality: number;
  premarketContextQuality: number;
  spaceQuality: number;
  riskQuality: number;
  overallQuality: number;
  structureBoxRelevant: boolean;
  boxCleared: boolean;
  trendAlignment: boolean;
  volumeConfirmation: boolean;
  priorCloseRelevant: boolean;
  priorRangeRelevant: boolean;
  priorHighLowRelevant: boolean;
  sma20Relevant: boolean;
  sma200Relevant: boolean;
  powerTypes: string[];
  oliverInterest: "Yes" | "Maybe" | "No";
  wouldTrade: "Yes" | "Maybe" | "No";
  direction: "Long" | "Short" | "None / unclear";
  setupType: string;
  overallGrade: "A+" | "A" | "B" | "C" | "Reject";
  confidence: number;
  strongestReason: string;
  biggestConcern: string;
  rationale: {
    state: string; location: string; structure: string; space: string; power: string; risk: string; overall: string;
  };
};

export type HumanAuditEntry = {
  at: string;
  changes: Record<string, { from: unknown; to: unknown }>;
};

export type CaseReview = {
  caseId: string; caseRef: string; sessionDate: string; symbol: OliverSymbol;
  reviewState: ReviewState;
  oliverInterest: "Unreviewed" | "Yes" | "Maybe" | "No"; wouldTrade: "Unreviewed" | "Yes" | "Maybe" | "No";
  direction: "Long" | "Short" | "None / unclear"; confidence: number; setupType: string;
  stateQuality: number; locationQuality: number; premarketContextQuality: number; spaceQuality: number;
  riskQuality: number; overallQuality: number; marketBias: string; gapDirection: string; trendAlignment: boolean;
  volumeConfirmation: boolean; priorCloseRelevant: boolean; priorRangeRelevant: boolean; priorHighLowRelevant: boolean;
  sma20Relevant: boolean; sma200Relevant: boolean; strongestReason: string; biggestConcern: string; humanRank: number | null;
  locked: boolean; lockedAt: string | null; stateClassification: string; locationClassification: string; boxStatus: string;
  structureBoxRelevant: boolean; boxCleared: boolean; powerTypes: string[]; riskStatus: string;
  overallGrade: "A+" | "A" | "B" | "C" | "Reject"; michaelAnalysis: string; chatgptAnalysis: string;
  combinedConclusion: string; lesson: string; outcomeFollowthrough: string;
  aiReviewState: AiReviewState; aiReviewError: string; aiReview: OliverAiReview | null;
  humanAuditTrail: HumanAuditEntry[];
  outcomeRevealed: boolean; replayCompleted: boolean; revealedOutcome: Record<string, number | boolean | null> | null;
};

export type DayReview = { sessionDate: string; bestSymbol: OliverSymbol | ""; secondSymbol: OliverSymbol | ""; noTradeDay: boolean; daySummary: string; winnerReason: string; separationReason: string; confidence: number; locked: boolean };
export type WeekReview = { weekId: string; bestTradeDate: string; bestTradeSymbol: OliverSymbol | ""; bestTradeReason: string; weeklySummary: string; bestPerformingDate: string; bestPerformingSymbol: OliverSymbol | ""; falsePositiveCaseId: string; missedOpportunityCaseId: string; weeklyLesson: string; locked: boolean };

export type DigitalOliverWorkspaceState = {
  workspaceId: "digital-oliver"; workspaceName: "Digital Oliver"; activeTab: OliverTab;
  selectedCaseId: string; selectedTimeframe: "5m" | "15m" | "1m"; fullDay: boolean;
  selectedDate: string; availableSessions: string[]; weekId: string; cases: CaseReview[]; days: DayReview[];
  week: WeekReview; modelSettings: OliverModelSettings; marketSnapshot: OliverMarketSnapshot | null; updatedAt: string;
};

export const OLIVER_RULEBOOK_SUMMARY = {
  purpose: "Persistent research workbench for reconstructing, reviewing, and statistically testing Oliver Velez's recurring trading methodology.",
  hierarchy: ["State", "Location", "Structure Box", "Space", "Power", "Risk"] as const,
  evidenceDiscipline: "Only candles available at the opening-window decision point are supplied before lock. Human and AI assessments are kept separate. Outcome candles and statistics are revealed only after lock.",
  chartEvidence: ["20 SMA / 200 SMA state and trend context", "prior close, prior high/low, prior late-session range", "premarket high/low and market-open context", "engine-suggested Structure Box", "candidate entry and structural stop", "Space in R to nearest known obstacle", "Elephant candidates and volume"],
  modelScope: { encoded: ["State from the 20/200 relationship", "basic 20/200 location", "Elephant Bar power", "engine-suggested Structure Box from prior rolling structure", "box-clear status", "structural event-bar risk", "Space in R to the nearest known obstacle", "opening-window decision replay", "separate human and AI assessments"], planned: ["calibrated Structure Box", "refined Space/obstacle definitions", "Bull/Bear 180", "power tails", "color-change adds", "position-management rules", "rule-version comparisons"] },
};

const symbols = Object.keys(MAG7) as OliverSymbol[];

export function blankCase(symbol: OliverSymbol, sessionDate = "Market data not connected"): CaseReview {
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(sessionDate) ? sessionDate.replaceAll("-", "") : "WEB";
  return {
    caseId:`${sessionDate}-${symbol}`, caseRef:`DO-${dateKey}-${symbol}`, sessionDate, symbol,
    reviewState:"unreviewed", oliverInterest:"Unreviewed", wouldTrade:"Unreviewed", direction:"None / unclear",
    confidence:3, setupType:"Unclassified", stateQuality:3, locationQuality:3, premarketContextQuality:3,
    spaceQuality:3, riskQuality:3, overallQuality:3, marketBias:"Unclear", gapDirection:"Not important / unclear",
    trendAlignment:false, volumeConfirmation:false, priorCloseRelevant:false, priorRangeRelevant:false,
    priorHighLowRelevant:false, sma20Relevant:false, sma200Relevant:false, strongestReason:"", biggestConcern:"",
    humanRank:null, locked:false, lockedAt:null, stateClassification:"Unclear", locationClassification:"Neutral / unclear",
    boxStatus:"Box unclear", structureBoxRelevant:false, boxCleared:false, powerTypes:[], riskStatus:"Stop unclear",
    overallGrade:"B", michaelAnalysis:"", chatgptAnalysis:"", combinedConclusion:"", lesson:"",
    outcomeFollowthrough:"Unreviewed", aiReviewState:"idle", aiReviewError:"", aiReview:null, humanAuditTrail:[],
    outcomeRevealed:false, replayCompleted:false, revealedOutcome:null,
  };
}

export const initialDigitalOliverState: DigitalOliverWorkspaceState = {
  workspaceId:"digital-oliver", workspaceName:"Digital Oliver", activeTab:"guidedReview",
  selectedCaseId:"Market data not connected-AAPL", selectedTimeframe:"5m", fullDay:false,
  selectedDate:"", availableSessions:[], weekId:"web-migration", cases:symbols.map(s=>blankCase(s)), days:[],
  week:{ weekId:"web-migration", bestTradeDate:"", bestTradeSymbol:"", bestTradeReason:"", weeklySummary:"", bestPerformingDate:"", bestPerformingSymbol:"", falsePositiveCaseId:"", missedOpportunityCaseId:"", weeklyLesson:"", locked:false },
  modelSettings:{...DEFAULT_MODEL_SETTINGS}, marketSnapshot:null, updatedAt:new Date(0).toISOString(),
};

function migrateCase(raw: Partial<CaseReview>): CaseReview {
  const symbol = (raw.symbol ?? "AAPL") as OliverSymbol;
  const date = raw.sessionDate ?? "Market data not connected";
  return {
    ...blankCase(symbol, date),
    ...raw,
    aiReview: raw.aiReview ?? null,
    aiReviewState: raw.aiReview ? "complete" : (raw.aiReviewState ?? "idle"),
    aiReviewError: raw.aiReviewError ?? "",
    humanAuditTrail: raw.humanAuditTrail ?? [],
    lockedAt: raw.lockedAt ?? null,
    outcomeRevealed: raw.outcomeRevealed ?? false,
    replayCompleted: raw.replayCompleted ?? false,
    revealedOutcome: raw.revealedOutcome ?? null,
  };
}

export function migrateWorkspaceState(raw: Partial<DigitalOliverWorkspaceState>): DigitalOliverWorkspaceState {
  const snapshot = raw.marketSnapshot;
  return {
    ...initialDigitalOliverState,
    ...raw,
    modelSettings: { ...DEFAULT_MODEL_SETTINGS, ...(raw.modelSettings ?? {}) },
    availableSessions: raw.availableSessions ?? [],
    selectedDate: raw.selectedDate ?? "",
    cases: Array.isArray(raw.cases) && raw.cases.length ? raw.cases.map(migrateCase) : initialDigitalOliverState.cases,
    week: { ...initialDigitalOliverState.week, ...(raw.week ?? {}) },
    marketSnapshot: snapshot ? {
      ...snapshot,
      phase: snapshot.phase ?? "decision",
      decisionTime: snapshot.decisionTime ?? snapshot.candidate?.event_time ?? null,
      outcome: snapshot.outcome ?? null,
    } : null,
  };
}

export function ensureCasesForDate(state: DigitalOliverWorkspaceState, date: string): DigitalOliverWorkspaceState {
  const existing = new Map(state.cases.map(c => [`${c.sessionDate}|${c.symbol}`, c]));
  const additions = symbols.filter(s => !existing.has(`${date}|${s}`)).map(s => blankCase(s, date));
  return additions.length ? { ...state, cases:[...state.cases, ...additions], updatedAt:new Date().toISOString() } : state;
}

export function casesForSelectedDate(state: DigitalOliverWorkspaceState) {
  const dated = state.cases.filter(c => c.sessionDate === state.selectedDate);
  return dated.length ? dated : symbols.map(s => blankCase(s, state.selectedDate || "Market data not connected"));
}

export function selectedCase(state: DigitalOliverWorkspaceState) {
  return state.cases.find(i=>i.caseId===state.selectedCaseId) ?? state.cases.find(i=>i.sessionDate===state.selectedDate) ?? state.cases[0];
}

const auditFields = new Set<keyof CaseReview>([
  "stateClassification","locationClassification","boxStatus","stateQuality","locationQuality","premarketContextQuality",
  "spaceQuality","riskQuality","overallQuality","structureBoxRelevant","boxCleared","trendAlignment","volumeConfirmation",
  "priorCloseRelevant","priorRangeRelevant","priorHighLowRelevant","sma20Relevant","sma200Relevant","powerTypes","oliverInterest",
  "wouldTrade","direction","confidence","setupType","overallGrade","strongestReason","biggestConcern","michaelAnalysis","combinedConclusion","lesson",
]);

export function updateCase(state: DigitalOliverWorkspaceState, caseId: string, patch: Partial<CaseReview>): DigitalOliverWorkspaceState {
  return {
    ...state,
    updatedAt:new Date().toISOString(),
    cases:state.cases.map(item=>{
      if(item.caseId!==caseId) return item;
      const changes: HumanAuditEntry["changes"] = {};
      if(!item.locked){
        for(const [key,to] of Object.entries(patch) as Array<[keyof CaseReview, CaseReview[keyof CaseReview]]>){
          if(auditFields.has(key) && JSON.stringify(item[key])!==JSON.stringify(to)) changes[String(key)]={from:item[key],to};
        }
      }
      const audit = Object.keys(changes).length ? [...item.humanAuditTrail,{at:new Date().toISOString(),changes}] : item.humanAuditTrail;
      return {...item,...patch,humanAuditTrail:audit};
    }),
  };
}

export function weekKey(date: string) {
  const d = new Date(`${date}T12:00:00`); const day = d.getDay(); const delta = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate()+delta); return d.toISOString().slice(0,10);
}

export function groupSessionsByWeek(sessions: string[]) {
  const groups = new Map<string,string[]>();
  [...sessions].sort().forEach(date => { const key=weekKey(date); groups.set(key,[...(groups.get(key)??[]),date]); });
  return [...groups.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
}
