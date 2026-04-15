export type RouteKey =
  | "home"
  | "focus"
  | "companion"
  | "pets"
  | "explore"
  | "bank"
  | "achievements"
  | "battle"
  | "shop";

export type FocusMode = "pomodoro" | "countup";
export type FocusSource = "manual" | "ai" | "demo";
export type MessageType = "text" | "taskCard" | "focusPlan" | "reward" | "recap" | "imageCard" | "systemEvent" | "structuredPlan";
export type TaskStatus = "todo" | "done";
export type Rarity = "N" | "R" | "SR";
export type AICardType = "journeyPlan" | "focusRecap" | "resourceAdvice" | "contextHint";
export type CompanionAIAction = "message" | "tasks" | "plan" | "idea";

export interface Wallet {
  crystal: number;
  energy: number;
}

export interface Pet {
  id: string;
  name: string;
  species: "sheep" | "cat" | "dog" | "rabbit";
  rarity: Rarity;
  level: number;
  exp: number;
  mood: number;
  affection: number;
  activeSkin: string;
  unlocked: boolean;
  active: boolean;
}

export interface FocusPreset {
  id: string;
  title: string;
  minutes: number;
  tone: "sky" | "peach" | "sage" | "amber";
}

export interface FocusState {
  mode: FocusMode;
  selectedPresetId: string;
  running: boolean;
  startedAt: number | null;
  durationMinutes: number;
  source: FocusSource;
}

export interface FocusSession {
  id: string;
  tag: string;
  duration: number;
  status: "completed" | "interrupted";
  crystalReward: number;
  expReward: number;
  source: FocusSource;
  endedAt: number;
}

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  linkedFocusPresetId: string;
}

export interface InspirationNote {
  id: string;
  title: string;
  body: string;
}

export interface CompanionMessage {
  id: string;
  role: "user" | "pet";
  type: MessageType;
  content: string;
  createdAt: number;
  relatedTaskIds?: string[];
  quoteRef?: string;
  structuredPlan?: StructuredPlan;
}

export interface StructuredPlan {
  goalSummary: string;
  steps: string[];
  recommendedDuration: string;
  nextRoute: RouteKey;
  nextAction: string;
  why: string;
}

export interface StepLedger {
  id: string;
  dateLabel: string;
  steps: number;
  energyEarned: number;
  redeemed: boolean;
}

export interface MapNode {
  id: string;
  title: string;
  unlockMinutes: number;
  explored: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
}

export interface AICard {
  id: string;
  type: AICardType;
  title: string;
  description: string;
  ctaLabel: string;
  ctaRoute?: RouteKey;
  secondaryLabel?: string;
  secondaryRoute?: RouteKey;
  steps?: string[];
}

export interface CompanionAIContext {
  recentMessages: Array<Pick<CompanionMessage, "role" | "type" | "content">>;
  focus: {
    running: boolean;
    mode: FocusMode;
    durationMinutes: number;
    elapsedSeconds: number;
  };
  claimableEnergy: number;
  wallet: Wallet;
  activePet: Pick<Pet, "id" | "name" | "mood" | "affection" | "level" | "activeSkin">;
  openTasksCount: number;
}

export interface CompanionAIRequest {
  action: CompanionAIAction;
  draft: string;
  context: CompanionAIContext;
}

export interface CompanionAIResponse {
  content: string;
  structuredPlan?: StructuredPlan;
  tasks?: string[];
  note?: {
    title: string;
    body: string;
  };
  quoteRef?: string;
  source: "model";
}

export interface BattleState {
  active: boolean;
  enemyName: string;
  enemyHp: number;
  enemyMaxHp: number;
  playerHp: number;
  playerMaxHp: number;
  logs: string[];
}

export interface DemoState {
  route: RouteKey;
  wallet: Wallet;
  selectedPetId: string;
  focus: FocusState;
  draft: string;
  pets: Pet[];
  presets: FocusPreset[];
  tasks: TaskItem[];
  notes: InspirationNote[];
  messages: CompanionMessage[];
  aiCards: AICard[];
  sessions: FocusSession[];
  steps: StepLedger[];
  mapNodes: MapNode[];
  achievements: Achievement[];
  battle: BattleState;
}



