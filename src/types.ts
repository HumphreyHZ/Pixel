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
export type MessageType = "text" | "taskCard" | "focusPlan" | "reward" | "recap" | "imageCard" | "systemEvent";
export type TaskStatus = "todo" | "done";
export type Rarity = "N" | "R" | "SR";

export interface Wallet {
  crystal: number;
  energy: number;
  stamina: number;
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
  source: "manual" | "ai";
}

export interface FocusSession {
  id: string;
  tag: string;
  duration: number;
  status: "completed" | "interrupted";
  crystalReward: number;
  expReward: number;
  source: "manual" | "ai";
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
  focus: FocusState;
  draft: string;
  pets: Pet[];
  presets: FocusPreset[];
  tasks: TaskItem[];
  notes: InspirationNote[];
  messages: CompanionMessage[];
  sessions: FocusSession[];
  steps: StepLedger[];
  mapNodes: MapNode[];
  achievements: Achievement[];
  battle: BattleState;
}
