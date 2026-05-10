import { useEffect, useMemo, useState } from "react";
import { seedState } from "../data/seed";
import type {
  AICard,
  Achievement,
  AgentObservedSnapshot,
  AgentSessionState,
  AgentStatus,
  AgentToolCall,
  AgentToolName,
  AgentTrace,
  AgentTraceStatus,
  CompanionAIAction,
  CompanionAIContext,
  CompanionAIRequest,
  CompanionAIResponse,
  CompanionStreamMode,
  CompanionMessage,
  DemoState,
  FocusBrief,
  FocusRecap,
  FocusSession,
  Pet,
  PlanKind,
  RouteKey,
  StructuredPlan,
  TaskItem,
} from "../types";

const STORAGE_KEY = "pixel-companion-focus-react-demo";
const LEGACY_COMPANION_KEYWORDS = [
  "作品集",
  "首页主视觉",
  "AI 对话页面顺一下",
  "冷冰冰的番茄钟",
  "完成时，让宠物说一句鼓励你的话",
];
const DEFAULT_COMPANION_DRAFT = "我今天有点乱，先帮我决定从哪开始";
const FALLBACK_NOTICE = "真实整理暂时没有接通，已切回演示整理模式，你仍然可以继续推进主线。";
const ALLOWED_MODEL_ROUTES: RouteKey[] = ["home", "focus", "companion", "pets", "explore", "bank", "achievements", "battle", "shop"];
const AUTO_AGENT_ROUTES: RouteKey[] = ["companion", "bank", "focus", "explore", "pets"];
const AGENT_TRACE_LIMIT = 6;

type CompanionActionResult = Omit<CompanionAIResponse, "source"> & { source: "model" | "fallback" };

type CompanionStreamCallbacks = {
  onStatus?: (label: string) => void;
  onDelta?: (delta: string) => void;
  onMetric?: (metric: { name: string; elapsedMs?: number }) => void;
};

type LocalCompanionIntent = "story" | "start" | "reward" | "rest" | "explore" | "greeting" | "capability" | "gratitude" | "general";

type AgentToolDispatchResult = {
  nextState: DemoState;
  trace: AgentTrace;
  pendingAction?: AgentSessionState["pendingAction"];
  createdTaskIds?: string[];
  createdIdeaQuote?: string;
};

