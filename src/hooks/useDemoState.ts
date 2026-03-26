import { useEffect, useMemo, useState } from "react";
import { seedState } from "../data/seed";
import type { Achievement, DemoState, FocusSession, Pet, RouteKey, TaskItem } from "../types";

const STORAGE_KEY = "pixel-companion-focus-react-demo";

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createTasksFromDraft(draft: string): string[] {
  if (draft.includes("作品集")) {
    return ["收集参考案例", "完成首页主视觉", "补 AI 对话演示动线"];
  }

  return ["拆清目标范围", "完成一轮核心推进", "写 3 句复盘"];
}

function createPlanFromDraft(draft: string): string[] {
  if (draft.includes("作品集")) {
    return ["25 分钟整理参考", "25 分钟完成主画面", "10 分钟补交互说明"];
  }

  return ["25 分钟主任务推进", "10 分钟整理输出", "5 分钟轻复盘"];
}

function loadState(): DemoState {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return seedState;

  try {
    return { ...seedState, ...(JSON.parse(saved) as DemoState) };
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
  const selectedPreset = useMemo(
    () => state.presets.find((preset) => preset.id === state.focus.selectedPresetId) ?? state.presets[0],
    [state.presets, state.focus.selectedPresetId],
  );
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

  function setRoute(route: RouteKey): void {
    setState((current) => ({ ...current, route }));
  }

  function setDraft(value: string): void {
    setState((current) => ({ ...current, draft: value }));
  }

  function setFocusMode(mode: DemoState["focus"]["mode"]): void {
    setState((current) => ({ ...current, focus: { ...current.focus, mode } }));
  }

  function setPreset(presetId: string): void {
    setState((current) => {
      const preset = current.presets.find((item) => item.id === presetId) ?? current.presets[0];
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
    setState((current) => ({
      ...current,
      route: "focus",
      focus: {
        ...current.focus,
        running: true,
        startedAt: Date.now(),
        durationMinutes: selectedPreset.minutes,
      },
    }));
  }

  function stopFocus(): void {
    setState((current) => ({
      ...current,
      focus: { ...current.focus, running: false, startedAt: null },
      sessions: [
        {
          id: createId("session"),
          tag: selectedPreset.title,
          duration: 5,
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
          content: "这次先记成中断也没关系，我们把节奏捡回来就好。",
          createdAt: Date.now(),
        },
      ],
    }));
  }

  function finishFocus(): void {
    setState((current) => {
      const rewardCrystal = current.focus.durationMinutes * 3;
      const rewardExp = current.focus.durationMinutes * 2;
      const nextSessions: FocusSession[] = [
        {
          id: createId("session"),
          tag: selectedPreset.title,
          duration: current.focus.durationMinutes,
          status: "completed",
          crystalReward: rewardCrystal,
          expReward: rewardExp,
          source: current.focus.source,
          endedAt: Date.now(),
        },
        ...current.sessions,
      ];

      // NOTE: 专注奖励、宠物成长、成就联动在这里一起计算，确保 demo 录屏时反馈是一致的。
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
          stamina: clamp(current.wallet.stamina - 4, 0, 100),
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
            content: `专注完成，拿到 ${rewardCrystal} 像素晶石和 ${rewardExp} 点经验。`,
            createdAt: Date.now(),
          },
          {
            id: createId("msg"),
            role: "pet",
            type: "recap",
            content: "这一轮推进得很稳。你可以继续开下一轮，或者先去步数银行补一点资源。",
            createdAt: Date.now(),
          },
        ],
      };
    });
  }

  useEffect(() => {
    if (!state.focus.running || state.focus.mode !== "pomodoro" || !state.focus.startedAt) return;
    if (now - state.focus.startedAt >= state.focus.durationMinutes * 60 * 1000) {
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
          { id: createId("msg"), role: "pet", type: "taskCard", content: "我把这句话拆成了可以立刻执行的动作。", createdAt: Date.now(), relatedTaskIds: taskIds },
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
      notes: [{ id: createId("note"), title: draft.slice(0, 14), body: `${draft}。把它变成一次可见的专注体验。` }, ...current.notes],
      messages: [
        ...current.messages,
        { id: createId("msg"), role: "user", type: "text", content: draft, createdAt: Date.now() },
        { id: createId("msg"), role: "pet", type: "imageCard", content: "我把这条想法收进记忆卡了。", createdAt: Date.now(), quoteRef: draft.slice(0, 28) },
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
    setState((current) => ({
      ...current,
      wallet: { ...current.wallet, crystal: current.wallet.crystal - 18 },
      pets: current.pets.map((pet) =>
        pet.active ? { ...pet, mood: clamp(pet.mood + 12, 0, 100), affection: clamp(pet.affection + 8, 0, 100) } : pet,
      ),
    }));
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
          { id: createId("msg"), role: "pet", type: "systemEvent", content: `步数到账：${target.energyEarned} 能量已经放进你的银行。`, createdAt: Date.now() },
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
      };
    });
  }

  function exploreNode(nodeId: string): void {
    setState((current) => ({
      ...current,
      wallet: { ...current.wallet, stamina: clamp(current.wallet.stamina - 5, 0, 100), crystal: current.wallet.crystal + 12 },
      mapNodes: current.mapNodes.map((node) => (node.id === nodeId ? { ...node, explored: node.explored + 1 } : node)),
      messages: [
        ...current.messages,
        { id: createId("msg"), role: "pet", type: "systemEvent", content: "探索成功，带回 12 枚像素晶石，还顺手解锁了一段世界观。", createdAt: Date.now() },
      ],
    }));
  }

  function startBattle(): void {
    setState((current) => ({
      ...current,
      wallet: { ...current.wallet, stamina: clamp(current.wallet.stamina - 10, 0, 100) },
      battle: {
        ...current.battle,
        active: true,
        enemyHp: current.battle.enemyMaxHp,
        playerHp: current.battle.playerMaxHp,
        logs: ["系统派出了企鹅。你准备先手进攻。"],
      },
    }));
  }

  function battleAction(action: "attack" | "heal" | "guard" | "escape"): void {
    setState((current) => {
      if (!current.battle.active) return current;
      if (action === "escape") {
        return { ...current, battle: { ...current.battle, active: false, logs: ["你撤退了，把体力留给更重要的任务。"] } };
      }

      const enemyHp = action === "attack" ? clamp(current.battle.enemyHp - 28, 0, current.battle.enemyMaxHp) : current.battle.enemyHp;
      const playerHpBase = action === "heal" ? clamp(current.battle.playerHp + 18, 0, current.battle.playerMaxHp) : current.battle.playerHp;

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

    setState((current) => ({
      ...current,
      wallet: { ...current.wallet, crystal: current.wallet.crystal - prices[itemId] },
      pets: current.pets.map((pet) => (pet.active && itemId === "scarf" ? { ...pet, activeSkin: "荧光围巾" } : pet)),
    }));
  }

  const timerSeconds = useMemo(() => {
    if (!state.focus.running || !state.focus.startedAt) {
      return state.focus.mode === "pomodoro" ? selectedPreset.minutes * 60 : 0;
    }

    const elapsed = Math.floor((now - state.focus.startedAt) / 1000);
    return state.focus.mode === "countup" ? elapsed : Math.max(0, state.focus.durationMinutes * 60 - elapsed);
  }, [now, selectedPreset.minutes, state.focus.durationMinutes, state.focus.mode, state.focus.running, state.focus.startedAt]);

  return {
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
