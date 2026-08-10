export const MAG7 = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "NVIDIA",
  AMZN: "Amazon",
  META: "Meta",
  GOOGL: "Alphabet",
  TSLA: "Tesla",
} as const;

export type OliverSymbol = keyof typeof MAG7;
export type OliverTab = "guidedReview" | "dailyRanking" | "evidenceLibrary" | "statistics" | "export" | "rulebook";

export type CaseReview = {
  caseId: string;
  caseRef: string;
  sessionDate: string;
  symbol: OliverSymbol;
  reviewState: "unreviewed" | "in_progress" | "complete";
  oliverInterest: "Unreviewed" | "Yes" | "Maybe" | "No";
  wouldTrade: "Unreviewed" | "Yes" | "Maybe" | "No";
  direction: "Long" | "Short" | "None / unclear";
  confidence: number;
  setupType: string;
  stateQuality: number;
  locationQuality: number;
  premarketContextQuality: number;
  spaceQuality: number;
  riskQuality: number;
  overallQuality: number;
  marketBias: string;
  gapDirection: string;
  trendAlignment: boolean;
  volumeConfirmation: boolean;
  priorCloseRelevant: boolean;
  priorRangeRelevant: boolean;
  priorHighLowRelevant: boolean;
  sma20Relevant: boolean;
  sma200Relevant: boolean;
  strongestReason: string;
  biggestConcern: string;
  humanRank: number | null;
  locked: boolean;
  stateClassification: string;
  locationClassification: string;
  boxStatus: string;
  structureBoxRelevant: boolean;
  boxCleared: boolean;
  powerTypes: string[];
  riskStatus: string;
  overallGrade: "A+" | "A" | "B" | "C" | "Reject";
  michaelAnalysis: string;
  chatgptAnalysis: string;
  combinedConclusion: string;
  lesson: string;
  outcomeFollowthrough: string;
};

export type DayReview = {
  sessionDate: string;
  bestSymbol: OliverSymbol | "";
  secondSymbol: OliverSymbol | "";
  noTradeDay: boolean;
  daySummary: string;
  winnerReason: string;
  separationReason: string;
  confidence: number;
  locked: boolean;
};

export type WeekReview = {
  weekId: string;
  bestTradeDate: string;
  bestTradeSymbol: OliverSymbol | "";
  bestTradeReason: string;
  weeklySummary: string;
  bestPerformingDate: string;
  bestPerformingSymbol: OliverSymbol | "";
  falsePositiveCaseId: string;
  missedOpportunityCaseId: string;
  weeklyLesson: string;
  locked: boolean;
};

export type DigitalOliverWorkspaceState = {
  workspaceId: "digital-oliver";
  workspaceName: "Digital Oliver";
  activeTab: OliverTab;
  selectedCaseId: string;
  selectedTimeframe: "5m" | "15m" | "1m";
  fullDay: boolean;
  weekId: string;
  cases: CaseReview[];
  days: DayReview[];
  week: WeekReview;
  updatedAt: string;
};

export const OLIVER_RULEBOOK_SUMMARY = {
  purpose: "Persistent research workbench for reconstructing, reviewing, and statistically testing Oliver Velez's recurring trading methodology.",
  hierarchy: ["State", "Location", "Structure Box", "Space", "Power", "Risk"] as const,
  evidenceDiscipline: "Interpretation is locked before outcome statistics are revealed. Daily rankings are locked before comparing outcomes.",
  chartEvidence: [
    "20 SMA / 200 SMA state and trend context",
    "prior close, prior high/low, prior late-session range",
    "premarket high/low and market-open context",
    "engine-suggested Structure Box",
    "candidate entry and structural stop",
    "Space in R to nearest known obstacle",
    "Elephant candidates and volume",
  ],
  modelScope: {
    encoded: [
      "State from the 20/200 relationship",
      "basic 20/200 location",
      "Elephant Bar power",
      "engine-suggested Structure Box from prior rolling structure",
      "box-clear status",
      "structural event-bar risk",
      "Space in R to the nearest known obstacle",
    ],
    planned: [
      "calibrated Structure Box",
      "refined Space/obstacle definitions",
      "Bull/Bear 180",
      "power tails",
      "color-change adds",
      "position-management rules",
      "rule-version comparisons",
      "true candle-by-candle replay",
    ],
  },
};

const symbols = Object.keys(MAG7) as OliverSymbol[];

function blankCase(symbol: OliverSymbol, index: number): CaseReview {
  const caseId = `migration-${index + 1}-${symbol}`;
  return {
    caseId,
    caseRef: `DO-WEB-${symbol}`,
    sessionDate: "Market data not connected",
    symbol,
    reviewState: "unreviewed",
    oliverInterest: "Unreviewed",
    wouldTrade: "Unreviewed",
    direction: "None / unclear",
    confidence: 3,
    setupType: "Unclassified",
    stateQuality: 3,
    locationQuality: 3,
    premarketContextQuality: 3,
    spaceQuality: 3,
    riskQuality: 3,
    overallQuality: 3,
    marketBias: "Unclear",
    gapDirection: "Not important / unclear",
    trendAlignment: false,
    volumeConfirmation: false,
    priorCloseRelevant: false,
    priorRangeRelevant: false,
    priorHighLowRelevant: false,
    sma20Relevant: false,
    sma200Relevant: false,
    strongestReason: "",
    biggestConcern: "",
    humanRank: null,
    locked: false,
    stateClassification: "Unclear",
    locationClassification: "Neutral / unclear",
    boxStatus: "Box unclear",
    structureBoxRelevant: false,
    boxCleared: false,
    powerTypes: [],
    riskStatus: "Stop unclear",
    overallGrade: "B",
    michaelAnalysis: "",
    chatgptAnalysis: "",
    combinedConclusion: "",
    lesson: "",
    outcomeFollowthrough: "Unreviewed",
  };
}

export const initialDigitalOliverState: DigitalOliverWorkspaceState = {
  workspaceId: "digital-oliver",
  workspaceName: "Digital Oliver",
  activeTab: "guidedReview",
  selectedCaseId: "migration-1-AAPL",
  selectedTimeframe: "5m",
  fullDay: false,
  weekId: "web-migration",
  cases: symbols.map(blankCase),
  days: [],
  week: {
    weekId: "web-migration",
    bestTradeDate: "",
    bestTradeSymbol: "",
    bestTradeReason: "",
    weeklySummary: "",
    bestPerformingDate: "",
    bestPerformingSymbol: "",
    falsePositiveCaseId: "",
    missedOpportunityCaseId: "",
    weeklyLesson: "",
    locked: false,
  },
  updatedAt: new Date(0).toISOString(),
};

export function selectedCase(state: DigitalOliverWorkspaceState) {
  return state.cases.find((item) => item.caseId === state.selectedCaseId) ?? state.cases[0];
}

export function updateCase(
  state: DigitalOliverWorkspaceState,
  caseId: string,
  patch: Partial<CaseReview>,
): DigitalOliverWorkspaceState {
  return {
    ...state,
    updatedAt: new Date().toISOString(),
    cases: state.cases.map((item) => item.caseId === caseId ? { ...item, ...patch } : item),
  };
}
