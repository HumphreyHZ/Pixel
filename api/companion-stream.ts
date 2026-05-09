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

function buildStreamingPrompt(payload: CompanionAIRequest): string {
  const activeGoal = payload.context.agent?.activeGoal
    ? `当前目标：${payload.context.agent.activeGoal}。`
    : "当前没有固定目标。";
  const activePetName = payload.context.activePet?.name ?? "当前陪伴";

  return [
    "你是像素宠物专注 app 里的陪伴整理助手。",
    "现在只输出给用户看的自然回复，不要 JSON，不要 markdown，不要列表。",
    "回复 1 到 2 句，语气治愈、聪明、有陪伴感。",
    "如果后面还会生成结构化卡片，你只需要先轻轻接住这句话，告诉用户正在整理。",
    "不要提及面试官、评审、作品集、展示、demo、录屏、测试、招聘。",
    "现实里的猫狗不要替换成 app 当前陪伴名。",
    activeGoal,
    `当前陪伴：${activePetName}。`,
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
        const finalResult = createFinalFromStreamedText(streamedText);
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
