export const moods = ["curious", "focused", "calm", "bold"] as const;
export const palettes = ["amber", "indigo", "mint", "rose"] as const;
export const scenes = ["Studio", "Library", "Observatory", "Workshop"] as const;

export type Mood = (typeof moods)[number];
export type Palette = (typeof palettes)[number];
export type Scene = (typeof scenes)[number];

export type OliverState = {
  name: string;
  scene: Scene;
  mood: Mood;
  palette: Palette;
  energy: number;
  focus: string;
  note: string;
};

export type OliverPatch = Partial<
  Pick<OliverState, "scene" | "mood" | "palette" | "energy" | "focus" | "note">
>;

export type Proposal = {
  message: string;
  observation: string;
  changes: OliverPatch;
  rationale: string;
  source?: "ai" | "demo";
};

export const initialOliver: OliverState = {
  name: "Digital Oliver",
  scene: "Studio",
  mood: "curious",
  palette: "amber",
  energy: 3,
  focus: "Turn a loose idea into something we can see and shape together.",
  note: "Oliver should feel attentive, warm, and ready to build—not like a chatbot waiting for instructions.",
};

