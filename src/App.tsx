import { useMemo } from "react";
import { PixelPet } from "./components/PixelPet";
import { mainRoutes, routeLabels } from "./data/seed";
import { useDemoState } from "./hooks/useDemoState";
import type { CompanionMessage, FocusPreset, StepLedger, TaskItem } from "./types";


const toneClassMap: Record<FocusPreset["tone"], string> = {
  sky: "bg-sky/70",
  peach: "bg-peach/70",
  sage: "bg-sage/70",
  amber: "bg-amber/70",
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
  if (role === "user") return "bg-sky/70 text-ink";
  if (type === "reward") return "bg-amber/60 text-ink";
  if (type === "systemEvent") return "bg-sage/60 text-ink";
  return "bg-white/90 text-ink";
}

function SectionTitle({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <h2 className="text-lg font-black tracking-tight">{title}</h2>
      <span className="text-xs font-medium text-mist">{caption}</span>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card min-w-0 flex-1">
      <p className="text-xs text-mist">{label}</p>
      <p className="mt-1 text-lg font-black tracking-tight">{value}</p>
    </div>
  );
}

function TaskList({ tasks, onToggle }: { tasks: TaskItem[]; onToggle: (taskId: string) => void }) {
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <label key={task.id} className="flex items-center gap-3 rounded-3xl bg-black/[0.03] px-4 py-3 text-sm">
          <input checked={task.status === "done"} onChange={() => onToggle(task.id)} type="checkbox" className="h-4 w-4 rounded border-black/20" />
          <span className={task.status === "done" ? "text-mist line-through" : "text-ink"}>{task.title}</span>
        </label>
      ))}
    </div>
  );
}

