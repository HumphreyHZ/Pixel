import { callDeepSeek, getDeepSeekConfig, parseRequestBody } from "./companion";
import type { CompanionAIRequest, CompanionAIResponse, CompanionStreamMode } from "../src/types";

export const runtime = "nodejs";

type StreamEvent = "status" | "delta" | "final" | "metric" | "error";

function sendEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: StreamEvent,
  data: unknown,
): void {
  controller.enqueue(encoder.encode(`event: ${event}\n`));
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function shouldRequestStructuredFinal(payload: CompanionAIRequest): boolean {
  if (payload.action !== "message") return true;

  if (/(判断|适合|该不该|要不要|先).*(专注|热身|休息|整理)/u.test(payload.draft)
    && /(专注|热身|休息)/u.test(payload.draft)) {
    return false;
  }

  return /(主线|闭环|从哪开始|先做什么|下一步|安排|规划|拆|三步|奖励|能量|探索|专注|休息|热身|复盘|总结)/u
    .test(payload.draft);
}

function resolveStreamMode(payload: CompanionAIRequest): CompanionStreamMode {
  if (payload.streamMode === "text" || payload.streamMode === "card") {
    return payload.streamMode;
  }

  return shouldRequestStructuredFinal(payload) ? "card" : "text";
}

function isStepBreakdownDraft(draft: string): boolean {
  const normalized = draft.trim();
  return /((拆|分|列|整理).{0,10}([3三]\s*(步|个步骤|个动作|件事|条)|步骤|小步|待办)|拆吧|拆一下|分一下|列一下|拆开|拆顺)/u.test(normalized);
}

function shouldStreamThreeStepAnswer(payload: CompanionAIRequest): boolean {
  if (payload.action !== "message") return false;
  if (isStepBreakdownDraft(payload.draft)) return true;

  return Boolean(
    payload.context.agent?.activeGoal
    && /(继续|然后呢|下一步|接着|往下).{0,8}(拆|分|列|整理)?/u.test(payload.draft.trim()),
  );
}

function isCompanionFlowDraft(draft: string): boolean {
  return /(专注|奖励|能量|步数|晶石|探索|宠物|图鉴|喂食|互动|地图|陪伴|主线|闭环|领奖|对战|商店)/u.test(draft);
}

function getRealLifePetLabel(draft: string): string | null {
  if (/(猫|猫咪|猫猫|小猫)/u.test(draft)) return "猫咪";
  if (/(狗|狗狗|小狗|遛狗)/u.test(draft)) return "狗狗";
  return null;
}

function shouldAvoidActivePetBinding(payload: CompanionAIRequest): boolean {
  return Boolean(getRealLifePetLabel(payload.draft)) && !isCompanionFlowDraft(payload.draft);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeStreamedCompanionText(payload: CompanionAIRequest, text: string): string {
  if (!shouldAvoidActivePetBinding(payload)) return text;

  const activePetName = payload.context.activePet?.name;
  const lifePetLabel = getRealLifePetLabel(payload.draft);
  if (!activePetName || !lifePetLabel) return text;

  return text
    .replace(new RegExp(escapeRegExp(activePetName), "g"), lifePetLabel)
    .replace(/陪伴小羊/g, lifePetLabel)
    .replace(/陪伴宠物/g, lifePetLabel);
}

function buildStreamingPrompt(payload: CompanionAIRequest): string {
  const activeGoal = payload.context.agent?.activeGoal
    ? `当前目标：${payload.context.agent.activeGoal}。`
    : "当前没有固定目标。";
  const activePetName = payload.context.activePet?.name ?? "当前陪伴";
  const shouldAnswerWithSteps = shouldStreamThreeStepAnswer(payload);
  const activePetContext = shouldAvoidActivePetBinding(payload)
    ? "当前问题是现实猫狗照护，不要提及当前 app 陪伴，也不要代入陪伴名字。"
    : `当前陪伴：${activePetName}。`;

  if (shouldAnswerWithSteps) {
    return [
      "你是像素宠物专注 app 里的陪伴整理助手。",
      "现在只输出给用户看的自然文字，不要 JSON，不要卡片字段。",
      "用户正在要求把一件事拆成 3 步。必须直接给出三条可执行步骤，不能只说“我会帮你整理”，也不能要求用户再输入一次。",
      "格式：先用一句短回应接住，然后换行输出 1. 2. 3. 三条步骤。",
      "每一步都要是具体动作，围绕用户当前输入；如果输入只是“拆吧/继续/然后呢”，就沿用当前目标来拆。",
      "现实里的猫狗就是现实宠物，不要替换成 app 当前陪伴名，也不要把猫咪写成当前陪伴。",
      "不要提及面试官、评审、作品集、展示、demo、录屏、测试、招聘。",
      activeGoal,
      activePetContext,
      `用户当前输入：${payload.draft}。`,
    ].join("\n");
  }

  return [
    "你是像素宠物专注 app 里的陪伴整理助手。",
    "现在只输出给用户看的自然回复，不要 JSON，不要卡片字段。",
    "回复 1 到 2 句，语气治愈、聪明、有陪伴感。",
    "如果用户明确要求拆步骤，但没有说清要拆什么，就轻轻追问一句；不要假装已经拆好了。",
    "不要提及面试官、评审、作品集、展示、demo、录屏、测试、招聘。",
    "现实里的猫狗不要替换成 app 当前陪伴名。",
    activeGoal,
    activePetContext,
    `动作类型：${payload.action}。`,
  ].join("\n");
}

function createFinalFromStreamedText(payload: CompanionAIRequest, content: string): CompanionAIResponse {
  return {
    content: sanitizeStreamedCompanionText(payload, content).trim() || "我在这儿。你说一句现在想推进的事，我会陪你把它理顺。",
    source: "model",
  };
}

async function streamDeepSeekReply(
  payload: CompanionAIRequest,
  onDelta: (delta: string) => void,
  onMetric: (name: string, at: number) => void,
): Promise<string> {
  const { apiKey, endpoint, model } = await getDeepSeekConfig();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: shouldStreamThreeStepAnswer(payload) ? 0.35 : 0.7,
      max_tokens: shouldStreamThreeStepAnswer(payload) ? 320 : 180,
      stream: true,
      messages: [
        {
          role: "system",
          content: buildStreamingPrompt(payload),
        },
        {
          role: "user",
          content: payload.draft,
        },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`deepseek_stream_${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamedText = "";
  let sanitizeBuffer = "";
  let firstTokenSeen = false;
  const shouldSanitizeDeltas = shouldAvoidActivePetBinding(payload);
  const sanitizeHoldLength = shouldSanitizeDeltas
    ? Math.max((payload.context.activePet?.name.length ?? 0) - 1, 1)
    : 0;
  const flushDelta = (delta: string, force = false) => {
    if (!shouldSanitizeDeltas) {
      onDelta(delta);
      return;
    }

    sanitizeBuffer = sanitizeStreamedCompanionText(payload, `${sanitizeBuffer}${delta}`);
    if (!force && sanitizeBuffer.length <= sanitizeHoldLength) return;

    const emitLength = force ? sanitizeBuffer.length : sanitizeBuffer.length - sanitizeHoldLength;
    if (emitLength <= 0) return;

    const nextDelta = sanitizeBuffer.slice(0, emitLength);
    sanitizeBuffer = sanitizeBuffer.slice(emitLength);
    if (nextDelta) onDelta(nextDelta);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const dataLines = rawEvent
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace(/^data:\s?/u, "").trim())
        .filter(Boolean);

      for (const dataLine of dataLines) {
        if (dataLine === "[DONE]") {
          flushDelta("", true);
          return streamedText;
        }

        const parsed = JSON.parse(dataLine) as {
          choices?: Array<{
            delta?: {
              content?: string | null;
              reasoning_content?: string | null;
            };
          }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content ?? "";
        if (!delta) continue;

        if (!firstTokenSeen) {
          firstTokenSeen = true;
          onMetric("first_token", Date.now());
        }

        streamedText += delta;
        flushDelta(delta);
      }
    }
  }

  flushDelta("", true);
  return streamedText;
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  let payload: CompanionAIRequest | null = null;

  try {
    const body: unknown = await request.json();
    payload = parseRequestBody(body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "invalid_companion_request" },
      { status: 400 },
    );
  }

  if (!payload) {
    return Response.json({ error: "invalid_companion_request" }, { status: 400 });
  }

  const streamPayload = payload;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        const streamMode = resolveStreamMode(streamPayload);
        console.info("[companion-stream] invoked", { action: streamPayload.action, streamMode });
        sendEvent(controller, encoder, "status", { label: "正在理解目标" });
        sendEvent(controller, encoder, "metric", { name: "function_start", elapsedMs: 0 });
        sendEvent(controller, encoder, "metric", { name: "first_event_sent", elapsedMs: Date.now() - startedAt });

        if (streamMode === "card") {
          sendEvent(controller, encoder, "status", { label: "正在搭好卡片骨架" });
          sendEvent(controller, encoder, "status", { label: "正在填入整理结果" });
          sendEvent(controller, encoder, "metric", { name: "deepseek_start", elapsedMs: Date.now() - startedAt });

          const finalResult = await callDeepSeek({ ...streamPayload, streamMode });

          sendEvent(controller, encoder, "final", finalResult);
          sendEvent(controller, encoder, "metric", { name: "final_ready", elapsedMs: Date.now() - startedAt });
          console.info("[companion-stream] completed", {
            action: streamPayload.action,
            streamMode,
            elapsedMs: Date.now() - startedAt,
          });
          return;
        }

        sendEvent(controller, encoder, "metric", { name: "deepseek_start", elapsedMs: Date.now() - startedAt });
        const streamedText = await streamDeepSeekReply(
          streamPayload,
          (delta) => sendEvent(controller, encoder, "delta", { text: delta }),
          (name, at) => {
            const elapsedMs = at - startedAt;
            sendEvent(controller, encoder, "metric", { name, elapsedMs });
            console.info("[companion-stream] metric", { action: streamPayload.action, name, elapsedMs });
          },
        );

        sendEvent(controller, encoder, "metric", { name: "deepseek_stream_done", elapsedMs: Date.now() - startedAt });
        const finalResult = createFinalFromStreamedText(streamPayload, streamedText);
        sendEvent(controller, encoder, "final", finalResult);
        sendEvent(controller, encoder, "metric", { name: "final_ready", elapsedMs: Date.now() - startedAt });
        console.info("[companion-stream] completed", {
          action: streamPayload.action,
          streamMode,
          elapsedMs: Date.now() - startedAt,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "companion_stream_error";
        console.error("[companion-stream] failed", {
          action: streamPayload.action,
          draft: streamPayload.draft.slice(0, 120),
          error: message,
        });
        sendEvent(controller, encoder, "error", { error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
