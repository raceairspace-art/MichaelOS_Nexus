import { z } from "zod";

export const maxDuration = 60;

const nullableNumber = z.number().finite().nullable().optional().default(null);
const optionalBoolean = z.boolean().optional().default(false);

const barSchema = z.object({
  time: z.string(),
  open: z.number().finite(),
  high: z.number().finite(),
  low: z.number().finite(),
  close: z.number().finite(),
  volume: nullableNumber,
  sMA20: nullableNumber,
  sMA200: nullableNumber,
  boxHigh: nullableNumber,
  boxLow: nullableNumber,
  bullElephant: optionalBoolean,
  bearElephant: optionalBoolean,
  premarket: optionalBoolean,
}).passthrough();

const requestSchema = z.object({
  symbol: z.string().min(1).max(8),
  sessionDate: z.string(),
  timeframe: z.enum(["1m", "5m", "15m"]),
  decisionTime: z.string().nullable().optional().default(null),
  modelVersion: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()).optional().default({}),
  candidate: z.record(z.string(), z.unknown()).optional().default({}),
  bars: z.array(barSchema).min(1).max(600),
}).passthrough();

const reviewSchema = z.object({
  stateClassification: z.string(),
  locationClassification: z.string(),
  boxStatus: z.string(),
  stateQuality: z.number().int().min(1).max(5),
  locationQuality: z.number().int().min(1).max(5),
  premarketContextQuality: z.number().int().min(1).max(5),
  spaceQuality: z.number().int().min(1).max(5),
  riskQuality: z.number().int().min(1).max(5),
  overallQuality: z.number().int().min(1).max(5),
  structureBoxRelevant: z.boolean(),
  boxCleared: z.boolean(),
  trendAlignment: z.boolean(),
  volumeConfirmation: z.boolean(),
  priorCloseRelevant: z.boolean(),
  priorRangeRelevant: z.boolean(),
  priorHighLowRelevant: z.boolean(),
  sma20Relevant: z.boolean(),
  sma200Relevant: z.boolean(),
  powerTypes: z.array(z.string()),
  oliverInterest: z.enum(["Yes", "Maybe", "No"]),
  wouldTrade: z.enum(["Yes", "Maybe", "No"]),
  direction: z.enum(["Long", "Short", "None / unclear"]),
  setupType: z.string(),
  overallGrade: z.enum(["A+", "A", "B", "C", "Reject"]),
  confidence: z.number().int().min(1).max(5),
  strongestReason: z.string(),
  biggestConcern: z.string(),
  rationale: z.object({
    state: z.string(), location: z.string(), structure: z.string(), space: z.string(),
    power: z.string(), risk: z.string(), overall: z.string(),
  }),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "stateClassification","locationClassification","boxStatus","stateQuality","locationQuality",
    "premarketContextQuality","spaceQuality","riskQuality","overallQuality","structureBoxRelevant",
    "boxCleared","trendAlignment","volumeConfirmation","priorCloseRelevant","priorRangeRelevant",
    "priorHighLowRelevant","sma20Relevant","sma200Relevant","powerTypes","oliverInterest","wouldTrade",
    "direction","setupType","overallGrade","confidence","strongestReason","biggestConcern","rationale",
  ],
  properties: {
    stateClassification: { type: "string" },
    locationClassification: { type: "string" },
    boxStatus: { type: "string" },
    stateQuality: { type: "integer", minimum: 1, maximum: 5 },
    locationQuality: { type: "integer", minimum: 1, maximum: 5 },
    premarketContextQuality: { type: "integer", minimum: 1, maximum: 5 },
    spaceQuality: { type: "integer", minimum: 1, maximum: 5 },
    riskQuality: { type: "integer", minimum: 1, maximum: 5 },
    overallQuality: { type: "integer", minimum: 1, maximum: 5 },
    structureBoxRelevant: { type: "boolean" },
    boxCleared: { type: "boolean" },
    trendAlignment: { type: "boolean" },
    volumeConfirmation: { type: "boolean" },
    priorCloseRelevant: { type: "boolean" },
    priorRangeRelevant: { type: "boolean" },
    priorHighLowRelevant: { type: "boolean" },
    sma20Relevant: { type: "boolean" },
    sma200Relevant: { type: "boolean" },
    powerTypes: { type: "array", items: { type: "string" } },
    oliverInterest: { type: "string", enum: ["Yes", "Maybe", "No"] },
    wouldTrade: { type: "string", enum: ["Yes", "Maybe", "No"] },
    direction: { type: "string", enum: ["Long", "Short", "None / unclear"] },
    setupType: { type: "string" },
    overallGrade: { type: "string", enum: ["A+", "A", "B", "C", "Reject"] },
    confidence: { type: "integer", minimum: 1, maximum: 5 },
    strongestReason: { type: "string" },
    biggestConcern: { type: "string" },
    rationale: {
      type: "object", additionalProperties: false,
      required: ["state","location","structure","space","power","risk","overall"],
      properties: {
        state: { type: "string" }, location: { type: "string" }, structure: { type: "string" },
        space: { type: "string" }, power: { type: "string" }, risk: { type: "string" }, overall: { type: "string" },
      },
    },
  },
} as const;