function getPresetMeta(currentState: DemoState, presetId: string) {
  return currentState.presets.find((preset) => preset.id === presetId) ?? currentState.presets[0];
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function createAgentTrace(message: string, status: AgentTraceStatus, createdAt = Date.now()): AgentTrace {
  return {
    id: createId("agent"),
    message,
    status,
    createdAt,
  };
}

function pushAgentTrace(traces: AgentTrace[], trace: AgentTrace): AgentTrace[] {
  return [trace, ...traces].slice(0, AGENT_TRACE_LIMIT);
}

function trimActiveGoal(value: string): string {
  return value
    .replace(/^用户刚刚补充：/u, "")
    .replace(/。用户刚刚补充：.+$/u, "")
    .replace(/^(请你|麻烦你|帮我|可以帮我|你能不能帮我)/u, "")
    .replace(/^(把|将)/u, "")
    .replace(/(这件事|这个目标)?(拆成|分成|列成)?\s*[3三]?\s*(个)?(步骤|小步|步)?/gu, "")
    .replace(/越顺手越好|越清楚越好|先帮我|今天/g, "")
    .replace(/[，。,！!？?：:；;\s]+$/gu, "")
    .trim();
}

function createAgentSnapshot(currentState: DemoState): AgentObservedSnapshot {
  const claimableEnergy = currentState.steps.filter((item) => !item.redeemed).reduce((sum, item) => sum + item.energyEarned, 0);
  return {
    route: currentState.route,
    focusRunning: currentState.focus.running,
    claimableEnergy,
    crystal: currentState.wallet.crystal,
    energy: currentState.wallet.energy,
    activePetId: currentState.selectedPetId,
    openTasksCount: currentState.tasks.filter((task) => task.status !== "done").length,
  };
}

function normalizeAgentState(currentState: DemoState, nextAgent?: Partial<AgentSessionState>): AgentSessionState {
  return {
    agentStatus: nextAgent?.agentStatus ?? currentState.agent?.agentStatus ?? "idle",
    activeGoal: nextAgent?.activeGoal ?? currentState.agent?.activeGoal ?? null,
    activePlan: nextAgent?.activePlan ?? currentState.agent?.activePlan ?? null,
    pendingAction: nextAgent?.pendingAction ?? currentState.agent?.pendingAction ?? null,
    agentTrace: nextAgent?.agentTrace ?? currentState.agent?.agentTrace ?? [],
    lastObservedSnapshot: nextAgent?.lastObservedSnapshot ?? currentState.agent?.lastObservedSnapshot ?? null,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizePets(pets: Pet[], selectedPetId?: string): Pet[] {
  const fallbackPetId = pets.find((pet) => pet.active)?.id ?? pets[0]?.id;
  const resolvedPetId = selectedPetId ?? fallbackPetId;
  return pets.map((pet) => ({ ...pet, active: pet.id === resolvedPetId }));
}

function getActivePetFromState(currentState: Pick<DemoState, "pets" | "selectedPetId">): Pet {
  return currentState.pets.find((pet) => pet.id === currentState.selectedPetId) ?? currentState.pets[0];
}

function createPetMessage(
  currentState: Pick<DemoState, "pets" | "selectedPetId">,
  message: Omit<CompanionMessage, "role" | "petName">,
): CompanionMessage {
  return {
    ...message,
    role: "pet",
    petName: getActivePetFromState(currentState).name,
  };
}

function inferMessagePetName(
  message: CompanionMessage,
  pets: Pet[],
  fallbackSelectedPetId: string,
): string | undefined {
  if (message.role !== "pet") return message.petName;
  if (message.petName) return message.petName;

  const matchedPet = pets.find((pet) =>
    message.content.includes(pet.name) || (message.quoteRef?.includes(pet.name) ?? false),
  );

  if (matchedPet) return matchedPet.name;

  return pets.find((pet) => pet.id === fallbackSelectedPetId)?.name ?? pets[0]?.name;
}

function isAppFlowDraft(draft: string): boolean {
  return /(专注|奖励|能量|步数|晶石|探索|宠物|图鉴|喂食|地图|银行|对战|商店|陪伴)/u.test(draft);
}

function inferPlanKindFromDraft(draft: string, nextRoute: RouteKey): PlanKind {
  const normalizedDraft = draft.trim();

  if (/(奖励|能量|兑换|领奖|晶石|银行|商店|购买|补给)/u.test(normalizedDraft) || nextRoute === "bank" || nextRoute === "shop") {
    return "resourceTask";
  }

  if (/(探索|地图|图鉴|喂食|宠物互动|对战)/u.test(normalizedDraft) || nextRoute === "explore" || nextRoute === "pets" || nextRoute === "battle") {
    return "exploreTask";
  }

  if (/(专注|番茄|计时|工作|学习|写|改|做方案|整理文档|热身|休息|状态|从哪开始|先做什么)/u.test(normalizedDraft) || nextRoute === "focus") {
    return "focusTask";
  }

  if (!isAppFlowDraft(normalizedDraft) && /(拆|步骤|三步|洗澡|遛狗|做饭|收拾|打扫|买|约|拿|取|寄|整理)/u.test(normalizedDraft)) {
    return "lifeTask";
  }

  return nextRoute === "companion" ? "lifeTask" : "chatOnly";
}

function createBattleIntroLog(petName: string): string {
  return `系统派出了企鹅。你派出了${petName}，准备进入演示战斗。`;
}

function createBattleOpeningLog(petName: string): string {
  return `系统派出了企鹅。你派出了${petName}，准备先手进攻。`;
}

function upsertAiCard(cards: AICard[], nextCard: AICard): AICard[] {
  return [nextCard, ...cards.filter((card) => card.type !== nextCard.type)];
}

function createStructuredPlanFromDraft(draft: string, currentState: DemoState): StructuredPlan {
  const claimableEnergy = currentState.steps.filter((item) => !item.redeemed).reduce((sum, item) => sum + item.energyEarned, 0);
  const normalizedDraft = draft.trim() || "我今天有点乱，先帮我决定从哪开始";

  if (currentState.focus.running) {
    return {
      planKind: "focusTask",
      goalSummary: "把当前这轮专注完整走完",
      steps: ["先把当前专注完成", "去奖励页领取步数能量", "再决定继续探索还是陪伴复盘"],
      recommendedDuration: `${currentState.focus.durationMinutes} 分钟当前节奏`,
      nextRoute: "focus",
      nextAction: "先把这轮走完",
      why: "先把正在进行的进度落袋，再接上后续奖励，会更像一条完整旅程。",
    };
  }

  if (claimableEnergy > 0 && (normalizedDraft.includes("奖励") || normalizedDraft.includes("能量") || normalizedDraft.includes("兑换"))) {
    return {
      planKind: "resourceTask",
      goalSummary: "把奖励闭环讲清楚",
      steps: ["先去奖励页收下步数能量", "按建议兑换一部分晶石", "再带着资源去探索或对战"],
      recommendedDuration: "15 分钟阅读整理",
      nextRoute: "bank",
      nextAction: "先收下今天奖励",
      why: "你已经有待领资源了，先让奖励到账，再解释资源流动会更顺。",
    };
  }

  if (normalizedDraft.includes("休息") || normalizedDraft.includes("累") || normalizedDraft.includes("热身")) {
    return {
      planKind: "focusTask",
      goalSummary: "先把状态轻一点地拉起来",
      steps: ["先做一轮 10 分钟快速热身", "去奖励页看一次能量变化", "如果状态起来了，再切 25 分钟深度专注"],
      recommendedDuration: "10 分钟快速热身",
      nextRoute: "focus",
      nextAction: "先轻量开始",
      why: "先用短时长把节奏拉起来，比一开始就逼自己深度专注更容易进入状态。",
    };
  }

  if (normalizedDraft.includes("探索") || normalizedDraft.includes("宠物") || normalizedDraft.includes("图鉴")) {
    return {
      planKind: "exploreTask",
      goalSummary: "让陪伴和探索一起接进主线",
      steps: ["先做一轮 25 分钟专注", "再去奖励页领取步数能量", "最后带着陪伴去探索或切换图鉴角色"],
      recommendedDuration: "25 分钟深度专注",
      nextRoute: "focus",
      nextAction: "先把第一轮拿下",
      why: "先让专注和奖励出现，再让宠物与探索接进来，闭环会更可信。",
    };
  }

  if (!isAppFlowDraft(normalizedDraft) && /(拆成\s*[3三]步|分成\s*[3三]步|列出\s*[3三]步|三个步骤|三步来拆|越顺手越好)/u.test(normalizedDraft)) {
    const steps = createTasksFromDraft(normalizedDraft);
    return {
      planKind: "lifeTask",
      goalSummary: "把这件事拆成三个顺手步骤，让过程更轻松",
      steps,
      recommendedDuration: "照着三步慢慢来",
      nextRoute: "companion",
      nextAction: steps[0],
      why: "先把事情拆小，再一个动作一个动作地做，会更容易开始，也不容易乱掉。",
    };
  }

  return {
    planKind: inferPlanKindFromDraft(normalizedDraft, claimableEnergy > 0 ? "bank" : "focus"),
    goalSummary: "把今天的主线讲顺",
    steps: ["先完成一轮 25 分钟专注", "去奖励页领取步数能量", "再决定继续探索还是陪伴复盘"],
    recommendedDuration: "25 分钟深度专注",
    nextRoute: claimableEnergy > 0 ? "bank" : "focus",
    nextAction: claimableEnergy > 0 ? "先收下今天奖励" : "先把第一轮拿下",
    why: claimableEnergy > 0
      ? "你已经有待领取的资源了，先让奖励到账，再继续往下走会更完整。"
      : "先让专注和奖励出现，再让资源继续流动起来，会更顺。",
  };
}

function createJourneyPlanCard(plan: StructuredPlan): AICard {
  return {
    id: createId("ai"),
    type: "journeyPlan",
    title: "今天建议这样走",
    description: plan.goalSummary,
    ctaLabel: "生成今日主线",
    ctaRoute: "home",
    secondaryLabel: "直接开始第一轮",
    secondaryRoute: plan.nextRoute,
    steps: plan.steps,
  };
}

function extractDurationMinutes(label: string): number {
  const match = label.match(/(\d+)\s*分钟/u);
  if (!match) return 25;
  return Math.max(5, Math.min(60, Number.parseInt(match[1], 10)));
}

function createFocusBriefFromPlan(plan: StructuredPlan, sourceMessageId?: string): FocusBrief | null {
  if (plan.planKind === "lifeTask" || plan.planKind === "chatOnly") return null;
  if (plan.nextRoute !== "focus") return null;
  const durationMinutes = extractDurationMinutes(plan.recommendedDuration);
  return {
    goal: plan.goalSummary,
    durationLabel: plan.recommendedDuration,
    durationMinutes,
    successCriteria: plan.steps[0] ?? "把这一轮目标推进到可以收尾",
    afterFocusNextStep: plan.steps[1] ?? "去奖励页领取能量",
    ...(sourceMessageId ? { sourceMessageId } : {}),
  };
}

function createFocusRecapCard(source: DemoState["focus"]["source"]): AICard {
  return {
    id: createId("ai"),
    type: "focusRecap",
    title: "这一轮之后，下一步更适合",
    description:
      source === "demo"
        ? "这次按演示结算处理。建议下一步直接去奖励页，把后续闭环走完整。"
        : "这轮已经稳了。建议先去奖励页把步数能量收回来，再决定要不要继续下一轮。",
    ctaLabel: "去领取能量",
    ctaRoute: "bank",
    secondaryLabel: "再开一轮",
    secondaryRoute: "focus",
  };
}

function createFocusRecapCardFromRecap(recap: FocusRecap): AICard {
  return {
    id: createId("ai"),
    type: "focusRecap",
    title: recap.summary,
    description: `${recap.completedMeaning} ${recap.nextStep}`,
    ctaLabel: recap.ctaLabel,
    ctaRoute: recap.nextRoute,
    secondaryLabel: "再开一轮",
    secondaryRoute: "focus",
  };
}

function createFocusRecapMessageContent(recap: FocusRecap): string {
  return `${recap.summary} ${recap.completedMeaning} ${recap.nextStep}`.replace(/\s+/gu, " ").trim();
}

function createFallbackFocusRecap(currentState: DemoState): FocusRecap {
  const brief = currentState.activeFocusBrief;
  const goal = brief?.goal ?? "这轮专注";
  const hasClaimableEnergy = currentState.steps.some((item) => !item.redeemed);
  return {
    summary: "这一轮已经走稳了",
    completedMeaning: brief
      ? `你刚刚推进了“${goal}”，这一步已经从想法变成了实际进度。`
      : "你刚刚完成了一轮专注，晶石和经验已经结算完成。",
    nextStep: hasClaimableEnergy ? "现在最适合去奖励页把能量接回来。" : "现在可以回到陪伴页继续整理下一步。",
    nextRoute: hasClaimableEnergy ? "bank" : "companion",
    ctaLabel: hasClaimableEnergy ? "去领取能量" : "回到陪伴页",
  };
}

function createFocusRecapPrompt(currentState: DemoState): string {
  const latestSession = currentState.sessions[0];
  const brief = currentState.activeFocusBrief;
  const claimableEnergy = currentState.steps.filter((item) => !item.redeemed).reduce((sum, item) => sum + item.energyEarned, 0);
  return [
    "请复盘这轮刚完成的专注，并给下一步建议。",
    `本轮目标：${brief?.goal ?? latestSession?.tag ?? "完成一轮专注"}`,
    `建议时长：${brief?.durationLabel ?? `${latestSession?.duration ?? currentState.focus.durationMinutes} 分钟专注`}`,
    `完成标准：${brief?.successCriteria ?? "把这一轮目标推进到可以收尾"}`,
    `实际时长：${latestSession?.duration ?? currentState.focus.durationMinutes} 分钟`,
    `本轮奖励：${latestSession?.crystalReward ?? currentState.focus.durationMinutes * 3} 晶石，${latestSession?.expReward ?? currentState.focus.durationMinutes * 2} 经验`,
    `待领取能量：${claimableEnergy}`,
    "请返回 focusRecap。",
  ].join("\n");
}

function presetIdForDuration(currentState: DemoState, durationMinutes: number): string {
  const exactPreset = currentState.presets.find((preset) => preset.minutes === durationMinutes);
  if (exactPreset) return exactPreset.id;
  const nearestPreset = [...currentState.presets].sort((a, b) =>
    Math.abs(a.minutes - durationMinutes) - Math.abs(b.minutes - durationMinutes),
  )[0];
  return nearestPreset?.id ?? currentState.focus.selectedPresetId;
}

function createResourceAdviceCard(currentState: DemoState): AICard {
  const claimableEnergy = currentState.steps.filter((item) => !item.redeemed).reduce((sum, item) => sum + item.energyEarned, 0);

  if (claimableEnergy > 0) {
    return {
      id: createId("ai"),
      type: "resourceAdvice",
      title: "现在这些能量更适合怎么用",
      description: "先把今天的步数小票收进来，再决定兑换还是继续冒险。",
      ctaLabel: "先收下今天奖励",
      ctaRoute: "bank",
      secondaryLabel: "去探索",
      secondaryRoute: "explore",
    };
  }

  if (currentState.wallet.energy >= 40) {
    return {
      id: createId("ai"),
      type: "resourceAdvice",
      title: "现在这些能量更适合怎么用",
      description: "你现在的能量足够先探索一次，再考虑兑换晶石。",
      ctaLabel: "去探索",
      ctaRoute: "explore",
      secondaryLabel: "按建议兑换成晶石",
      secondaryRoute: "bank",
    };
  }

  return {
    id: createId("ai"),
    type: "resourceAdvice",
    title: "现在这些能量更适合怎么用",
    description: "这点能量更适合先攒着，不建议立刻兑换。",
    ctaLabel: "继续累积能量",
    ctaRoute: "focus",
    secondaryLabel: "回到主线",
    secondaryRoute: "home",
  };
}

function createContextHintCard(currentState: DemoState): AICard {
  const activePet = getActivePetFromState(currentState);
  return {
    id: createId("ai"),
    type: "contextHint",
    title: "这一步更适合怎么走",
    description: `${activePet.name} 会参与开场说明和战斗反馈。建议打一轮攻击，再看是否继续。`,
    ctaLabel: "开始一场试炼",
    ctaRoute: "battle",
    secondaryLabel: "先看资源建议",
    secondaryRoute: "bank",
  };
}

function ensureAiCards(currentState: DemoState): DemoState {
  const nextPlan = createStructuredPlanFromDraft(currentState.draft, currentState);
  let nextCards = currentState.aiCards ?? [];

  if (!nextCards.some((card) => card.type === "journeyPlan")) {
    nextCards = upsertAiCard(nextCards, createJourneyPlanCard(nextPlan));
  }

  nextCards = upsertAiCard(nextCards, createResourceAdviceCard(currentState));
  nextCards = upsertAiCard(nextCards, createContextHintCard(currentState));

  return {
    ...currentState,
    aiCards: nextCards,
  };
}

function createPetAdvice(pet: Pet): string {
  if (pet.id === "sheep") {
    return "绵羊更适合做温和的起步陪伴。今天如果还没完全进入状态，就先让它陪你把第一轮走起来。";
  }

  if (pet.id === "beagle") {
    return "比格犬更适合做推进型搭档。你现在最适合快一点把主线跑完，再回来整理细节。";
  }

  if (pet.id === "night-cat") {
    return "夜猫子更适合做复盘和整理型陪伴。等你拿到奖励后，让它帮你把节奏收紧会很顺。";
  }

  return "休憩兔更适合做缓冲和安抚型陪伴。状态紧的时候，先轻一点地推进会更自然。";
}

function createStructuredPlanMessage(draft: string, currentState: DemoState) {
  const structuredPlan = createStructuredPlanFromDraft(draft, currentState);
  return {
    content: "我先把这句话整理成一条可以直接走的旅程。",
    structuredPlan,
    card: createJourneyPlanCard(structuredPlan),
  };
}

function createStreamingSkeletonPlan(action: CompanionAIAction, draft: string): StructuredPlan {
  if (action === "idea") {
    return {
      planKind: "chatOnly",
      goalSummary: "把这句话暂时收成一条灵感",
      steps: ["提炼值得留下的想法", "整理成一条灵感纸条", "放进灵感区方便后面展开"],
      recommendedDuration: "灵感整理中",
      nextRoute: "companion",
      nextAction: "准备收进灵感",
      why: "先保存想法，再决定要不要拆成待办。",
    };
  }

  const planKind = action === "tasks" ? "lifeTask" : inferPlanKindFromDraft(draft, action === "plan" ? "focus" : "companion");
  const goalSummary = action === "tasks"
    ? "把这件事拆成三个顺手步骤"
    : action === "plan"
      ? "把当前目标整理成可以开始的一轮"
      : "把这句话整理成可执行结果";

  return {
    planKind,
    goalSummary,
    steps: ["确认目标", "拆出关键动作", "准备下一步"],
    recommendedDuration: "正在整理",
    nextRoute: planKind === "focusTask" ? "focus" : "companion",
    nextAction: "准备填入结果",
    why: "我会先搭好结果骨架，再把真实整理内容填进来。",
  };
}

function getFocusElapsedSeconds(focus: DemoState["focus"], currentTime = Date.now()): number {
  if (!focus.running || !focus.startedAt) return 0;
  return Math.max(0, Math.floor((currentTime - focus.startedAt) / 1000));
}

function canClaimFocusReward(focus: DemoState["focus"], currentTime = Date.now()): boolean {
  return getFocusElapsedSeconds(focus, currentTime) >= focus.durationMinutes * 60;
}

function detectLocalCompanionIntent(draft: string): LocalCompanionIntent {
  const normalized = draft.trim();

  if (/^(你好|您好|嗨|哈喽|hi|hello|早上好|晚上好|在吗)[!！。.？? ]*$/iu.test(normalized)) {
    return "greeting";
  }

  if (/(你能做什么|你会什么|你可以做什么|能帮我做什么|怎么帮我|你是谁)/u.test(normalized)) {
    return "capability";
  }

  if (/^(谢谢|多谢|感谢|辛苦了|好的|好耶|收到)[!！。.？? ]*$/u.test(normalized)) {
    return "gratitude";
  }

  if (/(主线|讲清楚|闭环|怎么接|串起来)/u.test(normalized)) {
    return "story";
  }

  if (/(有点乱|很乱|从哪开始|先帮我决定|不知道怎么开始|不知道先做什么)/u.test(normalized)) {
    return "start";
  }

  if (/(奖励|能量|兑换|领奖|晶石)/u.test(normalized)) {
    return "reward";
  }

  if (/(休息|累|热身|缓一缓|状态不好)/u.test(normalized)) {
    return "rest";
  }

  if (/(探索|宠物|图鉴|喂食|互动|地图)/u.test(normalized)) {
    return "explore";
  }

  return "general";
}

function isLowSignalCompanionDraft(draft: string): boolean {
  const normalized = draft.trim();
  return /^(嗯|嗯嗯|好的|好呀|行|可以|收到|明白|ok|okay|好的呀|好耶)[!！。.？? ]*$/iu.test(normalized);
}

function detectFollowUpCompanionAction(draft: string): CompanionAIAction | null {
  const normalized = draft.trim();

  if (/^(拆吧|拆一下|拆成\s*[3三]\s*步|拆给我看|帮我拆|继续拆)/u.test(normalized)) {
    return "tasks";
  }

  if (/^(排一下|安排一下|顺一下|理一下|讲清楚|继续|继续吧|就按这个来|安排下一步|继续整理|整理一下|继续顺一顺)/u.test(normalized)) {
    return "plan";
  }

  if (/^(记一下|收起来|收进灵感|记成灵感|存一下)/u.test(normalized)) {
    return "idea";
  }

  return null;
}

function detectExplicitCompanionAction(draft: string): CompanionAIAction | null {
  const normalized = draft.trim();

  if (/(拆成\s*[3三]\s*步|分成\s*[3三]\s*步|列出\s*[3三]\s*步|三个步骤|三步来拆|拆出待办|拆成待办|待办清单)/u.test(normalized)) {
    return "tasks";
  }

  if (/(安排顺序|排一下顺序|讲清主线|主线讲清楚|帮我规划|顺一下流程|整理成路线|把.*串起来)/u.test(normalized)) {
    return "plan";
  }

  if (/(记成灵感|收进灵感|存成灵感|收起来做灵感|先记下来)/u.test(normalized)) {
    return "idea";
  }

  return null;
}

function isModeChoiceDraft(draft: string): boolean {
  const normalized = draft.trim();
  return /(判断|适合|该不该|要不要|先).*(专注|热身|休息|整理)/u.test(normalized)
    && /(专注|热身|休息)/u.test(normalized);
}

function getCompanionStreamMode(action: CompanionAIAction, draft: string): CompanionStreamMode {
  if (action !== "message") return "card";
  return "text";
}

function getLatestMeaningfulCompanionGoal(currentState: DemoState): string | null {
  if (currentState.agent.activePlan?.goalSummary) {
    return currentState.agent.activePlan.goalSummary;
  }

  if (currentState.agent.activeGoal && !isLowSignalCompanionDraft(currentState.agent.activeGoal)) {
    return currentState.agent.activeGoal;
  }

  const recentUserMessage = [...currentState.messages]
    .reverse()
    .find((message) => message.role === "user" && !isLowSignalCompanionDraft(message.content));

  return recentUserMessage?.content ?? null;
}

function shouldGenerateStructuredReply(draft: string): boolean {
  const normalized = draft.trim();
  const intent = detectLocalCompanionIntent(normalized);

  if (["story", "start", "reward", "rest", "explore"].includes(intent)) {
    return true;
  }

  return /(帮我|整理|拆成|安排|决定|主线|从哪开始|先做什么|怎么接|讲清楚|规划)/u.test(normalized);
}

function isGoalBearingCompanionDraft(draft: string): boolean {
  const normalized = draft.trim();
  const intent = detectLocalCompanionIntent(normalized);

  if (["greeting", "capability", "gratitude"].includes(intent) || isLowSignalCompanionDraft(normalized)) {
    return false;
  }

  if (detectExplicitCompanionAction(normalized) || shouldGenerateStructuredReply(normalized)) {
    return true;
  }

  return /(今天|我要|我想|需要|准备|计划|帮我|给.+(洗澡|遛|做|买|整理|收拾|打扫)|写|改|做|整理|学习|工作|洗澡|遛狗|做饭|打扫|收拾)/u.test(normalized);
}

function shouldOfferCompanionCardAction(draft: string): boolean {
  const normalized = draft.trim();
  if (!normalized || isModeChoiceDraft(normalized) || isLowSignalCompanionDraft(normalized)) {
    return false;
  }

  const intent = detectLocalCompanionIntent(normalized);
  if (["greeting", "capability", "gratitude", "rest"].includes(intent)) {
    return false;
  }

  return Boolean(detectExplicitCompanionAction(normalized))
    || shouldGenerateStructuredReply(normalized)
    || isGoalBearingCompanionDraft(normalized);
}

function getCompanionCardActionForDraft(draft: string): CompanionAIAction {
  const explicitAction = detectExplicitCompanionAction(draft);
  if (explicitAction === "tasks" || explicitAction === "plan") {
    return explicitAction;
  }

  if (/(拆|三步|3\s*步|步骤|待办|洗澡|遛狗|遛猫|做饭|打扫|收拾|买|取|寄)/u.test(draft)) {
    return "tasks";
  }

  return "plan";
}

function createActiveGoalFromCompanionResult(draft: string, plan?: StructuredPlan): string {
  if (plan?.goalSummary && plan.planKind !== "chatOnly" && !/^把这件事|先把这条/u.test(plan.goalSummary)) {
    return plan.goalSummary.trim();
  }

  const trimmedDraft = trimActiveGoal(draft);
  if (trimmedDraft.length >= 2) {
    return trimmedDraft;
  }

  return plan?.goalSummary.trim() ?? draft.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRouteKey(value: unknown): value is RouteKey {
  return typeof value === "string" && ALLOWED_MODEL_ROUTES.includes(value as RouteKey);
}

function isPlanKind(value: unknown): value is PlanKind {
  return typeof value === "string" && ["lifeTask", "focusTask", "resourceTask", "exploreTask", "chatOnly"].includes(value);
}

function isToolName(value: unknown): value is AgentToolName {
  return typeof value === "string" && ["createTasks", "setRoute", "startFocus", "createIdea", "selectPet", "claimRecommended", "noop"].includes(value);
}

function parseStructuredPlan(value: unknown): StructuredPlan | null {
  if (!isRecord(value)) return null;
  const steps = Array.isArray(value.steps)
    ? value.steps.filter((item): item is string => isNonEmptyString(item)).map((item) => item.trim()).slice(0, 3)
    : [];

  if (
    !isNonEmptyString(value.goalSummary)
    || steps.length !== 3
    || !isNonEmptyString(value.recommendedDuration)
    || !isRouteKey(value.nextRoute)
    || !isNonEmptyString(value.nextAction)
    || !isNonEmptyString(value.why)
  ) {
    return null;
  }

  return {
    planKind: isPlanKind(value.planKind) ? value.planKind : inferPlanKindFromDraft(value.goalSummary.trim(), value.nextRoute),
    goalSummary: value.goalSummary.trim(),
    steps,
    recommendedDuration: value.recommendedDuration.trim(),
    nextRoute: value.nextRoute,
    nextAction: value.nextAction.trim(),
    why: value.why.trim(),
  };
}

function parseAgentToolCall(value: unknown): AgentToolCall | null {
  if (!isRecord(value) || !isToolName(value.name) || typeof value.requiresConfirmation !== "boolean" || !isNonEmptyString(value.reason)) {
    return null;
  }

  if (value.name === "noop") {
    return {
      name: value.name,
      requiresConfirmation: value.requiresConfirmation,
      reason: value.reason.trim(),
    };
  }

  if (!isRecord(value.args)) {
    return null;
  }

  if (value.name === "createTasks") {
    const titles = Array.isArray(value.args.titles)
      ? value.args.titles.filter((item): item is string => isNonEmptyString(item)).map((item) => item.trim()).slice(0, 3)
      : [];

    if (!titles.length) return null;

    return {
      name: value.name,
      args: { titles },
      requiresConfirmation: value.requiresConfirmation,
      reason: value.reason.trim(),
    };
  }

  if (value.name === "setRoute") {
    if (!isRouteKey(value.args.route)) return null;
    return {
      name: value.name,
      args: { route: value.args.route },
      requiresConfirmation: value.requiresConfirmation,
      reason: value.reason.trim(),
    };
  }

  if (value.name === "startFocus") {
    if (value.args.mode !== "pomodoro" && value.args.mode !== "countup") return null;
    const duration = typeof value.args.duration === "number" && Number.isFinite(value.args.duration)
      ? Math.max(5, Math.min(60, Math.round(value.args.duration)))
      : undefined;
    return {
      name: value.name,
      args: duration ? { mode: value.args.mode, duration } : { mode: value.args.mode },
      requiresConfirmation: value.requiresConfirmation,
      reason: value.reason.trim(),
    };
  }

  if (value.name === "createIdea") {
    if (!isNonEmptyString(value.args.title) || !isNonEmptyString(value.args.body)) return null;
    return {
      name: value.name,
      args: {
        title: value.args.title.trim().slice(0, 14),
        body: value.args.body.trim(),
        ...(isNonEmptyString(value.args.quoteRef) ? { quoteRef: value.args.quoteRef.trim().slice(0, 28) } : {}),
      },
      requiresConfirmation: value.requiresConfirmation,
      reason: value.reason.trim(),
    };
  }

  if (value.name === "selectPet") {
    if (!isNonEmptyString(value.args.petId)) return null;
    return {
      name: value.name,
      args: { petId: value.args.petId.trim() },
      requiresConfirmation: value.requiresConfirmation,
      reason: value.reason.trim(),
    };
  }

  return {
    name: value.name,
    args: value.args.source === "steps" ? { source: "steps" } : {},
    requiresConfirmation: value.requiresConfirmation,
    reason: value.reason.trim(),
  };
}

function parseAgentToolCalls(value: unknown): AgentToolCall[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const toolCalls = value
    .map((item) => parseAgentToolCall(item))
    .filter((item): item is AgentToolCall => item !== null)
    .slice(0, 2);

  return toolCalls.length ? toolCalls : undefined;
}

function parseFocusBrief(value: unknown): FocusBrief | undefined {
  if (!isRecord(value)) return undefined;
  const durationMinutes = typeof value.durationMinutes === "number" && Number.isFinite(value.durationMinutes)
    ? Math.max(5, Math.min(60, Math.round(value.durationMinutes)))
    : null;

  if (
    !isNonEmptyString(value.goal)
    || !isNonEmptyString(value.durationLabel)
    || durationMinutes === null
    || !isNonEmptyString(value.successCriteria)
    || !isNonEmptyString(value.afterFocusNextStep)
  ) {
    return undefined;
  }

  return {
    goal: value.goal.trim(),
    durationLabel: value.durationLabel.trim(),
    durationMinutes,
    successCriteria: value.successCriteria.trim(),
    afterFocusNextStep: value.afterFocusNextStep.trim(),
    ...(isNonEmptyString(value.sourceMessageId) ? { sourceMessageId: value.sourceMessageId.trim() } : {}),
  };
}

function parseFocusRecap(value: unknown): FocusRecap | undefined {
  if (!isRecord(value)) return undefined;

  if (
    !isNonEmptyString(value.summary)
    || !isNonEmptyString(value.completedMeaning)
    || !isNonEmptyString(value.nextStep)
    || !isRouteKey(value.nextRoute)
    || !isNonEmptyString(value.ctaLabel)
  ) {
    return undefined;
  }

  return {
    summary: value.summary.trim(),
    completedMeaning: value.completedMeaning.trim(),
    nextStep: value.nextStep.trim(),
    nextRoute: value.nextRoute,
    ctaLabel: value.ctaLabel.trim(),
  };
}

function parseCompanionResponse(data: unknown, action: CompanionAIAction, draft: string): CompanionAIResponse | null {
  if (
    !isRecord(data)
    || (data.source !== "model" && data.source !== "fallback")
    || !isNonEmptyString(data.content)
  ) {
    return null;
  }

  const structuredPlan = data.structuredPlan ? parseStructuredPlan(data.structuredPlan) : undefined;
  const toolCalls = parseAgentToolCalls(data.toolCalls);
  const focusBrief = parseFocusBrief(data.focusBrief);
  const focusRecap = parseFocusRecap(data.focusRecap);
  const baseResponse: CompanionAIResponse = {
    content: data.content.trim(),
    source: data.source,
    toolCalls,
    ...(focusBrief ? { focusBrief } : {}),
    ...(focusRecap ? { focusRecap } : {}),
  };

  if (action === "idea") {
    if (!isRecord(data.note) || !isNonEmptyString(data.note.title) || !isNonEmptyString(data.note.body) || !isNonEmptyString(data.quoteRef)) {
      return null;
    }

    return {
      ...baseResponse,
      note: {
        title: data.note.title.trim().slice(0, 14),
        body: data.note.body.trim(),
      },
      quoteRef: data.quoteRef.trim().slice(0, 28),
    };
  }

  if (!structuredPlan && action === "message") {
    return baseResponse;
  }

  if (!structuredPlan) {
    return null;
  }

  if (action === "tasks") {
    const tasks = Array.isArray(data.tasks)
      ? data.tasks.filter((item): item is string => isNonEmptyString(item)).map((item) => item.trim()).slice(0, 3)
      : [];

    if (tasks.length !== 3) {
      return null;
    }

    const normalizedPlan = structuredPlan
      ? {
        ...structuredPlan,
        nextRoute: !isAppFlowDraft(draft) && structuredPlan.nextRoute === "home" ? "companion" as const : structuredPlan.nextRoute,
        planKind: inferPlanKindFromDraft(
          draft,
          !isAppFlowDraft(draft) && structuredPlan.nextRoute === "home" ? "companion" as const : structuredPlan.nextRoute,
        ),
      }
      : structuredPlan;

    return {
      ...baseResponse,
      structuredPlan: normalizedPlan,
      tasks,
    };
  }

  return {
    ...baseResponse,
    structuredPlan,
  };
}

function buildCompanionContext(currentState: DemoState): CompanionAIContext {
  const claimableEnergy = currentState.steps.filter((item) => !item.redeemed).reduce((sum, item) => sum + item.energyEarned, 0);
  const activePet = getActivePetFromState(currentState);

  return {
    recentMessages: currentState.messages.slice(-6).map((message) => ({
      role: message.role,
      type: message.type,
      content: message.content,
    })),
    route: currentState.route,
    focus: {
      running: currentState.focus.running,
      mode: currentState.focus.mode,
      durationMinutes: currentState.focus.durationMinutes,
      elapsedSeconds: getFocusElapsedSeconds(currentState.focus),
    },
    activeFocusBrief: currentState.activeFocusBrief,
    claimableEnergy,
    wallet: currentState.wallet,
    activePet: {
      id: activePet.id,
      name: activePet.name,
      mood: activePet.mood,
      affection: activePet.affection,
      level: activePet.level,
      activeSkin: activePet.activeSkin,
    },
    openTasksCount: currentState.tasks.filter((task) => task.status !== "done").length,
    agent: {
      status: currentState.agent.agentStatus,
      activeGoal: currentState.agent.activeGoal,
      hasPendingAction: Boolean(currentState.agent.pendingAction),
    },
  };
}

function describeCompanionFallbackReason(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "这次真实整理超时了，我先用演示模式把这一步接住。";
  }

  const message = error instanceof Error ? error.message : "";

  if (message.includes("invalid_companion_payload") || message.includes("invalid_model_json")) {
    return "真实模型这次返回的结果格式没对上，我先切回演示模式。";
  }

  if (message.includes("missing_deepseek_api_key") || message.includes("companion_api_401") || message.includes("companion_api_403")) {
    return "真实模型这次没有拿到可用凭据，我先切回演示模式。";
  }

  if (message.includes("companion_api_429")) {
    return "真实模型这会儿有点忙，我先切回演示模式。";
  }

  if (message.includes("companion_api_500")) {
    return "真实整理接口这次返回失败了，我先切回演示模式。";
  }

  if (message.includes("companion_api_")) {
    return "真实整理接口这次没有顺利返回结果，我先切回演示模式。";
  }

  return "真实整理这次没有顺利完成，我先切回演示模式。";
}

async function requestCompanionModel(
  action: CompanionAIAction,
  draft: string,
  currentState: DemoState,
  streamMode?: CompanionStreamMode,
): Promise<CompanionAIResponse> {
  const payload: CompanionAIRequest = {
    action,
    draft,
    context: buildCompanionContext(currentState),
    ...(streamMode ? { streamMode } : {}),
  };
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("/api/companion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errorBody: unknown = await response.json();
        if (isRecord(errorBody) && isNonEmptyString(errorBody.error)) {
          detail = errorBody.error.trim();
        }
      } catch {
        // Ignore response parsing errors for failed requests.
      }

      throw new Error(detail ? `companion_api_${response.status}:${detail}` : `companion_api_${response.status}`);
    }

    const data: unknown = await response.json();
    const parsed = parseCompanionResponse(data, action, draft);

    if (!parsed) {
      throw new Error("invalid_companion_payload");
    }

    return parsed;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function parseSsePayload(rawEvent: string): { event: string; data: unknown } | null {
  const eventLine = rawEvent.split(/\r?\n/).find((line) => line.startsWith("event:"));
  const dataLines = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/u, ""));

  if (!dataLines.length) return null;

  try {
    return {
      event: eventLine?.replace(/^event:\s?/u, "").trim() || "message",
      data: JSON.parse(dataLines.join("\n")),
    };
  } catch {
    return null;
  }
}

async function requestCompanionModelStream(
  action: CompanionAIAction,
  draft: string,
  currentState: DemoState,
  streamMode: CompanionStreamMode,
  callbacks: CompanionStreamCallbacks = {},
): Promise<CompanionAIResponse> {
  const payload: CompanionAIRequest = {
    action,
    draft,
    context: buildCompanionContext(currentState),
    streamMode,
  };
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch("/api/companion-stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`companion_stream_${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: CompanionAIResponse | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";

      for (const rawEvent of events) {
        const parsedEvent = parseSsePayload(rawEvent);
        if (!parsedEvent) continue;

        if (parsedEvent.event === "status" && isRecord(parsedEvent.data) && isNonEmptyString(parsedEvent.data.label)) {
          callbacks.onStatus?.(parsedEvent.data.label.trim());
          continue;
        }

        if (parsedEvent.event === "delta" && isRecord(parsedEvent.data) && typeof parsedEvent.data.text === "string") {
          callbacks.onDelta?.(parsedEvent.data.text);
          continue;
        }

        if (parsedEvent.event === "metric" && isRecord(parsedEvent.data) && isNonEmptyString(parsedEvent.data.name)) {
          callbacks.onMetric?.({
            name: parsedEvent.data.name.trim(),
            elapsedMs: typeof parsedEvent.data.elapsedMs === "number" ? parsedEvent.data.elapsedMs : undefined,
          });
          continue;
        }

        if (parsedEvent.event === "error") {
          const detail = isRecord(parsedEvent.data) && isNonEmptyString(parsedEvent.data.error)
            ? parsedEvent.data.error.trim()
            : "companion_stream_error";
          throw new Error(detail);
        }

        if (parsedEvent.event === "final") {
          finalResult = parseCompanionResponse(parsedEvent.data, action, draft);
          if (!finalResult) {
            throw new Error("invalid_companion_stream_payload");
          }
        }
      }
    }

    if (!finalResult) {
      throw new Error("missing_companion_stream_final");
    }

    return finalResult;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function createFallbackCompanionResult(action: CompanionAIAction, draft: string, currentState: DemoState): CompanionActionResult {
  const intent = detectLocalCompanionIntent(draft);
  const journeyPlan = createStructuredPlanMessage(draft, currentState);

  if (action === "tasks") {
    return {
      source: "fallback",
      content: "我把这句话整理成一张可以直接执行的旅程卡。",
      structuredPlan: journeyPlan.structuredPlan,
      focusBrief: createFocusBriefFromPlan(journeyPlan.structuredPlan) ?? undefined,
      tasks: createTasksFromDraft(draft),
    };
  }

  if (action === "plan") {
    return {
      source: "fallback",
      content: "我先把顺序排好，你照着走就能把主线讲清楚。",
      structuredPlan: journeyPlan.structuredPlan,
      focusBrief: createFocusBriefFromPlan(journeyPlan.structuredPlan) ?? undefined,
    };
  }

  if (action === "idea") {
    return {
      source: "fallback",
      content: "我把这条目标收进旅程记忆卡了。",
      note: {
        title: draft.slice(0, 14),
        body: `${draft}。把它整理成一条更清楚的专注旅程。`,
      },
      quoteRef: draft.slice(0, 28),
    };
  }

  if (action === "message" && intent === "greeting") {
    return {
      source: "fallback",
      content: "你好呀，我在这儿。你直接说一句今天想推进的事，我就陪你把它理顺。",
    };
  }

  if (action === "message" && intent === "capability") {
    return {
      source: "fallback",
      content: "我可以帮你拆成 3 步、判断先专注还是先领奖，也可以把奖励和探索顺成一条主线。你直接说一句现在最想推进的事就行。",
    };
  }

  if (action === "message" && intent === "gratitude") {
    return {
      source: "fallback",
      content: "好呀，需要的时候再叫我。我会继续陪你把后面的节奏走顺。",
    };
  }

  if (action === "message" && !shouldGenerateStructuredReply(draft)) {
    return {
      source: "fallback",
      content: createReplyFromDraft(draft),
    };
  }

  return {
    source: "fallback",
    content: "我先把这句话拆成一条可以直接走的旅程。",
    structuredPlan: journeyPlan.structuredPlan,
    focusBrief: createFocusBriefFromPlan(journeyPlan.structuredPlan) ?? undefined,
  };
}


function createTasksFromDraft(draft: string): string[] {
  if (draft.includes("步数") || draft.includes("能量") || draft.includes("银行") || draft.includes("奖励")) {
    return ["完成 1 轮 25 分钟专注", "领取最近一天步数能量", "兑换晶石后去探索晨露草坪"];
  }

  if (draft.includes("宠物") || draft.includes("探索") || draft.includes("图鉴")) {
    return ["安排一轮专注给宠物加经验", "完成一次喂食或切换陪伴", "触发 1 次探索并记录掉落反馈"];
  }

  if (/(洗澡|清洗|洗一洗|洗猫|洗狗)/u.test(draft) && /(猫|猫咪|猫猫|宠物)/u.test(draft)) {
    return ["准备温水、毛巾和洗澡用品", "先安抚猫咪，再快速温和地完成清洗", "擦干吹干并观察猫咪状态"];
  }

  return ["确定今天的专注主题", "完成一轮专注领取晶石", "把奖励带去奖励页或探索继续展开"];
}

function createPlanFromDraft(draft: string): string[] {
  if (draft.includes("步数") || draft.includes("能量") || draft.includes("银行") || draft.includes("奖励")) {
    return ["25 分钟专注推进", "5 分钟领取步数能量", "10 分钟兑换晶石并探索"];
  }

  if (draft.includes("宠物") || draft.includes("探索") || draft.includes("图鉴")) {
    return ["15 分钟整理今日目标", "25 分钟专注提升宠物经验", "10 分钟探索并记录奖励"];
  }

  if (/(洗澡|清洗|洗一洗|洗猫|洗狗)/u.test(draft) && /(猫|猫咪|猫猫|宠物)/u.test(draft)) {
    return ["5 分钟准备洗澡用品", "10 分钟温和地帮猫咪洗澡", "10 分钟擦干吹干并安抚它"];
  }

  return ["25 分钟主线专注", "5 分钟领取奖励", "10 分钟宠物互动与复盘"];
}

function createReplyFromDraft(draft: string): string {
  const intent = detectLocalCompanionIntent(draft);

  if (intent === "greeting") {
    return "你好呀，我在这儿。你直接说一句今天想推进的事，我就陪你把它理顺。";
  }

  if (intent === "capability") {
    return "我可以帮你拆顺序、判断先专注还是先领奖，也可以把奖励和探索接成一条主线。你直接说说现在最想推进什么就行。";
  }

  if (intent === "gratitude") {
    return "好呀，需要的时候再叫我。我会继续陪你把后面的节奏走顺。";
  }

  if (draft.includes("专注") || draft.includes("25") || draft.includes("番茄")) {
    return "可以，先把这一轮专注拿下。达标后我会提醒你先去奖励页领取步数能量。";
  }

  if (draft.includes("步数") || draft.includes("能量") || draft.includes("银行") || draft.includes("奖励")) {
    return "这一步更适合接在专注后面。先把能量领到手，再去兑换或探索，会更顺。";
  }

  if (draft.includes("宠物") || draft.includes("喂食") || draft.includes("升级")) {
    return "我会把它接成宠物成长路线：先专注加经验，再喂食补心情，最后决定要不要继续探索。";
  }

  if (draft.includes("探索") || draft.includes("地图")) {
    return "那我会把探索排在奖励结算后面，这样地图推进会更像完成任务后的展开。";
  }

  return "我听到了。你可以继续多说一点你现在卡在哪，我会顺着你的话帮你理一理。";
}

function createIdeaFromDraft(draft: string): { title: string; body: string; quoteRef: string } {
  const normalized = draft.replace(/\s+/gu, " ").trim();
  const titleCandidate = normalized
    .split(/[，。,！!？?\n]/u)
    .map((part) => part.trim())
    .find((part) => part.length > 0)
    ?? normalized;
  const title = titleCandidate.slice(0, 14) || normalized.slice(0, 14);

  return {
    title,
    body: normalized,
    quoteRef: normalized.slice(0, 28),
  };
}

function inferAgentToolCalls(action: CompanionAIAction, draft: string, currentState: DemoState, result: CompanionActionResult): AgentToolCall[] {
  if (action === "tasks") {
    const titles = result.tasks ?? createTasksFromDraft(draft);
    return [{
      name: "createTasks",
      args: { titles },
      requiresConfirmation: false,
      reason: "先把今天最顺手的动作拆出来，后面更容易继续推进。",
    }];
  }

  if (action === "idea" && result.note) {
    return [{
      name: "createIdea",
      args: {
        title: result.note.title,
        body: result.note.body,
        ...(result.quoteRef ? { quoteRef: result.quoteRef } : {}),
      },
      requiresConfirmation: false,
      reason: "先把这条想法收进灵感区，后面还可以继续往下接。",
    }];
  }

  if (action === "plan" && result.structuredPlan) {
    if (result.structuredPlan.planKind === "lifeTask" || result.structuredPlan.planKind === "chatOnly") {
      return [];
    }

    return [{
      name: "setRoute",
      args: { route: result.structuredPlan.nextRoute },
      requiresConfirmation: !AUTO_AGENT_ROUTES.includes(result.structuredPlan.nextRoute),
      reason: `已经替你排好顺序了，下一步更适合先去${result.structuredPlan.nextRoute === "focus" ? "专注页" : "对应页面"}。`,
    }];
  }

  if (action !== "message" || !result.structuredPlan) {
    return [];
  }

  if (/拆成|拆出|待办/u.test(draft)) {
    return [{
      name: "createTasks",
      args: { titles: createTasksFromDraft(draft) },
      requiresConfirmation: false,
      reason: "你在让陪伴拆动作，我先把待办准备好。",
    }];
  }

  if (/先做什么|从哪开始|下一步/u.test(draft)) {
    if (result.structuredPlan.planKind === "lifeTask" || result.structuredPlan.planKind === "chatOnly") {
      return [];
    }

    if (result.structuredPlan.nextRoute === "focus" && !currentState.focus.running) {
      return [{
        name: "startFocus",
        args: { mode: currentState.focus.mode, duration: currentState.focus.durationMinutes },
        requiresConfirmation: true,
        reason: "你现在更适合先拿下一轮专注，我可以替你把它起好。",
      }];
    }

    return [{
      name: "setRoute",
      args: { route: result.structuredPlan.nextRoute },
      requiresConfirmation: !AUTO_AGENT_ROUTES.includes(result.structuredPlan.nextRoute),
      reason: "我可以先把你带到最顺的下一页。",
    }];
  }

  if (detectLocalCompanionIntent(draft) === "reward" && currentState.steps.some((item) => !item.redeemed)) {
    return [{
      name: "claimRecommended",
      args: { source: "steps" },
      requiresConfirmation: true,
      reason: "现在最值得先做的是去奖励页把待领能量接回来。",
    }];
  }

  return [];
}

function normalizeAgentToolCalls(action: CompanionAIAction, draft: string, currentState: DemoState, result: CompanionActionResult): AgentToolCall[] {
  const blocksAutomaticTaskCreation = result.structuredPlan?.planKind === "lifeTask";
  const directToolCalls = (result.toolCalls?.slice(0, 2) ?? [])
    .filter((toolCall) => !(blocksAutomaticTaskCreation && toolCall.name === "createTasks"));
  const inferredToolCalls = inferAgentToolCalls(action, draft, currentState, result)
    .filter((toolCall) => !(blocksAutomaticTaskCreation && toolCall.name === "createTasks"))
    .slice(0, 2);

  if (directToolCalls.length > 0) {
    if (action === "tasks" && !directToolCalls.some((toolCall) => toolCall.name === "createTasks")) {
      return [...directToolCalls, ...inferredToolCalls.filter((toolCall) => toolCall.name === "createTasks")].slice(0, 2);
    }

    if (action === "idea" && !directToolCalls.some((toolCall) => toolCall.name === "createIdea")) {
      return [...directToolCalls, ...inferredToolCalls.filter((toolCall) => toolCall.name === "createIdea")].slice(0, 2);
    }

    return directToolCalls;
  }

  return inferredToolCalls;
}

function shouldConfirmToolCall(toolCall: AgentToolCall): boolean {
  if (toolCall.requiresConfirmation) {
    return true;
  }

  if (toolCall.name === "startFocus" || toolCall.name === "claimRecommended") {
    return true;
  }

  if (toolCall.name === "setRoute") {
    const route = toolCall.args?.route;
    return !isRouteKey(route) || !AUTO_AGENT_ROUTES.includes(route);
  }

  return false;
}

function shouldRefreshCompanionContent(savedState: DemoState): boolean {
  const content = [
    savedState.draft,
    ...savedState.tasks.map((task) => task.title),
    ...savedState.notes.map((note) => `${note.title} ${note.body}`),
    ...savedState.messages.map((message) => `${message.content} ${message.quoteRef ?? ""}`),
  ].join("\n");

  return LEGACY_COMPANION_KEYWORDS.some((keyword) => content.includes(keyword));
}

function loadState(): DemoState {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return seedState;

  try {
    const parsed = JSON.parse(saved) as DemoState;
    const nextPets = normalizePets(parsed.pets ?? seedState.pets, parsed.selectedPetId ?? seedState.selectedPetId);
    const activePet = getActivePetFromState({
      pets: nextPets,
      selectedPetId: nextPets.find((pet) => pet.active)?.id ?? seedState.selectedPetId,
    });
    const mergedState = {
      ...seedState,
      ...parsed,
      pets: nextPets,
      selectedPetId: activePet.id,
      wallet: {
        crystal: parsed.wallet?.crystal ?? seedState.wallet.crystal,
        energy: seedState.wallet.energy,
      },
      battle: {
        ...seedState.battle,
        ...parsed.battle,
        active: false,
        enemyHp: seedState.battle.enemyMaxHp,
        playerHp: seedState.battle.playerMaxHp,
        logs: [createBattleIntroLog(activePet.name)],
      },
      messages: (parsed.messages ?? seedState.messages).map((message) => ({
        ...message,
        petName: inferMessagePetName(message, nextPets, activePet.id),
      })),
      activeFocusBrief: parsed.activeFocusBrief ?? null,
      latestFocusRecap: parsed.latestFocusRecap ?? null,
      aiCards: parsed.aiCards ?? seedState.aiCards,
      agent: normalizeAgentState(seedState, parsed.agent ?? seedState.agent),
    };

    if (shouldRefreshCompanionContent(mergedState)) {
      return ensureAiCards({
        ...mergedState,
        draft: seedState.draft,
        tasks: seedState.tasks,
        notes: seedState.notes,
        messages: seedState.messages,
      });
    }

    return ensureAiCards(mergedState);
  } catch {
    return seedState;
  }
}

export function useDemoState() {
  const [state, setState] = useState<DemoState>(loadState);
  const [now, setNow] = useState<number>(Date.now());
  const [companionLoading, setCompanionLoading] = useState(false);
  const [aiErrorMode, setAiErrorMode] = useState(false);
  const [aiFallbackReason, setAiFallbackReason] = useState<string | null>(null);
  const [companionThinking, setCompanionThinking] = useState<null | {
    action: CompanionAIAction;
    intent: LocalCompanionIntent;
    draft: string;
    startedAt: number;
  }>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!state.focus.running) return;

    const timerId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [state.focus.running]);

  const activePet = useMemo<Pet>(() => getActivePetFromState(state), [state]);
  const selectedPreset = useMemo(() => getPresetMeta(state, state.focus.selectedPresetId), [state]);
  const completedMinutes = useMemo(
    () => state.sessions.filter((item) => item.status === "completed").reduce((sum, item) => sum + item.duration, 0),
    [state.sessions],
  );

  function createPendingToolTraceMessage(toolCall: AgentToolCall, current: DemoState): string {
    if (toolCall.name === "startFocus") {
      const duration = typeof toolCall.args?.duration === "number" ? Math.round(toolCall.args.duration) : current.focus.durationMinutes;
      return `等待你确认开始 ${duration} 分钟专注。`;
    }

    if (toolCall.name === "claimRecommended") {
      return "等待你确认去奖励页领取能量。";
    }

    if (toolCall.name === "setRoute" && isRouteKey(toolCall.args?.route)) {
      const routeLabelMap: Record<RouteKey, string> = {
        home: "主页",
        focus: "专注页",
        companion: "陪伴页",
        pets: "宠物页",
        explore: "探索页",
        bank: "奖励页",
        achievements: "成就页",
        battle: "试炼页",
        shop: "补给铺",
      };
      return `等待你确认前往${routeLabelMap[toolCall.args.route]}。`;
    }

    return "等待你确认是否继续这一步。";
  }

  function createPlanEvidenceTrace(plan: StructuredPlan, focusBrief?: FocusBrief | null, goalLabel?: string | null): AgentTrace | null {
    if (plan.planKind === "lifeTask") {
      return createAgentTrace(`已把「${goalLabel || trimActiveGoal(plan.goalSummary) || "这件事"}」拆成 3 个顺手步骤。`, "done");
    }

    if (plan.planKind === "focusTask" || focusBrief) {
      return createAgentTrace(`已准备好本轮专注任务：${focusBrief?.durationLabel ?? plan.recommendedDuration}。`, "done");
    }

    if (plan.planKind === "resourceTask") {
      return createAgentTrace("已整理好奖励和能量的下一步。", "done");
    }

    if (plan.planKind === "exploreTask") {
      return createAgentTrace("已整理好探索和陪伴的下一步。", "done");
    }

    return null;
  }

  function createToolFollowUpTrace(toolCall: AgentToolCall, current: DemoState, createdTaskIds?: string[]): AgentTrace | null {
    if (toolCall.name === "createTasks" && createdTaskIds?.length) {
      return createAgentTrace("下一步已经留在待办里了，照着往下走就行。", "done");
    }

    if (toolCall.name === "setRoute" && isRouteKey(toolCall.args?.route)) {
      const routeLabelMap: Record<RouteKey, string> = {
        home: "主页",
        focus: "专注页",
        companion: "陪伴页",
        pets: "宠物页",
        explore: "探索页",
        bank: "奖励页",
        achievements: "成就页",
        battle: "试炼页",
        shop: "补给铺",
      };
      return createAgentTrace(`已经把你带到${routeLabelMap[toolCall.args.route]}了。`, "done");
    }

    if (toolCall.name === "startFocus") {
      return createAgentTrace("这一轮已经启动了，奖励会在达标后接上。", "done");
    }

    if (toolCall.name === "createIdea") {
      return createAgentTrace("灵感已经收进边栏，后面还可以继续展开。", "done");
    }

    if (toolCall.name === "selectPet") {
      const nextPet = current.pets.find((pet) => pet.id === current.selectedPetId);
      return nextPet ? createAgentTrace(`已切换成${nextPet.name}，后续建议会跟着变化。`, "done") : null;
    }

    if (toolCall.name === "claimRecommended") {
      return createAgentTrace("先去奖励页把待领能量接回来，会更顺。", "done");
    }

    return null;
  }

  function runAgentToolCall(current: DemoState, toolCall: AgentToolCall, createdAt = Date.now(), skipConfirmation = false): AgentToolDispatchResult {
    if (toolCall.name === "noop") {
      return {
        nextState: current,
        trace: createAgentTrace("这一步先不自动推进，我继续陪你顺着聊。", "done", createdAt),
      };
    }

    if (!skipConfirmation && shouldConfirmToolCall(toolCall)) {
      return {
        nextState: current,
        trace: createAgentTrace(createPendingToolTraceMessage(toolCall, current), "pending", createdAt),
        pendingAction: {
          toolCall,
          requestedAt: createdAt,
        },
      };
    }

    if (toolCall.name === "createTasks") {
      const titles = Array.isArray(toolCall.args?.titles)
        ? toolCall.args.titles.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 3)
        : [];
      const existingTitles = new Set(current.tasks.map((task) => task.title.trim().toLowerCase()));
      const nextTitles = titles.filter((title) => !existingTitles.has(title.toLowerCase()));

      if (!nextTitles.length) {
        return {
          nextState: current,
          trace: createAgentTrace("这些待办已经准备好了，我就不重复再添一遍。", "done", createdAt),
        };
      }

      const createdTaskIds: string[] = [];
      const createdTasks: TaskItem[] = nextTitles.map((title) => {
        const id = createId("task");
        createdTaskIds.push(id);
        return {
          id,
          title,
          status: "todo",
          linkedFocusPresetId: current.focus.selectedPresetId,
        };
      });

      return {
        nextState: {
          ...current,
          tasks: [...createdTasks, ...current.tasks],
        },
        trace: createAgentTrace(`已加入 ${createdTasks.length} 条待办。`, "done", createdAt),
        createdTaskIds,
      };
    }

    if (toolCall.name === "setRoute") {
      const route = toolCall.args?.route;
      if (!isRouteKey(route)) {
        return {
          nextState: current,
          trace: createAgentTrace("这一步没能接到明确页面，我先保留成文字建议。", "failed", createdAt),
        };
      }

      return {
        nextState: {
          ...current,
          route,
        },
        trace: createAgentTrace(`已准备跳到${route === "focus" ? "专注页" : route === "bank" ? "奖励页" : route === "explore" ? "探索页" : route === "pets" ? "宠物页" : "陪伴页"}。`, "done", createdAt),
      };
    }

    if (toolCall.name === "startFocus") {
      const mode = toolCall.args?.mode === "countup" ? "countup" : "pomodoro";
      const duration = typeof toolCall.args?.duration === "number" ? Math.max(5, Math.min(60, Math.round(toolCall.args.duration))) : current.focus.durationMinutes;

      return {
        nextState: {
          ...current,
          route: "focus",
          focus: {
            ...current.focus,
            mode,
            running: true,
            startedAt: Date.now(),
            durationMinutes: duration,
            source: "ai",
          },
        },
        trace: createAgentTrace(`已替你开始 ${duration} 分钟${mode === "countup" ? "正计时" : "专注"}。`, "done", createdAt),
      };
    }

    if (toolCall.name === "createIdea") {
      const title = typeof toolCall.args?.title === "string" ? toolCall.args.title.trim().slice(0, 14) : "";
      const body = typeof toolCall.args?.body === "string" ? toolCall.args.body.trim() : "";
      const quoteRef = typeof toolCall.args?.quoteRef === "string" ? toolCall.args.quoteRef.trim().slice(0, 28) : undefined;

      if (!title || !body) {
        return {
          nextState: current,
          trace: createAgentTrace("这条灵感还不够完整，我先保留成一句陪伴提醒。", "failed", createdAt),
        };
      }

      const alreadyExists = current.notes.some((note) => note.title === title && note.body === body);
      if (alreadyExists) {
        return {
          nextState: current,
          trace: createAgentTrace("这条灵感已经收好啦，我不重复贴第二张。", "done", createdAt),
          createdIdeaQuote: quoteRef,
        };
      }

      return {
        nextState: {
          ...current,
          notes: [{ id: createId("note"), title, body }, ...current.notes],
        },
        trace: createAgentTrace("已把这条想法收进灵感区。", "done", createdAt),
        createdIdeaQuote: quoteRef ?? title,
      };
    }

    if (toolCall.name === "selectPet") {
      const petId = typeof toolCall.args?.petId === "string" ? toolCall.args.petId : "";
      const nextPet = current.pets.find((pet) => pet.id === petId && pet.unlocked);

      if (!nextPet) {
        return {
          nextState: current,
          trace: createAgentTrace("这只陪伴还没准备好出场，我先不切换。", "failed", createdAt),
        };
      }

      const nextPets = normalizePets(current.pets, petId);
      return {
        nextState: {
          ...current,
          selectedPetId: petId,
          pets: nextPets,
          battle: {
            ...current.battle,
            active: false,
            enemyHp: current.battle.enemyMaxHp,
            playerHp: current.battle.playerMaxHp,
            logs: [createBattleIntroLog(nextPet.name)],
          },
        },
        trace: createAgentTrace(`已切换到${nextPet.name}。`, "done", createdAt),
      };
    }

    return {
      nextState: {
        ...current,
        route: "bank",
      },
      trace: createAgentTrace("建议先去奖励页把待领能量接回来。", "done", createdAt),
    };
  }

  function applyCompanionActionResult(
    current: DemoState,
    action: CompanionAIAction,
    draft: string,
    result: CompanionActionResult,
    options: {
      addUserMessage: boolean;
      clearDraft: boolean;
      userMessageContent?: string;
      fallbackNoticeContent?: string;
      replaceMessageId?: string;
    },
  ): DemoState {
    const createdAt = Date.now();
    let nextMessages = [...current.messages];
    const shouldReplaceActiveGoal = Boolean(result.structuredPlan) || isGoalBearingCompanionDraft(draft);
    const nextActiveGoal = shouldReplaceActiveGoal
      ? createActiveGoalFromCompanionResult(draft, result.structuredPlan)
      : current.agent.activeGoal;
    let nextAgent = normalizeAgentState(current, {
      activeGoal: nextActiveGoal,
      activePlan: result.structuredPlan ?? current.agent.activePlan,
      pendingAction: null,
      agentStatus: "acting",
      lastObservedSnapshot: createAgentSnapshot(current),
    });

    if (options.fallbackNoticeContent) {
      nextMessages.push(createPetMessage(current, {
        id: createId("msg"),
        type: "systemEvent",
        content: options.fallbackNoticeContent,
        createdAt,
        aiSource: "fallback",
      }));
    }

    if (options.addUserMessage) {
      nextMessages.push({
        id: createId("msg"),
        role: "user",
        type: "text",
        content: options.userMessageContent ?? draft,
        createdAt,
      });
    }

    let nextTasks = current.tasks;
    let nextNotes = current.notes;
    let nextFocus = current.focus;
    let nextRoute = "companion" as RouteKey;
    const cardsToUpsert: AICard[] = [];
    const structuredMessageId = options.replaceMessageId ?? createId("msg");
    const resultFocusBrief = result.structuredPlan?.planKind === "lifeTask" || result.structuredPlan?.planKind === "chatOnly"
      ? undefined
      : result.focusBrief;
    const nextFocusBrief = resultFocusBrief
      ?? (result.structuredPlan ? createFocusBriefFromPlan(result.structuredPlan, structuredMessageId) : null);
    const normalizedToolCalls = normalizeAgentToolCalls(action, draft, current, result)
      .filter((toolCall) => !(action === "tasks" && toolCall.name === "createTasks"));

    if (result.structuredPlan) {
      cardsToUpsert.push(createJourneyPlanCard(result.structuredPlan));
      const planTrace = createPlanEvidenceTrace(result.structuredPlan, nextFocusBrief, nextActiveGoal);
      if (planTrace) {
        nextAgent = normalizeAgentState(current, {
          ...nextAgent,
          agentTrace: pushAgentTrace(nextAgent.agentTrace, planTrace),
        });
      }
    }

    if (result.focusRecap) {
      cardsToUpsert.push(createFocusRecapCardFromRecap(result.focusRecap));
    }

    const upsertResultMessage = (message: CompanionMessage) => {
      if (!options.replaceMessageId) {
        nextMessages.push(message);
        return;
      }

      let replaced = false;
      nextMessages = nextMessages.map((item) => {
        if (item.id !== options.replaceMessageId) return item;
        replaced = true;
        return message;
      });

      if (!replaced) {
        nextMessages.push(message);
      }
    };

    if (result.structuredPlan) {
      if (action === "plan") {
        nextFocus = { ...current.focus, source: "ai" };
      }
      if (nextFocusBrief && !current.focus.running) {
        nextFocus = {
          ...nextFocus,
          source: "ai",
          durationMinutes: nextFocusBrief.durationMinutes,
          selectedPresetId: presetIdForDuration(current, nextFocusBrief.durationMinutes),
        };
      }
      upsertResultMessage(createPetMessage(current, {
        id: structuredMessageId,
        type: "structuredPlan",
        content: result.content,
        createdAt,
        aiSource: result.source,
        structuredPlan: result.structuredPlan,
      }));
    } else {
      upsertResultMessage(createPetMessage(current, {
        id: structuredMessageId,
        type: "text",
        content: result.content,
        createdAt,
        aiSource: result.source,
        sourceDraft: draft,
        canCreateCard: shouldOfferCompanionCardAction(draft),
      }));
    }

    let workingState: DemoState = {
      ...current,
      route: nextRoute,
      draft: options.clearDraft ? "" : current.draft,
      focus: nextFocus,
      activeFocusBrief: nextFocusBrief ? { ...nextFocusBrief, sourceMessageId: nextFocusBrief.sourceMessageId ?? structuredMessageId } : current.activeFocusBrief,
      latestFocusRecap: result.focusRecap ?? current.latestFocusRecap,
      tasks: nextTasks,
      notes: nextNotes,
      messages: nextMessages,
      agent: nextAgent,
    };

    for (const toolCall of normalizedToolCalls) {
      const dispatch = runAgentToolCall(workingState, toolCall, createdAt);
      workingState = dispatch.nextState;
      nextAgent = normalizeAgentState(workingState, {
        ...nextAgent,
        agentTrace: pushAgentTrace(nextAgent.agentTrace, dispatch.trace),
        pendingAction: dispatch.pendingAction ? { ...dispatch.pendingAction, source: result.source } : null,
        agentStatus: dispatch.pendingAction ? "awaiting_confirmation" : "acting",
        lastObservedSnapshot: createAgentSnapshot(dispatch.nextState),
      });

      const followUpTrace = createToolFollowUpTrace(toolCall, dispatch.nextState, dispatch.createdTaskIds);
      if (followUpTrace) {
        nextAgent = normalizeAgentState(dispatch.nextState, {
          ...nextAgent,
          agentTrace: pushAgentTrace(nextAgent.agentTrace, followUpTrace),
          lastObservedSnapshot: createAgentSnapshot(dispatch.nextState),
        });
      }

      if (dispatch.pendingAction) {
        break;
      }
    }

    workingState = {
      ...workingState,
      messages: nextMessages,
      agent: normalizeAgentState(workingState, {
        ...nextAgent,
        activeGoal: nextActiveGoal,
        activePlan: result.structuredPlan ?? nextAgent.activePlan,
        agentStatus: nextAgent.pendingAction ? "awaiting_confirmation" : "done",
        lastObservedSnapshot: createAgentSnapshot(workingState),
      }),
    };

    return finalizeState({
      ...workingState,
      route: workingState.route ?? "companion",
    }, cardsToUpsert);
  }

  async function performCompanionAction(
    action: CompanionAIAction,
    options: {
      draft: string;
      addUserMessage: boolean;
      clearDraft: boolean;
    },
  ): Promise<void> {
    if (companionLoading) return;

    const draft = options.draft.trim();
    if (!draft) return;

    const snapshot = state;
    const resolvedRequest = resolveCompanionRequest(action, draft, snapshot);
    const streamMode = getCompanionStreamMode(resolvedRequest.action, resolvedRequest.requestDraft);
    const streamMessageId = createId("msg");
    let hasStreamDelta = false;
    const patchStreamMessage = (nextContent: string, append = false) => {
      setState((current) => ({
        ...current,
        messages: current.messages.map((message) =>
          message.id === streamMessageId
            ? { ...message, content: append ? `${message.content}${nextContent}` : nextContent }
            : message,
        ),
      }));
    };

    setCompanionLoading(true);
    setAiErrorMode(false);
    setCompanionThinking({
      action: resolvedRequest.action,
      intent: detectLocalCompanionIntent(resolvedRequest.requestDraft),
      draft: resolvedRequest.userMessageContent,
      startedAt: Date.now(),
    });
    setState((current) => {
      const createdAt = Date.now();
      const streamingMessage = streamMode === "card"
        ? createPetMessage(current, {
          id: streamMessageId,
          type: "structuredPlan",
          content: "正在把这句话整理成可执行结果...",
          createdAt,
          aiSource: "model",
          streaming: true,
          structuredPlan: createStreamingSkeletonPlan(resolvedRequest.action, resolvedRequest.requestDraft),
        })
        : createPetMessage(current, {
          id: streamMessageId,
          type: "text",
          content: "正在理解这句话...",
          createdAt,
          aiSource: "model",
          streaming: true,
        });
      const nextMessages = [
        ...current.messages,
        ...(options.addUserMessage
          ? [{
            id: createId("msg"),
            role: "user" as const,
            type: "text" as const,
            content: resolvedRequest.userMessageContent,
            createdAt,
          }]
          : []),
        streamingMessage,
      ];

      return {
        ...current,
        draft: options.clearDraft ? "" : current.draft,
        messages: nextMessages,
        agent: normalizeAgentState(current, {
          agentStatus: "thinking",
          activeGoal: current.agent.activeGoal ?? (isGoalBearingCompanionDraft(resolvedRequest.requestDraft) ? trimActiveGoal(resolvedRequest.requestDraft) : null),
          pendingAction: null,
        }),
      };
    });

    try {
      await waitForNextPaint();

      let modelResult: CompanionAIResponse;
      try {
        modelResult = await requestCompanionModelStream(resolvedRequest.action, resolvedRequest.requestDraft, snapshot, streamMode, {
          onStatus: (label) => {
            if (!hasStreamDelta) {
              patchStreamMessage(`${label}...`);
            }
          },
          onDelta: (delta) => {
            patchStreamMessage(delta, hasStreamDelta);
            hasStreamDelta = true;
          },
          onMetric: (metric) => {
            console.info("[companion-stream] metric", metric);
          },
        });
      } catch (streamError) {
        console.warn("[companion-stream] falling back to json endpoint", streamError);
        modelResult = await requestCompanionModel(resolvedRequest.action, resolvedRequest.requestDraft, snapshot, streamMode);
      }

      setAiFallbackReason(null);
      setState((current) =>
        applyCompanionActionResult(current, resolvedRequest.action, resolvedRequest.requestDraft, modelResult, {
          addUserMessage: false,
          clearDraft: false,
          userMessageContent: resolvedRequest.userMessageContent,
          replaceMessageId: streamMessageId,
        }),
      );
    } catch (error) {
      const fallbackResult = createFallbackCompanionResult(resolvedRequest.action, resolvedRequest.requestDraft, snapshot);
      const fallbackReason = describeCompanionFallbackReason(error);
      setAiErrorMode(true);
      setAiFallbackReason(fallbackReason);
      setState((current) =>
        applyCompanionActionResult(current, resolvedRequest.action, resolvedRequest.requestDraft, fallbackResult, {
          addUserMessage: false,
          clearDraft: false,
          userMessageContent: resolvedRequest.userMessageContent,
          fallbackNoticeContent: `${FALLBACK_NOTICE} 原因：${fallbackReason}`,
          replaceMessageId: streamMessageId,
        }),
      );
    } finally {
      setCompanionLoading(false);
      setCompanionThinking(null);
    }
  }

  function resolveCompanionRequest(
    requestedAction: CompanionAIAction,
    draft: string,
    currentState: DemoState,
  ): {
    action: CompanionAIAction;
    requestDraft: string;
    userMessageContent: string;
  } {
    if (requestedAction !== "message") {
      const baseGoal = getLatestMeaningfulCompanionGoal(currentState);
      if (baseGoal && (isLowSignalCompanionDraft(draft) || detectFollowUpCompanionAction(draft))) {
        return {
          action: requestedAction,
          requestDraft: `${baseGoal}。用户刚刚补充：${draft}`,
          userMessageContent: draft,
        };
      }

      return {
        action: requestedAction,
        requestDraft: draft,
        userMessageContent: draft,
      };
    }

    return {
      action: requestedAction,
      requestDraft: draft,
      userMessageContent: draft,
    };
  }

  function finalizeState(nextState: DemoState, cardsToUpsert: AICard[] = []): DemoState {
    let mergedCards = nextState.aiCards;
    cardsToUpsert.forEach((card) => {
      mergedCards = upsertAiCard(mergedCards, card);
    });

    return ensureAiCards({
      ...nextState,
      aiCards: mergedCards,
    });
  }

  function patchAchievements(nextSessions: FocusSession[], stepRedeemed: boolean, nextPets: Pet[]): Achievement[] {
    return state.achievements.map((achievement) => {
      if (achievement.id === "a-1" && nextSessions.some((item) => item.status === "completed")) {
        return { ...achievement, unlocked: true };
      }
      if (achievement.id === "a-2" && stepRedeemed) {
        return { ...achievement, unlocked: true };
      }
      if (achievement.id === "a-3" && nextPets.some((pet) => pet.rarity === "SR" && pet.unlocked)) {
        return { ...achievement, unlocked: true };
      }
      if (achievement.id === "a-4" && nextSessions.filter((item) => item.status === "completed").length >= 4) {
        return { ...achievement, unlocked: true };
      }
      return achievement;
    });
  }

  function settleCompletedFocus(current: DemoState, source: DemoState["focus"]["source"], recapContent: string): DemoState {
    const activePreset = getPresetMeta(current, current.focus.selectedPresetId);
    const rewardCrystal = current.focus.durationMinutes * 3;
    const rewardExp = current.focus.durationMinutes * 2;
    const nextSessions: FocusSession[] = [
      {
        id: createId("session"),
        tag: activePreset.title,
        duration: current.focus.durationMinutes,
        status: "completed",
        crystalReward: rewardCrystal,
        expReward: rewardExp,
        source,
        endedAt: Date.now(),
      },
      ...current.sessions,
    ];

    const nextPets = current.pets.map((pet) => {
      if (pet.id !== current.selectedPetId) return pet;
      const threshold = pet.level * 12;
      const nextExpRaw = pet.exp + rewardExp;
      const leveled = nextExpRaw >= threshold;
      return {
        ...pet,
        level: leveled ? pet.level + 1 : pet.level,
        exp: leveled ? nextExpRaw - threshold : nextExpRaw,
        mood: clamp(pet.mood + 6, 0, 100),
      };
    });

    return finalizeState({
      ...current,
      wallet: {
        ...current.wallet,
        crystal: current.wallet.crystal + rewardCrystal,
      },
      focus: { ...current.focus, running: false, startedAt: null },
      pets: nextPets,
      sessions: nextSessions,
      achievements: patchAchievements(nextSessions, current.steps.some((item) => item.redeemed), nextPets),
      messages: [
        ...current.messages,
        createPetMessage({ pets: nextPets, selectedPetId: current.selectedPetId }, {
          id: createId("msg"),
          type: "reward",
          content:
            source === "demo"
              ? `演示跳过完成，直接结算 ${rewardCrystal} 枚像素晶石和 ${rewardExp} 点经验，方便你继续测试后续闭环。`
              : `专注达标，拿到 ${rewardCrystal} 枚像素晶石和 ${rewardExp} 点经验，当前陪伴宠物也一起成长了。`,
          createdAt: Date.now(),
        }),
        createPetMessage({ pets: nextPets, selectedPetId: current.selectedPetId }, {
          id: createId("msg"),
          type: "recap",
          content: recapContent,
          createdAt: Date.now(),
        }),
      ],
    }, [createFocusRecapCard(source)]);
  }

  function setRoute(route: RouteKey): void {
    setState((current) => ({ ...current, route }));
  }

  function setDraft(value: string): void {
    setState((current) => ({ ...current, draft: value }));
  }

  function generateJourneyPlan(): void {
    void performCompanionAction("plan", {
      draft: state.draft.trim() || DEFAULT_COMPANION_DRAFT,
      addUserMessage: false,
      clearDraft: false,
    });
  }

  function setFocusMode(mode: DemoState["focus"]["mode"]): void {
    setState((current) => {
      if (current.focus.running) return current;
      return { ...current, focus: { ...current.focus, mode } };
    });
  }

  function setPreset(presetId: string): void {
    setState((current) => {
      if (current.focus.running) return current;
      const preset = getPresetMeta(current, presetId);
      return {
        ...current,
        focus: {
          ...current.focus,
          selectedPresetId: preset.id,
          durationMinutes: preset.minutes,
        },
      };
    });
  }

  async function refreshFocusRecap(settledState: DemoState): Promise<void> {
    const fallbackRecap = createFallbackFocusRecap(settledState);
    try {
      const result = await requestCompanionModel("message", createFocusRecapPrompt(settledState), settledState);
      const nextRecap = result.focusRecap ?? fallbackRecap;
      const aiSource = result.focusRecap ? "model" : "fallback";
      setState((current) =>
        finalizeState({
          ...current,
          latestFocusRecap: nextRecap,
          messages: [
            ...current.messages,
            createPetMessage(current, {
              id: createId("msg"),
              type: "recap",
              content: createFocusRecapMessageContent(nextRecap),
              createdAt: Date.now(),
              aiSource,
            }),
          ],
        }, [createFocusRecapCardFromRecap(nextRecap)]),
      );
    } catch {
      setState((current) =>
        finalizeState({
          ...current,
          latestFocusRecap: fallbackRecap,
          messages: [
            ...current.messages,
            createPetMessage(current, {
              id: createId("msg"),
              type: "recap",
              content: createFocusRecapMessageContent(fallbackRecap),
              createdAt: Date.now(),
              aiSource: "fallback",
            }),
          ],
        }, [createFocusRecapCardFromRecap(fallbackRecap)]),
      );
    }
  }

  function startFocus(): void {
    setState((current) => {
      if (current.focus.running) {
        return { ...current, route: "focus" };
      }

      const preset = getPresetMeta(current, current.focus.selectedPresetId);
      return {
        ...current,
        route: "focus",
        focus: {
          ...current.focus,
          running: true,
          startedAt: Date.now(),
          durationMinutes: preset.minutes,
        },
      };
    });
  }

  function stopFocus(): void {
    setState((current) => {
      if (!current.focus.running) {
        return current;
      }

      const activePreset = getPresetMeta(current, current.focus.selectedPresetId);
      const interruptedDuration = Math.max(1, Math.round(getFocusElapsedSeconds(current.focus) / 60));
      return finalizeState({
        ...current,
        focus: { ...current.focus, running: false, startedAt: null },
        sessions: [
          {
            id: createId("session"),
            tag: activePreset.title,
            duration: interruptedDuration,
            status: "interrupted",
            crystalReward: 0,
            expReward: 0,
            source: current.focus.source,
            endedAt: Date.now(),
          },
          ...current.sessions,
        ],
        messages: [
          ...current.messages,
          createPetMessage(current, {
            id: createId("msg"),
            type: "recap",
            content: "这轮先记成放弃，不会发放奖励。等你准备好，我们再从下一轮继续。",
            createdAt: Date.now(),
          }),
        ],
      });
    });
  }

  function finishFocus(): void {
    let settledState: DemoState | null = null;
    setState((current) => {
      if (!current.focus.running || !canClaimFocusReward(current.focus)) {
        return current;
      }

      settledState = settleCompletedFocus(
        current,
        current.focus.source,
        "这轮奖励已经拿稳了。下一步先去奖励页领取步数能量，再决定要不要继续探索。",
      );
      return settledState;
    });

    if (settledState) {
      void refreshFocusRecap(settledState);
    }
  }

  function skipFocusForDemo(): void {
    setState((current) =>
      settleCompletedFocus(
        current,
        "demo",
        "这次是演示跳过结算。下一步先去奖励页领取步数能量，再继续录屏或测试后续闭环。",
      ),
    );
  }

  useEffect(() => {
    if (!state.focus.running || state.focus.mode !== "pomodoro" || !state.focus.startedAt) return;
    if (canClaimFocusReward(state.focus, now)) {
      finishFocus();
    }
  }, [now, state.focus.running, state.focus.mode, state.focus.startedAt, state.focus.durationMinutes]);

  function toggleTask(taskId: string): void {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId ? { ...task, status: task.status === "done" ? "todo" : "done" } : task,
      ),
    }));
  }

  function runAiAction(action: "tasks" | "plan" | "idea"): void {
    const draft = state.draft.trim();
    if (!draft) return;

    if (action === "idea") {
      const createdAt = Date.now();
      setAiErrorMode(false);
      setState((current) => {
        const currentDraft = current.draft.trim();
        if (!currentDraft) return current;

        const nextIdea = createIdeaFromDraft(currentDraft);
        const dispatch = runAgentToolCall(
          current,
          {
            name: "createIdea",
            args: nextIdea,
            requiresConfirmation: false,
            reason: "先把这条想法放进灵感区，后面准备好了再继续展开。",
          },
          createdAt,
          true,
        );

        return finalizeState({
          ...dispatch.nextState,
          draft: "",
          agent: normalizeAgentState(dispatch.nextState, {
            ...current.agent,
            pendingAction: null,
            agentStatus: "done",
            agentTrace: pushAgentTrace(current.agent.agentTrace, dispatch.trace),
            lastObservedSnapshot: createAgentSnapshot(dispatch.nextState),
          }),
        });
      });
      return;
    }

    void performCompanionAction(action, {
      draft,
      addUserMessage: true,
      clearDraft: false,
    });
  }

  function sendDraftMessage(): void {
    const draft = state.draft.trim();
    if (!draft) return;
    void performCompanionAction("message", {
      draft,
      addUserMessage: true,
      clearDraft: true,
    });
  }

  function generateTaskCardFromMessage(sourceDraft: string): void {
    const draft = sourceDraft.trim();
    if (!draft || companionLoading) return;

    void performCompanionAction(getCompanionCardActionForDraft(draft), {
      draft,
      addUserMessage: false,
      clearDraft: false,
    });
  }

  function confirmPendingAgentAction(): void {
    setState((current) => {
      const pendingAction = current.agent.pendingAction;
      if (!pendingAction) return current;

      const createdAt = Date.now();
      const dispatch = runAgentToolCall(
        {
          ...current,
          agent: normalizeAgentState(current, {
            pendingAction: null,
            agentStatus: "acting",
          }),
        },
        {
          ...pendingAction.toolCall,
          requiresConfirmation: false,
        },
        createdAt,
        true,
      );

      let nextMessages = dispatch.nextState.messages;
      let nextAgent = normalizeAgentState(dispatch.nextState, {
        activeGoal: current.agent.activeGoal,
        activePlan: current.agent.activePlan,
        pendingAction: null,
        agentStatus: "done",
        agentTrace: pushAgentTrace(current.agent.agentTrace, dispatch.trace),
        lastObservedSnapshot: createAgentSnapshot(dispatch.nextState),
      });

      const followUpTrace = createToolFollowUpTrace(pendingAction.toolCall, dispatch.nextState, dispatch.createdTaskIds);
      if (followUpTrace) {
        nextAgent = normalizeAgentState(dispatch.nextState, {
          ...nextAgent,
          agentTrace: pushAgentTrace(nextAgent.agentTrace, followUpTrace),
          lastObservedSnapshot: createAgentSnapshot(dispatch.nextState),
        });
      }

      return finalizeState({
        ...dispatch.nextState,
        messages: nextMessages,
        agent: nextAgent,
      });
    });
  }

  function skipPendingAgentAction(): void {
    setState((current) => {
      if (!current.agent.pendingAction) return current;

      return finalizeState({
        ...current,
        agent: normalizeAgentState(current, {
          pendingAction: null,
          agentStatus: "done",
          agentTrace: pushAgentTrace(current.agent.agentTrace, createAgentTrace("这一步先保留，继续陪你整理别的。", "skipped")),
          lastObservedSnapshot: createAgentSnapshot(current),
        }),
      });
    });
  }

  function askPetForAdvice(): void {
    setState((current) => {
      const currentPet = getActivePetFromState(current);
      return finalizeState({
        ...current,
        route: "companion",
        messages: [
          ...current.messages,
          createPetMessage(current, {
            id: createId("msg"),
            type: "text",
            content: createPetAdvice(currentPet),
            createdAt: Date.now(),
          }),
        ],
      });
    });
  }

  function clearMessages(): void {
    setAiErrorMode(false);
    setState((current) => {
      if (current.messages.length === 0 && current.agent.agentTrace.length === 0 && !current.agent.pendingAction) return current;
      return finalizeState({
        ...current,
        messages: [],
        agent: normalizeAgentState(current, {
          agentStatus: "idle",
          activeGoal: null,
          activePlan: null,
          pendingAction: null,
          agentTrace: [],
          lastObservedSnapshot: null,
        }),
      });
    });
  }

  function clearActiveGoal(): void {
    setState((current) => {
      if (!current.agent.activeGoal && !current.agent.activePlan) return current;

      return finalizeState({
        ...current,
        agent: normalizeAgentState(current, {
          activeGoal: null,
          activePlan: null,
          pendingAction: null,
          agentStatus: "idle",
          agentTrace: pushAgentTrace(current.agent.agentTrace, createAgentTrace("已换到新的目标入口，等你说下一件想推进的事。", "skipped")),
          lastObservedSnapshot: createAgentSnapshot(current),
        }),
      });
    });
  }

  function completeActiveGoal(): void {
    setState((current) => {
      const goalLabel = current.agent.activeGoal?.trim() || current.agent.activePlan?.goalSummary.trim();
      if (!goalLabel) return current;

      return finalizeState({
        ...current,
        agent: normalizeAgentState(current, {
          activeGoal: null,
          activePlan: null,
          pendingAction: null,
          agentStatus: "done",
          agentTrace: pushAgentTrace(current.agent.agentTrace, createAgentTrace(`已把「${goalLabel}」标记完成。`, "done")),
          lastObservedSnapshot: createAgentSnapshot(current),
        }),
      });
    });
  }

  function recordPlanStepProgress(plan: StructuredPlan, completedStepIndex: number): void {
    setState((current) => {
      const safeCompletedIndex = Math.max(0, Math.min(completedStepIndex, plan.steps.length - 1));
      const completedStep = plan.steps[safeCompletedIndex] ?? "这一步";
      const nextStep = plan.steps[safeCompletedIndex + 1];
      const message = nextStep
        ? `已完成第 ${safeCompletedIndex + 1} 步：${completedStep}。下一步是：${nextStep}`
        : `这组三步已经走完，可以标记「${current.agent.activeGoal ?? plan.goalSummary}」完成。`;

      return finalizeState({
        ...current,
        agent: normalizeAgentState(current, {
          activeGoal: current.agent.activeGoal ?? plan.goalSummary,
          activePlan: plan,
          agentStatus: nextStep ? "acting" : "done",
          agentTrace: pushAgentTrace(current.agent.agentTrace, createAgentTrace(message, "done")),
          lastObservedSnapshot: createAgentSnapshot(current),
        }),
      });
    });
  }

  function addPlanStepsToTasks(plan: StructuredPlan, source: "model" | "fallback" = "fallback"): void {
    setState((current) => {
      const createdAt = Date.now();
      const dispatch = runAgentToolCall(current, {
        name: "createTasks",
        args: { titles: plan.steps },
        requiresConfirmation: false,
        reason: "先把这三个步骤放进待办里，照着往下做会更顺。",
      }, createdAt, true);

      let nextMessages = current.messages;
      let nextAgent = normalizeAgentState(dispatch.nextState, {
        ...current.agent,
        activeGoal: plan.goalSummary,
        activePlan: plan,
        pendingAction: null,
        agentStatus: "done",
        agentTrace: pushAgentTrace(current.agent.agentTrace, dispatch.trace),
        lastObservedSnapshot: createAgentSnapshot(dispatch.nextState),
      });

      return finalizeState({
        ...dispatch.nextState,
        messages: nextMessages,
        agent: nextAgent,
      });
    });
  }

  function removeTask(taskId: string): void {
    setState((current) => {
      if (!current.tasks.some((task) => task.id === taskId)) return current;
      return finalizeState({
        ...current,
        tasks: current.tasks.filter((task) => task.id !== taskId),
      });
    });
  }

  function clearCompletedTasks(): void {
    setState((current) => {
      if (!current.tasks.some((task) => task.status === "done")) return current;
      return finalizeState({
        ...current,
        tasks: current.tasks.filter((task) => task.status !== "done"),
      });
    });
  }

  function removeNote(noteId: string): void {
    setState((current) => {
      if (!current.notes.some((note) => note.id === noteId)) return current;
      return finalizeState({
        ...current,
        notes: current.notes.filter((note) => note.id !== noteId),
      });
    });
  }

  function convertNoteToTasks(noteId: string): void {
    setState((current) => {
      const targetNote = current.notes.find((note) => note.id === noteId);
      if (!targetNote) return current;

      const titles = createTasksFromDraft(`${targetNote.title}。${targetNote.body}`);
      const existingTitles = new Set(current.tasks.map((task) => task.title.trim().toLowerCase()));
      const nextTitles = titles.filter((title) => !existingTitles.has(title.toLowerCase()));

      if (!nextTitles.length) {
        return current;
      }

      const createdTasks: TaskItem[] = nextTitles.map((title) => ({
        id: createId("task"),
        title,
        status: "todo",
        linkedFocusPresetId: current.focus.selectedPresetId,
      }));

      return finalizeState({
        ...current,
        tasks: [...createdTasks, ...current.tasks],
      });
    });
  }

  function selectPet(petId: string): void {
    setState((current) => {
      const nextPets = normalizePets(current.pets, petId);
      const nextActivePet = getActivePetFromState({ pets: nextPets, selectedPetId: petId });

      return finalizeState({
        ...current,
        selectedPetId: petId,
        pets: nextPets,
        battle: {
          ...current.battle,
          active: false,
          enemyHp: current.battle.enemyMaxHp,
          playerHp: current.battle.playerMaxHp,
          logs: [createBattleIntroLog(nextActivePet.name)],
        },
        messages: [
          ...current.messages,
          createPetMessage({ pets: nextPets, selectedPetId: petId }, {
            id: createId("msg"),
            type: "systemEvent",
            content: `已切换为${nextActivePet.name}，后续建议和对战开场会跟着变化。`,
            createdAt: Date.now(),
          }),
        ],
      });
    });
  }

  function feedPet(): void {
    setState((current) => {
      if (current.wallet.crystal < 18) return current;
      return finalizeState({
        ...current,
        wallet: { ...current.wallet, crystal: current.wallet.crystal - 18 },
        pets: current.pets.map((pet) =>
          pet.id === current.selectedPetId
            ? { ...pet, mood: clamp(pet.mood + 12, 0, 100), affection: clamp(pet.affection + 8, 0, 100) }
            : pet,
        ),
      });
    });
  }

  function redeemStep(stepId: string): void {
    setState((current) => {
      const target = current.steps.find((step) => step.id === stepId);
      if (!target || target.redeemed) return current;

      const nextSteps = current.steps.map((step) => (step.id === stepId ? { ...step, redeemed: true } : step));
      return finalizeState({
        ...current,
        wallet: { ...current.wallet, energy: current.wallet.energy + target.energyEarned },
        steps: nextSteps,
        achievements: patchAchievements(current.sessions, true, current.pets),
        messages: [
          ...current.messages,
          createPetMessage(current, { id: createId("msg"), type: "systemEvent", content: `步数到账：${target.energyEarned} 点能量已经放进你的奖励页，现在可以考虑兑换成晶石了。`, createdAt: Date.now() }),
        ],
      });
    });
  }

  function exchangeEnergy(): void {
    setState((current) => {
      const crystals = Math.floor(current.wallet.energy / 10);
      if (crystals <= 0) return current;
      return finalizeState({
        ...current,
        wallet: {
          ...current.wallet,
          energy: current.wallet.energy - crystals * 10,
          crystal: current.wallet.crystal + crystals,
        },
        messages: [
          ...current.messages,
          createPetMessage(current, {
            id: createId("msg"),
            type: "systemEvent",
            content: `已兑换 ${crystals} 枚像素晶石。现在资源更充足了，可以去喂食、探索，或者继续开下一轮专注。`,
            createdAt: Date.now(),
          }),
        ],
      });
    });
  }

  function exploreNode(nodeId: string): void {
    setState((current) => {
      if (current.wallet.energy < 5) return current;
      return finalizeState({
        ...current,
        wallet: { ...current.wallet, energy: clamp(current.wallet.energy - 5, 0, seedState.wallet.energy), crystal: current.wallet.crystal + 12 },
        mapNodes: current.mapNodes.map((node) => (node.id === nodeId ? { ...node, explored: node.explored + 1 } : node)),
        messages: [
          ...current.messages,
          createPetMessage(current, { id: createId("msg"), type: "systemEvent", content: "探索成功，带回 12 枚像素晶石，还顺手点亮了一段新的地图记忆。", createdAt: Date.now() }),
        ],
      });
    });
  }

  function startBattle(): void {
    setState((current) => {
      if (current.wallet.energy < 10) return current;
      const currentActivePet = getActivePetFromState(current);
      return finalizeState({
        ...current,
        wallet: { ...current.wallet, energy: clamp(current.wallet.energy - 10, 0, seedState.wallet.energy) },
        battle: {
          ...current.battle,
          active: true,
          enemyHp: current.battle.enemyMaxHp,
          playerHp: current.battle.playerMaxHp,
          logs: [createBattleOpeningLog(currentActivePet.name)],
        },
      });
    });
  }

  function battleAction(action: "attack" | "heal" | "guard" | "escape"): void {
    setState((current) => {
      if (!current.battle.active) return current;
      const currentActivePet = getActivePetFromState(current);
      if (action === "escape") {
        return finalizeState({
          ...current,
          battle: {
            ...current.battle,
            active: false,
            logs: [`${currentActivePet.name} 先撤退了，把能量留给更重要的任务。`],
          },
        });
      }

      const enemyHp = action === "attack" ? clamp(current.battle.enemyHp - 28, 0, current.battle.enemyMaxHp) : current.battle.enemyHp;
      const healAmount = action === "heal" ? Math.max(0, Math.min(18, current.battle.playerMaxHp - current.battle.playerHp)) : 0;
      const playerHpBase = action === "heal" ? current.battle.playerHp + healAmount : current.battle.playerHp;

      if (enemyHp <= 0) {
        return finalizeState({
          ...current,
          wallet: { ...current.wallet, crystal: current.wallet.crystal + 20 },
          battle: {
            ...current.battle,
            active: false,
            enemyHp,
            logs: [`${currentActivePet.name} 赢下了这场试炼，额外拿到 20 晶石。`],
          },
        });
      }

      return finalizeState({
        ...current,
        battle: {
          ...current.battle,
          enemyHp,
          playerHp: clamp(playerHpBase - 16, 0, current.battle.playerMaxHp),
          logs: [
            action === "attack"
              ? `${currentActivePet.name} 发起攻击，对方掉了 28 HP。`
              : action === "heal"
                ? `${currentActivePet.name} 回复了 18 HP。`
                : `${currentActivePet.name} 顶住防御，先稳住节奏。`,
            "系统反击，造成 16 点伤害。",
          ],
        },
      });
    });
  }

  function buyItem(itemId: "snack" | "tea" | "scarf"): void {
    const prices: Record<"snack" | "tea" | "scarf", number> = { snack: 24, tea: 18, scarf: 66 };

    setState((current) => {
      if (current.wallet.crystal < prices[itemId]) return current;

      const nextPets = current.pets.map((pet) => {
        if (pet.id !== current.selectedPetId) return pet;
        if (itemId === "scarf") return { ...pet, activeSkin: "荧光围巾" };
        if (itemId === "snack") {
          return {
            ...pet,
            mood: clamp(pet.mood + 10, 0, 100),
            affection: clamp(pet.affection + 6, 0, 100),
          };
        }
        return pet;
      });

      const nextEnergy = itemId === "tea" ? clamp(current.wallet.energy + 20, 0, seedState.wallet.energy) : current.wallet.energy;
      const purchaseMessage =
        itemId === "tea"
          ? "薄荷茶已经泡好，回复了 20 点能量，可以继续探索或开始对战。"
          : itemId === "snack"
            ? "像素零食喂好了，当前陪伴的心情和亲密度都升了一点。"
            : "荧光围巾已经换上，当前陪伴的形象更醒目了。";

      return finalizeState({
        ...current,
        wallet: {
          ...current.wallet,
          crystal: current.wallet.crystal - prices[itemId],
          energy: nextEnergy,
        },
        pets: nextPets,
        messages: [
          ...current.messages,
          createPetMessage({ pets: nextPets, selectedPetId: current.selectedPetId }, { id: createId("msg"), type: "systemEvent", content: purchaseMessage, createdAt: Date.now() }),
        ],
      });
    });
  }

  const timerSeconds = useMemo(() => {
    if (!state.focus.running || !state.focus.startedAt) {
      return state.focus.mode === "pomodoro" ? selectedPreset.minutes * 60 : 0;
    }

    const elapsed = Math.floor((now - state.focus.startedAt) / 1000);
    return state.focus.mode === "countup" ? elapsed : Math.max(0, state.focus.durationMinutes * 60 - elapsed);
  }, [now, selectedPreset.minutes, state.focus.durationMinutes, state.focus.mode, state.focus.running, state.focus.startedAt]);

  const focusElapsedSeconds = useMemo(() => getFocusElapsedSeconds(state.focus, now), [now, state.focus]);
  const canClaimCurrentFocusReward = useMemo(() => canClaimFocusReward(state.focus, now), [now, state.focus]);

  return {
    state,
    activePet,
    selectedPreset,
    completedMinutes,
    generateJourneyPlan,
    companionLoading,
    companionThinking,
    aiErrorMode,
    aiFallbackReason,
    timerSeconds,
    focusElapsedSeconds,
    canClaimFocusReward: canClaimCurrentFocusReward,
    setRoute,
    setDraft,
    setFocusMode,
    setPreset,
    startFocus,
    stopFocus,
    finishFocus,
    skipFocusForDemo,
    toggleTask,
    removeTask,
    clearCompletedTasks,
    removeNote,
    convertNoteToTasks,
    addPlanStepsToTasks,
    runAiAction,
    sendDraftMessage,
    generateTaskCardFromMessage,
    confirmPendingAgentAction,
    skipPendingAgentAction,
    clearMessages,
    clearActiveGoal,
    completeActiveGoal,
    recordPlanStepProgress,
    askPetForAdvice,
    selectPet,
    feedPet,
    redeemStep,
    exchangeEnergy,
    exploreNode,
    startBattle,
    battleAction,
    buyItem,
  };
}





