import { useMemo } from "react";
import type { ReactNode } from "react";
import { useState } from "react";
import { PixelPet } from "./components/PixelPet";
import { mainRoutes, routeLabels } from "./data/seed";
import { useDemoState } from "./hooks/useDemoState";
import type { AICard, CompanionMessage, FocusPreset, RouteKey, StepLedger, StructuredPlan, TaskItem } from "./types";

const presetToneMap: Record<FocusPreset["tone"], string> = {
  sky: "bg-sky/55",
  peach: "bg-peach/60",
  sage: "bg-sage/55",
  amber: "bg-amber/65",
};

const routeMeta: Record<RouteKey, { eyebrow: string; caption: string }> = {
  home: { eyebrow: "旅程封面", caption: "先把今天的主线讲清楚，再顺着这条旅程继续往前走。" },
  focus: { eyebrow: "核心章节", caption: "让一轮专注真正带来奖励、成长和下一步动作。" },
  companion: { eyebrow: "陪伴整理", caption: "把一句目标拆成顺手的动作，让宠物承担引导角色。" },
  pets: { eyebrow: "陪伴图鉴", caption: "让角色成长和情绪反馈参与整个演示闭环。" },
  explore: { eyebrow: "旅程地图", caption: "把已经赚到的能量继续带去冒险，而不是停在账面上。" },
  bank: { eyebrow: "奖励中转", caption: "把步数奖励收进能量池，再决定兑换还是继续使用。" },
  achievements: { eyebrow: "成长记录", caption: "把专注、奖励和收集痕迹整理成一页清楚的成绩册。" },
  battle: { eyebrow: "试炼插曲", caption: "用一场轻量试炼感受状态变化、资源门槛和反馈节奏。" },
  shop: { eyebrow: "补给铺", caption: "给旅程加一点补给和装饰，而不是做普通商品列表。" },
};

const shopItems = [
  { id: "snack", title: "像素零食", price: 24, description: "给当前陪伴补一点心情和亲密度，适合在推进主线前顺手补状态。" },
  { id: "tea", title: "薄荷茶", price: 18, description: "回复 20 点能量，让探索或对战可以继续推进。" },
  { id: "scarf", title: "荧光围巾", price: 66, description: "给当前宠物换一层更醒目的形象，让陪伴感更强。" },
] as const;

const extendedDemoRoutes: RouteKey[] = ["pets", "shop", "battle", "achievements"];

const companionPrompts = [
  { label: "拆成 3 步", value: "帮我把今天要推进的事拆成 3 步，越顺手越好。" },
  { label: "先专注还是休息", value: "我现在有点乱，帮我判断更适合先专注、先热身还是先休息整理。" },
] as const;

const petRoleCopy: Record<string, string> = {
  sheep: "更适合做温和的起步陪伴，帮你把今天先走起来。",
  beagle: "更适合做推进型搭档，鼓励你快一点把主线跑完。",
  "night-cat": "更适合做复盘和整理型陪伴，帮你把节奏收紧。",
  "rest-rabbit": "更适合做缓冲型搭档，适合先轻一点地把状态拉起来。",
};

const achievementEvidenceCopy: Record<string, string> = {
  "a-1": "这是主循环成立的证据",
  "a-2": "这是资源系统被看懂的证据",
  "a-3": "这是陪伴角色被建立起来的证据",
  "a-4": "这是节奏能持续运转的证据",
};

