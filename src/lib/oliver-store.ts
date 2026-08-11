import crypto from "node:crypto";

const DEFAULT_SUPABASE_URL = "https://mutgmifeyabrbjjmjfoq.supabase.co";

function config() {
  const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { url: url.replace(/\/$/, ""), key };
}

export function oliverStoreConfigured() {
  return Boolean(config().key);
}

function headers(extra?: Record<string, string>) {
  const { key } = config();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function request(path: string, init?: RequestInit) {
  const { url, key } = config();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Oliver store ${response.status}: ${detail.slice(0, 500)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function aiReviewKey(input: {sessionDate:string;symbol:string;timeframe:string;modelVersion:string;decisionTime?:string|null}) {
  return ["ai", input.sessionDate, input.symbol, input.timeframe, input.modelVersion, input.decisionTime || "none"].join("|");
}

export function rankingKey(input: {sessionDate:string;timeframe:string;modelVersion:string;source:string}) {
  return [input.source, input.sessionDate, input.timeframe, input.modelVersion].join("|");
}

export async function getAiReview(reviewKey: string, inputHash: string) {
  if (!oliverStoreConfigured()) return null;
  const rows = await request(`oliver_ai_reviews?review_key=eq.${encodeURIComponent(reviewKey)}&input_hash=eq.${encodeURIComponent(inputHash)}&select=review,openai_model,generated_at&limit=1`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function putAiReview(row: Record<string, unknown>) {
  if (!oliverStoreConfigured()) return;
  await request("oliver_ai_reviews?on_conflict=review_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
}

export async function getDailyRanking(key: string, inputHash: string) {
  if (!oliverStoreConfigured()) return null;
  const rows = await request(`oliver_daily_rankings?ranking_key=eq.${encodeURIComponent(key)}&input_hash=eq.${encodeURIComponent(inputHash)}&select=ranking,generated_at&limit=1`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function putDailyRanking(row: Record<string, unknown>) {
  if (!oliverStoreConfigured()) return;
  await request("oliver_daily_rankings?on_conflict=ranking_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
}

export async function getWorkspaceState(workspaceId = "digital-oliver") {
  if (!oliverStoreConfigured()) return null;
  const rows = await request(`oliver_workspace_state?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=state,updated_at&limit=1`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function putWorkspaceState(workspaceId: string, state: unknown) {
  if (!oliverStoreConfigured()) return false;
  await request("oliver_workspace_state?on_conflict=workspace_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ workspace_id: workspaceId, state, updated_at: new Date().toISOString() }),
  });
  return true;
}

export async function putModelVersion(version: string, parameters: unknown) {
  if (!oliverStoreConfigured()) return false;
  await request("oliver_model_versions?on_conflict=version", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ version, parameters, baseline: version === "Oliver v0.1" }),
  });
  return true;
}
