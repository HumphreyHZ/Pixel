import { useEffect, useMemo, useState } from "react";
import { seedState } from "../data/seed";
import type { Achievement, DemoState, FocusSession, Pet, RouteKey, TaskItem } from "../types";

const STORAGE_KEY = "pixel-companion-focus-react-demo";
const LEGACY_COMPANION_KEYWORDS = [
  "作品集",
  "首页主视觉",
  "AI 对话页面顺一下",
  "冷冰冰的番茄钟",
  "完成时，让宠物说一句鼓励你的话",
];

function getPresetMeta(currentState: DemoState, presetId: string) {
  return currentState.presets.find((preset) => preset.id === presetId) ?? currentState.presets[0];
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getFocusElapsedSeconds(focus: DemoState["focus"], currentTime = Date.now()): number {
  if (!focus.running || !focus.startedAt) return 0;
  return Math.max(0, Math.floor((currentTime - focus.startedAt) / 1000));
}

function canClaimFocusReward(focus: DemoState["focus"], currentTime = Date.now()): boolean {
  return getFocusElapsedSeconds(focus, currentTime) >= focus.durationMinutes * 60;
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

  return "收到。我会先把它接进今天的主线：定任务、做一轮专注、领取奖励，再决定继续探索还是照顾宠物。";
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
    const mergedState = {
      ...seedState,
      ...parsed,
      wallet: {
        crystal: parsed.wallet?.crystal ?? seedState.wallet.crystal,
        energy: seedState.wallet.energy,
      },
    };

    if (shouldRefreshCompanionContent(mergedState)) {
      return {
        ...mergedState,
        draft: seedState.draft,
        tasks: seedState.tasks,
        notes: seedState.notes,
        messages: seedState.messages,
      };
    }

    return mergedState;
  } catch {
    return seedState;
  }
}