function BankRow({ item, onRedeem }: { item: StepLedger; onRedeem: (stepId: string) => void }) {
  return (
    <div className="panel flex items-center justify-between gap-3 p-4">
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-mist">{item.dateLabel}</p>
        <p className="mt-2 text-2xl font-black tracking-tight">{item.steps.toLocaleString("zh-CN")} 步</p>
      </div>
      <div className="text-right">
        <p className="text-xs text-mist">可兑能量</p>
        <p className="mt-1 text-2xl font-black tracking-tight">{item.energyEarned}</p>
        <button className={`mt-3 rounded-full px-4 py-2 text-sm font-semibold ${item.redeemed ? "bg-black/5 text-mist" : "bg-ink text-white"}`} disabled={item.redeemed} onClick={() => onRedeem(item.id)}>
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

  return (
    <div className="mx-auto flex min-h-screen w-full items-center justify-center px-4 py-6 sm:px-6">
      <div className="relative w-full max-w-[430px] overflow-hidden rounded-[36px] border border-white/70 bg-white/60 p-4 shadow-float backdrop-blur">
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/90 to-transparent" />

        <header className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-mist">Pixel Companion Focus</p>
            <h1 className="mt-2 text-[2rem] font-black leading-none tracking-tight">{routeLabels[state.route]}</h1>
          </div>
          <div className="panel grid grid-cols-3 gap-2 px-3 py-2 text-center text-[11px] text-mist">
            <div><p>晶石</p><strong className="text-sm text-ink">{state.wallet.crystal}</strong></div>
            <div><p>能量</p><strong className="text-sm text-ink">{state.wallet.energy}</strong></div>
            <div><p>体力</p><strong className="text-sm text-ink">{state.wallet.stamina}</strong></div>
          </div>
        </header>

        <main className="relative z-10 mt-5 space-y-4 pb-28">
          {state.route === "home" && (
            <>
              <section className="panel overflow-hidden bg-gradient-to-br from-sky/70 via-white to-peach/50 p-5">
                <p className="text-sm font-medium text-mist">专注不是打卡，而是和宠物一起把一天慢慢完成。</p>
                <div className="mt-5 flex items-center gap-4">
                  <div className="shrink-0">
                    <PixelPet pet={activePet} size="lg" tone="home" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-3xl font-black tracking-tight">{activePet.name}</h2>
                    <p className="mt-1 text-sm text-mist">Lv.{activePet.level} · {activePet.rarity} · {activePet.activeSkin}</p>
                    <div className="mt-4 h-2 rounded-full bg-black/10">
                      <div className="h-2 rounded-full bg-ink" style={{ width: `${Math.min(100, (activePet.exp / (activePet.level * 12)) * 100)}%` }} />
                    </div>
                    <p className="mt-2 text-sm text-mist">心情 {activePet.mood} / 100 · 亲密度 {activePet.affection} / 100</p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white" onClick={startFocus}>开始专注</button>
                  <button className="rounded-full bg-white/85 px-5 py-3 text-sm font-semibold text-ink" onClick={() => setRoute("companion")}>先和宠物说一句</button>
                </div>
              </section>

              <section className="grid grid-cols-3 gap-3">
                <SmallStat label="今日晶石" value={`${completedSessions.reduce((sum, item) => sum + item.crystalReward, 0)}`} />
                <SmallStat label="未完成待办" value={`${openTasks.length}`} />
                <SmallStat label="累计专注" value={`${completedMinutes} 分钟`} />
              </section>

                            <section className="panel p-5">
                <SectionTitle title="今日旅程" caption="Journey" />
                <div className="space-y-3">
                  <div className="rounded-[26px] bg-black/[0.03] px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-mist">01 对话编排</p>
                    <p className="mt-2 text-sm leading-6 text-ink">先和宠物说一句今天想完成的事，把目标拆成待办和专注节奏。</p>
                  </div>
                  <div className="rounded-[26px] bg-black/[0.03] px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-mist">02 专注结算</p>
                    <p className="mt-2 text-sm leading-6 text-ink">完成一轮专注后，立刻领取像素晶石、经验和宠物情绪反馈。</p>
                  </div>
                  <div className="rounded-[26px] bg-black/[0.03] px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-mist">03 继续展开</p>
                    <p className="mt-2 text-sm leading-6 text-ink">去银行兑换能量，再把资源带去探索、商店或系统对战。</p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <button className="rounded-full bg-black/5 px-3 py-3 text-xs font-semibold text-ink" onClick={() => setRoute("achievements")}>成就</button>
                  <button className="rounded-full bg-black/5 px-3 py-3 text-xs font-semibold text-ink" onClick={() => setRoute("battle")}>对战</button>
                  <button className="rounded-full bg-black/5 px-3 py-3 text-xs font-semibold text-ink" onClick={() => setRoute("shop")}>商店</button>
                </div>
              </section>
            </>
          )}

          {state.route === "focus" && (
            <>
              <section className="panel bg-gradient-to-b from-sky/50 via-white to-white p-5 text-center">
                <div className="mx-auto w-fit">
                  <PixelPet pet={activePet} size="lg" tone="focus" />
                </div>
                <p className="mt-5 text-sm text-mist">当前标签 · {selectedPreset.title} · {state.focus.source === "ai" ? "AI 编排" : "手动选择"}</p>
                <div className="mt-3 text-[4.5rem] font-black leading-none tracking-tight">{formatTimer(timerSeconds)}</div>
                <div className="mt-4 flex justify-center gap-2">
                  <button className={`pill ${state.focus.mode === "pomodoro" ? "pill-active" : ""}`} onClick={() => setFocusMode("pomodoro")}>番茄钟</button>
                  <button className={`pill ${state.focus.mode === "countup" ? "pill-active" : ""}`} onClick={() => setFocusMode("countup")}>正计时</button>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-3">
                {state.presets.map((preset) => (
                  <button key={preset.id} className={`panel p-4 text-left transition ${toneClassMap[preset.tone]} ${selectedPreset.id === preset.id ? "ring-2 ring-ink" : ""}`} onClick={() => setPreset(preset.id)}>
                    <p className="text-lg font-black tracking-tight">{preset.title}</p>
                    <p className="mt-2 text-sm text-mist">{preset.minutes}:00</p>
                  </button>
                ))}
              </section>

              <section className="grid grid-cols-2 gap-3">
                <button className="rounded-full bg-ink px-5 py-4 text-sm font-semibold text-white" onClick={startFocus}>开始专注</button>
                <button className="rounded-full bg-white px-5 py-4 text-sm font-semibold text-ink shadow-soft" onClick={stopFocus}>提前结束</button>
                <button className="col-span-2 rounded-full bg-amber/80 px-5 py-4 text-sm font-semibold text-ink" onClick={finishFocus}>直接演示完成反馈</button>
              </section>
            </>
          )}

          {state.route === "companion" && (
            <>
              <section className="panel p-5">
                <SectionTitle title={`${activePet.name} 的工作台`} caption="Companion" />
                <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                  <button className="pill" onClick={() => runAiAction("tasks")}>拆成待办</button>
                  <button className="pill" onClick={() => runAiAction("plan")}>生成专注计划</button>
                  <button className="pill" onClick={() => runAiAction("idea")}>保存为灵感</button>
                </div>
                <div className="space-y-3">
                  {recentMessages.map((message) => (
                    <article key={message.id} className={`flex flex-col gap-2 ${message.role === "user" ? "items-end" : "items-start"}`}>
                      <span className="text-[11px] text-mist">{message.role === "user" ? "你" : activePet.name} · {relativeTime(message.createdAt)}</span>
                      <div className={`w-full max-w-[88%] rounded-[28px] px-4 py-3 ${messageTone(message.type, message.role)}`}>
                        <p className="text-sm leading-6">{message.content}</p>
                        {message.type === "taskCard" && message.relatedTaskIds ? (
                          <div className="mt-3">
                            <TaskList tasks={state.tasks.filter((task) => message.relatedTaskIds?.includes(task.id))} onToggle={toggleTask} />
                          </div>
                        ) : null}
                        {message.type === "imageCard" ? (
                          <div className="mt-4 rounded-[24px] bg-black/5 p-3">
                            <div className="mx-auto w-fit rounded-[24px] bg-white/70 p-3">
                              <PixelPet pet={activePet} size="md" />
                            </div>
                            <p className="mt-3 text-sm font-medium">{message.quoteRef}</p>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel p-5">
                <label className="block text-sm font-semibold text-mist">输入一句目标，让 AI 帮你编排今天</label>
                <textarea
                  className="mt-3 min-h-28 w-full rounded-[28px] border border-black/5 bg-white/80 px-4 py-4 text-sm outline-none placeholder:text-mist"
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
                <div className="mt-3 flex justify-end">
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
                  <SectionTitle title="待办摘要" caption={`${openTasks.length} 项`} />
                  <TaskList tasks={state.tasks.slice(0, 3)} onToggle={toggleTask} />
                </div>
                <div className="panel p-4">
                  <SectionTitle title="灵感记忆" caption={`${state.notes.length} 条`} />
                  <div className="space-y-3">
                    {state.notes.slice(0, 2).map((note) => (
                      <div key={note.id} className="rounded-[24px] bg-black/[0.03] p-3">
                        <p className="text-sm font-semibold">{note.title}</p>
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
                    <h2 className="text-3xl font-black tracking-tight">{activePet.name}</h2>
                    <p className="mt-1 text-sm text-mist">{activePet.rarity} · {activePet.activeSkin}</p>
                    <div className="mt-4 h-2 rounded-full bg-black/10">
                      <div className="h-2 rounded-full bg-ink" style={{ width: `${activePet.mood}%` }} />
                    </div>
                    <p className="mt-2 text-sm text-mist">心情 {activePet.mood} / 100 · 亲密度 {activePet.affection} / 100</p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:bg-black/20" disabled={state.wallet.crystal < 18} onClick={feedPet}>喂食</button>
                  <button className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink shadow-soft" onClick={() => setRoute("shop")}>去商店</button>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-3">
                {state.pets.map((pet) => (
                  <div key={pet.id} className="panel p-4">
                    <div className="mx-auto w-fit">
                      <PixelPet pet={pet} size="md" />
                    </div>
                    <p className="mt-4 text-lg font-black tracking-tight">{pet.name}</p>
                    <p className="text-sm text-mist">Lv.{pet.level} · {pet.rarity}</p>
                    <button className={`mt-4 w-full rounded-full px-4 py-3 text-sm font-semibold ${pet.active ? "bg-ink text-white" : "bg-black/5 text-ink"}`} onClick={() => selectPet(pet.id)}>
                      {pet.active ? "当前陪伴" : "切换陪伴"}
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}

          {state.route === "explore" && (
            <section className="panel p-5">
              <SectionTitle title="地图探索" caption={`累计专注 ${completedMinutes} 分钟`} />
              <div className="space-y-3">
                {state.mapNodes.map((node) => {
                  const unlocked = completedMinutes >= node.unlockMinutes;
                  return (
                    <div key={node.id} className="rounded-[28px] bg-black/[0.03] p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-lg font-black tracking-tight">{node.title}</p>
                          <p className="mt-1 text-sm leading-6 text-mist">解锁条件 {node.unlockMinutes} 分钟 · 已探索 {node.explored} 次</p>
                        </div>
                        <button className={`rounded-full px-4 py-2 text-sm font-semibold ${unlocked ? "bg-ink text-white" : "bg-black/5 text-mist"}`} disabled={!unlocked} onClick={() => exploreNode(node.id)}>
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
            <>
              <section className="panel p-5">
                <SectionTitle title="能量兑换银行" caption="10 能量 = 1 晶石" />
                <div className="space-y-3">
                  {state.steps.map((item) => (
                    <BankRow key={item.id} item={item} onRedeem={redeemStep} />
                  ))}
                </div>
              </section>
              <button className="w-full rounded-full bg-ink px-5 py-4 text-sm font-semibold text-white" onClick={exchangeEnergy}>把当前能量兑换成像素晶石</button>
            </>
          )}

          {state.route === "achievements" && (
            <section className="grid grid-cols-2 gap-3">
              {state.achievements.map((achievement) => (
                <div key={achievement.id} className={`panel p-4 ${achievement.unlocked ? "bg-white" : "bg-black/[0.03]"}`}>
                  <div className="mb-4 h-28 rounded-[24px] bg-gradient-to-br from-amber/50 to-white p-3">
                    <PixelPet pet={activePet} size="sm" />
                  </div>
                  <p className="text-lg font-black tracking-tight">{achievement.title}</p>
                  <p className="mt-2 text-sm leading-6 text-mist">{achievement.description}</p>
                  <p className="mt-3 text-xs font-semibold text-mist">{achievement.unlocked ? "已解锁" : "未解锁"}</p>
                </div>
              ))}
            </section>
          )}

          {state.route === "battle" && (
            <>
              <section className="grid grid-cols-2 gap-3">
                <div className="panel p-4">
                  <p className="text-lg font-black tracking-tight">{activePet.name}</p>
                  <p className="mt-1 text-sm text-mist">HP {state.battle.playerHp}/{state.battle.playerMaxHp}</p>
                  <div className="mt-3 h-2 rounded-full bg-black/10"><div className="h-2 rounded-full bg-ink" style={{ width: `${(state.battle.playerHp / state.battle.playerMaxHp) * 100}%` }} /></div>
                </div>
                <div className="panel p-4">
                  <p className="text-lg font-black tracking-tight">{state.battle.enemyName}</p>
                  <p className="mt-1 text-sm text-mist">HP {state.battle.enemyHp}/{state.battle.enemyMaxHp}</p>
                  <div className="mt-3 h-2 rounded-full bg-black/10"><div className="h-2 rounded-full bg-ink" style={{ width: `${(state.battle.enemyHp / state.battle.enemyMaxHp) * 100}%` }} /></div>
                </div>
              </section>
              <section className="panel p-5">
                <SectionTitle title="系统对战" caption="Battle" />
                <div className="space-y-2 text-sm leading-6 text-mist">
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
            <section className="space-y-3">
              {shopItems.map((item) => (
                <div key={item.id} className="panel p-5">
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
                  <button className="mt-4 w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:bg-black/15" disabled={state.wallet.crystal < item.price} onClick={() => buyItem(item.id)}>
                    购买
                  </button>
                </div>
              ))}
            </section>
          )}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[430px] px-4 pb-4">
          <div className="grid grid-cols-6 gap-2 rounded-[28px] border border-white/70 bg-white/90 p-2 shadow-float backdrop-blur">
            {mainRoutes.map((route) => (
              <button key={route} className={`rounded-full px-1 py-3 text-[11px] font-semibold leading-none transition ${state.route === route ? "bg-ink text-white shadow-soft" : "text-mist"}`} onClick={() => setRoute(route)}>
                {routeLabels[route]}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}











