export const maxDuration = 30;

function extractText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text;
  return (data?.output ?? [])
    .flatMap((item: any) => item.content ?? [])
    .map((part: any) => part.text ?? "")
    .join("");
}

async function openaiRequest(body: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: "OPENAI_API_KEY is not configured." };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Client-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch {}
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: parsed?.error?.message || text.slice(0, 1200) || `OpenAI HTTP ${response.status}`,
        code: parsed?.error?.code || null,
      };
    }
    return { ok: true, status: response.status, data: parsed };
  } catch (error) {
    return { ok: false, status: 500, error: error instanceof Error ? error.message : "OpenAI request failed." };
  }
}

export async function GET() {
  const model = process.env.OPENAI_TEXT_MODEL || "gpt-5";

  const plain = await openaiRequest({
    model,
    store: false,
    input: "Reply with exactly OK.",
    max_output_tokens: 8,
  });
  if (!plain.ok) return Response.json({ ok: false, stage: "plain-response", model, detail: plain }, { status: 502 });

  const structured = await openaiRequest({
    model,
    store: false,
    input: "Return a successful health check.",
    text: {
      format: {
        type: "json_schema",
        name: "oliver_health",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: { ok: { type: "boolean" } },
        },
      },
    },
  });
  if (!structured.ok) return Response.json({ ok: false, stage: "structured-response", model, detail: structured }, { status: 502 });

  const structuredText = extractText(structured.data);
  let value: any = null;
  try { value = JSON.parse(structuredText); } catch {}
  if (value?.ok !== true) {
    return Response.json({ ok: false, stage: "structured-parse", model, output: structuredText.slice(0, 1200) }, { status: 502 });
  }

  return Response.json({
    ok: true,
    model: structured.data?.model || plain.data?.model || model,
    plain: extractText(plain.data),
    structured: value,
  });
}
