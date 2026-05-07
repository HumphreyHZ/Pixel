import type { CompanionAIRequest, CompanionAIResponse } from "../src/types";

export const runtime = "nodejs";

type StreamEvent = "status" | "delta" | "final" | "metric" | "error";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseStreamRequestBody(value: unknown): CompanionAIRequest | null {
  if (!isRecord(value)) return null;
  if (value.action !== "message" && value.action !== "tasks" && value.action !== "plan" && value.action !== "idea") return null;
  if (!isNonEmptyString(value.draft) || !isRecord(value.context)) return null;

  return {
    action: value.action,
    draft: value.draft.trim(),
    context: value.context as unknown as CompanionAIRequest["context"],
  };
}

function getConfigValue(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function getDeepSeekConfig(): { apiKey: string; endpoint: string; model: string } {
  const apiKey = getConfigValue("DEEPSEEK_API_KEY");
  if (!apiKey) throw new Error("missing_deepseek_api_key");

  const baseUrl = (getConfigValue("DEEPSEEK_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
  const model = getConfigValue("DEEPSEEK_MODEL") ?? DEFAULT_MODEL;

  return { apiKey, endpoint, model };
}

function sendEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: StreamEvent, data: unknown): void {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`event: ${event}\n`));
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function shouldRequestStructuredFinal(payload: CompanionAIRequest): boolean {
  if (payload.action !== "message") return true;

  return /(主线|闭环|从哪开始|先做什么|下一步|安排|规划|拆|三步|奖励|能量|探索|专注|休息|热身|复盘|总结)/u
    .test(payload.draft);
}

function buildStreamingPrompt(payload: CompanionAIRequest): string {
  const activeGoal = payload.context.agent.activeGoal
    ? `当前目标：${payload.context.agent.activeGoal}。`
    : "当前没有固定目标。";

  return [
    "你是像素宠物专注 app 里的陪伴整理助手。",
    "现在只输出给用户看的自然回复，不要 JSON，不要 markdown，不要列表。",
    "回复 1 到 2 句，语气治愈、聪明、有陪伴感。",
    "如果后面还会生成结构化卡片，你只需要先轻轻接住这句话，告诉用户正在整理。",
    "不要提及面试官、评审、作品集、展示、demo、录屏、测试、招聘。",
    "现实里的猫狗不要替换成 app 当前陪伴名。",
    activeGoal,
    `当前陪伴：${payload.context.activePet.name}。`,
    `动作类型：${payload.action}。`,
  ].join("\n");
}

function createFinalFromStreamedText(content: string): CompanionAIResponse {
  return {
    content: content.trim() || "我在这儿。你说一句现在想推进的事，我会陪你把它理顺。",
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
      temperature: 0.7,
      max_tokens: 160,
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
  let firstTokenSeen = false;

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
        onDelta(delta);
      }
    }
  }

  return streamedText;
}

async function requestStructuredFinal(request: Request, payload: CompanionAIRequest): Promise<CompanionAIResponse> {
  const response = await fetch(new URL("/api/companion", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`companion_final_${response.status}`);
  }

  return await response.json() as CompanionAIResponse;
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const body: unknown = await request.json();
  const payload = parseStreamRequestBody(body);

  if (!payload) {
    return Response.json({ error: "invalid_companion_request" }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        sendEvent(controller, "status", { label: "正在理解目标" });
        sendEvent(controller, "metric", { name: "function_start", elapsedMs: 0 });

        let streamedText = "";
        streamedText = await streamDeepSeekReply(
          payload,
          (delta) => sendEvent(controller, "delta", { text: delta }),
          (name, at) => {
            const elapsedMs = at - startedAt;
            sendEvent(controller, "metric", { name, elapsedMs });
            console.info("[companion-stream] metric", { action: payload.action, name, elapsedMs });
          },
        );

        sendEvent(controller, "metric", { name: "deepseek_stream_done", elapsedMs: Date.now() - startedAt });

        const needsStructuredFinal = shouldRequestStructuredFinal(payload);
        if (needsStructuredFinal) {
          sendEvent(controller, "status", { label: "正在准备任务卡" });
        }

        const finalResult = needsStructuredFinal
          ? await requestStructuredFinal(request, payload)
          : createFinalFromStreamedText(streamedText);

        sendEvent(controller, "final", finalResult);
        sendEvent(controller, "metric", { name: "final_ready", elapsedMs: Date.now() - startedAt });
        console.info("[companion-stream] completed", {
          action: payload.action,
          structured: needsStructuredFinal,
          elapsedMs: Date.now() - startedAt,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "companion_stream_error";
        console.error("[companion-stream] failed", {
          action: payload.action,
          draft: payload.draft.slice(0, 120),
          error: message,
        });
        sendEvent(controller, "error", { error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
