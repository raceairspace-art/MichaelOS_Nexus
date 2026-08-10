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

export function buildWorkspaceContext(workspace: DigitalOliverWorkspaceState, transcript: TranscriptEntry[]): WorkspaceContext {
  const current = selectedCase(workspace);
  const marketSnapshot = workspace.marketSnapshot ?? null;

  // Research integrity: before lock, both the market snapshot and stored case
  // are scrubbed of anything learned after the decision point. The Python
  // endpoint itself also withholds future candles, so this is defense in depth.
  const safeWorkspace: DigitalOliverWorkspaceState = current.locked
    ? workspace
    : {
        ...workspace,
        marketSnapshot: marketSnapshot ? { ...marketSnapshot, outcome: null, phase: "decision" } : null,
        cases: workspace.cases.map(item => item.caseId === current.caseId
          ? { ...item, outcomeRevealed: false, replayCompleted: false, revealedOutcome: null }
          : item),
      };

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
      decisionTime: marketSnapshot?.decisionTime ?? current.aiReview?.decisionTime ?? null,
    },
    visibleContent: {
      selectedTimeframe: workspace.selectedTimeframe,
      selectedDate: workspace.selectedDate,
      modelSettings: workspace.modelSettings,
      humanAssessment: current,
      nexusInitialAssessment: current.aiReview,
      aiReviewState: current.aiReviewState,
      marketEngine: marketSnapshot ? {
        source: marketSnapshot.source,
        phase: marketSnapshot.phase,
        symbol: marketSnapshot.symbol,
        interval: marketSnapshot.interval,
        sessionDate: marketSnapshot.sessionDate,
        caseRef: marketSnapshot.caseRef,
        decisionTime: marketSnapshot.decisionTime,
        candidate: marketSnapshot.candidate,
        outcome: current.locked && current.replayCompleted ? current.revealedOutcome : "hidden until locked replay completes",
        chartBarCount: marketSnapshot.bars.length,
        parameters: marketSnapshot.parameters,
      } : null,
      evidenceDiscipline: current.locked
        ? "Human and Nexus assessments are locked. Outcome may be discussed only if replayCompleted is true."
        : "Future candles and outcome are unavailable. Discuss only decision-time evidence and the frozen Nexus initial assessment.",
      lockedCaseCount: workspace.cases.filter(item => item.locked).length,
      totalCaseCount: workspace.cases.length,
    },
    workspaceState: safeWorkspace,
    rulebook: OLIVER_RULEBOOK_SUMMARY,
    recentConversation: transcript.slice(-12),
  };
}

export function contextInstructions(context: WorkspaceContext) {
  return [
    "You are Nexus, the embedded AI collaborator inside MichaelOS Nexus.",
    "You are working beside Michael in the same Digital Oliver workspace, not operating as a detached chatbot.",
    "The application supplies structured workspace state. Never ask Michael to re-describe information already present in that state.",
    "Digital Oliver follows State → Location → Structure Box → Space → Power → Risk, then human/AI judgment, lock, replay, and outcome validation.",
    "There are three distinct sources: deterministic Python engine evidence, Nexus's frozen initial AI assessment, and Michael's editable human assessment. Keep them separate.",
    "If Michael asks why you scored something a certain way, explain the frozen nexusInitialAssessment and its rationale. Do not silently rewrite that initial assessment during discussion.",
    "Michael may revise his human assessment after discussion; that is expected. Never present his scores as your own or your scores as his.",
    "Before lock, future candles are intentionally not supplied. Never infer, reveal, or hint at the later-day outcome.",
    "After lock, outcome may only be discussed when replayCompleted is true and revealedOutcome is present.",
    "Oliver's practical workflow is opening-window centric. Evaluate whether the setup was actionable around the open, not whether something attractive happened much later.",
    "When marketEngine is present, it comes from the migrated Digital Oliver Python engine and is valid evidence for the selected case.",
    "If evidence is absent or an API failed, say so plainly rather than inventing candles, levels, scores, or outcomes.",
    "Be concise in voice unless Michael asks for depth.",
    "Do not claim you changed the workspace unless the application explicitly confirms a change.",
    "Current structured workspace context follows:",
    JSON.stringify(context),
  ].join("\n");
}
