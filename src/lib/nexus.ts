export const sectionKeys = [
  "identity",
  "tradingPhilosophy",
  "principles",
  "rules",
  "knowledge",
  "behavioralCharacteristics",
  "notes",
] as const;

export type SectionKey = (typeof sectionKeys)[number];

export type OliverWorkspace = {
  projectId: "digital-oliver";
  projectName: "Digital Oliver";
  updatedAt: string;
  sections: Record<SectionKey, string>;
};

export type TranscriptEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  mode: "voice" | "text";
};

export type WorkspaceContext = {
  activeProject: string;
  currentWorkspaceObject: string;
  selectedSection: SectionKey;
  visibleContent: string;
  workspace: OliverWorkspace;
  recentConversation: TranscriptEntry[];
};

export const sectionLabels: Record<SectionKey, string> = {
  identity: "Identity",
  tradingPhilosophy: "Trading philosophy",
  principles: "Principles",
  rules: "Rules",
  knowledge: "Knowledge",
  behavioralCharacteristics: "Behavioral characteristics",
  notes: "Notes",
};

export const initialWorkspace: OliverWorkspace = {
  projectId: "digital-oliver",
  projectName: "Digital Oliver",
  updatedAt: new Date(0).toISOString(),
  sections: {
    identity:
      "Digital Oliver is a working model of Oliver Velez's trading mindset and teaching style. The goal is not impersonation; it is to capture a disciplined, probability-based way of thinking about markets so Michael can study, test, and refine it.",
    tradingPhilosophy:
      "Trade what price is doing, not what you hope it will do. Favor repeatable setups, defined risk, and evidence over prediction. A strong process matters more than the outcome of any single trade.",
    principles:
      "• Price action first.\n• Risk is defined before entry.\n• Preserve capital so the next opportunity remains available.\n• Think in probabilities, not certainties.\n• Review behavior as rigorously as chart structure.",
    rules:
      "1. Do not enter without a clear reason and invalidation point.\n2. Keep losses intentionally small.\n3. Avoid adding risk to a broken thesis.\n4. Separate a good trade from a winning trade.\n5. Record observations that can improve the next decision.",
    knowledge:
      "Build this section with tested observations about market structure, entries, exits, trend, momentum, support/resistance, trade management, and recurring Velez concepts. Mark uncertain interpretations clearly so they can be verified later.",
    behavioralCharacteristics:
      "Direct, disciplined, skeptical of excuses, focused on execution, and willing to challenge emotional reasoning. The collaborator should explain why a rule matters, not merely repeat it.",
    notes:
      "V1 working note: use this workspace to turn Digital Oliver from an idea into a structured, auditable body of knowledge. Keep interpretation separate from verified source material.",
  },
};

export function buildWorkspaceContext(
  workspace: OliverWorkspace,
  selectedSection: SectionKey,
  transcript: TranscriptEntry[],
): WorkspaceContext {
  return {
    activeProject: workspace.projectName,
    currentWorkspaceObject: "Digital Oliver knowledge model",
    selectedSection,
    visibleContent: workspace.sections[selectedSection],
    workspace,
    recentConversation: transcript.slice(-12),
  };
}

export function contextInstructions(context: WorkspaceContext) {
  return [
    "You are Nexus, the embedded AI collaborator inside MichaelOS Nexus.",
    "You are working beside Michael in the same workspace, not operating as a detached chatbot.",
    "Never ask Michael to re-describe information already present in the supplied workspace context.",
    "Refer naturally to the selected section and the workspace when useful.",
    "Be concise in voice unless the user asks for depth.",
    "Do not claim you changed the workspace unless the application explicitly confirms a change.",
    "Current structured workspace context follows:",
    JSON.stringify(context),
  ].join("\n");
}
