import type { DemoState } from "../types";

export const routeLabels: Record<DemoState["route"], string> = {
  home: "主页",
  focus: "专注",
  companion: "AI 对话",
  pets: "宠物",
  explore: "探索",
  bank: "银行",
  achievements: "成就",
  battle: "对战",
  shop: "商店",
};

export const mainRoutes: DemoState["route"][] = ["home", "focus", "companion", "pets", "explore", "bank"];

export const seedState: DemoState = {
  route: "home",
  wallet: { crystal: 516, energy: 88, stamina: 40 },
  focus: {
    mode: "pomodoro",
    selectedPresetId: "design",
    running: false,
    startedAt: null,
    durationMinutes: 25,
    source: "manual",
  },
  draft: "我想先完成一轮 25 分钟专注，再去银行领取步数能量，最后带绵羊去探索晨露草坪。",
  pets: [
    { id: "sheep", name: "绵羊", species: "sheep", rarity: "N", level: 12, exp: 36, mood: 78, affection: 44, activeSkin: "默认毛绒", unlocked: true, active: true },
    { id: "beagle", name: "比格犬", species: "dog", rarity: "N", level: 8, exp: 16, mood: 66, affection: 28, activeSkin: "街头围巾", unlocked: true, active: false },
    { id: "night-cat", name: "夜猫子", species: "cat", rarity: "SR", level: 3, exp: 8, mood: 90, affection: 14, activeSkin: "星光条纹", unlocked: true, active: false },
    { id: "rest-rabbit", name: "休憩兔", species: "rabbit", rarity: "R", level: 4, exp: 10, mood: 72, affection: 18, activeSkin: "暖阳耳朵", unlocked: true, active: false },
  ],
  presets: [
    { id: "design", title: "设计", minutes: 25, tone: "sky" },
    { id: "work", title: "工作", minutes: 30, tone: "peach" },
    { id: "reading", title: "阅读", minutes: 15, tone: "sage" },
    { id: "move", title: "运动", minutes: 10, tone: "amber" },
  ],
  tasks: [
    { id: "task-1", title: "完成 1 轮 25 分钟专注", status: "todo", linkedFocusPresetId: "design" },
    { id: "task-2", title: "去银行领取今日步数能量", status: "todo", linkedFocusPresetId: "move" },
    { id: "task-3", title: "兑换晶石后去晨露草坪探索", status: "todo", linkedFocusPresetId: "work" },
  ],
  notes: [
    { id: "note-1", title: "AI 对话先给下一步", body: "每条宠物回复都应该把用户往下一步带，比如专注后提醒去银行领奖，领奖后提醒去探索。" },
    { id: "note-2", title: "奖励反馈要串成闭环", body: "专注给晶石、步数给能量、兑换后再去探索，让用户在对话里一眼看懂完整循环。" },
  ],
  messages: [
    { id: "msg-1", role: "pet", type: "text", content: "今天想先做哪一步？我可以帮你排一轮专注、提醒领取步数能量，再带你去探索。", createdAt: Date.now() - 1000 * 60 * 42 },
    { id: "msg-2", role: "user", type: "text", content: "先做一次 25 分钟专注，然后看看晶石和能量怎么接到探索上。", createdAt: Date.now() - 1000 * 60 * 34 },
    { id: "msg-3", role: "pet", type: "taskCard", content: "我先把今天的演示旅程拆成 3 步，照着走就能把主循环讲清楚。", createdAt: Date.now() - 1000 * 60 * 26, relatedTaskIds: ["task-1", "task-2", "task-3"] },
    { id: "msg-4", role: "pet", type: "focusPlan", content: "25 分钟专注推进 / 领取今日步数能量 / 兑换晶石后去晨露草坪探索", createdAt: Date.now() - 1000 * 60 * 18 },
    { id: "msg-5", role: "pet", type: "imageCard", content: "我把这条目标记成今天的旅程卡了。", createdAt: Date.now() - 1000 * 60 * 10, quoteRef: "专注完成后，优先提醒我去银行领取奖励。" },
  ],
  sessions: [],
  steps: [
    { id: "step-1", dateLabel: "03/26", steps: 2124, energyEarned: 212, redeemed: false },
    { id: "step-2", dateLabel: "03/25", steps: 207, energyEarned: 20, redeemed: false },
    { id: "step-3", dateLabel: "03/24", steps: 2407, energyEarned: 240, redeemed: true },
    { id: "step-4", dateLabel: "03/23", steps: 13035, energyEarned: 1303, redeemed: true },
  ],
  mapNodes: [
    { id: "meadow", title: "晨露草坪", unlockMinutes: 0, explored: 1 },
    { id: "valley", title: "薄雾溪谷", unlockMinutes: 50, explored: 0 },
    { id: "moon", title: "月光驿站", unlockMinutes: 120, explored: 0 },
  ],
  achievements: [
    { id: "a-1", title: "我的第一步", description: "完成第一次专注", unlocked: false },
    { id: "a-2", title: "能量兑换", description: "完成第一次步数兑换", unlocked: true },
    { id: "a-3", title: "夜猫子", description: "解锁一只 SR 宠物", unlocked: true },
    { id: "a-4", title: "有个好习惯", description: "累计完成 4 次专注", unlocked: false },
  ],
  battle: {
    active: false,
    enemyName: "企鹅",
    enemyHp: 100,
    enemyMaxHp: 100,
    playerHp: 118,
    playerMaxHp: 118,
    logs: ["系统派出了企鹅。你派出绵羊，准备进入演示战斗。"],
  },
};
