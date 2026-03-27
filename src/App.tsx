import { useMemo } from "react";
import type { ReactNode } from "react";
import { PixelPet } from "./components/PixelPet";
import { mainRoutes, routeLabels } from "./data/seed";
import { useDemoState } from "./hooks/useDemoState";
import type { CompanionMessage, FocusPreset, RouteKey, StepLedger, TaskItem } from "./types";

const presetToneMap: Record<FocusPreset["tone"], string> = {
  sky: "bg-sky/55",
  peach: "bg-peach/60",
  sage: "bg-sage/55",
  amber: "bg-amber/65",
};

const routeMeta: Record<RouteKey, { eyebrow: string; caption: string }> = {
  home: { eyebrow: "旅程封面", caption: "先把今天的主线讲清楚，再带评审继续往前走。" },
  focus: { eyebrow: "核心章节", caption: "让一轮专注真正带来奖励、成长和下一步动作。" },
  companion: { eyebrow: "陪伴整理", caption: "把一句目标拆成顺手的动作，让宠物承担引导角色。" },
  pets: { eyebrow: "陪伴图鉴", caption: "让角色成长和情绪反馈参与整个演示闭环。" },
  explore: { eyebrow: "旅程地图", caption: "把已经赚到的能量继续带去冒险，而不是停在账面上。" },
  bank: { eyebrow: "奖励中转", caption: "把步数奖励收进能量池，再决定兑换还是继续使用。" },
  achievements: { eyebrow: "展示证据", caption: "把专注、奖励和收集痕迹整理成一页可展示的成绩册。" },
  battle: { eyebrow: "试炼插曲", caption: "用一场轻量试炼展示状态变化、资源门槛和反馈节奏。" },
  shop: { eyebrow: "补给铺", caption: "给旅程加一点补给和装饰，而不是做普通商品列表。" },
};

const shopItems = [
  { id: "snack", title: "像素零食", price: 24, description: "给当前陪伴补一点心情和亲密度，适合顺手展示即时反馈。" },
  { id: "tea", title: "薄荷茶", price: 18, description: "回复 20 点能量，让探索或对战可以继续推进。" },
  { id: "scarf", title: "荧光围巾", price: 66, description: "给当前宠物换一层更有展示感的形象。" },
] as const;

const extendedDemoRoutes: RouteKey[] = ["pets", "shop", "battle", "achievements"];

const companionPrompts = [
  { label: "先排今天主线", value: "先帮我排今天的主线：做一轮专注、领一次能量，再决定要不要继续探索。" },
  { label: "想把奖励讲清楚", value: "我想把专注、步数奖励、兑换晶石和探索之间的关系讲得更顺。" },
  { label: "先安排陪伴互动", value: "先帮我把陪伴互动接进主线里，别让它只是装饰。" },
] as const;

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

