import { z } from "zod";

export const maxDuration = 30;

const requestSchema = z.object({
  text: z.string().trim().min(1).max(4096),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Speech text was invalid." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY is not configured on the server." }, { status: 503 });
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice: process.env.OPENAI_VOICE || "marin",
        input: parsed.data.text,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("OpenAI speech fallback failed", response.status, detail);
      return Response.json({ error: `Speech fallback failed (${response.status}).` }, { status: 502 });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Nexus speech fallback failed", error);
    return Response.json({ error: "Nexus could not generate fallback speech." }, { status: 500 });
  }
}
