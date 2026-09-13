import type { State, Task } from "./work-model";

export const xpCategories = ["learning", "work", "quality", "teamwork"] as const;
export type XpCategory = (typeof xpCategories)[number];
export type FarmConfig = {
  levels: number[];
  stages: { id: string; label: string; minXp: number; sprite: number }[];
};
export const defaultFarmConfig: FarmConfig = {
  levels: [0, 100, 250, 500, 900, 1400, 2200, 3200, 4500, 6000],
  stages: [
    { id: "egg", label: "ไข่แห่งความหวัง", minXp: 0, sprite: 0 },
    { id: "chick", label: "ลูกเจี๊ยบ", minXp: 100, sprite: 1 },
    { id: "young", label: "ไก่หนุ่ม", minXp: 400, sprite: 2 },
    { id: "adult", label: "ไก่นักสู้", minXp: 900, sprite: 3 },
    { id: "champion", label: "ไก่แชมเปียน", minXp: 1800, sprite: 4 },
    { id: "legend", label: "ไก่ราชัน OLE", minXp: 3200, sprite: 5 },
  ],
};

export function seasonOf(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Bangkok", year: "numeric" }).format(date));
}
export function monthKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}
export function taskRewards(task: Task, state: State) {
  if (task.status !== "สำเร็จ" || !task.completedAt) return [];
  const assignee = state.employees.find((employee) => employee.id === task.assigneeId);
  const reviewer = state.employees.find((employee) => employee.id === task.reviewerId);
  const season = seasonOf(task.completedAt);
  const priority = task.priority === "ด่วน" ? 10 : task.priority === "สูง" ? 5 : 0;
  const quality = (task.submissionCount || 1) <= 1 ? 10 : 5;
  const base = { season, sourceType: "task", sourceId: task.id, createdAt: task.completedAt, createdBy: "system" };
  return [
    { ...base, employeeId: task.assigneeId, branchId: assignee?.branch || null, category: "work" as const, amount: 20 + priority, idempotencyKey: `task:${task.id}:work` },
    { ...base, employeeId: task.assigneeId, branchId: assignee?.branch || null, category: "quality" as const, amount: quality, idempotencyKey: `task:${task.id}:quality` },
    ...(reviewer && reviewer.id !== assignee?.id ? [{ ...base, employeeId: reviewer.id, branchId: reviewer.branch || null, category: "teamwork" as const, amount: 5, idempotencyKey: `task:${task.id}:reviewer:${reviewer.id}` }] : []),
  ];
}
export function learningReward(attempt: { id: string; employeeId: string; score: number; criticalPassed: number | boolean; completedAt: string }, state: State) {
  const employee = state.employees.find((item) => item.id === attempt.employeeId);
  return {
    employeeId: attempt.employeeId, branchId: employee?.branch || null, season: seasonOf(attempt.completedAt), category: "learning" as const,
    amount: 10 + Math.floor(attempt.score / 10) + (attempt.criticalPassed ? 5 : 0), sourceType: "sop_attempt", sourceId: attempt.id,
    idempotencyKey: `sop:${attempt.id}:learning`, createdAt: attempt.completedAt, createdBy: "system",
  };
}
export function levelFor(totalXp: number, config = defaultFarmConfig) {
  let level = 1;
  for (let i = 0; i < config.levels.length; i++) if (totalXp >= config.levels[i]) level = i + 1;
  const current = config.levels[Math.min(level - 1, config.levels.length - 1)] || 0;
  const next = config.levels[level] ?? current;
  return { level, current, next, progress: next === current ? 100 : Math.max(0, Math.min(100, Math.round(((totalXp - current) / (next - current)) * 100))) };
}
export function stageFor(totalXp: number, config = defaultFarmConfig) {
  return [...config.stages].reverse().find((stage) => totalXp >= stage.minXp) || config.stages[0];
}
