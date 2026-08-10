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
  message: z.string().trim().min(1).max(4000),
  context: z.object({
    activeProject: z.string(),
    currentWorkspaceObject: z.string(),
    selectedSection: z.enum(sectionKeys),
    visibleContent: z.string().max(12000),
    workspace: workspaceSchema,
    recentConversation: z.array(transcriptSchema).max(12),
  }),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Nexus received incomplete workspace context." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 503 },
      );
    }

    const { message, context } = parsed.data;
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || "gpt-5",
        instructions: contextInstructions(context),
        input: message,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("OpenAI text response failed", response.status, detail);
      return Response.json({ error: "Nexus could not reach OpenAI." }, { status: 502 });
    }

    const data = await response.json();
    const text = data.output_text ??
      data.output?.flatMap((item: { content?: Array<{ text?: string }> }) => item.content ?? [])
        .map((item: { text?: string }) => item.text ?? "")
        .join("") ?? "";

    return Response.json({ text: text || "I’m here, but I didn’t receive a usable response." });
  } catch (error) {
    console.error("Nexus collaboration failed", error);
    return Response.json({ error: "Nexus lost the thread for a moment. Try again." }, { status: 500 });
  }
}