function outputText(data: any) {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output ?? [])
    .flatMap((item: any) => item.content ?? [])
    .map((part: any) => part.text ?? "")
    .join("");
}

function validationSummary(error: z.ZodError) {
  return error.issues.slice(0, 5).map(issue => `${issue.path.join(".") || "payload"}: ${issue.message}`).join("; ");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      const detail = validationSummary(parsed.error);
      console.error("Oliver decision snapshot rejected", detail, body && typeof body === "object" ? Object.keys(body) : typeof body);
      return Response.json({ error: `Oliver decision snapshot validation failed: ${detail}` }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return Response.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });

    const input = parsed.data;
    const recentBars = input.bars.slice(-80);
    const model = process.env.OPENAI_OLIVER_MODEL || "gpt-5-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "minimal" },
        max_output_tokens: 2000,
        instructions: [
          "You are Nexus acting as the independent AI reviewer inside Digital Oliver.",
          "Evaluate only the supplied decision-time evidence. Future candles and outcome statistics are intentionally unavailable.",
          "Use the Oliver hierarchy: State → Location → Structure Box → Space → Power → Risk.",
          "The Python engine facts are evidence, not a command. Make your own preliminary judgment, but do not invent levels or candles.",
          "Oliver's practical trading behavior is opening-window centric; weigh setups that are actionable near the market open more heavily than hypothetical later opportunities.",
          "Score qualities from 1 (poor) to 5 (excellent). Be willing to say No/Reject when the setup is weak.",
          "Keep each rationale concise: one short sentence per category.",
          "Your assessment is frozen once returned; explanations should make it easy for Michael to ask why you scored a criterion the way you did.",
        ].join("\n"),
        input: JSON.stringify({
          symbol: input.symbol,
          sessionDate: input.sessionDate,
          timeframe: input.timeframe,
          decisionTime: input.decisionTime,
          modelVersion: input.modelVersion,
          parameters: input.parameters,
          engineCandidate: input.candidate,
          decisionBars: recentBars,
        }),
        text: {
          format: {
            type: "json_schema",
            name: "digital_oliver_ai_review",
            strict: true,
            schema: jsonSchema,
          },
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Oliver AI review failed", response.status, detail);
      return Response.json({ error: `Nexus automatic Oliver review failed (${response.status}): ${detail.slice(0, 500)}` }, { status: 502 });
    }

    const data = await response.json();
    const text = outputText(data);
    let json: unknown;
    try { json = JSON.parse(text); } catch { return Response.json({ error: `Nexus returned an unreadable Oliver review: ${text.slice(0, 500)}` }, { status: 502 }); }
    const review = reviewSchema.safeParse(json);
    if (!review.success) {
      console.error("Oliver AI review schema mismatch", review.error.flatten());
      return Response.json({ error: `Nexus returned an incomplete Oliver review: ${validationSummary(review.error)}` }, { status: 502 });
    }

    return Response.json({
      review: {
        ...review.data,
        generatedAt: new Date().toISOString(),
        model: data.model || model,
        modelVersion: input.modelVersion,
        timeframe: input.timeframe,
        decisionTime: input.decisionTime,
      },
    });
  } catch (error) {
    console.error("Oliver AI review route failed", error);
    return Response.json({ error: error instanceof Error ? `Nexus Oliver review failed: ${error.message}` : "Nexus could not complete the automatic Oliver review." }, { status: 500 });
  }
}
