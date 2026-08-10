import type { DigitalOliverWorkspaceState } from "@/lib/digital-oliver";
import { OLIVER_RULEBOOK_SUMMARY, selectedCase } from "@/lib/digital-oliver";

export type TranscriptEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  mode: "voice" | "text";
};

export type WorkspaceContext = {
  activeProject: string;
  workspaceType: "digital-oliver";
  currentWorkspaceObject: string;
  activeView: string;
  selectedObject: Record<string, unknown>;
  visibleContent: Record<string, unknown>;
  workspaceState: DigitalOliverWorkspaceState;
  rulebook: typeof OLIVER_RULEBOOK_SUMMARY;
  recentConversation: TranscriptEntry[];
};

export function buildWorkspaceContext(
  workspace: DigitalOliverWorkspaceState,
  transcript: TranscriptEntry[],
): WorkspaceContext {
  const current = selectedCase(workspace);
  const marketSnapshot = workspace.marketSnapshot ?? null;
  return {
    activeProject: workspace.workspaceName,
    workspaceType: "digital-oliver",
    currentWorkspaceObject: `Digital Oliver ${workspace.activeTab}`,
    activeView: workspace.activeTab,
    selectedObject: {
      caseId: current.caseId,
      caseRef: current.caseRef,
      symbol: current.symbol,
      sessionDate: current.sessionDate,
      reviewState: current.reviewState,
      locked: current.locked,
    },
    visibleContent: {
      selectedTimeframe: workspace.selectedTimeframe,
      fullDay: workspace.fullDay,
      selectedCase: current,
      marketEngine: marketSnapshot ? {
        source: marketSnapshot.source,
        symbol: marketSnapshot.symbol,
        interval: marketSnapshot.interval,
        sessionDate: marketSnapshot.sessionDate,
        caseRef: marketSnapshot.caseRef,
        candidate: marketSnapshot.candidate,
        outcome: current.locked ? marketSnapshot.outcome : "hidden until interpretation lock",
        chartBarCount: marketSnapshot.bars.length,
        parameters: marketSnapshot.parameters,
      } : null,
      lockedCaseCount: workspace.cases.filter((item) => item.locked).length,
      totalCaseCount: workspace.cases.length,
    },
    workspaceState: workspace,
    rulebook: OLIVER_RULEBOOK_SUMMARY,
    recentConversation: transcript.slice(-12),
  };
}

export function contextInstructions(context: WorkspaceContext) {
  return [
    "You are Nexus, the embedded AI collaborator inside MichaelOS Nexus.",
    "You are working beside Michael in the same Digital Oliver workspace, not operating as a detached chatbot.",
    "The application supplies structured workspace state. Never ask Michael to re-describe information already present in that state.",
    "Digital Oliver follows the hierarchy State → Location → Structure Box → Space → Power → Risk, then Oliver judgment, ranking, lock, and outcome validation.",
    "Treat Python engine evidence and Michael's human judgment as separate sources. Never silently convert engine evidence into Michael's judgment.",
    "When marketEngine is present, it comes from the migrated Digital Oliver Python market-data and analysis engine and is valid evidence for discussing the selected case.",
    "Respect evidence discipline: if the selected case is not locked, do not reveal or use hidden outcome statistics even if they exist elsewhere in workspace state.",
    "If marketEngine is absent or reports an error, say so plainly rather than inventing candles or outcomes.",
    "When discussing a selected case, refer naturally to its symbol, case reference, engine candidate, State, Structure Box, Space, notes, lock state, and current view.",
    "Be concise in voice unless the user asks for depth.",
    "Do not claim you changed the workspace unless the application explicitly confirms a change.",
    "Current structured workspace context follows:",
    JSON.stringify(context),
  ].join("\n");
}
