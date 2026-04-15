import { useEffect, useMemo, useState } from "react";
import { seedState } from "../data/seed";
import type {
  AICard,
  Achievement,
  CompanionAIAction,
  CompanionAIContext,
  CompanionAIRequest,
  CompanionAIResponse,
  DemoState,
  FocusSession,
  Pet,
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

type CompanionActionResult = Omit<CompanionAIResponse, "source"> & { source: "model" | "fallback" };

type LocalCompanionIntent = "story" | "start" | "reward" | "rest" | "explore" | "greeting" | "capability" | "gratitude" | "general";

function getPresetMeta(currentState: DemoState, presetId: string) {
  return currentState.presets.find((preset) => preset.id === presetId) ?? currentState.presets[0];
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
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
      goalSummary: "让陪伴和探索一起接进主线",
      steps: ["先做一轮 25 分钟专注", "再去奖励页领取步数能量", "最后带着陪伴去探索或切换图鉴角色"],
      recommendedDuration: "25 分钟深度专注",
      nextRoute: "focus",
      nextAction: "先把第一轮拿下",
      why: "先让专注和奖励出现，再让宠物与探索接进来，闭环会更可信。",
    };
  }

  return {
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

function shouldGenerateStructuredReply(draft: string): boolean {
  const normalized = draft.trim();
  const intent = detectLocalCompanionIntent(normalized);

  if (["story", "start", "reward", "rest", "explore"].includes(intent)) {
    return true;
  }

  return /(帮我|整理|拆成|安排|决定|主线|从哪开始|先做什么|怎么接|讲清楚|规划)/u.test(normalized);
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
    goalSummary: value.goalSummary.trim(),
    steps,
    recommendedDuration: value.recommendedDuration.trim(),
    nextRoute: value.nextRoute,
    nextAction: value.nextAction.trim(),
    why: value.why.trim(),
  };
}

