import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CompanionAIAction,
  CompanionAIContext,
  CompanionAIRequest,
  CompanionAIResponse,
  MessageType,
  RouteKey,
  StructuredPlan,
} from "../src/types";

export const runtime = "nodejs";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const ALLOWED_ROUTES: RouteKey[] = ["home", "focus", "companion", "pets", "explore", "bank", "achievements", "battle", "shop"];
const ALLOWED_MESSAGE_TYPES: MessageType[] = ["text", "taskCard", "focusPlan", "reward", "recap", "imageCard", "systemEvent", "structuredPlan"];
let localEnvCache: Record<string, string> | null = null;
type DraftIntent = "story" | "start" | "reward" | "rest" | "explore" | "greeting" | "capability" | "gratitude" | "distracted" | "general";

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

function isMessageType(value: unknown): value is MessageType {
  return typeof value === "string" && ALLOWED_MESSAGE_TYPES.includes(value as MessageType);
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

function parseContext(value: unknown): CompanionAIContext | null {
  if (!isRecord(value)) return null;
  if (
    !Array.isArray(value.recentMessages)
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
    focus: {
      running: value.focus.running,
      mode: value.focus.mode,
      durationMinutes: value.focus.durationMinutes,
      elapsedSeconds: value.focus.elapsedSeconds,
    },
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
  };
}

function parseRequestBody(value: unknown): CompanionAIRequest | null {
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
  };
}

