import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentToolCall,
  AgentToolName,
  CompanionAIAction,
  CompanionAIContext,
  CompanionAIRequest,
  CompanionAIResponse,
  FocusBrief,
  FocusRecap,
  MessageType,
  PlanKind,
  RouteKey,
  StructuredPlan,
} from "../src/types";

export const runtime = "nodejs";

export const DEFAULT_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_MODEL = "deepseek-v4-flash";
const ALLOWED_ROUTES: RouteKey[] = ["home", "focus", "companion", "pets", "explore", "bank", "achievements", "battle", "shop"];
const ALLOWED_MESSAGE_TYPES: MessageType[] = ["text", "taskCard", "focusPlan", "reward", "recap", "imageCard", "systemEvent", "structuredPlan"];
const ALLOWED_TOOL_NAMES: AgentToolName[] = ["createTasks", "setRoute", "startFocus", "createIdea", "selectPet", "claimRecommended", "noop"];
let localEnvCache: Record<string, string> | null = null;
type DraftIntent = "story" | "start" | "reward" | "rest" | "modeChoice" | "explore" | "recap" | "greeting" | "capability" | "gratitude" | "distracted" | "general";

function isTaskOrientedIntent(intent: DraftIntent): boolean {
  return ["story", "start", "reward", "rest", "explore"].includes(intent);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRouteKey(value: unknown): value is RouteKey {
  return typeof value === "string" && ALLOWED_ROUTES.includes(value as RouteKey);
}

function isPlanKind(value: unknown): value is PlanKind {
  return typeof value === "string" && ["lifeTask", "focusTask", "resourceTask", "exploreTask", "chatOnly"].includes(value);
}

function isMessageType(value: unknown): value is MessageType {
  return typeof value === "string" && ALLOWED_MESSAGE_TYPES.includes(value as MessageType);
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

  if (!isCompanionFlowDraft(normalizedDraft) && /(拆|步骤|三步|洗澡|遛狗|做饭|收拾|打扫|买|约|拿|取|寄|整理)/u.test(normalizedDraft)) {
    return "lifeTask";
  }

  return nextRoute === "companion" ? "lifeTask" : "chatOnly";
}

function isToolName(value: unknown): value is AgentToolName {
  return typeof value === "string" && ALLOWED_TOOL_NAMES.includes(value as AgentToolName);
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

function parseFocusBrief(value: unknown): FocusBrief | null {
  if (!isRecord(value)) return null;
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
    return null;
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

function parseFocusRecap(value: unknown): FocusRecap | null {
  if (!isRecord(value)) return null;

  if (
    !isNonEmptyString(value.summary)
    || !isNonEmptyString(value.completedMeaning)
    || !isNonEmptyString(value.nextStep)
    || !isRouteKey(value.nextRoute)
    || !isNonEmptyString(value.ctaLabel)
  ) {
    return null;
  }

  return {
    summary: value.summary.trim(),
    completedMeaning: value.completedMeaning.trim(),
    nextStep: value.nextStep.trim(),
    nextRoute: value.nextRoute,
    ctaLabel: value.ctaLabel.trim(),
  };
}

function parseContext(value: unknown): CompanionAIContext | null {
  if (!isRecord(value)) return null;
  if (
    !Array.isArray(value.recentMessages)
    || !isRouteKey(value.route)
    || !isRecord(value.focus)
    || typeof value.focus.running !== "boolean"
    || (value.focus.mode !== "pomodoro" && value.focus.mode !== "countup")
    || typeof value.focus.durationMinutes !== "number"
    || typeof value.focus.elapsedSeconds !== "number"
    || typeof value.claimableEnergy !== "number"
    || !isRecord(value.wallet)
    || typeof value.wallet.crystal !== "number"
    || typeof value.wallet.energy !== "number"
    || !isRecord(value.activePet)
    || !isNonEmptyString(value.activePet.id)
    || !isNonEmptyString(value.activePet.name)
    || typeof value.activePet.mood !== "number"
    || typeof value.activePet.affection !== "number"
    || typeof value.activePet.level !== "number"
    || !isNonEmptyString(value.activePet.activeSkin)
    || typeof value.openTasksCount !== "number"
    || !isRecord(value.agent)
    || typeof value.agent.hasPendingAction !== "boolean"
    || !isNonEmptyString(value.agent.status)
  ) {
    return null;
  }

  const recentMessages = value.recentMessages
    .filter((message): message is { role: "user" | "pet"; type: MessageType; content: string } =>
      isRecord(message)
      && (message.role === "user" || message.role === "pet")
      && isMessageType(message.type)
      && isNonEmptyString(message.content))
    .slice(-6)
    .map((message) => ({
      role: message.role,
      type: message.type,
      content: message.content.trim(),
    }));

  return {
    recentMessages,
    route: value.route,
    focus: {
      running: value.focus.running,
      mode: value.focus.mode,
      durationMinutes: value.focus.durationMinutes,
      elapsedSeconds: value.focus.elapsedSeconds,
    },
    activeFocusBrief: parseFocusBrief(value.activeFocusBrief) ?? null,
    claimableEnergy: value.claimableEnergy,
    wallet: {
      crystal: value.wallet.crystal,
      energy: value.wallet.energy,
    },
    activePet: {
      id: value.activePet.id.trim(),
      name: value.activePet.name.trim(),
      mood: value.activePet.mood,
      affection: value.activePet.affection,
      level: value.activePet.level,
      activeSkin: value.activePet.activeSkin.trim(),
    },
    openTasksCount: value.openTasksCount,
    agent: {
      status: value.agent.status as CompanionAIContext["agent"]["status"],
      activeGoal: isNonEmptyString(value.agent.activeGoal) ? value.agent.activeGoal.trim() : null,
      hasPendingAction: value.agent.hasPendingAction,
    },
  };
}

function parseToolCallArgs(name: AgentToolName, args: unknown): Record<string, unknown> | undefined {
  if (name === "noop") {
    return undefined;
  }

  if (!isRecord(args)) {
    return undefined;
  }

  if (name === "createTasks") {
    const titles = Array.isArray(args.titles)
      ? args.titles.filter((item): item is string => isNonEmptyString(item)).map((item) => item.trim()).slice(0, 3)
      : [];
    return titles.length ? { titles } : undefined;
  }

  if (name === "setRoute") {
    return isRouteKey(args.route) ? { route: args.route } : undefined;
  }

  if (name === "startFocus") {
    if (args.mode !== "pomodoro" && args.mode !== "countup") {
      return undefined;
    }

    const duration = typeof args.duration === "number" && Number.isFinite(args.duration)
      ? Math.max(5, Math.min(60, Math.round(args.duration)))
      : undefined;

    return duration ? { mode: args.mode, duration } : { mode: args.mode };
  }

  if (name === "createIdea") {
    if (!isNonEmptyString(args.title) || !isNonEmptyString(args.body)) {
      return undefined;
    }

    return {
      title: args.title.trim().slice(0, 14),
      body: args.body.trim(),
      ...(isNonEmptyString(args.quoteRef) ? { quoteRef: args.quoteRef.trim().slice(0, 28) } : {}),
    };
  }

  if (name === "selectPet") {
    return isNonEmptyString(args.petId) ? { petId: args.petId.trim() } : undefined;
  }

  if (name === "claimRecommended") {
    return args.source === "steps" ? { source: "steps" } : {};
  }

  return undefined;
}

function parseToolCall(value: unknown): AgentToolCall | null {
  if (!isRecord(value) || !isToolName(value.name) || typeof value.requiresConfirmation !== "boolean" || !isNonEmptyString(value.reason)) {
    return null;
  }

  const args = parseToolCallArgs(value.name, value.args);
  if (value.name !== "noop" && !args) {
    return null;
  }

  return {
    name: value.name,
    args,
    requiresConfirmation: value.requiresConfirmation,
    reason: value.reason.trim(),
  };
}

function parseToolCalls(value: unknown): AgentToolCall[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const toolCalls = value
    .map((item) => parseToolCall(item))
    .filter((item): item is AgentToolCall => item !== null)
    .slice(0, 2);

  return toolCalls.length ? toolCalls : undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => isNonEmptyString(item))
    .map((item) => item.trim())
    .slice(0, 3);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function extractLenientMessageContent(value: unknown): string | null {
  if (isNonEmptyString(value)) {
    return normalizeWhitespace(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  const candidates = [value.content, value.message, value.reply, value.text];
  for (const candidate of candidates) {
    if (isNonEmptyString(candidate)) {
      return normalizeWhitespace(candidate);
    }
  }

  return null;
}

function inferTaskTitlesFromDraft(draft: string): string[] {
  if (/(洗澡|清洗|洗一洗|洗猫|洗狗)/u.test(draft) && /(猫|猫咪|猫猫|小猫)/u.test(draft)) {
    return ["准备温水、毛巾和洗澡用品", "先安抚猫咪，再快速温和地完成清洗", "擦干吹干并观察猫咪状态"];
  }

  if (/(遛狗|狗狗|小狗|散步)/u.test(draft)) {
    return ["准备牵引绳、拾便袋和水", "出门走一段安静顺手的路线", "回家后擦脚、补水并安顿好狗狗"];
  }

  if (/(遛猫|猫咪散步|带猫咪出门)/u.test(draft)) {
    return ["准备牵引绳和外出小用品", "挑一段安静路线，慢慢陪猫咪适应", "回家后擦脚、补水并让猫咪休息"];
  }

  return ["先准备好第一步需要的东西", "把中间最关键的动作单独完成", "收尾整理好，再确认下一步"];
}

function extractTaskTitlesFromToolCalls(toolCalls?: AgentToolCall[]): string[] {
  const createTasksCall = toolCalls?.find((toolCall) => toolCall.name === "createTasks");
  return normalizeStringList(createTasksCall?.args?.titles);
}

function isReadableNextAction(value: string): boolean {
  return /[\u4e00-\u9fff]/u.test(value) && !/^(noop|complete|startFocus)$/iu.test(value.trim());
}

function normalizeStructuredPlanForDraft(
  plan: StructuredPlan,
  draft: string,
  fallbackSteps: string[],
): StructuredPlan {
  const nextRoute = !isCompanionFlowDraft(draft) && plan.nextRoute === "home" ? "companion" : plan.nextRoute;
  const nextAction = isReadableNextAction(plan.nextAction) ? plan.nextAction.trim() : (fallbackSteps[0] ?? plan.steps[0] ?? "先从第一步开始");
  const why = isNonEmptyString(plan.why)
    ? plan.why.trim()
    : "先把事情拆小，再一步一步往下走，会更容易开始，也更容易坚持。";

  return {
    ...plan,
    planKind: inferPlanKindFromDraft(draft, nextRoute),
    nextRoute,
    nextAction,
    why,
  };
}

function buildFallbackStructuredPlan(draft: string, steps: string[]): StructuredPlan {
  const safeSteps = steps.length === 3 ? steps : inferTaskTitlesFromDraft(draft);

  return {
    planKind: inferPlanKindFromDraft(draft, !isCompanionFlowDraft(draft) ? "companion" : "focus"),
    goalSummary: !isCompanionFlowDraft(draft)
      ? "把这件事拆成三个顺手步骤，让过程更轻松"
      : "先把这条主线拆顺，再决定下一步",
    steps: safeSteps,
    recommendedDuration: !isCompanionFlowDraft(draft) ? "照着三步慢慢来" : "25 分钟当前节奏",
    nextRoute: !isCompanionFlowDraft(draft) ? "companion" : "focus",
    nextAction: safeSteps[0] ?? "先从第一步开始",
    why: "先把事情拆小，再一步一步往下走，会更容易开始，也更容易坚持。",
  };
}

function buildServerFallbackResponse(payload: CompanionAIRequest, reason: string): CompanionAIResponse {
  const steps = inferTaskTitlesFromDraft(payload.draft);
  const plan = buildFallbackStructuredPlan(payload.draft, steps);

  console.warn("[companion] using_server_fallback", {
    action: payload.action,
    draft: payload.draft.slice(0, 120),
    reason,
  });

  if (payload.action === "idea") {
    return {
      content: "真实整理刚刚有点打结，我先把这句话收成一条灵感，之后你还可以继续改。",
      note: {
        title: payload.draft.slice(0, 14) || "新的灵感",
        body: payload.draft,
      },
      quoteRef: "从当前输入收进灵感",
      source: "fallback",
    };
  }

  if (payload.action === "tasks") {
    return {
      content: "真实整理刚刚有点打结，我先按演示模式把它拆成三步，你可以直接加入待办。",
      structuredPlan: plan,
      tasks: steps,
      source: "fallback",
    };
  }

  if (payload.action === "plan" || /(?:拆|三步|3\s*步|步骤)/u.test(payload.draft)) {
    return {
      content: "真实整理刚刚有点打结，我先把这件事拆成一张顺手的小计划。",
      structuredPlan: plan,
      source: "fallback",
    };
  }

  return {
    content: "真实整理刚刚有点打结，我先切回演示整理模式。你可以继续说，我会接着帮你理顺。",
    source: "fallback",
  };
}

export function parseRequestBody(value: unknown): CompanionAIRequest | null {
  if (!isRecord(value)) return null;

  const action = value.action;
  const context = parseContext(value.context);

  if (
    (action !== "message" && action !== "tasks" && action !== "plan" && action !== "idea")
    || !isNonEmptyString(value.draft)
    || !context
  ) {
    return null;
  }

  return {
    action,
    draft: value.draft.trim(),
    context,
    ...(value.streamMode === "text" || value.streamMode === "card" ? { streamMode: value.streamMode } : {}),
  };
}

function parseModelResult(value: unknown, action: CompanionAIAction): CompanionAIResponse | null {
  if (action === "message") {
    const content = extractLenientMessageContent(value);
    if (!content) {
      return null;
    }

    const toolCalls = isRecord(value) ? parseToolCalls(value.toolCalls) : undefined;
    const structuredPlan = isRecord(value) && value.structuredPlan ? parseStructuredPlan(value.structuredPlan) : undefined;
    const focusBrief = isRecord(value) && value.focusBrief ? parseFocusBrief(value.focusBrief) : undefined;
    const focusRecap = isRecord(value) && value.focusRecap ? parseFocusRecap(value.focusRecap) : undefined;
    return {
      content,
      source: "model",
      toolCalls,
      ...(structuredPlan ? { structuredPlan } : {}),
      ...(focusBrief ? { focusBrief } : {}),
      ...(focusRecap ? { focusRecap } : {}),
    };
  }

  if (!isRecord(value) || !isNonEmptyString(value.content)) {
    return null;
  }

  const baseResult: CompanionAIResponse = {
    content: value.content.trim(),
    source: "model",
    toolCalls: parseToolCalls(value.toolCalls),
    focusBrief: value.focusBrief ? parseFocusBrief(value.focusBrief) ?? undefined : undefined,
    focusRecap: value.focusRecap ? parseFocusRecap(value.focusRecap) ?? undefined : undefined,
  };

  if (action === "idea") {
    if (!isRecord(value.note) || !isNonEmptyString(value.note.title) || !isNonEmptyString(value.note.body) || !isNonEmptyString(value.quoteRef)) {
      return null;
    }

    return {
      ...baseResult,
      note: {
        title: value.note.title.trim().slice(0, 14),
        body: value.note.body.trim(),
      },
      quoteRef: value.quoteRef.trim().slice(0, 28),
    };
  }

  const structuredPlan = value.structuredPlan ? parseStructuredPlan(value.structuredPlan) : undefined;

  if (action === "tasks") {
    const tasksFromPayload = normalizeStringList(value.tasks);
    const tasksFromPlan = normalizeStringList(isRecord(value.structuredPlan) ? value.structuredPlan.steps : undefined);
    const tasksFromToolCalls = extractTaskTitlesFromToolCalls(baseResult.toolCalls);
    const tasks = tasksFromPayload.length === 3
      ? tasksFromPayload
      : tasksFromPlan.length === 3
        ? tasksFromPlan
        : tasksFromToolCalls.length === 3
          ? tasksFromToolCalls
          : [];

    if (tasks.length !== 3) {
      return null;
    }

    return {
      ...baseResult,
      structuredPlan: structuredPlan ?? buildFallbackStructuredPlan("先把这件事拆成三步", tasks),
      tasks,
    };
  }

  if (!structuredPlan) {
    return null;
  }

  return {
    ...baseResult,
    structuredPlan,
  };
}

function detectDraftIntent(draft: string): DraftIntent {
  const normalized = draft.trim();

  if (/^(你好|您好|嗨|哈喽|hi|hello|早上好|晚上好|在吗)[!！。.？? ]*$/iu.test(normalized)) {
    return "greeting";
  }

  if (/(你能做什么|你会什么|你可以做什么|能帮我做什么|怎么帮我|你是谁|(宠物|陪伴).*(能做什么|可以做什么|会什么))/u.test(normalized)) {
    return "capability";
  }

  if (/^(谢谢|多谢|感谢|辛苦了|好的|好耶|收到)[!！。.？? ]*$/u.test(normalized)) {
    return "gratitude";
  }

  if (/(走神|心不在焉|静不下心|注意力不集中|总想分心)/u.test(normalized)) {
    return "distracted";
  }

  if (/(复盘|总结|刚完成|完成了一轮|专注结束|这一轮之后|这轮之后)/u.test(normalized)) {
    return "recap";
  }

  if (/(主线|讲清楚|闭环|怎么接|串起来)/u.test(normalized)) {
    return "story";
  }

  if (/(有点乱|很乱|从哪开始|先帮我决定|不知道怎么开始|不知道先做什么|下一步做什么|先做哪一步|先干什么)/u.test(normalized)) {
    return "start";
  }

  if (/(奖励|能量|兑换|领奖|晶石)/u.test(normalized)) {
    return "reward";
  }

  if (/(判断|适合|该不该|要不要|先).*(专注|热身|休息|整理)/u.test(normalized)
    && /(专注|热身|休息)/u.test(normalized)) {
    return "modeChoice";
  }

  if (/(休息|累|热身|缓一缓|状态不好)/u.test(normalized)) {
    return "rest";
  }

  if (/(探索|宠物|图鉴|喂食|互动|地图)/u.test(normalized)) {
    return "explore";
  }

  return "general";
}

function stripJsonFence(content: string): string {
  const trimmed = content.trim();

  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  }

  return trimmed;
}

async function loadLocalEnvFile(): Promise<Record<string, string>> {
  if (localEnvCache) {
    return localEnvCache;
  }

  const files = [".env.local", ".env"];
  const parsed: Record<string, string> = {};

  for (const file of files) {
    try {
      const content = await readFile(join(process.cwd(), file), "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex < 0) continue;
        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        if (!key || parsed[key]) continue;

        parsed[key] = rawValue.replace(/^['"]|['"]$/g, "");
      }
    } catch {
      // Ignore missing local env files in deployed/serverless environments.
    }
  }

  localEnvCache = parsed;
  return parsed;
}

async function getConfigValue(name: string): Promise<string | undefined> {
  const envValue = process.env[name];
  if (envValue && envValue.trim().length > 0) {
    return envValue.trim();
  }

  const localEnv = await loadLocalEnvFile();
  const fallbackValue = localEnv[name];
  return fallbackValue && fallbackValue.trim().length > 0 ? fallbackValue.trim() : undefined;
}

export async function getDeepSeekConfig(): Promise<{ apiKey: string; endpoint: string; model: string }> {
  const apiKey = await getConfigValue("DEEPSEEK_API_KEY");
  if (!apiKey) {
    throw new Error("missing_deepseek_api_key");
  }

  const baseUrl = ((await getConfigValue("DEEPSEEK_BASE_URL")) ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
  const model = (await getConfigValue("DEEPSEEK_MODEL")) ?? DEFAULT_MODEL;

  return { apiKey, endpoint, model };
}

function isCompanionFlowDraft(draft: string): boolean {
  return /(专注|奖励|能量|步数|晶石|探索|宠物|图鉴|喂食|互动|地图|陪伴|主线|闭环|领奖|对战|商店)/u.test(draft);
}

function getRealLifePetLabel(draft: string): string | null {
  if (/(猫|猫咪|猫猫|小猫)/u.test(draft)) return "猫咪";
  if (/(狗|狗狗|小狗|遛狗)/u.test(draft)) return "狗狗";
  return null;
}

function shouldAvoidActivePetBinding(draft: string): boolean {
  return Boolean(getRealLifePetLabel(draft)) && !isCompanionFlowDraft(draft);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function polishCompanionCopy(
  text: string,
  activePetName: string,
  options?: { avoidActivePetBinding?: boolean; lifePetLabel?: string | null },
): string {
  const trimmed = text.trim();
  const withoutPetIntro = trimmed.startsWith(`${activePetName}看到你回来了，`)
    ? trimmed.slice(`${activePetName}看到你回来了，`.length)
    : trimmed;

  let polished = withoutPetIntro
    .replace(/[?？]{2,}/g, activePetName)
    .replace(/^看到你[^，。！？!?]*[，,]\s*/u, "")
    .replace(/^好呀[，,]\s*/u, "好呀，")
    .replace(/用户/g, "你")
    .replace(/APP/g, "旅程")
    .replace(/(\d+)\s*分钟/g, "$1 分钟")
    .replace(/(\d+)\s*点能量\s+/g, "$1 点能量")
    .trim();

  if (options?.avoidActivePetBinding && options.lifePetLabel) {
    polished = polished
      .replace(new RegExp(escapeRegExp(activePetName), "g"), options.lifePetLabel)
      .replace(/陪伴小羊/g, options.lifePetLabel)
      .replace(/陪伴宠物/g, options.lifePetLabel)
      .replace(/宠物/g, options.lifePetLabel);
  } else {
    polished = polished
      .replace(/陪伴小羊/g, `让${activePetName}陪你`)
      .replace(/陪伴宠物/g, `和${activePetName}继续往前走`)
      .replace(/宠物/g, activePetName);
  }

  return polished.trim();
}

function polishStructuredPlan(
  plan: StructuredPlan,
  activePetName: string,
  options?: { avoidActivePetBinding?: boolean; lifePetLabel?: string | null },
): StructuredPlan {
  const polishedSteps = plan.steps.map((step) =>
    polishCompanionCopy(step, activePetName, options)
      .replace(/(\d+)\s*点能量\s+/g, "$1 点能量"),
  );

  return {
    ...plan,
    goalSummary: polishCompanionCopy(plan.goalSummary, activePetName, options),
    steps: polishedSteps,
    recommendedDuration: plan.recommendedDuration
      .replace(/(\d+)\s*分钟/u, "$1 分钟")
      .replace(/^(\d+ 分钟)$/u, "$1 深度专注"),
    nextAction: polishCompanionCopy(plan.nextAction, activePetName, options),
    why: polishCompanionCopy(plan.why, activePetName, options),
  };
}

function buildSystemPrompt(action: CompanionAIAction, context: CompanionAIContext, draft: string): string {
  const intent = detectDraftIntent(draft);
  const basePrompt = [
    "你是像素宠物专注 app 的陪伴整理助手，语气治愈、聪明、有陪伴感。",
    `当前陪伴：${context.activePet.name}。只有用户说 app 内陪伴、探索、喂食、图鉴或互动时才使用这个名字；现实猫狗不要替换成陪伴名。`,
    "先接住用户这句话，再给最短下一步。不要每次套用“专注->领奖->探索”。",
    "短输入如“继续”“拆吧”“安排一下”要沿着 context.agent.activeGoal 或最近计划继续。",
    "禁止出现：面试官、评审、作品集、展示、demo、录屏、测试、招聘、APP 功能、用户、任务助手。",
    "不要用机械模板：看到你…所以…、看到你回来了、开启番茄钟、开始专注任务。",
    "可用工具：createTasks、setRoute、startFocus、createIdea、selectPet、claimRecommended、noop；最多 2 个 toolCalls。",
    "只在真的能推进时返回 toolCalls；startFocus、claimRecommended 或打断流程的 setRoute 必须 requiresConfirmation=true。",
    "structuredPlan 必须有 planKind：lifeTask、focusTask、resourceTask、exploreTask、chatOnly。",
    "生活三步用 lifeTask；脑力/计时用 focusTask；奖励资源用 resourceTask；宠物地图用 exploreTask。",
    `nextRoute 只能从这些值里选择：${ALLOWED_ROUTES.join(", ")}。`,
    "content 写 1-2 句中文；steps 正好 3 条；recommendedDuration 写成“25 分钟深度专注”或“10 分钟快速热身”。",
    "只输出 JSON，不要 markdown、解释或代码块。",
  ];

  const intentPromptMap: Record<DraftIntent, string> = {
    greeting: "用户现在是在打招呼。请只用 1 到 2 句温柔回应，并轻轻告诉他你可以帮他整理今天想推进的事。不要输出 structuredPlan。",
    capability: "用户现在在问你能做什么。请只用 2 句以内说明你可以帮他拆顺序、判断下一步、把专注和奖励接进主线。不要输出 structuredPlan，不要立刻替他排计划。",
    gratitude: "用户现在是在表达感谢或简单确认。请只做简短回应，不要输出 structuredPlan。",
    distracted: "用户是在说自己有点走神或分心。请先接住这个状态，给一个轻一点的回应，不要立刻生成计划，也不要机械地问从哪里开始。",
    recap: "用户是在请求专注后的复盘。请结合 context.activeFocusBrief、focus、奖励状态和当前陪伴，生成一段短复盘，并附带 focusRecap。",
    story: "用户是在明确请求你帮他理清主线。请给更清楚的闭环表达，必要时附带 structuredPlan。",
    start: "用户是在问现在该从哪一步开始。请优先给一个具体起点，而不是把整条流程都重讲一遍；必要时附带 structuredPlan。",
    reward: "用户重点在奖励和能量怎么接进主线。请先回答这个问题本身；只有在确实需要时才附带 structuredPlan。",
    rest: "用户更需要低压力起步。请优先推荐更轻的下一步，不要默认 25 分钟深度专注；只有在确实需要时才附带 structuredPlan。",
    modeChoice: "用户是在让你判断现在更适合先专注、热身还是休息整理。请只用自然回复给一个明确推荐和一句理由，不要输出 structuredPlan、focusBrief 或 toolCalls。",
    explore: "用户更关心宠物、探索或地图。请先顺着探索和陪伴来回答；只有在确实需要时才附带 structuredPlan。",
    general: "用户只是来和你说一句话。先理解他说的是什么。若问题还不够具体，可以轻轻追问一句；不要默认生成 structuredPlan。",
  };

  const messageShape = isTaskOrientedIntent(intent)
    ? `json: {"content":"...","structuredPlan":{"planKind":"lifeTask|focusTask|resourceTask|exploreTask","goalSummary":"...","steps":["...","...","..."],"recommendedDuration":"...","nextRoute":"...","nextAction":"...","why":"..."},"focusBrief":{"goal":"...","durationLabel":"...","durationMinutes":25,"successCriteria":"...","afterFocusNextStep":"..."},"toolCalls":[...]}。不需要的字段省略。`
    : `json: {"content":"..."}。普通聊天不要硬凑 structuredPlan 或 toolCalls。`;

  const actionPromptMap: Record<CompanionAIAction, string> = {
    message: intent === "recap"
      ? `json: {"content":"...","focusRecap":{"summary":"...","completedMeaning":"...","nextStep":"...","nextRoute":"bank","ctaLabel":"去领取能量"}}。`
      : messageShape,
    plan: `json: {"content":"...","structuredPlan":{"planKind":"focusTask","goalSummary":"...","steps":["...","...","..."],"recommendedDuration":"...","nextRoute":"focus","nextAction":"...","why":"..."},"focusBrief":{"goal":"...","durationLabel":"...","durationMinutes":25,"successCriteria":"...","afterFocusNextStep":"..."}}`,
    tasks: `json: {"content":"...","structuredPlan":{"planKind":"lifeTask","goalSummary":"...","steps":["...","...","..."],"recommendedDuration":"照着三步慢慢来","nextRoute":"companion","nextAction":"...","why":"..."},"tasks":["...","...","..."]}`,
    idea: `json: {"content":"...","note":{"title":"...","body":"..."},"quoteRef":"..."}`,
  };

  return [...basePrompt, intentPromptMap[intent], actionPromptMap[action]].join("\n");
}

function normalizeParsedResultForDraft(payload: CompanionAIRequest, parsed: CompanionAIResponse): CompanionAIResponse {
  const avoidActivePetBinding = shouldAvoidActivePetBinding(payload.draft);
  const lifePetLabel = getRealLifePetLabel(payload.draft);
  const tasks = parsed.tasks?.length === 3 ? parsed.tasks : extractTaskTitlesFromToolCalls(parsed.toolCalls);

  return {
    ...parsed,
    content: polishCompanionCopy(parsed.content, payload.context.activePet.name, {
      avoidActivePetBinding,
      lifePetLabel,
    }),
    structuredPlan: parsed.structuredPlan
      ? polishStructuredPlan(
          normalizeStructuredPlanForDraft(parsed.structuredPlan, payload.draft, tasks),
          payload.context.activePet.name,
          {
            avoidActivePetBinding,
            lifePetLabel,
          },
        )
      : undefined,
    focusBrief: parsed.focusBrief
      ? {
          ...parsed.focusBrief,
          goal: polishCompanionCopy(parsed.focusBrief.goal, payload.context.activePet.name, {
            avoidActivePetBinding,
            lifePetLabel,
          }),
          durationLabel: parsed.focusBrief.durationLabel.replace(/(\d+)\s*分钟/u, "$1 分钟"),
          successCriteria: polishCompanionCopy(parsed.focusBrief.successCriteria, payload.context.activePet.name, {
            avoidActivePetBinding,
            lifePetLabel,
          }),
          afterFocusNextStep: polishCompanionCopy(parsed.focusBrief.afterFocusNextStep, payload.context.activePet.name, {
            avoidActivePetBinding,
            lifePetLabel,
          }),
        }
      : undefined,
    focusRecap: parsed.focusRecap
      ? {
          ...parsed.focusRecap,
          summary: polishCompanionCopy(parsed.focusRecap.summary, payload.context.activePet.name, {
            avoidActivePetBinding,
            lifePetLabel,
          }),
          completedMeaning: polishCompanionCopy(parsed.focusRecap.completedMeaning, payload.context.activePet.name, {
            avoidActivePetBinding,
            lifePetLabel,
          }),
          nextStep: polishCompanionCopy(parsed.focusRecap.nextStep, payload.context.activePet.name, {
            avoidActivePetBinding,
            lifePetLabel,
          }),
          ctaLabel: polishCompanionCopy(parsed.focusRecap.ctaLabel, payload.context.activePet.name, {
            avoidActivePetBinding,
            lifePetLabel,
          }),
        }
      : undefined,
    tasks,
  };
}

function shouldRetryModelError(error: unknown, action: CompanionAIAction, attempt: number): boolean {
  if (attempt > 0 || action === "message") {
    return false;
  }

  if (error instanceof SyntaxError) {
    return true;
  }

  const message = error instanceof Error ? error.message : "";
  return /missing_model_content|invalid_model_json|deepseek_5\d{2}|Expected .* after property value|Expected ',' or '\}'/u.test(message);
}

async function requestDeepSeekContent(
  payload: CompanionAIRequest,
  options?: { retryMode?: boolean },
): Promise<string> {
  const { apiKey, endpoint, model } = await getDeepSeekConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const retryNote = options?.retryMode
    ? "\n你上一次输出缺了必要字段。这一次务必返回完整 JSON，不能省略 content、structuredPlan、tasks、note 或 quoteRef 中当前动作要求的字段。"
    : "";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: payload.action === "message" ? 0.9 : options?.retryMode ? 0 : 0.2,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${buildSystemPrompt(payload.action, payload.context, payload.draft)}${retryNote}`,
          },
          {
            role: "user",
            content: JSON.stringify({
              action: payload.action,
              draft: payload.draft,
              context: payload.context,
            }, null, 2),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`deepseek_${response.status}`);
    }

    const completion = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = completion.choices?.[0]?.message?.content;

    if (!isNonEmptyString(content)) {
      throw new Error("missing_model_content");
    }

    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callDeepSeek(payload: CompanionAIRequest): Promise<CompanionAIResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const content = await requestDeepSeekContent(payload, { retryMode: attempt > 0 });
      const sanitizedContent = stripJsonFence(content);
      let parsedValue: unknown;

      try {
        parsedValue = JSON.parse(sanitizedContent);
      } catch (error) {
        if (payload.action === "message") {
          return normalizeParsedResultForDraft(payload, {
            content: normalizeWhitespace(sanitizedContent),
            source: "model",
          });
        }

        throw error;
      }

      const parsed = parseModelResult(parsedValue, payload.action);
      if (!parsed) {
        throw new Error("invalid_model_json");
      }

      return normalizeParsedResultForDraft(payload, parsed);
    } catch (error) {
      lastError = error;
      console.error("[companion] model_parse_failed", {
        action: payload.action,
        draft: payload.draft.slice(0, 120),
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!shouldRetryModelError(error, payload.action, attempt)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("companion_model_error");
}

export async function POST(request: Request): Promise<Response> {
  let payload: CompanionAIRequest | null = null;

  try {
    const body: unknown = await request.json();
    payload = parseRequestBody(body);

    if (!payload) {
      return Response.json({ error: "invalid_companion_request" }, { status: 400 });
    }

    const result = await callDeepSeek(payload);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "companion_model_error";
    console.error("[companion] request_failed", {
      action: payload?.action ?? null,
      draft: payload?.draft.slice(0, 120) ?? null,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (payload) {
      return Response.json(buildServerFallbackResponse(payload, message));
    }

    return Response.json({ error: message }, { status: 500 });
  }
}