function TaskList({ tasks, onToggle }: { tasks: TaskItem[]; onToggle: (taskId: string) => void }) {
  return (
    <div className="space-y-2.5">
      {tasks.map((task) => (
        <label key={task.id} className="flex items-center gap-3 rounded-[22px] border border-black/[0.05] bg-white/72 px-4 py-3 text-sm shadow-[0_10px_24px_rgba(28,23,18,0.05)]">
          <input
            checked={task.status === "done"}
            onChange={() => onToggle(task.id)}
            type="checkbox"
            className="h-4 w-4 rounded border-black/20 bg-white"
          />
          <span className={task.status === "done" ? "min-w-0 flex-1 text-mist line-through" : "min-w-0 flex-1 text-ink"}>{task.title}</span>
        </label>
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

function PromptChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="route-pill text-left" onClick={onClick}>
      {label}
    </button>
  );
}

function AchievementSeal({ title, description, unlocked, index }: { title: string; description: string; unlocked: boolean; index: number }) {
  return (
    <article className={`stamp-card ${unlocked ? "stamp-card-active" : "stamp-card-muted"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="stamp-index">{String(index + 1).padStart(2, "0")}</span>
        <span className="story-chip">{unlocked ? "已点亮" : "待点亮"}</span>
      </div>
      <h3 className="mt-6 text-lg font-black tracking-tight text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-mist">{description}</p>
    </article>
  );
}

export default function App() {
  const {
    state,
    activePet,
    selectedPreset,
    completedMinutes,
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
    runAiAction,
    sendDraftMessage,
    selectPet,
    feedPet,
    redeemStep,
    exchangeEnergy,
    exploreNode,
    startBattle,
    battleAction,
    buyItem,
  } = useDemoState();

  const openTasks = useMemo(() => state.tasks.filter((task) => task.status !== "done"), [state.tasks]);
  const completedSessions = useMemo(() => state.sessions.filter((session) => session.status === "completed"), [state.sessions]);
  const recentMessages = useMemo(() => state.messages.slice(-6), [state.messages]);
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
  const focusTargetSeconds = state.focus.durationMinutes * 60;
  const focusRemainingMinutes = Math.max(0, Math.ceil((focusTargetSeconds - focusElapsedSeconds) / 60));
  const focusProgress = focusTargetSeconds > 0 ? Math.min(100, (focusElapsedSeconds / focusTargetSeconds) * 100) : 0;
  const activeNavRoute = mainRoutes.includes(state.route) ? state.route : "home";
  const energyReadyForExchange = Math.floor(state.wallet.energy / 10);
  const completedFocusCount = completedSessions.length;
  const redeemedStepsCount = state.steps.filter((item) => item.redeemed).length;
  const chapterMeta = routeMeta[state.route];

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
        description: "当面试官看到你先专注、再领奖、再探索时，主线会更清楚，也更可信。",
      };
    }

    return {
      eyebrow: "下一步",
      title: "先让陪伴帮你定今天的任务，再开始第一轮专注",
      description: "如果今天还没决定从哪里开始，就先去陪伴页说一句目标，让它帮你拆成顺手的动作。",
    };
  }, [claimableEnergy, openTasks.length, state.focus.running]);

  const homePrimaryLabel = state.focus.running ? "继续当前专注" : claimableEnergy > 0 ? "领取步数能量" : "开始本轮专注";
  const homeSecondaryLabel = state.focus.running ? "去陪伴页看任务" : claimableEnergy > 0 ? "再开下一轮专注" : "先整理任务";
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
                <SectionTitle eyebrow="主循环" title="今天把这条旅程点亮" caption="这不是模块总览，而是让评审快速看懂价值的一条路径。" />
                <div className="space-y-1">
                  {journeySteps.map((step) => (
                    <JourneyStep key={step.index} index={step.index} title={step.title} copy={step.copy} status={step.status} />
                  ))}
                </div>
              </section>

              <section className="section-slab">
                <SectionTitle eyebrow="次级章节" title="更多玩法" caption="这些模块保留展示，但不应该抢走首页对主循环的注意力。" />
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
                  <div className="note-strip" aria-live="polite">
                    <p className="story-kicker !text-[10px]">结算规则</p>
                    <p className="mt-3 text-sm leading-6 text-mist">{focusRuleCopy}</p>
                  </div>
                </div>
              </section>

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
                    <SectionTitle eyebrow="陪伴工作台" title={`${activePet.name} 会先帮你把目标理顺`} caption="先点一个一句话 prompt，再决定要不要继续自由输入，会比大段打字更适合移动端和演示。" />
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-2.5">
                  {companionPrompts.map((prompt) => (
                    <PromptChip key={prompt.label} label={prompt.label} onClick={() => setDraft(prompt.value)} />
                  ))}
                </div>
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                  <button type="button" className="route-pill disabled:cursor-not-allowed disabled:opacity-50" disabled={!hasDraft} onClick={() => runAiAction("tasks")}>
                    拆出待办
                  </button>
                  <button type="button" className="route-pill disabled:cursor-not-allowed disabled:opacity-50" disabled={!hasDraft} onClick={() => runAiAction("plan")}>
                    安排顺序
                  </button>
                  <button type="button" className="route-pill disabled:cursor-not-allowed disabled:opacity-50" disabled={!hasDraft} onClick={() => runAiAction("idea")}>
                    收进灵感
                  </button>
                </div>
              </section>

              <section className="section-slab">
                <SectionTitle eyebrow="最近对话" title="把关键互动整理成纸条" caption="这里不是普通聊天记录，而是演示陪伴如何持续把用户推向下一步。" />
                <div className="space-y-4">
                  {recentMessages.map((message) => (
                    <article key={message.id} className={`flex flex-col gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}>
                      <span className="text-[11px] font-medium text-mist">{message.role === "user" ? "你" : activePet.name} · {relativeTime(message.createdAt)}</span>
                      <div className={`message-card ${messageTone(message.type, message.role)}`}>
                        <p className="text-sm leading-6 text-ink">{message.content}</p>
                        {message.type === "taskCard" && message.relatedTaskIds ? (
                          <div className="mt-4">
                            <TaskList tasks={state.tasks.filter((task) => message.relatedTaskIds?.includes(task.id))} onToggle={toggleTask} />
                          </div>
                        ) : null}
                        {message.type === "imageCard" ? (
                          <div className="note-strip mt-4">
                            <div className="mx-auto w-fit">
                              <PixelPet pet={activePet} size="sm" tone="home" />
                            </div>
                            <p className="mt-3 text-sm font-semibold leading-6 text-ink">{message.quoteRef}</p>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="section-slab">
                <SectionTitle eyebrow="输入区" title="说出你现在最想推进的事" caption="我会先把它接成今天的主线，再决定下一步该去专注、领奖还是探索。" />
                <textarea
                  id="companion-draft"
                  aria-label="输入今天想推进的目标"
                  className="min-h-32 w-full rounded-[28px] border border-black/[0.06] bg-white/82 px-4 py-4 text-sm leading-6 text-ink placeholder:text-mist"
                  value={state.draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendDraftMessage();
                    }
                  }}
                  placeholder="例如：先完成一轮专注，再去奖励页领取步数能量"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-mist">回车发送，Shift + Enter 换行</p>
                  <button type="button" className="story-button w-auto px-5 py-3" disabled={!hasDraft} onClick={sendDraftMessage}>
                    发送给陪伴
                  </button>
                </div>
              </section>

              <section className="grid gap-3">
                <div className="section-slab">
                  <SectionTitle eyebrow="待办" title="今天还剩哪些动作" caption={`${openTasks.length} 项`} />
                  <TaskList tasks={state.tasks.slice(0, 3)} onToggle={toggleTask} />
                </div>
                <div className="section-slab">
                  <SectionTitle eyebrow="灵感" title="把值得保留的想法贴在边栏" caption={`${state.notes.length} 条`} />
                  <div className="space-y-3">
                    {state.notes.slice(0, 2).map((note) => (
                      <div key={note.id} className="note-strip">
                        <p className="text-sm font-semibold text-ink">{note.title}</p>
                        <p className="mt-2 text-sm leading-6 text-mist">{note.body}</p>
                      </div>
                    ))}
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

              <section className="section-slab">
                <SectionTitle eyebrow="图鉴" title="已解锁的陪伴阵列" caption="切换陪伴时，也是在切换整个界面的情绪和叙事角色。" />
                <div className="grid grid-cols-2 gap-3">
                  {state.pets.map((pet) => (
                    <article key={pet.id} className={`stamp-card ${pet.active ? "stamp-card-active" : "stamp-card-muted"}`}>
                      <div className="mx-auto w-fit">
                        <PixelPet pet={pet} size="sm" />
                      </div>
                      <p className="mt-4 text-lg font-black tracking-tight text-ink">{pet.name}</p>
                      <p className="mt-1 text-sm text-mist">Lv.{pet.level} · {pet.rarity}</p>
                      <button
                        type="button"
                        className={`mt-4 ${pet.active ? "story-button-soft" : "story-button-secondary"}`}
                        onClick={() => selectPet(pet.id)}
                      >
                        {pet.active ? "当前陪伴" : "切换陪伴"}
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
                  {state.wallet.energy < 10 ? "能量不足 10，暂时不能兑换" : "把当前能量兑换成像素晶石"}
                </button>
              </section>

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
              <SectionTitle eyebrow="成绩册" title="把这次演示里最值得被看到的痕迹盖成印章" caption="这一页不只是展示结果，也是面试官确认你做了哪些状态设计的证据墙。" trailing={<span className="story-chip">已解锁 {state.achievements.filter((item) => item.unlocked).length}</span>} />
              <div className="grid grid-cols-2 gap-3">
                {state.achievements.map((achievement, index) => (
                  <AchievementSeal key={achievement.id} title={achievement.title} description={achievement.description} unlocked={achievement.unlocked} index={index} />
                ))}
              </div>
            </section>
          )}

          {state.route === "battle" && (
            <>
              <section className="section-slab hero-slab">
                <SectionTitle eyebrow="试炼场" title="打一场轻量遭遇，展示资源门槛和状态变化" caption="这页更像旅程插曲，而不是独立 mini game，所以视觉会继续服从整套手账壳子。" trailing={<span className="story-chip">消耗 10 能量</span>} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="note-strip !p-4">
                    <div className="mx-auto w-fit">
                      <PixelPet pet={activePet} size="sm" tone="home" />
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
                  {state.battle.logs.map((log, index) => (
                    <p key={`${log}-${index}`}>{log}</p>
                  ))}
                </div>
              </section>

              <section className="section-slab">
                <SectionTitle eyebrow="操作" title="让动作和反馈简短但清楚" caption="这页的重点不是复杂战斗，而是展示状态改变、资源扣减和胜利奖励。" />
                <div className="grid gap-3">
                  <button
                    type="button"
                    className="story-button"
                    disabled={state.wallet.energy < 10}
                    onClick={startBattle}
                  >
                    {state.wallet.energy < 10 ? "能量不足，暂时不能开始" : state.battle.active ? "重新开始对战" : "开始对战"}
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" className="story-button-secondary" disabled={!state.battle.active} onClick={() => battleAction("attack")}>攻击</button>
                    <button type="button" className="story-button-secondary" disabled={!state.battle.active} onClick={() => battleAction("heal")}>治疗</button>
                    <button type="button" className="story-button-secondary" disabled={!state.battle.active} onClick={() => battleAction("guard")}>防御</button>
                    <button type="button" className="story-button-soft" disabled={!state.battle.active} onClick={() => battleAction("escape")}>撤退</button>
                  </div>
                </div>
              </section>
            </>
          )}

          {state.route === "shop" && (
            <section className="section-slab hero-slab">
              <SectionTitle eyebrow="补给铺" title="给这段旅程带一点补给和装饰" caption="商店会更像手账里的补给页：东西不多，但每件都能直接对应到一次演示反馈。" trailing={<span className="story-chip">可用晶石 {state.wallet.crystal}</span>} />
              <div className="space-y-3">
                {shopItems.map((item) => (
                  <article key={item.id} className="ticket-card">
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