function parseModelResult(value: unknown, action: CompanionAIAction): CompanionAIResponse | null {
  if (!isRecord(value) || !isNonEmptyString(value.content)) {
    return null;
  }

  const baseResult: CompanionAIResponse = {
    content: value.content.trim(),
    source: "model",
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

  if (action === "message") {
    return structuredPlan
      ? {
          ...baseResult,
          structuredPlan,
        }
      : baseResult;
  }

  if (!structuredPlan) {
    return null;
  }

  if (action === "tasks") {
    const tasks = Array.isArray(value.tasks)
      ? value.tasks.filter((item): item is string => isNonEmptyString(item)).map((item) => item.trim()).slice(0, 3)
      : [];

    if (tasks.length !== 3) {
      return null;
    }

    return {
      ...baseResult,
      structuredPlan,
      tasks,
    };
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

  if (/(主线|讲清楚|闭环|怎么接|串起来)/u.test(normalized)) {
    return "story";
  }

  if (/(有点乱|很乱|从哪开始|先帮我决定|不知道怎么开始|不知道先做什么|下一步做什么|先做哪一步|先干什么)/u.test(normalized)) {
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

function polishCompanionCopy(text: string, activePetName: string): string {
  const trimmed = text.trim();
  const withoutPetIntro = trimmed.startsWith(`${activePetName}看到你回来了，`)
    ? trimmed.slice(`${activePetName}看到你回来了，`.length)
    : trimmed;

  return withoutPetIntro
    .replace(/[?？]{2,}/g, activePetName)
    .replace(/^看到你[^，。！？!?]*[，,]\s*/u, "")
    .replace(/^好呀[，,]\s*/u, "好呀，")
    .replace(/陪伴小羊/g, `让${activePetName}陪你`)
    .replace(/陪伴宠物/g, `和${activePetName}继续往前走`)
    .replace(/用户/g, "你")
    .replace(/APP/g, "旅程")
    .replace(/(\d+)\s*分钟/g, "$1 分钟")
    .replace(/(\d+)\s*点能量\s+/g, "$1 点能量")
    .replace(/\b宠物\b/g, activePetName)
    .trim();
}

function polishStructuredPlan(
  plan: StructuredPlan,
  activePetName: string,
): StructuredPlan {
  const polishedSteps = plan.steps.map((step) =>
    polishCompanionCopy(step, activePetName)
      .replace(/(\d+)\s*点能量\s+/g, "$1 点能量"),
  );

  return {
    ...plan,
    goalSummary: polishCompanionCopy(plan.goalSummary, activePetName),
    steps: polishedSteps,
    recommendedDuration: plan.recommendedDuration
      .replace(/(\d+)\s*分钟/u, "$1 分钟")
      .replace(/^(\d+ 分钟)$/u, "$1 深度专注"),
    nextAction: polishCompanionCopy(plan.nextAction, activePetName),
    why: polishCompanionCopy(plan.why, activePetName),
  };
}

function buildSystemPrompt(action: CompanionAIAction, context: CompanionAIContext, draft: string): string {
  const intent = detectDraftIntent(draft);
  const basePrompt = [
    "你是一个像素宠物专注 app 的陪伴整理助手。",
    `当前陪伴名字是：${context.activePet.name}。如果需要提到宠物，只能自然地使用这个名字。`,
    "语气要治愈、聪明、有陪伴感，用短句和鼓励式表达。",
    "先直接回应用户眼前这句话，再决定要不要顺手给下一步建议。",
    "只有在用户明确请求整理主线、拆步骤、决定下一步时，才把回答组织成清晰计划。",
    "不要把所有输入都自动拉回“先专注 -> 再领奖 -> 再探索”的同一套模板。",
    "说话要像宠物在轻轻接住用户，而不是任务助手在下指令。",
    "不要反复使用同一种开场，比如“好呀，我们先…”。不同输入要有明显不同的回应方式。",
    "不要总以“今天想从哪里开始”或类似问题结尾。只有用户明确在问下一步时，才这样追问。",
    "如果用户只是打招呼、表达情绪、提到自己有点乱、累、走神，先回应状态本身，不要立刻拉去专注。",
    "如果提到资源，优先说“把奖励接回来”或“去奖励页把能量领回来”。",
    "如果提到宠物，不要写“陪伴小羊”“陪伴宠物”这种生硬说法，要写成自然句子。",
    "避免使用“看到你回来了”“开始专注任务”“开启番茄钟”这种像模板或工具说明的说法。",
    "不要用“看到你…所以…”、“用户”、“任务助手”、“APP 功能”、“系统建议”这种机械或旁白式表达。",
    "不要提及面试官、评审、作品集、展示、demo、录屏、测试、招聘、产品设计等打破产品语境的词。",
    `nextRoute 只能从这些值里选择：${ALLOWED_ROUTES.join(", ")}。`,
    "如果返回 structuredPlan，steps 必须正好 3 条，每条都是清晰、可执行的中文短句。",
    "content 写 1 到 3 句中文，像宠物在温柔地接住用户并推动下一步。",
    "recommendedDuration 要写成“25 分钟深度专注”或“10 分钟快速热身”这种格式。",
    "只输出 JSON，不要 markdown，不要解释，不要代码块。",
  ];

  const intentPromptMap: Record<DraftIntent, string> = {
    greeting: "用户现在是在打招呼。请只用 1 到 2 句温柔回应，并轻轻告诉他你可以帮他整理今天想推进的事。不要输出 structuredPlan。",
    capability: "用户现在在问你能做什么。请只用 2 句以内说明你可以帮他拆顺序、判断下一步、把专注和奖励接进主线。不要输出 structuredPlan，不要立刻替他排计划。",
    gratitude: "用户现在是在表达感谢或简单确认。请只做简短回应，不要输出 structuredPlan。",
    distracted: "用户是在说自己有点走神或分心。请先接住这个状态，给一个轻一点的回应，不要立刻生成计划，也不要机械地问从哪里开始。",
    story: "用户是在明确请求你帮他理清主线。请给更清楚的闭环表达，必要时附带 structuredPlan。",
    start: "用户是在问现在该从哪一步开始。请优先给一个具体起点，而不是把整条流程都重讲一遍；必要时附带 structuredPlan。",
    reward: "用户重点在奖励和能量怎么接进主线。请先回答这个问题本身；只有在确实需要时才附带 structuredPlan。",
    rest: "用户更需要低压力起步。请优先推荐更轻的下一步，不要默认 25 分钟深度专注；只有在确实需要时才附带 structuredPlan。",
    explore: "用户更关心宠物、探索或地图。请先顺着探索和陪伴来回答；只有在确实需要时才附带 structuredPlan。",
    general: "用户只是来和你说一句话。先理解他说的是什么。若问题还不够具体，可以轻轻追问一句；不要默认生成 structuredPlan。",
  };

  const messageShape = isTaskOrientedIntent(intent)
    ? `返回 JSON 结构：{"content":"..."} 或 {"content":"...","structuredPlan":{"goalSummary":"...","steps":["...","...","..."],"recommendedDuration":"...","nextRoute":"...","nextAction":"...","why":"..."}}。只有当用户明确在请求你整理主线、拆步骤、决定下一步时，才附带 structuredPlan。`
    : `返回 JSON 结构：{"content":"..."}`; 

  const actionPromptMap: Record<CompanionAIAction, string> = {
    message: messageShape,
    plan: `返回 JSON 结构：{"content":"...","structuredPlan":{"goalSummary":"...","steps":["...","...","..."],"recommendedDuration":"...","nextRoute":"...","nextAction":"...","why":"..."}}`,
    tasks: `返回 JSON 结构：{"content":"...","structuredPlan":{"goalSummary":"...","steps":["...","...","..."],"recommendedDuration":"...","nextRoute":"...","nextAction":"...","why":"..."},"tasks":["...","...","..."]}`,
    idea: `返回 JSON 结构：{"content":"...","note":{"title":"...","body":"..."},"quoteRef":"..."}`,
  };

  return [...basePrompt, intentPromptMap[intent], actionPromptMap[action]].join("\n");
}

async function callDeepSeek(payload: CompanionAIRequest): Promise<CompanionAIResponse> {
  const intent = detectDraftIntent(payload.draft);
  const apiKey = await getConfigValue("DEEPSEEK_API_KEY");
  if (!apiKey) {
    throw new Error("missing_deepseek_api_key");
  }

  const baseUrl = ((await getConfigValue("DEEPSEEK_BASE_URL")) ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
  const model = (await getConfigValue("DEEPSEEK_MODEL")) ?? DEFAULT_MODEL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: payload.action === "message" ? 0.9 : 0.6,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(payload.action, payload.context, payload.draft),
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

    const parsed = parseModelResult(JSON.parse(stripJsonFence(content)), payload.action);
    if (!parsed) {
      throw new Error("invalid_model_json");
    }

    return {
      ...parsed,
      content: polishCompanionCopy(parsed.content, payload.context.activePet.name),
      structuredPlan: parsed.structuredPlan
        ? polishStructuredPlan(parsed.structuredPlan, payload.context.activePet.name)
        : undefined,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();
    const payload = parseRequestBody(body);

    if (!payload) {
      return Response.json({ error: "invalid_companion_request" }, { status: 400 });
    }

    const result = await callDeepSeek(payload);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "companion_model_error";
    return Response.json({ error: message }, { status: 500 });
  }
}
