import { useMemo } from "react";
import { PixelPet } from "./components/PixelPet";
import { mainRoutes, routeLabels } from "./data/seed";
import { useDemoState } from "./hooks/useDemoState";
import type { CompanionMessage, FocusPreset, StepLedger, TaskItem } from "./types";

const toneClassMap: Record<FocusPreset["tone"], string> = {
  sky: "bg-sky/60",
  peach: "bg-peach/55",
  sage: "bg-sage/60",
  amber: "bg-amber/65",
};

const shopItems = [
  { id: "snack", title: "像素零食", price: 24, description: "提高心情和亲密度，适合录 demo 时展示宠物反馈。" },
  { id: "tea", title: "薄荷茶", price: 18, description: "补一点体力，让专注和探索节奏更顺。" },
  { id: "scarf", title: "荧光围巾", price: 66, description: "给当前宠物换一层更有展示感的形象。" },
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
  if (role === "user") return "bg-sky/65 text-ink";
  if (type === "reward") return "bg-amber/55 text-ink";
  if (type === "systemEvent") return "bg-sage/55 text-ink";
  return "bg-white/92 text-ink";
}

function SectionTitle({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <h2 className="text-lg font-black tracking-tight">{title}</h2>
      {caption ? <span className="text-xs font-medium text-mist">{caption}</span> : null}
    </div>
  );
}

function TaskList({ tasks, onToggle }: { tasks: TaskItem[]; onToggle: (taskId: string) => void }) {
  return (
    <div className="space-y-2.5">
      {tasks.map((task) => (
        <label key={task.id} className="flex items-center gap-3 rounded-[22px] bg-black/[0.03] px-4 py-3 text-sm">
          <input
            checked={task.status === "done"}
            onChange={() => onToggle(task.id)}
            type="checkbox"
            className="h-4 w-4 rounded border-black/20"
          />
          <span className={task.status === "done" ? "text-mist line-through" : "text-ink"}>{task.title}</span>
        </label>
      ))}
    </div>
  );
}