export function useDemoState() {
  const [state, setState] = useState<DemoState>(loadState);
  const [now, setNow] = useState<number>(Date.now());

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

  const activePet = useMemo<Pet>(() => state.pets.find((pet) => pet.active) ?? state.pets[0], [state.pets]);
  const selectedPreset = useMemo(() => getPresetMeta(state, state.focus.selectedPresetId), [state]);
  const completedMinutes = useMemo(
    () => state.sessions.filter((item) => item.status === "completed").reduce((sum, item) => sum + item.duration, 0),
    [state.sessions],
  );

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
      if (!pet.active) return pet;
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

    return {
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
    };
  }

  function setRoute(route: RouteKey): void {
    setState((current) => ({ ...current, route }));
  }

  function setDraft(value: string): void {
    setState((current) => ({ ...current, draft: value }));
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
      return {
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
      };
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

    if (action === "tasks") {
      const taskIds: string[] = [];
      const nextTasks: TaskItem[] = createTasksFromDraft(draft).map((title) => {
        const id = createId("task");
        taskIds.push(id);
        return { id, title, status: "todo", linkedFocusPresetId: selectedPreset.id };
      });

      setState((current) => ({
        ...current,
        route: "companion",
        tasks: [...nextTasks, ...current.tasks],
        messages: [
          ...current.messages,
          { id: createId("msg"), role: "user", type: "text", content: draft, createdAt: Date.now() },
          { id: createId("msg"), role: "pet", type: "taskCard", content: "我把这句话拆成了今天最顺手的 3 个动作。", createdAt: Date.now(), relatedTaskIds: taskIds },
        ],
      }));
      return;
    }

    if (action === "plan") {
      setState((current) => ({
        ...current,
        route: "focus",
        focus: { ...current.focus, source: "ai" },
        messages: [
          ...current.messages,
          { id: createId("msg"), role: "user", type: "text", content: draft, createdAt: Date.now() },
          { id: createId("msg"), role: "pet", type: "focusPlan", content: createPlanFromDraft(draft).join(" / "), createdAt: Date.now() },
        ],
      }));
      return;
    }

    setState((current) => ({
      ...current,
      route: "companion",
      notes: [{ id: createId("note"), title: draft.slice(0, 14), body: `${draft}。把它整理成一条更清楚的专注旅程。` }, ...current.notes],
      messages: [
        ...current.messages,
        { id: createId("msg"), role: "user", type: "text", content: draft, createdAt: Date.now() },
        { id: createId("msg"), role: "pet", type: "imageCard", content: "我把这条目标收进旅程记忆卡了。", createdAt: Date.now(), quoteRef: draft.slice(0, 28) },
      ],
    }));
  }

  function sendDraftMessage(): void {
    const draft = state.draft.trim();
    if (!draft) return;

    setState((current) => ({
      ...current,
      route: "companion",
      draft: "",
      messages: [
        ...current.messages,
        { id: createId("msg"), role: "user", type: "text", content: draft, createdAt: Date.now() },
        { id: createId("msg"), role: "pet", type: "text", content: createReplyFromDraft(draft), createdAt: Date.now() },
      ],
    }));
  }

  function selectPet(petId: string): void {
    setState((current) => ({
      ...current,
      pets: current.pets.map((pet) => ({ ...pet, active: pet.id === petId })),
    }));
  }

  function feedPet(): void {
    setState((current) => {
      if (current.wallet.crystal < 18) return current;
      return {
        ...current,
        wallet: { ...current.wallet, crystal: current.wallet.crystal - 18 },
        pets: current.pets.map((pet) =>
          pet.active ? { ...pet, mood: clamp(pet.mood + 12, 0, 100), affection: clamp(pet.affection + 8, 0, 100) } : pet,
        ),
      };
    });
  }

  function redeemStep(stepId: string): void {
    setState((current) => {
      const target = current.steps.find((step) => step.id === stepId);
      if (!target || target.redeemed) return current;

      const nextSteps = current.steps.map((step) => (step.id === stepId ? { ...step, redeemed: true } : step));
      return {
        ...current,
        wallet: { ...current.wallet, energy: current.wallet.energy + target.energyEarned },
        steps: nextSteps,
        achievements: patchAchievements(current.sessions, true, current.pets),
        messages: [
          ...current.messages,
          { id: createId("msg"), role: "pet", type: "systemEvent", content: `步数到账：${target.energyEarned} 点能量已经放进你的奖励页，现在可以考虑兑换成晶石了。`, createdAt: Date.now() },
        ],
      };
    });
  }

  function exchangeEnergy(): void {
    setState((current) => {
      const crystals = Math.floor(current.wallet.energy / 10);
      if (crystals <= 0) return current;
      return {
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
      };
    });
  }

  function exploreNode(nodeId: string): void {
    setState((current) => {
      if (current.wallet.energy < 5) return current;
      return {
        ...current,
        wallet: { ...current.wallet, energy: clamp(current.wallet.energy - 5, 0, seedState.wallet.energy), crystal: current.wallet.crystal + 12 },
        mapNodes: current.mapNodes.map((node) => (node.id === nodeId ? { ...node, explored: node.explored + 1 } : node)),
        messages: [
          ...current.messages,
          { id: createId("msg"), role: "pet", type: "systemEvent", content: "探索成功，带回 12 枚像素晶石，还顺手点亮了一段新的地图记忆。", createdAt: Date.now() },
        ],
      };
    });
  }

  function startBattle(): void {
    setState((current) => {
      if (current.wallet.energy < 10) return current;
      return {
        ...current,
        wallet: { ...current.wallet, energy: clamp(current.wallet.energy - 10, 0, seedState.wallet.energy) },
        battle: {
          ...current.battle,
          active: true,
          enemyHp: current.battle.enemyMaxHp,
          playerHp: current.battle.playerMaxHp,
          logs: ["系统派出了企鹅。你准备先手进攻。"],
        },
      };
    });
  }

  function battleAction(action: "attack" | "heal" | "guard" | "escape"): void {
    setState((current) => {
      if (!current.battle.active) return current;
      if (action === "escape") {
        return { ...current, battle: { ...current.battle, active: false, logs: ["你撤退了，把能量留给更重要的任务。"] } };
      }

      const enemyHp = action === "attack" ? clamp(current.battle.enemyHp - 28, 0, current.battle.enemyMaxHp) : current.battle.enemyHp;
      const healAmount = action === "heal" ? Math.max(0, Math.min(18, current.battle.playerMaxHp - current.battle.playerHp)) : 0;
      const playerHpBase = action === "heal" ? current.battle.playerHp + healAmount : current.battle.playerHp;

      if (enemyHp <= 0) {
        return {
          ...current,
          wallet: { ...current.wallet, crystal: current.wallet.crystal + 20 },
          battle: { ...current.battle, active: false, enemyHp, logs: ["你赢下了系统对战，额外拿到 20 晶石。"] },
        };
      }

      return {
        ...current,
        battle: {
          ...current.battle,
          enemyHp,
          playerHp: clamp(playerHpBase - 16, 0, current.battle.playerMaxHp),
          logs: [
            action === "attack" ? "你发起攻击，对方掉了 28 HP。" : action === "heal" ? "你回复了 18 HP。" : "你选择防御，压住了节奏。",
            "系统反击，造成 16 点伤害。",
          ],
        },
      };
    });
  }

  function buyItem(itemId: "snack" | "tea" | "scarf"): void {
    const prices: Record<"snack" | "tea" | "scarf", number> = { snack: 24, tea: 18, scarf: 66 };

    setState((current) => {
      if (current.wallet.crystal < prices[itemId]) return current;

      const nextPets = current.pets.map((pet) => {
        if (!pet.active) return pet;
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

      return {
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
      };
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