function parseCompanionResponse(data: unknown, action: CompanionAIAction, draft: string): CompanionAIResponse | null {
  if (!isRecord(data) || data.source !== "model" || !isNonEmptyString(data.content)) {
    return null;
  }

  const intent = detectLocalCompanionIntent(draft);
  const structuredPlan = data.structuredPlan ? parseStructuredPlan(data.structuredPlan) : undefined;
  const baseResponse: CompanionAIResponse = {
    content: data.content.trim(),
    source: "model",
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

    return {
      ...baseResponse,
      structuredPlan,
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
    focus: {
      running: currentState.focus.running,
      mode: currentState.focus.mode,
      durationMinutes: currentState.focus.durationMinutes,
      elapsedSeconds: getFocusElapsedSeconds(currentState.focus),
    },
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
  };
}

async function requestCompanionModel(action: CompanionAIAction, draft: string, currentState: DemoState): Promise<CompanionAIResponse> {
  const payload: CompanionAIRequest = {
    action,
    draft,
    context: buildCompanionContext(currentState),
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
      throw new Error(`companion_api_${response.status}`);
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

function createFallbackCompanionResult(action: CompanionAIAction, draft: string, currentState: DemoState): CompanionActionResult {
  const intent = detectLocalCompanionIntent(draft);
  const journeyPlan = createStructuredPlanMessage(draft, currentState);

  if (action === "tasks") {
    return {
      source: "fallback",
      content: "我把这句话整理成一张可以直接执行的旅程卡。",
      structuredPlan: journeyPlan.structuredPlan,
      tasks: createTasksFromDraft(draft),
    };
  }

  if (action === "plan") {
    return {
      source: "fallback",
      content: "我先把顺序排好，你照着走就能把主线讲清楚。",
      structuredPlan: journeyPlan.structuredPlan,
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
  };
}


function createTasksFromDraft(draft: string): string[] {
  if (draft.includes("步数") || draft.includes("能量") || draft.includes("银行") || draft.includes("奖励")) {
    return ["完成 1 轮 25 分钟专注", "领取最近一天步数能量", "兑换晶石后去探索晨露草坪"];
  }

  if (draft.includes("宠物") || draft.includes("探索") || draft.includes("图鉴")) {
    return ["安排一轮专注给宠物加经验", "完成一次喂食或切换陪伴", "触发 1 次探索并记录掉落反馈"];
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
      aiCards: parsed.aiCards ?? seedState.aiCards,
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

  function applyCompanionActionResult(
    current: DemoState,
    action: CompanionAIAction,
    draft: string,
    result: CompanionActionResult,
    options: {
      addUserMessage: boolean;
      clearDraft: boolean;
      presetId: string;
      fallbackNotice?: boolean;
    },
  ): DemoState {
    const createdAt = Date.now();
    const nextMessages = [...current.messages];

    if (options.fallbackNotice) {
      nextMessages.push({
        id: createId("msg"),
        role: "pet",
        type: "systemEvent",
        content: FALLBACK_NOTICE,
        createdAt,
      });
    }

    if (options.addUserMessage) {
      nextMessages.push({
        id: createId("msg"),
        role: "user",
        type: "text",
        content: draft,
        createdAt,
      });
    }

    let nextTasks = current.tasks;
    let nextNotes = current.notes;
    let nextFocus = current.focus;
    const cardsToUpsert: AICard[] = [];

    if (result.structuredPlan) {
      cardsToUpsert.push(createJourneyPlanCard(result.structuredPlan));
    }

    if (action === "idea" && result.note && result.quoteRef) {
      nextNotes = [{ id: createId("note"), title: result.note.title, body: result.note.body }, ...current.notes];
      nextMessages.push({
        id: createId("msg"),
        role: "pet",
        type: "imageCard",
        content: result.content,
        createdAt,
        quoteRef: result.quoteRef,
      });
    } else if (action === "tasks" && result.structuredPlan && result.tasks) {
      const taskIds: string[] = [];
      const createdTasks: TaskItem[] = result.tasks.map((title) => {
        const id = createId("task");
        taskIds.push(id);
        return { id, title, status: "todo", linkedFocusPresetId: options.presetId };
      });

      nextTasks = [...createdTasks, ...current.tasks];
      nextMessages.push({
        id: createId("msg"),
        role: "pet",
        type: "structuredPlan",
        content: result.content,
        createdAt,
        structuredPlan: result.structuredPlan,
      });
      nextMessages.push({
        id: createId("msg"),
        role: "pet",
        type: "taskCard",
        content: "我把这句话拆成了今天最顺手的 3 个动作。",
        createdAt,
        relatedTaskIds: taskIds,
      });
    } else if (result.structuredPlan) {
      if (action === "plan") {
        nextFocus = { ...current.focus, source: "ai" };
      }

      nextMessages.push({
        id: createId("msg"),
        role: "pet",
        type: "structuredPlan",
        content: result.content,
        createdAt,
        structuredPlan: result.structuredPlan,
      });
    } else {
      nextMessages.push({
        id: createId("msg"),
        role: "pet",
        type: "text",
        content: result.content,
        createdAt,
      });
    }

    return finalizeState({
      ...current,
      route: "companion",
      draft: options.clearDraft ? "" : current.draft,
      focus: nextFocus,
      tasks: nextTasks,
      notes: nextNotes,
      messages: nextMessages,
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
    const presetId = getPresetMeta(snapshot, snapshot.focus.selectedPresetId).id;
    setCompanionLoading(true);
    setAiErrorMode(false);

    try {
      const modelResult = await requestCompanionModel(action, draft, snapshot);
      setState((current) =>
        applyCompanionActionResult(current, action, draft, modelResult, {
          addUserMessage: options.addUserMessage,
          clearDraft: options.clearDraft,
          presetId,
        }),
      );
    } catch {
      const fallbackResult = createFallbackCompanionResult(action, draft, snapshot);
      setAiErrorMode(true);
      setState((current) =>
        applyCompanionActionResult(current, action, draft, fallbackResult, {
          addUserMessage: options.addUserMessage,
          clearDraft: options.clearDraft,
          presetId,
          fallbackNotice: true,
        }),
      );
    } finally {
      setCompanionLoading(false);
    }
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
        {
          id: createId("msg"),
          role: "pet",
          type: "reward",
          content:
            source === "demo"
              ? `演示跳过完成，直接结算 ${rewardCrystal} 枚像素晶石和 ${rewardExp} 点经验，方便你继续测试后续闭环。`
              : `专注达标，拿到 ${rewardCrystal} 枚像素晶石和 ${rewardExp} 点经验，当前陪伴宠物也一起成长了。`,
          createdAt: Date.now(),
        },
        {
          id: createId("msg"),
          role: "pet",
          type: "recap",
          content: recapContent,
          createdAt: Date.now(),
        },
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
          {
            id: createId("msg"),
            role: "pet",
            type: "recap",
            content: "这轮先记成放弃，不会发放奖励。等你准备好，我们再从下一轮继续。",
            createdAt: Date.now(),
          },
        ],
      });
    });
  }

  function finishFocus(): void {
    setState((current) => {
      if (!current.focus.running || !canClaimFocusReward(current.focus)) {
        return current;
      }

      return settleCompletedFocus(
        current,
        current.focus.source,
        "这轮奖励已经拿稳了。下一步先去奖励页领取步数能量，再决定要不要继续探索。",
      );
    });
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

  function askPetForAdvice(): void {
    setState((current) => {
      const currentPet = getActivePetFromState(current);
      return finalizeState({
        ...current,
        route: "companion",
        messages: [
          ...current.messages,
          {
            id: createId("msg"),
            role: "pet",
            type: "text",
            content: createPetAdvice(currentPet),
            createdAt: Date.now(),
          },
        ],
      });
    });
  }

  function clearMessages(): void {
    setAiErrorMode(false);
    setState((current) => {
      if (current.messages.length === 0) return current;
      return finalizeState({
        ...current,
        messages: [],
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
          {
            id: createId("msg"),
            role: "pet",
            type: "systemEvent",
            content: `已切换为${nextActivePet.name}，后续建议和对战开场会跟着变化。`,
            createdAt: Date.now(),
          },
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
          { id: createId("msg"), role: "pet", type: "systemEvent", content: `步数到账：${target.energyEarned} 点能量已经放进你的奖励页，现在可以考虑兑换成晶石了。`, createdAt: Date.now() },
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
          {
            id: createId("msg"),
            role: "pet",
            type: "systemEvent",
            content: `已兑换 ${crystals} 枚像素晶石。现在资源更充足了，可以去喂食、探索，或者继续开下一轮专注。`,
            createdAt: Date.now(),
          },
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
          { id: createId("msg"), role: "pet", type: "systemEvent", content: "探索成功，带回 12 枚像素晶石，还顺手点亮了一段新的地图记忆。", createdAt: Date.now() },
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
          { id: createId("msg"), role: "pet", type: "systemEvent", content: purchaseMessage, createdAt: Date.now() },
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
    aiErrorMode,
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
    runAiAction,
    sendDraftMessage,
    clearMessages,
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