function BankRow({ item, onRedeem }: { item: StepLedger; onRedeem: (stepId: string) => void }) {
  return (
    <div className="rounded-[26px] bg-black/[0.03] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-mist">{item.dateLabel}</p>
          <p className="mt-2 text-2xl font-black tracking-tight">{item.steps.toLocaleString("zh-CN")} 步</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-mist">可兑能量</p>
          <p className="mt-1 text-2xl font-black tracking-tight">{item.energyEarned}</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          className={`rounded-full px-4 py-2 text-sm font-semibold ${item.redeemed ? "bg-black/5 text-mist" : "bg-ink text-white"}`}
          disabled={item.redeemed}
          onClick={() => onRedeem(item.id)}
        >
          {item.redeemed ? "已领取" : "领取"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const {
    state,
    activePet,
    selectedPreset,
    completedMinutes,
    timerSeconds,
    setRoute,
    setDraft,
    setFocusMode,
    setPreset,
    startFocus,
    stopFocus,
    finishFocus,
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

  return (
    <div className="mx-auto flex min-h-screen w-full items-center justify-center px-4 py-6 sm:px-6">
      <div className="relative w-full max-w-[430px] overflow-hidden rounded-[36px] border border-white/70 bg-white/60 p-4 shadow-float backdrop-blur">
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/90 to-transparent" />

        <header className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-mist">Pixel Companion Focus</p>
            <h1 className="mt-2 text-[2rem] font-black leading-none tracking-tight">{routeLabels[state.route]}</h1>
          </div>
          <div className="rounded-[24px] bg-white/78 px-3 py-2 text-center text-[11px] text-mist shadow-soft backdrop-blur">
            <div className="grid grid-cols-3 gap-3">
              <div><p>晶石</p><strong className="mt-1 block text-sm text-ink">{state.wallet.crystal}</strong></div>
              <div><p>能量</p><strong className="mt-1 block text-sm text-ink">{state.wallet.energy}</strong></div>
              <div><p>体力</p><strong className="mt-1 block text-sm text-ink">{state.wallet.stamina}</strong></div>
            </div>
          </div>
        </header>

        <main className="relative z-10 mt-5 space-y-4 pb-28">
          {state.route === "home" && (
            <>
              <section className="panel overflow-hidden bg-gradient-to-br from-sky/50 via-white to-peach/35 p-5">
                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    <PixelPet pet={activePet} size="lg" tone="home" />
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-xs font-semibold tracking-[0.22em] text-mist">当前陪伴</p>
                    <h2 className="mt-2 text-[2rem] font-black leading-none tracking-tight">{activePet.name}</h2>
                    <p className="mt-2 text-sm leading-6 text-mist">先完成一轮 {selectedPreset.minutes} 分钟 {selectedPreset.title}，再去领取步数能量，把今天的奖励闭环走完。</p>
                    <div className="mt-4 h-2 rounded-full bg-black/10">
                      <div className="h-2 rounded-full bg-ink" style={{ width: `${activePetProgress}%` }} />
                    </div>
                    <p className="mt-2 text-sm text-mist">Lv.{activePet.level} · 心情 {activePet.mood} / 100 · 亲密度 {activePet.affection} / 100</p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-black/6 pt-4">
                  <div>
                    <p className="text-[11px] text-mist">今日晶石</p>
                    <p className="mt-1 text-xl font-black tracking-tight">{todayCrystal}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-mist">待办</p>
                    <p className="mt-1 text-xl font-black tracking-tight">{openTasks.length}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-mist">累计专注</p>
                    <p className="mt-1 text-xl font-black tracking-tight">{completedMinutes} 分钟</p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white" onClick={startFocus}>开始专注</button>
                  <button className="rounded-full bg-white/92 px-5 py-3 text-sm font-semibold text-ink" onClick={() => setRoute("companion")}>和宠物说一句</button>
                </div>
              </section>

              <section className="panel p-5">
                <SectionTitle title="今日旅程" />
                <div className="space-y-4">
                  {[
                    ["01", "先整理今天的目标", "去 AI 对话里说一句今天想完成的事，把它拆成待办和专注顺序。"],
                    ["02", "完成一轮专注", "把第一笔晶石和经验拿稳，让宠物先成长起来。"],
                    ["03", "把奖励继续带走", "去银行领取能量，再把资源带去探索、商店或对战。"],
                  ].map(([index, title, copy]) => (
                    <div key={index} className="flex gap-4">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/[0.04] text-xs font-black text-ink">{index}</div>
                      <div className="min-w-0 flex-1 border-b border-black/6 pb-4 last:border-b-0 last:pb-0">
                        <p className="text-sm font-black tracking-tight">{title}</p>
                        <p className="mt-2 text-sm leading-6 text-mist">{copy}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex gap-2">
                  <button className="pill" onClick={() => setRoute("achievements")}>成就</button>
                  <button className="pill" onClick={() => setRoute("battle")}>对战</button>
                  <button className="pill" onClick={() => setRoute("shop")}>商店</button>
                </div>
              </section>
            </>
          )}

          {state.route === "focus" && (
            <>
              <section className="panel overflow-hidden bg-gradient-to-b from-sky/42 via-white to-white p-5 text-center">
                <div className="mx-auto flex w-fit flex-col items-center">
                  <PixelPet pet={activePet} size="lg" tone="focus" />
                  <p className="mt-4 text-sm text-mist">{selectedPreset.title} · {state.focus.mode === "pomodoro" ? "番茄钟" : "正计时"}</p>
                </div>
                <div className="mt-6 text-[5.25rem] font-black leading-none tracking-[-0.05em] text-ink">{formatTimer(timerSeconds)}</div>
                <p className="mt-3 text-sm leading-6 text-mist">结束后会获得 {state.focus.durationMinutes * 3} 晶石和 {state.focus.durationMinutes * 2} 点经验。</p>

                <div className="mt-6 flex justify-center gap-2">
                  <button className={`pill ${state.focus.mode === "pomodoro" ? "pill-active" : ""}`} onClick={() => setFocusMode("pomodoro")}>番茄钟</button>
                  <button className={`pill ${state.focus.mode === "countup" ? "pill-active" : ""}`} onClick={() => setFocusMode("countup")}>正计时</button>
                </div>
              </section>

              <section className="panel p-5">
                <SectionTitle title="专注标签" />
                <div className="grid grid-cols-2 gap-3">
                  {state.presets.map((preset) => (
                    <button
                      key={preset.id}
                      className={`rounded-[26px] px-4 py-4 text-left transition ${toneClassMap[preset.tone]} ${selectedPreset.id === preset.id ? "ring-2 ring-ink shadow-soft" : "border border-black/5"}`}
                      onClick={() => setPreset(preset.id)}
                    >
                      <p className="text-lg font-black tracking-tight text-ink">{preset.title}</p>
                      <p className="mt-2 text-sm text-mist">{preset.minutes}:00</p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <button className="col-span-2 rounded-full bg-ink px-5 py-4 text-sm font-semibold text-white" onClick={startFocus}>开始这一轮专注</button>
                <button className="rounded-full bg-white px-5 py-4 text-sm font-semibold text-ink shadow-soft" onClick={stopFocus}>提前结束</button>
                <button className="rounded-full bg-amber/75 px-5 py-4 text-sm font-semibold text-ink" onClick={finishFocus}>直接演示完成反馈</button>
              </section>
            </>
          )}

          {state.route === "companion" && (
            <>
              <section className="panel p-5">
                <div className="flex items-center gap-3">
                  <div className="shrink-0">
                    <PixelPet pet={activePet} size="sm" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight">{activePet.name} 的对话工作台</h2>
                    <p className="mt-1 text-sm text-mist">把一句目标整理成待办、专注顺序和下一步提醒。</p>
                  </div>
                </div>

                <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
                  <button className="pill" onClick={() => runAiAction("tasks")}>拆成待办</button>
                  <button className="pill" onClick={() => runAiAction("plan")}>生成专注计划</button>
                  <button className="pill" onClick={() => runAiAction("idea")}>保存为灵感</button>
                </div>

                <div className="mt-5 space-y-4">
                  {recentMessages.map((message) => (
                    <article key={message.id} className={`flex flex-col gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}>
                      <span className="text-[11px] text-mist">{message.role === "user" ? "你" : activePet.name} · {relativeTime(message.createdAt)}</span>
                      <div className={`w-full max-w-[90%] rounded-[26px] px-4 py-4 ${messageTone(message.type, message.role)}`}>
                        <p className="text-sm leading-6">{message.content}</p>
                        {message.type === "taskCard" && message.relatedTaskIds ? (
                          <div className="mt-3">
                            <TaskList tasks={state.tasks.filter((task) => message.relatedTaskIds?.includes(task.id))} onToggle={toggleTask} />
                          </div>
                        ) : null}
                        {message.type === "imageCard" ? (
                          <div className="mt-4 rounded-[24px] bg-black/[0.04] p-3">
                            <div className="mx-auto w-fit">
                              <PixelPet pet={activePet} size="md" tone="home" />
                            </div>
                            <p className="mt-3 text-sm font-medium text-ink">{message.quoteRef}</p>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel p-5">
                <p className="text-sm text-mist">说出你想做的事，我来帮你拆成专注任务。</p>
                <textarea
                  className="mt-4 min-h-32 w-full rounded-[28px] border border-black/5 bg-white/85 px-4 py-4 text-sm outline-none placeholder:text-mist"
                  value={state.draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendDraftMessage();
                    }
                  }}
                  placeholder="说出你想做的事，我来帮你拆成专注任务"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-mist">回车发送，Shift + Enter 换行</p>
                  <button
                    className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:bg-black/15"
                    disabled={!state.draft.trim()}
                    onClick={sendDraftMessage}
                  >
                    发送
                  </button>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-3">
                <div className="panel p-4">
                  <SectionTitle title="待办" caption={`${openTasks.length} 项`} />
                  <TaskList tasks={state.tasks.slice(0, 3)} onToggle={toggleTask} />
                </div>
                <div className="panel p-4">
                  <SectionTitle title="灵感" caption={`${state.notes.length} 条`} />
                  <div className="space-y-3">
                    {state.notes.slice(0, 2).map((note) => (
                      <div key={note.id} className="rounded-[22px] bg-black/[0.03] p-3">
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
              <section className="panel p-5">
                <div className="flex items-center gap-4">
                  <div className="shrink-0">
                    <PixelPet pet={activePet} size="lg" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-[0.22em] text-mist">当前陪伴</p>
                    <h2 className="mt-2 text-3xl font-black tracking-tight">{activePet.name}</h2>
                    <p className="mt-2 text-sm text-mist">{activePet.rarity} · {activePet.activeSkin}</p>
                    <div className="mt-4 h-2 rounded-full bg-black/10">
                      <div className="h-2 rounded-full bg-ink" style={{ width: `${activePet.mood}%` }} />
                    </div>
                    <p className="mt-2 text-sm text-mist">心情 {activePet.mood} / 100 · 亲密度 {activePet.affection} / 100</p>
                  </div>
                </div>
                <div className="mt-5 flex gap-3">
                  <button className="flex-1 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:bg-black/20" disabled={state.wallet.crystal < 18} onClick={feedPet}>喂食</button>
                  <button className="flex-1 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink shadow-soft" onClick={() => setRoute("shop")}>去商店</button>
                </div>
              </section>

              <section className="panel p-5">
                <SectionTitle title="已解锁宠物" caption={`${state.pets.length} 只`} />
                <div className="grid grid-cols-2 gap-3">
                  {state.pets.map((pet) => (
                    <div key={pet.id} className="rounded-[26px] bg-black/[0.03] p-4">
                      <div className="mx-auto w-fit">
                        <PixelPet pet={pet} size="md" />
                      </div>
                      <p className="mt-4 text-lg font-black tracking-tight">{pet.name}</p>
                      <p className="text-sm text-mist">Lv.{pet.level} · {pet.rarity}</p>
                      <button
                        className={`mt-4 w-full rounded-full px-4 py-3 text-sm font-semibold ${pet.active ? "bg-ink text-white" : "bg-white text-ink"}`}
                        onClick={() => selectPet(pet.id)}
                      >
                        {pet.active ? "当前陪伴" : "切换陪伴"}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {state.route === "explore" && (
            <section className="panel p-5">
              <SectionTitle title="地图探索" caption={`${unlockedMapCount} / ${state.mapNodes.length} 已解锁`} />
              <div className="mb-5 flex items-center justify-between border-b border-black/6 pb-4 text-sm text-mist">
                <span>累计专注 {completedMinutes} 分钟</span>
                <span>体力 {state.wallet.stamina}</span>
              </div>
              <div className="space-y-3">
                {state.mapNodes.map((node) => {
                  const unlocked = completedMinutes >= node.unlockMinutes;
                  return (
                    <div key={node.id} className="rounded-[26px] bg-black/[0.03] p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-lg font-black tracking-tight">{node.title}</p>
                          <p className="mt-2 text-sm leading-6 text-mist">解锁条件 {node.unlockMinutes} 分钟 · 已探索 {node.explored} 次</p>
                        </div>
                        <button
                          className={`rounded-full px-4 py-2 text-sm font-semibold ${unlocked ? "bg-ink text-white" : "bg-white text-mist"}`}
                          disabled={!unlocked}
                          onClick={() => exploreNode(node.id)}
                        >
                          {unlocked ? "探索" : "未解锁"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {state.route === "bank" && (
            <section className="panel p-5">
              <SectionTitle title="能量兑换银行" caption="10 能量 = 1 晶石" />
              <div className="mb-5 grid grid-cols-2 gap-3 border-b border-black/6 pb-4">
                <div>
                  <p className="text-xs text-mist">当前能量</p>
                  <p className="mt-1 text-2xl font-black tracking-tight">{state.wallet.energy}</p>
                </div>
                <div>
                  <p className="text-xs text-mist">待领取</p>
                  <p className="mt-1 text-2xl font-black tracking-tight">{claimableEnergy}</p>
                </div>
              </div>
              <div className="space-y-3">
                {state.steps.map((item) => (
                  <BankRow key={item.id} item={item} onRedeem={redeemStep} />
                ))}
              </div>
              <button className="mt-5 w-full rounded-full bg-ink px-5 py-4 text-sm font-semibold text-white" onClick={exchangeEnergy}>把当前能量兑换成像素晶石</button>
            </section>
          )}

          {state.route === "achievements" && (
            <section className="panel p-5">
              <SectionTitle title="成就" caption={`${state.achievements.filter((item) => item.unlocked).length} 已解锁`} />
              <div className="grid grid-cols-2 gap-3">
                {state.achievements.map((achievement) => (
                  <div key={achievement.id} className={`rounded-[26px] p-4 ${achievement.unlocked ? "bg-black/[0.03]" : "bg-white/65"}`}>
                    <div className="mb-4 flex justify-center rounded-[24px] bg-white/72 py-4">
                      <PixelPet pet={activePet} size="sm" />
                    </div>
                    <p className="text-lg font-black tracking-tight">{achievement.title}</p>
                    <p className="mt-2 text-sm leading-6 text-mist">{achievement.description}</p>
                    <p className="mt-3 text-xs font-semibold text-mist">{achievement.unlocked ? "已解锁" : "未解锁"}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {state.route === "battle" && (
            <>
              <section className="panel p-5">
                <SectionTitle title="系统对战" caption={state.battle.active ? "进行中" : "待开始"} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[24px] bg-black/[0.03] p-4">
                    <p className="text-lg font-black tracking-tight">{activePet.name}</p>
                    <p className="mt-1 text-sm text-mist">HP {state.battle.playerHp}/{state.battle.playerMaxHp}</p>
                    <div className="mt-3 h-2 rounded-full bg-black/10"><div className="h-2 rounded-full bg-ink" style={{ width: `${(state.battle.playerHp / state.battle.playerMaxHp) * 100}%` }} /></div>
                  </div>
                  <div className="rounded-[24px] bg-black/[0.03] p-4">
                    <p className="text-lg font-black tracking-tight">{state.battle.enemyName}</p>
                    <p className="mt-1 text-sm text-mist">HP {state.battle.enemyHp}/{state.battle.enemyMaxHp}</p>
                    <div className="mt-3 h-2 rounded-full bg-black/10"><div className="h-2 rounded-full bg-ink" style={{ width: `${(state.battle.enemyHp / state.battle.enemyMaxHp) * 100}%` }} /></div>
                  </div>
                </div>
                <div className="mt-5 rounded-[24px] bg-black/[0.03] p-4 text-sm leading-6 text-mist">
                  {state.battle.logs.map((log, index) => <p key={`${log}-${index}`}>{log}</p>)}
                </div>
              </section>
              <div className="grid grid-cols-2 gap-3">
                <button className="rounded-full bg-ink px-5 py-4 text-sm font-semibold text-white" onClick={startBattle}>开始对战</button>
                <button className="rounded-full bg-white px-5 py-4 text-sm font-semibold text-ink shadow-soft" onClick={() => battleAction("attack")}>攻击</button>
                <button className="rounded-full bg-white px-5 py-4 text-sm font-semibold text-ink shadow-soft" onClick={() => battleAction("heal")}>治疗</button>
                <button className="rounded-full bg-white px-5 py-4 text-sm font-semibold text-ink shadow-soft" onClick={() => battleAction("guard")}>防御</button>
                <button className="col-span-2 rounded-full bg-black/5 px-5 py-4 text-sm font-semibold text-ink" onClick={() => battleAction("escape")}>逃脱</button>
              </div>
            </>
          )}

          {state.route === "shop" && (
            <section className="panel p-5">
              <SectionTitle title="商店" caption={`可用晶石 ${state.wallet.crystal}`} />
              <div className="space-y-3">
                {shopItems.map((item) => (
                  <div key={item.id} className="rounded-[26px] bg-black/[0.03] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-black tracking-tight">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-mist">{item.description}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black tracking-tight">{item.price}</p>
                        <p className="text-xs text-mist">晶石</p>
                      </div>
                    </div>
                    <button
                      className="mt-4 w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:bg-black/15"
                      disabled={state.wallet.crystal < item.price}
                      onClick={() => buyItem(item.id)}
                    >
                      购买
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[430px] px-4 pb-4">
          <div className="grid grid-cols-6 gap-2 rounded-[28px] border border-white/70 bg-white/92 p-2 shadow-float backdrop-blur">
            {mainRoutes.map((route) => (
              <button
                key={route}
                className={`rounded-full px-1 py-3 text-[11px] font-semibold leading-none transition ${state.route === route ? "bg-ink text-white shadow-soft" : "text-mist"}`}
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
