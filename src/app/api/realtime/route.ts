import { z } from "zod";
import { contextInstructions, sectionKeys } from "@/lib/nexus";

export const maxDuration = 30;

const transcriptSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
  createdAt: z.string(),
  mode: z.enum(["voice", "text"]),
});

const workspaceSchema = z.object({
  projectId: z.literal("digital-oliver"),
  projectName: z.literal("Digital Oliver"),
  updatedAt: z.string(),
  sections: z.record(z.enum(sectionKeys), z.string().max(12000)),
});

const requestSchema = z.object({
  sdp: z.string().min(1),
  context: z.object({
    activeProject: z.string(),
    currentWorkspaceObject: z.string(),
    selectedSection: z.enum(sectionKeys),
    visibleContent: z.string().max(12000),
    workspace: workspaceSchema,
    recentConversation: z.array(transcriptSchema).max(12),
  }),
});

function safeOpenAIError(status: number, body: string) {
  let detail = "OpenAI rejected the realtime session request.";

  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: string; type?: string; param?: string | null };
    };
    const message = parsed.error?.message?.trim();
    const code = parsed.error?.code?.trim();
    if (message) detail = message;
    if (code) detail = `${detail} (${code})`;
  } catch {
    if (body.trim() && body.length < 500) detail = body.trim();
  }

  return {
    error: `OpenAI realtime error ${status}: ${detail}`,
    openAIStatus: status,
    detail,
  };
}

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Realtime session context was incomplete." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY is not configured on the server." }, { status: 503 });
    }

    // OpenAI's Realtime WebRTC endpoint expects multipart fields named
    // `sdp` and `session`, not uploaded files. Using Blob/File parts causes
    // the API to report that the required `sdp` form field is missing.
    const form = new FormData();
    form.set("sdp", parsed.data.sdp);
    form.set(
      "session",
      JSON.stringify({
        type: "realtime",
        model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
        instructions: contextInstructions(parsed.data.context),
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
            turn_detection: { type: "semantic_vad", interrupt_response: true },
          },
          output: { voice: process.env.OPENAI_VOICE || "marin" },
        },
      }),
    );

    const openAIResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const answer = await openAIResponse.text();
    if (!openAIResponse.ok) {
      console.error("OpenAI realtime session failed", openAIResponse.status, answer);
      return Response.json(safeOpenAIError(openAIResponse.status, answer), { status: 502 });
    }

    return new Response(answer, {
      status: 200,
      headers: { "Content-Type": "application/sdp" },
    });
  } catch (error) {
    console.error("Nexus realtime setup failed", error);
    return Response.json({ error: "Nexus could not start voice." }, { status: 500 });
  }
}