function formatTimer(totalSeconds: number): string {
  const safeValue = Math.max(totalSeconds, 0);
  const minutes = String(Math.floor(safeValue / 60)).padStart(2, "0");
  const seconds = String(safeValue % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function relativeTime(timestamp: number): string {
  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const hours = Math.round(diffMinutes / 60);
  return `${hours} 小时前`;
}

function messageTone(type: CompanionMessage["type"], role: CompanionMessage["role"]): string {
  if (role === "user") return "bg-sky/45 border-sky/50";
  if (type === "structuredPlan") return "bg-white/88 border-black/[0.08]";
  if (type === "reward") return "bg-amber/45 border-amber/55";
  if (type === "systemEvent") return "bg-sage/42 border-sage/50";
  if (type === "imageCard") return "bg-peach/42 border-peach/50";
  return "bg-white/82 border-white/75";
}

function SectionTitle({ eyebrow, title, caption, trailing }: { eyebrow?: string; title: string; caption?: string; trailing?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="story-kicker">{eyebrow}</p> : null}
        <h2 className="mt-2 text-[1.45rem] font-black leading-tight tracking-[-0.03em] text-ink">{title}</h2>
        {caption ? <p className="mt-2 text-sm leading-6 text-mist">{caption}</p> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

function ResourceBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="resource-badge">
      <p className="text-[11px] font-semibold tracking-[0.22em] text-mist">{label}</p>
      <p className="mt-1 text-lg font-black tracking-tight text-ink">{value.toLocaleString("zh-CN")}</p>
    </div>
  );
}

function TaskList({
  tasks,
  onToggle,
  onRemove,
}: {
  tasks: TaskItem[];
  onToggle: (taskId: string) => void;
  onRemove?: (taskId: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center gap-3 rounded-[22px] border border-black/[0.05] bg-white/72 px-4 py-3 text-sm shadow-[0_10px_24px_rgba(28,23,18,0.05)]">
          <input
            checked={task.status === "done"}
            onChange={() => onToggle(task.id)}
            type="checkbox"
            className="h-4 w-4 rounded border-black/20 bg-white"
          />
          <span className={task.status === "done" ? "min-w-0 flex-1 text-mist line-through" : "min-w-0 flex-1 text-ink"}>{task.title}</span>
          {onRemove ? (
            <button
              type="button"
              className="shrink-0 rounded-full border border-black/[0.08] px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] text-mist transition hover:border-black/[0.14] hover:text-ink"
              onClick={() => onRemove(task.id)}
            >
              清除
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function JourneyStep({ index, title, copy, status }: { index: string; title: string; copy: string; status: "done" | "active" | "idle" }) {
  const statusLabel = status === "done" ? "已点亮" : status === "active" ? "正在走" : "下一步";

  return (
    <div className="relative flex gap-4 pb-5 last:pb-0">
      <div className="relative flex w-10 shrink-0 justify-center">
        <span className={`trail-marker ${status === "done" ? "trail-marker-done" : status === "active" ? "trail-marker-active" : "trail-marker-idle"}`}>
          {status === "done" ? "✓" : index}
        </span>
      </div>
      <div className={`min-w-0 flex-1 rounded-[28px] border px-4 py-4 ${status === "active" ? "border-black/[0.08] bg-white/84 shadow-soft" : status === "done" ? "border-sage/55 bg-sage/28" : "border-black/[0.05] bg-white/64"}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-black tracking-tight text-ink">{title}</p>
          <span className="story-chip">{statusLabel}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-mist">{copy}</p>
      </div>
    </div>
  );
}

function BankRow({ item, onRedeem }: { item: StepLedger; onRedeem: (stepId: string) => void }) {
  return (
    <article className={`ticket-card ${item.redeemed ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="story-kicker !text-[10px] !tracking-[0.22em]">{item.dateLabel}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-ink">{item.steps.toLocaleString("zh-CN")} 步</p>
          <p className="mt-2 text-sm leading-6 text-mist">{item.redeemed ? "这张奖励小票已经收进能量池了。" : "领取后会直接汇入当前能量，方便你继续探索或兑换。"}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold tracking-[0.18em] text-mist">待领能量</p>
          <p className="mt-1 text-[2rem] font-black leading-none tracking-[-0.04em] text-ink">{item.energyEarned}</p>
        </div>
      </div>
      <button
        type="button"
        className={`mt-4 ${item.redeemed ? "story-button-soft" : "story-button"}`}
        disabled={item.redeemed}
        onClick={() => onRedeem(item.id)}
      >
        {item.redeemed ? "已收入能量池" : "领取这天奖励"}
      </button>
    </article>
  );
}

function PromptChip({
  label,
  onClick,
  disabled = false,
  selected = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className={`route-pill text-left disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "route-pill-active" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function planPrimaryLabel(plan: StructuredPlan, isExecuting = false, isExecutionComplete = false, executionStepIndex?: number): string {
  if (plan.nextRoute === "companion") {
    if (!isExecuting) return "开始第一步";
    if (isExecutionComplete) return "这三步已走完";
    const stepNumber = Math.min((executionStepIndex ?? 0) + 1, plan.steps.length);
    return `完成第 ${stepNumber} 步`;
  }

  if (plan.nextRoute === "focus") {
    if (/热身/u.test(plan.recommendedDuration)) {
      return `先热身 ${plan.recommendedDuration.replace(/\s+/g, "")}`;
    }
    return `先专注 ${plan.recommendedDuration.replace(/\s+/g, "")}`;
  }

  if (plan.nextRoute === "bank") return "去领取能量";
  if (plan.nextRoute === "explore") return "去探索";
  if (plan.nextRoute === "pets") return "去看看陪伴";

  return plan.nextAction;
}

function AiModule({
  eyebrow = "AI 陪伴建议",
  title,
  description,
  steps,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  secondaryDisabled,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  steps?: string[];
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
}) {
  return (
    <section className="ai-panel">
      <p className="ai-eyebrow">{eyebrow}</p>
      <h3 className="mt-2 text-xl font-black tracking-tight text-ink">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-mist">{description}</p>
      {steps?.length ? (
        <div className="mt-4 space-y-2">
          {steps.map((step, index) => (
            <div key={`${step}-${index}`} className="ai-step-row">
              <span className="ai-step-index">{index + 1}</span>
              <p className="text-sm leading-6 text-ink">{step}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button type="button" className="story-button" disabled={primaryDisabled} onClick={onPrimary}>
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
          <button type="button" className="story-button-secondary" disabled={secondaryDisabled} onClick={onSecondary}>
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function StructuredPlanMessage({
  content,
  plan,
  executionStepIndex,
  onAdvanceExecution,
  onPrimary,
  onAddToTasks,
  onSecondary,
}: {
  content: string;
  plan: StructuredPlan;
  executionStepIndex?: number;
  onAdvanceExecution?: () => void;
  onPrimary: () => void;
  onAddToTasks: () => void;
  onSecondary: () => void;
}) {
  const isCompanionExecutionPlan = plan.nextRoute === "companion";
  const isExecuting = isCompanionExecutionPlan && typeof executionStepIndex === "number";
  const isExecutionComplete = isExecuting && executionStepIndex >= plan.steps.length;
  const activeStepIndex = isExecutionComplete
    ? plan.steps.length - 1
    : Math.min(executionStepIndex ?? 0, Math.max(0, plan.steps.length - 1));
  const primaryLabel = planPrimaryLabel(plan, isExecuting, isExecutionComplete, executionStepIndex);
  const progressLabel = isExecutionComplete ? "三步都已经完成了" : `正在走第 ${activeStepIndex + 1} 步`;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="ai-eyebrow">陪伴整理</p>
        <span className="story-chip">{plan.recommendedDuration}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-ink">{content}</p>
      <div className="mt-4 space-y-4">
        <div>
          <p className="ai-mini-title">你现在要推进的是</p>
          <p className="mt-2 text-sm leading-6 text-ink">{plan.goalSummary}</p>
        </div>
        <div className="border-t border-black/[0.08] pt-4">
          <p className="ai-mini-title">建议顺序</p>
          <div className="mt-2 space-y-2">
            {plan.steps.map((step, index) => (
              <div
                key={`${step}-${index}`}
                className={`ai-step-row rounded-[20px] border px-3 py-3 transition ${
                  isCompanionExecutionPlan
                    ? index < activeStepIndex || isExecutionComplete
                      ? "border-sage/40 bg-sage/18"
                      : index === activeStepIndex && isExecuting
                        ? "border-black/[0.08] bg-white/92 shadow-[0_10px_24px_rgba(28,23,18,0.05)]"
                        : "border-black/[0.05] bg-white/68"
                    : "border-transparent px-0 py-0"
                }`}
              >
                <span className="ai-step-index">{isCompanionExecutionPlan && (index < activeStepIndex || isExecutionComplete) ? "✓" : index + 1}</span>
                <p className="text-sm leading-6 text-ink">{step}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-black/[0.08] pt-4">
          <p className="ai-mini-title">{isCompanionExecutionPlan ? "执行进度" : "下一步"}</p>
          <p className="mt-2 text-sm leading-6 text-ink">{isCompanionExecutionPlan ? progressLabel : plan.nextAction}</p>
          {isCompanionExecutionPlan ? (
            <p className="mt-1 text-sm leading-6 text-mist">
              {!isExecuting
                ? "这类生活任务更适合直接开始做，不需要再回到输入框。"
                : isExecutionComplete
                  ? "如果你想把它正式记下来，可以再点一次加入待办。"
                  : "完成当前这一步后，我会把你切到下一步。"}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="story-button w-auto px-4 py-3"
          disabled={isCompanionExecutionPlan && isExecutionComplete}
          onClick={isCompanionExecutionPlan && isExecuting && !isExecutionComplete && onAdvanceExecution ? onAdvanceExecution : onPrimary}
        >
          {primaryLabel}
        </button>
        <button type="button" className="story-button-secondary w-auto px-4 py-3" onClick={onAddToTasks}>
          加入待办
        </button>
        <button type="button" className="story-button-secondary w-auto px-4 py-3" onClick={onSecondary}>
          重新整理
        </button>
      </div>
    </div>
  );
}

function agentTraceStatusLabel(status: "done" | "pending" | "skipped" | "failed"): string {
  if (status === "pending") return "待确认";
  if (status === "skipped") return "已跳过";
  if (status === "failed") return "未完成";
  return "已完成";
}

function agentTraceStatusClass(status: "done" | "pending" | "skipped" | "failed"): string {
  if (status === "pending") return "border-amber/45 bg-amber/22";
  if (status === "skipped") return "border-black/[0.06] bg-black/[0.04]";
  if (status === "failed") return "border-peach/50 bg-peach/26";
  return "border-sage/50 bg-sage/24";
}

function aiSourceLabel(source?: "model" | "fallback"): string | null {
  if (source === "model") return "DeepSeek";
  if (source === "fallback") return "演示回退";
  return null;
}

function companionThinkingCopy(
  action?: RouteKey | "message" | "tasks" | "plan" | "idea",
  intent?: "story" | "start" | "reward" | "rest" | "explore" | "greeting" | "capability" | "gratitude" | "general",
) {
  if (action === "tasks") {
    return {
      title: "正在把这件事拆成顺手的三步",
      steps: ["先抓住这件事的重点", "把动作拆成更容易开始的三步", "准备把结果接回待办和下一步"],
    };
  }

  if (action === "plan") {
    return {
      title: "正在安排更顺的节奏",
      steps: ["先判断这句话更像哪种目标", "再把顺序和下一步排清楚", "尽量让这条路线接回当前主线"],
    };
  }

  if (action === "idea") {
    return {
      title: "正在把这条想法收成灵感",
      steps: ["先提炼这句话里最值得留下的部分", "把它收成一条更清楚的灵感", "准备放进边栏方便后面继续展开"],
    };
  }

  if (intent === "start") {
    return {
      title: "正在判断现在最适合从哪一步开始",
      steps: ["先看你现在卡在起步、顺序还是决策", "判断更适合先专注、先领奖，还是先整理一下", "把最值得做的第一步先提出来"],
    };
  }

  if (intent === "rest") {
    return {
      title: "正在平衡专注、热身和休息节奏",
      steps: ["先接住你现在的状态", "判断该先热身、先缓一缓，还是直接推进", "尽量给你一个更低压力的起步方式"],
    };
  }

  if (intent === "reward") {
    return {
      title: "正在整理奖励和能量该怎么接",
      steps: ["先看你现在有没有待领资源", "判断更适合先领奖、先兑换，还是继续往下用", "把奖励页接回当前主线"],
    };
  }

  if (intent === "explore") {
    return {
      title: "正在判断陪伴、探索和主线怎么接",
      steps: ["先看你关心的是宠物、地图还是互动", "判断这一步该接在专注前还是奖励后", "把探索路线整理得更顺手一些"],
    };
  }

  if (intent === "story") {
    return {
      title: "正在把今天这条主线讲顺",
      steps: ["先抓住你现在最想强调的环节", "把专注、奖励和后续动作排成闭环", "尽量让下一步一眼就能看懂"],
    };
  }

  if (intent === "capability") {
    return {
      title: "正在整理陪伴现在最能帮你的地方",
      steps: ["先判断你是在问能力还是问下一步", "挑出最相关的几项整理方式", "用更自然的话把它说明白"],
    };
  }

  if (intent === "greeting" || intent === "gratitude") {
    return {
      title: "正在准备一句更自然的陪伴回应",
      steps: ["先接住你现在这句简单的话", "判断要不要顺手带一点下一步提示", "把语气收得温柔一点再回应"],
    };
  }

  return {
    title: "正在整理这句话",
    steps: ["先理解你现在最想推进的事", "判断该直接回应、拆步骤，还是安排下一步", "把结果整理成更顺手的回复"],
  };
}

function AchievementSeal({ title, description, unlocked, index, evidence }: { title: string; description: string; unlocked: boolean; index: number; evidence: string }) {
  return (
    <article className={`stamp-card ${unlocked ? "stamp-card-active" : "stamp-card-muted"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="stamp-index">{String(index + 1).padStart(2, "0")}</span>
        <span className="story-chip">{unlocked ? "已点亮" : "待点亮"}</span>
      </div>
      <h3 className="mt-6 text-lg font-black tracking-tight text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-mist">{description}</p>
      <p className="mt-4 text-xs font-semibold tracking-[0.08em] text-ink/75">{evidence}</p>
    </article>
  );
}

export default function App() {
  const [companionExecutionSteps, setCompanionExecutionSteps] = useState<Record<string, number>>({});
  const {
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
    canClaimFocusReward,
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
    confirmPendingAgentAction,
    skipPendingAgentAction,
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
  } = useDemoState();
  const [showAllNotes, setShowAllNotes] = useState(false);

  const openTasks = useMemo(() => state.tasks.filter((task) => task.status !== "done"), [state.tasks]);
  const completedTasks = useMemo(() => state.tasks.filter((task) => task.status === "done"), [state.tasks]);
  const completedSessions = useMemo(() => state.sessions.filter((session) => session.status === "completed"), [state.sessions]);
  const recentMessages = useMemo(
    () => state.messages.filter((message) => message.type !== "taskCard" && message.type !== "imageCard"),
    [state.messages],
  );
  const recentAgentTrace = useMemo(() => state.agent.agentTrace.slice(0, 4), [state.agent.agentTrace]);
  const visibleNotes = useMemo(
    () => (showAllNotes ? state.notes : state.notes.slice(0, 2)),
    [showAllNotes, state.notes],
  );
  const thinkingCopy = useMemo(
    () => companionThinkingCopy(companionThinking?.action, companionThinking?.intent),
    [companionThinking?.action, companionThinking?.intent],
  );
  const todayCrystal = useMemo(() => completedSessions.reduce((sum, item) => sum + item.crystalReward, 0), [completedSessions]);
  const activePetProgress = Math.min(100, (activePet.exp / (activePet.level * 12)) * 100);
  const claimableEnergy = useMemo(
    () => state.steps.filter((item) => !item.redeemed).reduce((sum, item) => sum + item.energyEarned, 0),
    [state.steps],
  );
  const unlockedMapCount = useMemo(
    () => state.mapNodes.filter((node) => completedMinutes >= node.unlockMinutes).length,
    [state.mapNodes, completedMinutes],
  );
  const hasDraft = state.draft.trim().length > 0;
  const selectedPrompt = useMemo(
    () => companionPrompts.find((prompt) => state.draft.trim() === prompt.value.trim()) ?? null,
    [state.draft],
  );
  const focusTargetSeconds = state.focus.durationMinutes * 60;
  const focusRemainingMinutes = Math.max(0, Math.ceil((focusTargetSeconds - focusElapsedSeconds) / 60));
  const focusProgress = focusTargetSeconds > 0 ? Math.min(100, (focusElapsedSeconds / focusTargetSeconds) * 100) : 0;
  const activeNavRoute = mainRoutes.includes(state.route) ? state.route : "home";
  const energyReadyForExchange = Math.floor(state.wallet.energy / 10);
  const completedFocusCount = completedSessions.length;
  const redeemedStepsCount = state.steps.filter((item) => item.redeemed).length;
  const chapterMeta = routeMeta[state.route];
  const battleNarration = useMemo(() => {
    if (state.battle.active) {
      return state.battle.logs;
    }

    if (state.battle.logs.some((log) => log.includes("准备进入演示战斗") || log.includes("准备先手进攻"))) {
      return [`系统派出了${state.battle.enemyName}。你派出了${activePet.name}，准备进入演示战斗。`];
    }

    return state.battle.logs;
  }, [activePet.name, state.battle.active, state.battle.enemyName, state.battle.logs]);
  const latestFocusRecapCard = useMemo<AICard | undefined>(
    () => state.aiCards.find((card) => card.type === "focusRecap"),
    [state.aiCards],
  );
  const latestResourceAdviceCard = useMemo<AICard | undefined>(
    () => state.aiCards.find((card) => card.type === "resourceAdvice"),
    [state.aiCards],
  );
  const latestContextHintCard = useMemo<AICard | undefined>(
    () => state.aiCards.find((card) => card.type === "contextHint"),
    [state.aiCards],
  );
  const recommendedExploreNode = useMemo(
    () =>
      state.mapNodes.find((node) => completedMinutes >= node.unlockMinutes && node.explored === 0)
      ?? [...state.mapNodes].reverse().find((node) => completedMinutes >= node.unlockMinutes)
      ?? state.mapNodes[0],
    [completedMinutes, state.mapNodes],
  );
  const shopRecommendation = useMemo(() => {
    if (state.wallet.energy < 15) {
      return {
        itemId: "tea" as const,
        title: "现在更值得买哪一个",
        description: "如果你准备继续探索或对战，薄荷茶是更直接的补给。",
      };
    }

    if (activePet.activeSkin !== "荧光围巾" && state.wallet.crystal >= 66) {
      return {
        itemId: "scarf" as const,
        title: "现在更值得买哪一个",
        description: "如果你想让当前陪伴更有记忆点，荧光围巾会是更醒目的选择。",
      };
    }

    return {
      itemId: "snack" as const,
      title: "现在更值得买哪一个",
        description: "如果你想先照顾当前陪伴的状态，可以先买像素零食。",
    };
  }, [activePet.activeSkin, state.wallet.crystal, state.wallet.energy]);
  const achievementSummary = useMemo(() => {
    const unlockedCount = state.achievements.filter((item) => item.unlocked).length;
    return unlockedCount >= 3
      ? "你已经把专注奖励、步数领奖和资源继续流动串起来了，这说明这是一条完整的互动闭环。"
      : "你已经开始点亮主循环，接下来再补一段探索或奖励流动，整套旅程会更完整。";
  }, [state.achievements]);

  const homeStory = useMemo(() => {
    if (state.focus.running) {
      return {
        eyebrow: "当前主线",
        title: "先把正在进行的这轮专注走完",
        description: "本轮还在计时中。倒计时归零后会自动结算，正计时达到目标后才能领奖。",
      };
    }

    if (claimableEnergy > 0) {
      return {
        eyebrow: "下一步",
        title: `先领取 ${claimableEnergy} 点待领能量`,
        description: "把已经赚到的奖励先收进口袋，再决定要不要继续探索、喂食或开启下一轮专注。",
      };
    }

    if (openTasks.length > 0) {
      return {
        eyebrow: "下一步",
        title: "先完成一轮专注，把奖励闭环真正启动起来",
        description: "先专注、再领奖、再探索，整条主线会更清楚，也更顺。",
      };
    }

    return {
      eyebrow: "下一步",
      title: "先让陪伴帮你定今天的任务，再开始第一轮专注",
      description: "如果今天还没决定从哪里开始，就先去陪伴页说一句目标，让它帮你拆成顺手的动作。",
    };
  }, [claimableEnergy, openTasks.length, state.focus.running]);

  const homePrimaryLabel = state.focus.running ? "继续当前专注" : claimableEnergy > 0 ? "领取步数能量" : "开始本轮专注";
  const homeSecondaryLabel = state.focus.running ? "去陪伴页看任务" : claimableEnergy > 0 ? "再开下一轮专注" : "让陪伴帮我整理主线";
  const companionFocusPlan = useMemo(() => {
    if (state.agent.activePlan?.nextRoute !== "focus") return null;
    return state.agent.activePlan;
  }, [state.agent.activePlan]);
  const focusRuleCopy = !state.focus.running
    ? "倒计时模式会在归零后自动结算；正计时达到目标时长后，才会开放领奖按钮。需要快速录屏或测试时，可以使用演示跳过。"
    : state.focus.mode === "pomodoro"
      ? "当前是倒计时模式。计时归零后会自动发放本轮奖励；若只是测试闭环，可用演示跳过直接结算。"
      : canClaimFocusReward
        ? "已经达到目标时长，现在可以结束本轮并领取奖励。"
        : `当前是正计时模式。还需专注 ${focusRemainingMinutes} 分钟后才能领奖；需要快速测试时，也可以使用演示跳过。`;
  const demoSkipHint = "测试入口仍然保留，但会缩成次要动作，避免它抢走主流程的可信度。";

  const journeySteps = [
    {
      index: "01",
      title: "把目标说清楚",
      copy: "去陪伴页说一句今天想推进的事，让它先帮你拆成待办和顺序。",
      status: state.focus.running || completedFocusCount > 0 || claimableEnergy > 0 ? ("done" as const) : ("active" as const),
    },
    {
      index: "02",
      title: "完成一轮专注",
      copy: "先拿下这笔晶石和经验，让旅程有一个真正被完成的时刻。",
      status: state.focus.running ? ("active" as const) : completedFocusCount > 0 ? ("done" as const) : ("idle" as const),
    },
    {
      index: "03",
      title: "把奖励继续带走",
      copy: "去奖励页领取能量，再决定要不要探索、对战、喂食，或把它兑换成晶石。",
      status: redeemedStepsCount > 0 ? ("done" as const) : claimableEnergy > 0 ? ("active" as const) : ("idle" as const),
    },
  ];

  const focusCrystalReward = state.focus.durationMinutes * 3;
  const focusExpReward = state.focus.durationMinutes * 2;
  const focusStatusLabel = !state.focus.running ? "待开始" : canClaimFocusReward ? "可领奖" : "进行中";

  function startCompanionExecution(messageId: string): void {
    setCompanionExecutionSteps((current) => ({
      ...current,
      [messageId]: 0,
    }));
  }

  function advanceCompanionExecution(messageId: string, totalSteps: number): void {
    setCompanionExecutionSteps((current) => {
      const currentIndex = current[messageId] ?? 0;
      return {
        ...current,
        [messageId]: Math.min(currentIndex + 1, totalSteps),
      };
    });
  }

  function focusCompanionDraft(nextStep: string): void {
    setRoute("companion");
    setDraft(nextStep);
    window.requestAnimationFrame(() => {
      const draftField = document.getElementById("companion-draft") as HTMLTextAreaElement | null;
      draftField?.focus();
      draftField?.scrollIntoView({ behavior: "smooth", block: "center" });
      const valueLength = draftField?.value.length ?? 0;
      draftField?.setSelectionRange(valueLength, valueLength);
    });
  }

  function goToRouteOrStart(route?: RouteKey, nextStep?: string): void {
    if (!route) return;
    if (route === "focus" && !state.focus.running) {
      startFocus();
      return;
    }
    if (route === "companion") {
      focusCompanionDraft(nextStep ?? "");
      return;
    }
    setRoute(route);
  }

  function handleResourceSecondaryAction(): void {
    if (latestResourceAdviceCard?.secondaryLabel === "按建议兑换成晶石") {
      exchangeEnergy();
      return;
    }
    goToRouteOrStart(latestResourceAdviceCard?.secondaryRoute);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full items-center justify-center px-4 py-6 sm:px-6">
      <div className="journey-shell">
        <div className="journey-orb journey-orb-left" />
        <div className="journey-orb journey-orb-right" />
        <div className="journey-orb journey-orb-bottom" />

        <header className="relative z-10 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="story-kicker">{chapterMeta.eyebrow}</p>
            <h1 className="mt-2 text-[2.25rem] font-black leading-none tracking-[-0.05em] text-ink">{routeLabels[state.route]}</h1>
            <p className="mt-3 max-w-[15rem] text-sm leading-6 text-mist">{chapterMeta.caption}</p>
          </div>
          <div className="grid min-w-[142px] grid-cols-2 gap-2">
            <ResourceBadge label="晶石" value={state.wallet.crystal} />
            <ResourceBadge label="能量" value={state.wallet.energy} />
          </div>
        </header>

        <main className="relative z-10 mt-6 space-y-5 pb-32">
          {state.route === "home" && (
            <>
              <section className="section-slab hero-slab">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="story-kicker">{homeStory.eyebrow}</p>
                    <h2 className="mt-2 max-w-[12rem] text-[2.15rem] font-black leading-[0.98] tracking-[-0.05em] text-ink">{homeStory.title}</h2>
                    <p className="mt-3 max-w-[15rem] text-sm leading-6 text-mist">{homeStory.description}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <span className="story-chip">今日晶石 {todayCrystal}</span>
                      <span className="story-chip">待办 {openTasks.length}</span>
                      <span className="story-chip">累计专注 {completedMinutes} 分钟</span>
                    </div>
                  </div>

                  <div className="shrink-0">
                    <div className="pet-vignette">
                      <PixelPet pet={activePet} size="lg" tone="home" />
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-[26px] border border-white/70 bg-white/62 px-4 py-4 shadow-[0_12px_26px_rgba(28,23,18,0.05)]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="story-kicker !text-[10px]">当前陪伴</p>
                      <p className="mt-2 text-xl font-black tracking-tight text-ink">{activePet.name}</p>
                      <p className="mt-2 text-sm text-mist">Lv.{activePet.level} · {activePet.activeSkin}</p>
                    </div>
                    <div className="min-w-[7rem] text-right text-sm text-mist">
                      <p>心情 {activePet.mood} / 100</p>
                      <p className="mt-1">亲密度 {activePet.affection} / 100</p>
                    </div>
                  </div>
                  <div className="meter-rail mt-4">
                    <div className="meter-fill" style={{ width: `${activePetProgress}%` }} />
                  </div>
                </div>

                <div className="mt-6 grid gap-3">
                  <button
                    type="button"
                    className="story-button"
                    onClick={() => {
                      if (state.focus.running) {
                        setRoute("focus");
                        return;
                      }

                      if (claimableEnergy > 0) {
                        setRoute("bank");
                        return;
                      }

                      startFocus();
                    }}
                  >
                    {homePrimaryLabel}
                  </button>
                  <button
                    type="button"
                    className="story-button-secondary"
                    onClick={() => {
                      if (state.focus.running) {
                        setRoute("companion");
                        return;
                      }

                      if (claimableEnergy > 0) {
                        startFocus();
                        return;
                      }

                      setRoute("companion");
                    }}
                  >
                    {homeSecondaryLabel}
                  </button>
                </div>

              </section>

              <section className="section-slab">
                <SectionTitle eyebrow="主循环" title="今天把这条旅程点亮" caption="这不是模块总览，而是一条顺着走就能看懂的路径。" />
                <div className="space-y-1">
                  {journeySteps.map((step) => (
                    <JourneyStep key={step.index} index={step.index} title={step.title} copy={step.copy} status={step.status} />
                  ))}
                </div>
              </section>

              <section className="section-slab">
                <SectionTitle eyebrow="次级章节" title="更多玩法" caption="这些模块会继续保留，但不应该抢走首页对主循环的注意力。" />
                <div className="flex flex-wrap gap-2.5">
                  {extendedDemoRoutes.map((route) => (
                    <button key={route} type="button" className="route-pill" onClick={() => setRoute(route)}>
                      {routeLabels[route]}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {state.route === "focus" && (
            <>
              <section className="section-slab hero-slab">
                <div className="flex items-start justify-between gap-3">
                  <span className="story-chip">{focusStatusLabel}</span>
                  <span className="story-chip">{selectedPreset.title} · {state.focus.mode === "pomodoro" ? "倒计时" : "正计时"}</span>
                </div>

                <div className="mt-5 flex flex-col items-center text-center">
                  <div className="pet-vignette">
                    <PixelPet pet={activePet} size="lg" tone="focus" />
                  </div>
                  <p className="mt-5 text-[5rem] font-black leading-none tracking-[-0.07em] text-ink">{formatTimer(timerSeconds)}</p>
                  <p className="mt-3 max-w-[16rem] text-sm leading-6 text-mist">
                    {!state.focus.running
                      ? `目标 ${selectedPreset.minutes} 分钟，完成后可获得 ${focusCrystalReward} 晶石和 ${focusExpReward} 点经验。`
                      : state.focus.mode === "countup"
                        ? canClaimFocusReward
                          ? "已经达到目标时长，可以结束本轮并领取奖励。"
                          : `已专注 ${formatTimer(focusElapsedSeconds)}，达到 ${selectedPreset.minutes}:00 后才能领奖。`
                        : "倒计时归零后会自动结算本轮奖励。"}
                  </p>
                </div>

                <div className="meter-rail mt-5">
                  <div className="meter-fill" style={{ width: `${state.focus.running ? focusProgress : 0}%` }} />
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="note-strip">
                    <p className="story-kicker !text-[10px]">本轮奖励</p>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-3xl font-black tracking-[-0.04em] text-ink">+{focusCrystalReward}</p>
                        <p className="mt-1 text-sm text-mist">晶石</p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-black tracking-[-0.04em] text-ink">+{focusExpReward}</p>
                        <p className="mt-1 text-sm text-mist">经验</p>
                      </div>
                    </div>
                  </div>
                  {companionFocusPlan ? (
                    <div className="note-strip">
                      <p className="story-kicker !text-[10px]">来自陪伴页</p>
                      <p className="mt-3 text-sm font-semibold leading-6 text-ink">{companionFocusPlan.goalSummary}</p>
                      <div className="mt-3 space-y-2 text-sm leading-6 text-mist">
                        <p>这轮建议：{companionFocusPlan.recommendedDuration}</p>
                        <p>完成后下一步：{companionFocusPlan.steps[1] ?? "去奖励页领取能量"}</p>
                      </div>
                    </div>
                  ) : null}
                  <div className="note-strip" aria-live="polite">
                    <p className="story-kicker !text-[10px]">结算规则</p>
                    <p className="mt-3 text-sm leading-6 text-mist">{focusRuleCopy}</p>
                  </div>
                </div>
              </section>

              <AiModule
                eyebrow="陪伴建议"
                title="陪伴建议"
                description={
                  !state.focus.running
                    ? "你现在更适合先做一轮 15 到 25 分钟的推进，把今天的节奏拉起来。"
                    : state.focus.mode === "pomodoro"
                      ? "这轮更适合专注完成，不建议中途切去处理奖励。"
                      : "达到目标时长后再领奖，会更像一次完整推进。"
                }
                primaryLabel="按这个节奏开始"
                onPrimary={() => {
                  if (!state.focus.running) {
                    startFocus();
                  }
                }}
                primaryDisabled={state.focus.running}
                secondaryLabel="先整理任务"
                onSecondary={() => setRoute("companion")}
              />

              <section className="section-slab">
                <SectionTitle
                  eyebrow="节奏选择"
                  title="挑一段你想推进的时间"
                  caption={state.focus.running ? "当前进行中，先把这一轮走完再切换。" : "预设是旅程标签，不只是普通时间块。"}
                  trailing={
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-pressed={state.focus.mode === "pomodoro"}
                        className={`route-pill ${state.focus.mode === "pomodoro" ? "route-pill-active" : ""}`}
                        disabled={state.focus.running}
                        onClick={() => setFocusMode("pomodoro")}
                      >
                        倒计时
                      </button>
                      <button
                        type="button"
                        aria-pressed={state.focus.mode === "countup"}
                        className={`route-pill ${state.focus.mode === "countup" ? "route-pill-active" : ""}`}
                        disabled={state.focus.running}
                        onClick={() => setFocusMode("countup")}
                      >
                        正计时
                      </button>
                    </div>
                  }
                />
                <div className="grid grid-cols-2 gap-3">
                  {state.presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={selectedPreset.id === preset.id}
                      className={`rounded-[28px] border px-4 py-4 text-left transition ${selectedPreset.id === preset.id ? "border-black/[0.12] bg-white/86 shadow-soft" : "border-black/[0.05] bg-white/65"}`}
                      disabled={state.focus.running}
                      onClick={() => setPreset(preset.id)}
                    >
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.18em] text-ink ${presetToneMap[preset.tone]}`}>
                        {preset.minutes} 分钟
                      </span>
                      <p className="mt-4 text-lg font-black tracking-tight text-ink">{preset.title}</p>
                      <p className="mt-2 text-sm leading-6 text-mist">把这一段时间留给最值得推进的那一步。</p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="section-slab">
                <SectionTitle eyebrow="行动区" title="现在就把这轮走完" caption="主动作继续保持明确，测试入口缩成次级控制，不再抢视觉重量。" />
                {!state.focus.running ? (
                  <div className="grid gap-3">
                    <button type="button" className="story-button" onClick={startFocus}>
                      开始计时
                    </button>
                    <button type="button" className="story-button-secondary" onClick={() => setRoute("companion")}>
                      先去陪伴页整理任务
                    </button>
                    <div className="flex items-center justify-between gap-4 rounded-[24px] border border-dashed border-black/[0.08] bg-black/[0.025] px-4 py-3 text-sm text-mist">
                      <p className="leading-6">{demoSkipHint}</p>
                      <button type="button" className="story-micro-button" onClick={skipFocusForDemo}>
                        演示跳过
                      </button>
                    </div>
                  </div>
                ) : state.focus.mode === "countup" ? (
                  <div className="grid gap-3">
                    <button
                      type="button"
                      className={canClaimFocusReward ? "story-button" : "story-button-soft"}
                      disabled={!canClaimFocusReward}
                      onClick={finishFocus}
                    >
                      {canClaimFocusReward ? "结束并领取奖励" : `还需 ${focusRemainingMinutes} 分钟后领奖`}
                    </button>
                    <div className="grid grid-cols-[1fr_auto] gap-3">
                      <button type="button" className="story-button-secondary" onClick={stopFocus}>
                        放弃本轮
                      </button>
                      <button type="button" className="story-micro-button" onClick={skipFocusForDemo}>
                        演示跳过
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <div className="note-strip text-sm leading-6 text-mist">
                      倒计时模式会在归零后自动结算奖励。现在如果离开，这轮会记为放弃，不会发放晶石和经验。
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-3">
                      <button type="button" className="story-button-secondary" onClick={stopFocus}>
                        放弃本轮
                      </button>
                      <button type="button" className="story-micro-button" onClick={skipFocusForDemo}>
                        演示跳过
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {latestFocusRecapCard ? (
                <AiModule
                  eyebrow="AI 复盘卡"
                  title={latestFocusRecapCard.title}
                  description={latestFocusRecapCard.description}
                  primaryLabel={latestFocusRecapCard.ctaLabel}
                  onPrimary={() => goToRouteOrStart(latestFocusRecapCard.ctaRoute)}
                  secondaryLabel={latestFocusRecapCard.secondaryLabel}
                  onSecondary={() => goToRouteOrStart(latestFocusRecapCard.secondaryRoute)}
                />
              ) : null}
            </>
          )}

          {state.route === "companion" && (
            <>
              <section className="section-slab hero-slab">
                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    <div className="pet-vignette">
                      <PixelPet pet={activePet} size="md" tone="home" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <SectionTitle eyebrow="陪伴整理台" title="把一句模糊目标，拆成可走的下一步" caption="这里不是泛聊天，而是把目标整理成任务、顺序和建议时长。" />
                  </div>
                </div>
                <div className="companion-group mt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="companion-group-title">可以直接这样说</p>
                      <p className="mt-1 text-xs leading-5 text-mist">点一句带进输入区，也可以改成更像你自己的说法。</p>
                    </div>
                    {selectedPrompt ? <span className="story-chip !px-2.5 !py-1 !text-[10px] !tracking-[0.08em]">已带入</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {companionPrompts.map((prompt) => (
                      <PromptChip
                        key={prompt.label}
                        label={prompt.label}
                        selected={selectedPrompt?.label === prompt.label}
                        disabled={companionLoading}
                        onClick={() => setDraft(prompt.value)}
                      />
                    ))}
                  </div>
                </div>
                {aiErrorMode ? (
                  <div className="note-strip mt-4">
                    <p className="text-sm font-semibold text-ink">当前已切回演示整理模式。</p>
                    <p className="mt-2 text-sm leading-6 text-mist">
                      {aiFallbackReason ?? "真实模型暂时没接通，但你仍然可以继续测试这条专注、奖励和探索的闭环。"}
                    </p>
                  </div>
                ) : null}
              </section>

              <section className="section-slab">
                <SectionTitle eyebrow="行动轨迹" title="陪伴已经替你推进了哪些动作" caption="这里只展示看得见的行动证据，不展示内部推理。" />
                {state.agent.pendingAction ? (
                  <div className="note-strip mb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink">当前这一步正在等你确认</p>
                        <p className="mt-2 text-sm leading-6 text-mist">{state.agent.pendingAction.toolCall.reason}</p>
                      </div>
                      <span className={`story-chip ${agentTraceStatusClass("pending")}`}>{agentTraceStatusLabel("pending")}</span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className="story-button w-auto px-4 py-3" disabled={companionLoading} onClick={confirmPendingAgentAction}>
                        按这个继续
                      </button>
                      <button type="button" className="story-button-secondary w-auto px-4 py-3" disabled={companionLoading} onClick={skipPendingAgentAction}>
                        先不执行
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="space-y-3">
                  {recentAgentTrace.length > 0 ? (
                    recentAgentTrace.map((trace) => (
                      <div key={trace.id} className="note-strip">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-6 text-ink">{trace.message}</p>
                            <p className="mt-1 text-xs text-mist">{relativeTime(trace.createdAt)}</p>
                          </div>
                          <span className={`story-chip ${agentTraceStatusClass(trace.status)}`}>{agentTraceStatusLabel(trace.status)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="note-strip">
                      <p className="text-sm font-semibold text-ink">还没有新的行动轨迹。</p>
                      <p className="mt-2 text-sm leading-6 text-mist">说一句你现在最想推进的事，我会先给出建议，再在这里留下推进证据。</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="section-slab">
                <SectionTitle
                  eyebrow="最近对话"
                  title="把关键互动整理成纸条"
                  caption="这里不是普通聊天记录，而是陪伴如何持续把你推向下一步。往上滚也能看到更早的对话。"
                  trailing={(
                    <button
                      type="button"
                      className="story-button-secondary w-auto px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={(recentMessages.length === 0 && recentAgentTrace.length === 0 && !state.agent.pendingAction) || companionLoading}
                      onClick={clearMessages}
                    >
                      清除记录
                    </button>
                  )}
                />
                <div className="max-h-[34rem] space-y-4 overflow-y-auto pr-1">
                  {recentMessages.length > 0 ? (
                    recentMessages.map((message) => (
                      <article key={message.id} className={`flex flex-col gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}>
                        <div className="flex items-center gap-2 text-[11px] font-medium text-mist">
                          <span>{message.role === "user" ? "你" : (message.petName ?? activePet.name)} · {relativeTime(message.createdAt)}</span>
                          {message.role === "pet" && aiSourceLabel(message.aiSource) ? (
                            <span className="story-chip !px-2.5 !py-1 !text-[10px] !tracking-[0.08em]">{aiSourceLabel(message.aiSource)}</span>
                          ) : null}
                        </div>
                        <div className={`message-card ${messageTone(message.type, message.role)}`}>
                          {message.type === "structuredPlan" && message.structuredPlan ? (
                            <StructuredPlanMessage
                              content={message.content}
                              plan={message.structuredPlan}
                              executionStepIndex={companionExecutionSteps[message.id]}
                              onPrimary={() => {
                                if (message.structuredPlan?.nextRoute === "companion") {
                                  startCompanionExecution(message.id);
                                  return;
                                }
                                goToRouteOrStart(message.structuredPlan?.nextRoute, message.structuredPlan?.nextAction);
                              }}
                              onAdvanceExecution={() => {
                                if (message.structuredPlan) {
                                  advanceCompanionExecution(message.id, message.structuredPlan.steps.length);
                                }
                              }}
                              onAddToTasks={() => {
                                if (message.structuredPlan) {
                                  addPlanStepsToTasks(message.structuredPlan, message.aiSource);
                                }
                              }}
                              onSecondary={generateJourneyPlan}
                            />
                          ) : (
                            <p className="text-sm leading-6 text-ink">{message.content}</p>
                          )}
                        </div>
                      </article>
                    ))
                  ) : null}
                  {companionLoading && companionThinking ? (
                    <article className="flex flex-col gap-2 items-start">
                      <div className="flex items-center gap-2 text-[11px] font-medium text-mist">
                        <span>{activePet.name} · 刚刚</span>
                        <span className="story-chip !px-2.5 !py-1 !text-[10px] !tracking-[0.08em]">整理中</span>
                      </div>
                      <div className="message-card bg-white/82 border-white/75">
                        <p className="text-sm leading-6 text-ink">{thinkingCopy.title}</p>
                        <div className="mt-4 space-y-2">
                          {thinkingCopy.steps.map((step, index) => (
                            <div key={`${step}-${index}`} className="ai-step-row">
                              <span className="ai-step-index">{index + 1}</span>
                              <p className="text-sm leading-6 text-ink">{step}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  ) : null}
                  {recentMessages.length === 0 && !companionLoading ? (
                    <div className="note-strip">
                      <p className="text-sm font-semibold text-ink">最近对话已经清空了。</p>
                      <p className="mt-2 text-sm leading-6 text-mist">说一句你现在想推进的事，陪伴会从新的节奏重新接住你。</p>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="section-slab">
                <SectionTitle eyebrow="输入区" title="说出你现在最想推进的事" caption="先直接说一句。陪伴会先理解你的意思，再决定要不要拆步骤、排顺序，或把下一步讲清楚。" />
                <textarea
                  id="companion-draft"
                  aria-label="输入今天想推进的目标"
                  className="min-h-32 w-full rounded-[28px] border border-black/[0.06] bg-white/82 px-4 py-4 text-sm leading-6 text-ink placeholder:text-mist"
                  disabled={companionLoading}
                  value={state.draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !companionLoading) {
                      event.preventDefault();
                      sendDraftMessage();
                    }
                  }}
                  placeholder="例如：先完成一轮专注，再去奖励页领取步数能量"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-mist">回车发送，Shift + Enter 换行</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="story-button-secondary w-auto px-4 py-3"
                      disabled={!hasDraft || companionLoading}
                      onClick={() => runAiAction("idea")}
                    >
                      存成灵感
                    </button>
                    <button type="button" className="story-button w-auto px-5 py-3" disabled={!hasDraft || companionLoading} onClick={sendDraftMessage}>
                      {companionLoading ? "整理中..." : "发送"}
                    </button>
                  </div>
                </div>
              </section>

              <section className="grid gap-3">
                <div className="section-slab">
                  <SectionTitle
                    eyebrow="待办"
                    title="今天还剩哪些动作"
                    caption={openTasks.length > 0 ? `未完成 ${openTasks.length} 项` : "当前待办都已经完成了"}
                    trailing={completedTasks.length > 0 ? (
                      <button
                        type="button"
                        className="rounded-full border border-black/[0.08] bg-white/72 px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-mist transition hover:border-black/[0.14] hover:text-ink"
                        onClick={clearCompletedTasks}
                      >
                        清空已完成
                      </button>
                    ) : null}
                  />
                  <TaskList tasks={openTasks.length > 0 ? openTasks : completedTasks.slice(0, 4)} onToggle={toggleTask} onRemove={removeTask} />
                </div>
                <div className="section-slab">
                  <SectionTitle
                    eyebrow="灵感"
                    title="先把值得留下的想法放在这里"
                    caption={state.notes.length > 0 ? `${state.notes.length} 条，先记下来，不急着现在执行` : "先记下来，等准备好了再把它转成待办"}
                    trailing={state.notes.length > 2 ? (
                      <button
                        type="button"
                        className="rounded-full border border-black/[0.08] bg-white/72 px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-mist transition hover:border-black/[0.14] hover:text-ink"
                        onClick={() => setShowAllNotes((current) => !current)}
                      >
                        {showAllNotes ? "收起灵感" : "查看更多"}
                      </button>
                    ) : null}
                  />
                  <div className="space-y-3">
                    {visibleNotes.map((note) => (
                      <div key={note.id} className="note-strip">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-ink">{note.title}</p>
                            <p className="mt-2 text-sm leading-6 text-mist">{note.body}</p>
                          </div>
                          <span className="story-chip !px-2.5 !py-1 !text-[10px] !tracking-[0.08em]">暂存</span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="story-button-secondary w-auto px-4 py-2.5"
                            onClick={() => convertNoteToTasks(note.id)}
                          >
                            拆成待办
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-black/[0.08] bg-white/72 px-3.5 py-2 text-[11px] font-semibold tracking-[0.08em] text-mist transition hover:border-black/[0.14] hover:text-ink"
                            onClick={() => removeNote(note.id)}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                    {state.notes.length === 0 ? (
                      <div className="note-strip">
                        <p className="text-sm font-semibold text-ink">这里还没有新的灵感。</p>
                        <p className="mt-2 text-sm leading-6 text-mist">当一句话暂时不想立刻执行时，可以先把它存成灵感，等准备好了再拆成待办。</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            </>
          )}

          {state.route === "pets" && (
            <>
              <section className="section-slab hero-slab">
                <SectionTitle eyebrow="当前陪伴" title={`${activePet.name} 是这段旅程的情绪锚点`} caption="把宠物做成真正参与闭环的角色，而不是放在角落里的装饰。" trailing={<span className="story-chip">{activePet.rarity}</span>} />
                <div className="flex items-center gap-4">
                  <div className="shrink-0">
                    <div className="pet-vignette">
                      <PixelPet pet={activePet} size="lg" tone="home" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[2rem] font-black leading-none tracking-[-0.05em] text-ink">Lv.{activePet.level}</p>
                    <p className="mt-2 text-sm text-mist">{activePet.activeSkin}</p>
                    <div className="mt-4 grid gap-2">
                      <div className="note-strip !p-3">
                        <div className="flex items-center justify-between text-sm text-mist">
                          <span>心情</span>
                          <span>{activePet.mood} / 100</span>
                        </div>
                        <div className="meter-rail mt-2">
                          <div className="meter-fill" style={{ width: `${activePet.mood}%` }} />
                        </div>
                      </div>
                      <div className="note-strip !p-3">
                        <div className="flex items-center justify-between text-sm text-mist">
                          <span>亲密度</span>
                          <span>{activePet.affection} / 100</span>
                        </div>
                        <div className="meter-rail mt-2">
                          <div className="meter-fill" style={{ width: `${activePet.affection}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-5 grid gap-3">
                  <button type="button" className="story-button" disabled={state.wallet.crystal < 18} onClick={feedPet}>
                    {state.wallet.crystal < 18 ? "晶石不足，暂时不能喂食" : "花 18 晶石喂食"}
                  </button>
                  <button type="button" className="story-button-secondary" onClick={() => setRoute("shop")}>
                    去补给铺看看
                  </button>
                </div>
              </section>

              <AiModule
                eyebrow="AI 陪伴角色卡"
                title="它现在更适合扮演什么角色"
                description={petRoleCopy[activePet.id] ?? "它更适合做这段旅程里的温柔提醒者。"}
                primaryLabel="设为当前陪伴"
                onPrimary={() => selectPet(activePet.id)}
                primaryDisabled
                secondaryLabel="让它给我一句建议"
                onSecondary={askPetForAdvice}
              />

              <section className="section-slab">
                <SectionTitle eyebrow="图鉴" title="已解锁的陪伴阵列" caption="切换陪伴时，也是在切换整个界面的情绪和叙事角色。" />
                <div className="grid grid-cols-2 gap-3">
                  {state.pets.map((pet) => (
                    <article key={pet.id} className={`stamp-card ${pet.id === state.selectedPetId ? "stamp-card-active" : "stamp-card-muted"}`}>
                      <div className="mx-auto w-fit">
                        <PixelPet pet={pet} size="sm" />
                      </div>
                      <p className="mt-4 text-lg font-black tracking-tight text-ink">{pet.name}</p>
                      <p className="mt-1 text-sm text-mist">Lv.{pet.level} · {pet.rarity}</p>
                      <button
                        type="button"
                        className={`mt-4 ${pet.id === state.selectedPetId ? "story-button-soft" : "story-button-secondary"}`}
                        onClick={() => selectPet(pet.id)}
                      >
                        {pet.id === state.selectedPetId ? "当前陪伴" : "切换陪伴"}
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}

          {state.route === "explore" && (
            <>
              <section className="section-slab hero-slab">
                <SectionTitle eyebrow="地图卷轴" title="把已经赚到的能量继续带去冒险" caption="背景保持统一，真正拉开章节差异的是路径、节点和反馈方式。" trailing={<span className="story-chip">可探索 {unlockedMapCount} / {state.mapNodes.length}</span>} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="note-strip">
                    <p className="story-kicker !text-[10px]">累计专注</p>
                    <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-ink">{completedMinutes}</p>
                    <p className="mt-1 text-sm text-mist">分钟</p>
                  </div>
                  <div className="note-strip">
                    <p className="story-kicker !text-[10px]">当前能量</p>
                    <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-ink">{state.wallet.energy}</p>
                    <p className="mt-1 text-sm text-mist">每次探索消耗 5 点</p>
                  </div>
                </div>
              </section>

              <AiModule
                eyebrow="AI 路线建议"
                title="这一步最适合去哪里"
                description={
                  recommendedExploreNode.id === "meadow"
                    ? "如果你想先走一条最顺的路线，优先去晨露草坪，路径最短、反馈最直接。"
                    : "你已经有足够的专注积累，可以继续往更深一层的地图推进。"
                }
                primaryLabel="按建议探索"
                onPrimary={() => exploreNode(recommendedExploreNode.id)}
                primaryDisabled={state.wallet.energy < 5 || completedMinutes < recommendedExploreNode.unlockMinutes}
                secondaryLabel="先回奖励页"
                onSecondary={() => setRoute("bank")}
              />

              <section className="section-slab">
                <SectionTitle eyebrow="路径节点" title="沿着一条线把地图点亮" caption="节点不再只是列表项目，而是旅程本身的进度证据。" />
                <div className="space-y-5">
                  {state.mapNodes.map((node, index) => {
                    const unlockedByTime = completedMinutes >= node.unlockMinutes;
                    const hasEnergy = state.wallet.energy >= 5;
                    const canExplore = unlockedByTime && hasEnergy;

                    return (
                      <article key={node.id} className="relative flex gap-4">
                        <div className="relative flex w-10 shrink-0 justify-center">
                          {index < state.mapNodes.length - 1 ? <span className="absolute bottom-[-1.5rem] top-10 w-px bg-black/10" /> : null}
                          <span className={`trail-marker ${unlockedByTime ? "trail-marker-active" : "trail-marker-idle"}`}>{index + 1}</span>
                        </div>
                        <div className={`min-w-0 flex-1 rounded-[28px] border px-4 py-4 ${unlockedByTime ? "border-black/[0.08] bg-white/82" : "border-black/[0.05] bg-black/[0.025]"}`}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-lg font-black tracking-tight text-ink">{node.title}</p>
                              <p className="mt-2 text-sm leading-6 text-mist">解锁条件 {node.unlockMinutes} 分钟 · 已探索 {node.explored} 次 · 每次消耗 5 能量</p>
                              <p className="mt-2 text-xs font-semibold tracking-[0.08em] text-ink/70">
                                {index === 0 ? "适合先从这里开始" : index === 1 ? "更适合继续往前推进" : "需要更长专注积累"}
                              </p>
                            </div>
                            <button
                              type="button"
                              className={`w-auto min-w-[6.25rem] px-4 py-2.5 ${canExplore ? "story-button-secondary" : "story-button-soft"}`}
                              disabled={!canExplore}
                              onClick={() => exploreNode(node.id)}
                            >
                              {!unlockedByTime ? "未解锁" : hasEnergy ? "探索" : "能量不足"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {state.route === "bank" && (
            <>
              <section className="section-slab hero-slab">
                <SectionTitle eyebrow="能量池" title="把步数奖励收进来，再决定怎么花" caption="同一套背景里，奖励页靠票据和能量池来建立章节气质，而不是换一整套色盘。" />
                <div className="grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[30px] border border-black/[0.06] bg-white/84 px-5 py-5 shadow-[0_16px_30px_rgba(28,23,18,0.06)]">
                    <p className="story-kicker">当前能量</p>
                    <p className="mt-3 text-[4rem] font-black leading-none tracking-[-0.07em] text-ink">{state.wallet.energy}</p>
                    <p className="mt-3 text-sm leading-6 text-mist">能量来自步数领奖。你可以把它花在探索和对战上，也可以每 10 点兑换成 1 枚晶石。</p>
                  </div>
                  <div className="grid gap-3">
                    <div className="note-strip">
                      <p className="story-kicker !text-[10px]">待领取</p>
                      <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-ink">{claimableEnergy}</p>
                      <p className="mt-2 text-sm text-mist">先把小票收下，再统一决定继续冒险还是兑换。</p>
                    </div>
                    <div className="note-strip">
                      <p className="story-kicker !text-[10px]">可兑换晶石</p>
                      <p className="mt-2 text-3xl font-black tracking-[-0.04em] text-ink">{energyReadyForExchange}</p>
                      <p className="mt-2 text-sm text-mist">当前能量每满 10 点就能兑换一枚。</p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="story-button mt-5"
                  disabled={state.wallet.energy < 10}
                  onClick={exchangeEnergy}
                >
                  {state.wallet.energy < 10 ? "能量不足 10，暂时不能兑换" : "按建议兑换成晶石"}
                </button>
              </section>

              {latestResourceAdviceCard ? (
                <AiModule
                  eyebrow="AI 资源建议"
                  title={latestResourceAdviceCard.title}
                  description={latestResourceAdviceCard.description}
                  primaryLabel={latestResourceAdviceCard.ctaLabel}
                  onPrimary={() => {
                    const nextStep = state.steps.find((item) => !item.redeemed);
                    if (latestResourceAdviceCard.ctaRoute === "bank" && nextStep) {
                      redeemStep(nextStep.id);
                      return;
                    }
                    goToRouteOrStart(latestResourceAdviceCard.ctaRoute);
                  }}
                  primaryDisabled={latestResourceAdviceCard.ctaRoute === "bank" && !state.steps.some((item) => !item.redeemed)}
                  secondaryLabel={latestResourceAdviceCard.secondaryLabel}
                  onSecondary={handleResourceSecondaryAction}
                />
              ) : null}

              <section className="section-slab">
                <SectionTitle eyebrow="奖励票据" title="把今天赚到的步数奖励一张张收进来" caption="领取动作需要有收集感，而不是像表单一样被处理掉。" />
                <div className="space-y-3">
                  {state.steps.map((item) => (
                    <BankRow key={item.id} item={item} onRedeem={redeemStep} />
                  ))}
                </div>
              </section>
            </>
          )}

          {state.route === "achievements" && (
            <section className="section-slab hero-slab">
              <SectionTitle eyebrow="成绩册" title="把这段旅程里最值得留下的痕迹盖成印章" caption="这一页不只是结果汇总，也是一路走来的状态记录。" trailing={<span className="story-chip">已解锁 {state.achievements.filter((item) => item.unlocked).length}</span>} />
              <AiModule
                eyebrow="AI 旅程总结卡"
                title="这段旅程里，最值得留下的是"
                description={achievementSummary}
                primaryLabel="回到首页继续走"
                onPrimary={() => setRoute("home")}
                secondaryLabel="再补一段探索"
                onSecondary={() => setRoute("explore")}
              />
              <div className="mt-4 grid grid-cols-2 gap-3">
                {state.achievements.map((achievement, index) => (
                  <AchievementSeal
                    key={achievement.id}
                    title={achievement.title}
                    description={achievement.description}
                    unlocked={achievement.unlocked}
                    index={index}
                    evidence={achievementEvidenceCopy[achievement.id] ?? "这是这段旅程里留下的一段证据"}
                  />
                ))}
              </div>
            </section>
          )}

          {state.route === "battle" && (
            <>
              <section className="section-slab hero-slab">
                <SectionTitle eyebrow="试炼场" title="打一场轻量遭遇，展示资源门槛和状态变化" caption="这页更像旅程插曲，而不是独立 mini game，所以视觉会继续服从整套手账壳子。" trailing={<span className="story-chip">消耗 10 能量</span>} />
                {latestContextHintCard ? (
                  <div className="mb-4">
                    <AiModule
                      eyebrow="AI 导演提示"
                      title={latestContextHintCard.title}
                      description="这页的重点不是赢，而是感受资源消耗、状态变化和即时反馈。建议打一轮攻击，再看是否继续。"
                      primaryLabel="开始一场试炼"
                      onPrimary={startBattle}
                      primaryDisabled={state.wallet.energy < 10}
                      secondaryLabel="先看资源建议"
                      onSecondary={() => setRoute("bank")}
                    />
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <div className="note-strip !p-4">
                    <div className="grid h-24 place-items-center">
                      <div className="mx-auto w-fit">
                        <PixelPet pet={activePet} size="sm" tone="home" />
                      </div>
                    </div>
                    <p className="mt-3 text-center text-lg font-black tracking-tight text-ink">{activePet.name}</p>
                    <p className="mt-1 text-center text-sm text-mist">HP {state.battle.playerHp}/{state.battle.playerMaxHp}</p>
                    <div className="meter-rail mt-3">
                      <div className="meter-fill" style={{ width: `${(state.battle.playerHp / state.battle.playerMaxHp) * 100}%` }} />
                    </div>
                  </div>
                  <div className="note-strip !p-4">
                    <div className="grid h-24 place-items-center rounded-[24px] border border-black/[0.06] bg-ink text-3xl font-black text-white shadow-[0_12px_26px_rgba(20,20,20,0.16)]">
                      敌
                    </div>
                    <p className="mt-3 text-center text-lg font-black tracking-tight text-ink">{state.battle.enemyName}</p>
                    <p className="mt-1 text-center text-sm text-mist">HP {state.battle.enemyHp}/{state.battle.enemyMaxHp}</p>
                    <div className="meter-rail mt-3">
                      <div className="meter-fill" style={{ width: `${(state.battle.enemyHp / state.battle.enemyMaxHp) * 100}%` }} />
                    </div>
                  </div>
                </div>

                <div className="note-strip mt-5 text-sm leading-6 text-mist">
                  <p className="mb-2 text-xs font-semibold tracking-[0.08em] text-ink/70">当前陪伴会参与开场说明和战斗反馈。</p>
                  {battleNarration.map((log, index) => (
                    <p key={`${log}-${index}`}>{log}</p>
                  ))}
                </div>
              </section>

              <section className="section-slab">
                <SectionTitle eyebrow="操作" title="让动作和反馈简短但清楚" caption="这页的重点不是复杂战斗，而是感受状态改变、资源扣减和胜利奖励。" />
                <div className="grid gap-3">
                  <button
                    type="button"
                    className="story-button"
                    disabled={state.wallet.energy < 10}
                    onClick={startBattle}
                  >
                    {state.wallet.energy < 10 ? "能量不足，暂时不能开始" : state.battle.active ? "重新开始试炼" : "开始一场试炼"}
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" className="story-button-secondary" disabled={!state.battle.active} onClick={() => battleAction("attack")}>发起攻击</button>
                    <button type="button" className="story-button-secondary" disabled={!state.battle.active} onClick={() => battleAction("heal")}>回复状态</button>
                    <button type="button" className="story-button-secondary" disabled={!state.battle.active} onClick={() => battleAction("guard")}>稳住节奏</button>
                    <button type="button" className="story-button-soft" disabled={!state.battle.active} onClick={() => battleAction("escape")}>结束这场试炼</button>
                  </div>
                </div>
              </section>
            </>
          )}

          {state.route === "shop" && (
            <section className="section-slab hero-slab">
              <SectionTitle eyebrow="补给铺" title="给这段旅程带一点补给和装饰" caption="商店会更像手账里的补给页：东西不多，但每件都能直接对应到一次即时反馈。" trailing={<span className="story-chip">可用晶石 {state.wallet.crystal}</span>} />
              <AiModule
                eyebrow="AI 补给建议"
                title={shopRecommendation.title}
                description={shopRecommendation.description}
                primaryLabel="按建议购买"
                onPrimary={() => buyItem(shopRecommendation.itemId)}
                primaryDisabled={state.wallet.crystal < shopItems.find((item) => item.id === shopRecommendation.itemId)!.price}
                secondaryLabel="先不买，继续主线"
                onSecondary={() => setRoute("home")}
              />
              <div className="space-y-3">
                {shopItems.map((item) => (
                  <article key={item.id} className="ticket-card mt-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-black tracking-tight text-ink">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-mist">{item.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-black leading-none tracking-[-0.05em] text-ink">{item.price}</p>
                        <p className="mt-1 text-xs font-semibold tracking-[0.18em] text-mist">晶石</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="story-button mt-4"
                      disabled={state.wallet.crystal < item.price}
                      onClick={() => buyItem(item.id)}
                    >
                      {state.wallet.crystal < item.price ? `还差 ${item.price - state.wallet.crystal} 晶石` : "购买"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[430px] px-4 pb-4">
          <div className="nav-dock">
            {mainRoutes.map((route) => (
              <button
                key={route}
                type="button"
                aria-current={activeNavRoute === route ? "page" : undefined}
                className={`nav-tab ${activeNavRoute === route ? "nav-tab-active" : ""}`}
                onClick={() => setRoute(route)}
              >
                {routeLabels[route]}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
