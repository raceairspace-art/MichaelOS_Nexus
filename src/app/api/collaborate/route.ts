import { generateText, Output } from "ai";
import { z } from "zod";
import { moods, palettes, scenes } from "@/lib/nexus";

export const maxDuration = 30;

const workspaceSchema = z.object({
  name: z.string().max(80),
  scene: z.enum(scenes),
  mood: z.enum(moods),
  palette: z.enum(palettes),
  energy: z.number().int().min(1).max(5),
  focus: z.string().max(500),
  note: z.string().max(1000),
});

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(1000),
  workspace: workspaceSchema,
  selection: z.string().max(100).default("Digital Oliver"),
  recentActivity: z.array(z.string().max(240)).max(8).default([]),
});

const proposalSchema = z.object({
  message: z.string().max(500),
  observation: z.string().max(300),
  changes: z.object({
    scene: z.enum(scenes).optional(),
    mood: z.enum(moods).optional(),
    palette: z.enum(palettes).optional(),
    energy: z.number().int().min(1).max(5).optional(),
    focus: z.string().max(500).optional(),
    note: z.string().max(1000).optional(),
  }),
  rationale: z.string().max(400),
});

function demoProposal(prompt: string) {
  const lower = prompt.toLowerCase();

  if (lower.includes("night") || lower.includes("observ")) {
    return {
      message: "I’d move Oliver into the observatory and cool the palette. The intent stays the same, but the scene feels more reflective and alive.",
      observation: "Oliver is currently warm and exploratory; the request points toward a quieter, more cinematic workspace.",
      changes: { scene: "Observatory" as const, palette: "indigo" as const, mood: "focused" as const, energy: 2 },
      rationale: "The darker environment gives the shared object a clear change without rewriting its purpose.",
      source: "demo" as const,
    };
  }

  if (lower.includes("energy") || lower.includes("bold")) {
    return {
      message: "I’d raise Oliver’s energy, shift to rose, and make the focus more decisive. It gives us a visible change we can react to together.",
      observation: "The current workspace feels thoughtful, but it could communicate more forward motion.",
      changes: { mood: "bold" as const, palette: "rose" as const, energy: 5, focus: "Choose the strongest direction and turn it into a concrete first move." },
      rationale: "A stronger visual rhythm and a sharper focus make collaboration feel active rather than observational.",
      source: "demo" as const,
    };
  }

  return {
    message: "I’d narrow Oliver’s attention and lower the visual noise. That makes the next decision feel obvious without changing what you’re building.",
    observation: "The shared object already has a clear purpose; the best next move is concentration, not expansion.",
    changes: { mood: "focused" as const, palette: "mint" as const, energy: 3, focus: "Shape one idea at a time, together, until it is clear enough to act on." },
    rationale: "Focus is a small, reversible change that strengthens the feeling of working side by side.",
    source: "demo" as const,
  };
}

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "The workspace context was incomplete." }, { status: 400 });
    }

    const { prompt, workspace, selection, recentActivity } = parsed.data;
    const hasGatewayAuth = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

    if (!hasGatewayAuth) {
      return Response.json(demoProposal(prompt));
    }

    const result = await generateText({
      model: process.env.AI_MODEL || "openai/gpt-5.6-luna",
      output: Output.object({ schema: proposalSchema }),
      system: `You are the embedded collaborator inside MichaelOS Nexus. You are not a detached chatbot. The app has already supplied the current shared object, selection, and recent activity. Never ask the user to describe the screen. Observe the actual state, explain one useful idea in plain language, and propose a small reversible patch. Only change fields that genuinely support the user's request. Keep your tone warm, direct, and collaborative.`,
      prompt: JSON.stringify({ userRequest: prompt, currentSelection: selection, workspace, recentActivity }),
    });

    return Response.json({ ...result.output, source: "ai" });
  } catch (error) {
    console.error("Nexus collaboration failed", error);
    return Response.json({ error: "Oliver lost the thread for a moment. Try that again." }, { status: 500 });
  }
}

