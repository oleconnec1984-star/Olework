export const statuses = [
  "รอรับงาน",
  "กำลังทำ",
  "รอตรวจ",
  "ต้องแก้ไข",
  "สำเร็จ",
] as const;
export type Status = (typeof statuses)[number];
import { defaultPresetAvatar, validStoredAvatar, type AvatarConfig } from "./avatar";
export type { AvatarConfig } from "./avatar";
export const defaultAvatar: AvatarConfig = { ...defaultPresetAvatar };
export type Employee = {
  id: string;
  name: string;
  role: string;
  branch: string;
  department: string;
  active: boolean;
  lineUserId?: string;
  avatar?: AvatarConfig;
};
export type RoutineFrequency = "daily" | "weekly" | "monthly";
export type RoutineWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Routine = {
  frequency: RoutineFrequency;
  interval: number;
  endDate: string | null;
  seriesId: string;
  startDate?: string;
  weekdays?: RoutineWeekday[];
  monthMode?: "day" | "days" | "nthWeekday";
  monthDay?: number;
  monthDays?: number[];
  monthWeek?: 1 | 2 | 3 | 4 | -1;
  monthWeekday?: RoutineWeekday;
  endMode?: "never" | "date" | "count";
  maxOccurrences?: number;
  occurrence?: number;
  createMode?: "afterApproval" | "advance";
  advanceCount?: number;
};
export type Task = {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  reviewerId: string;
  dueDate: string;
  priority: "ปกติ" | "สูง" | "ด่วน";
  status: Status;
  createdAt: string;
  completedAt: string | null;
  checklist: { id: string; label: string; done: boolean }[];
  comments: { id: string; text: string; at: string; author: string }[];
  attachments?: {
    id: string;
    name: string;
    type: string;
    size: number;
    uploadedAt: string;
    uploadedBy: string;
    submissionRound?: number;
  }[];
  submissionCount?: number;
  quickSubmit?: { at: string; by: string; incompleteChecklist: boolean };
  routine?: Routine;
};
export type Mark = {
  id: string;
  date: string;
  title: string;
  time: string;
  important: boolean;
  color: string;
};
export type State = {
  employees: Employee[];
  tasks: Task[];
  events: Mark[];
  branches: string[];
  departments: string[];
  sample: boolean;
  activity: { id: string; text: string; at: string; actor: string }[];
};
export const emptyState = (): State => ({
  employees: [],
  tasks: [],
  events: [],
  branches: [
    "บ้านแซม",
    "ป่าซาง",
    "บ้านเส้ง",
    "หน้าตลาดบ้านเส้ง",
    "ตลาดจตุจักร",
  ],
  departments: [
    "ฝ่ายการตลาด",
    "ผู้จัดการร้าน",
    "ฝ่ายเสมียน",
    "ฝ่ายช่าง",
    "พนักงานหน้าร้าน",
  ],
  sample: false,
  activity: [],
});
export const dateKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
export function validDate(s: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s + "T00:00:00Z")) &&
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s
  );
}
export const late = (t: Task, today = dateKey(new Date())) =>
  t.status !== "สำเร็จ" && t.dueDate < today;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (value: string) => new Date(value + "T00:00:00Z");
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: RoutineWeekday,
  week: 1 | 2 | 3 | 4 | -1,
) {
  if (week === -1) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
    return isoDate(last);
  }
  const first = new Date(Date.UTC(year, month, 1)),
    day = 1 + ((weekday - first.getUTCDay() + 7) % 7) + (week - 1) * 7;
  return isoDate(new Date(Date.UTC(year, month, day)));
}
export function nextRoutineDueDate(dueDate: string, routine: Routine) {
  const [year, month, day] = dueDate.split("-").map(Number);
  if (routine.frequency === "daily")
    return isoDate(new Date(Date.UTC(year, month - 1, day + routine.interval)));
  if (routine.frequency === "weekly") {
    const selected = routine.weekdays?.length
      ? [...routine.weekdays].sort((a, b) => a - b)
      : [utcDate(dueDate).getUTCDay() as RoutineWeekday];
    const anchor = utcDate(routine.startDate || dueDate),
      anchorWeek = new Date(anchor);
    anchorWeek.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
    for (let offset = 1; offset <= routine.interval * 7 + 7; offset++) {
      const candidate = new Date(Date.UTC(year, month - 1, day + offset)),
        candidateWeek = new Date(candidate);
      candidateWeek.setUTCDate(
        candidate.getUTCDate() - ((candidate.getUTCDay() + 6) % 7),
      );
      const weekDistance = Math.floor(
        (candidateWeek.getTime() - anchorWeek.getTime()) / 604800000,
      );
      if (
        weekDistance >= 0 &&
        weekDistance % routine.interval === 0 &&
        selected.includes(candidate.getUTCDay() as RoutineWeekday)
      )
        return isoDate(candidate);
    }
  }
  if (routine.monthMode === "days" && routine.monthDays?.length) {
    const selected = [...new Set(routine.monthDays)].sort((a, b) => a - b),
      daysInCurrent = new Date(Date.UTC(year, month, 0)).getUTCDate(),
      nextThisMonth = selected.find(
        (value) => value > day && value <= daysInCurrent,
      );
    if (nextThisMonth)
      return isoDate(new Date(Date.UTC(year, month - 1, nextThisMonth)));
    for (let step = 1; step <= 240; step++) {
      const monthIndex = month - 1 + routine.interval * step,
        targetYear = year + Math.floor(monthIndex / 12),
        targetMonth = ((monthIndex % 12) + 12) % 12,
        daysInTarget = new Date(
          Date.UTC(targetYear, targetMonth + 1, 0),
        ).getUTCDate(),
        first = selected.find((value) => value <= daysInTarget);
      if (first)
        return isoDate(new Date(Date.UTC(targetYear, targetMonth, first)));
    }
  }
  const monthIndex = month - 1 + routine.interval,
    targetYear = year + Math.floor(monthIndex / 12),
    targetMonth = ((monthIndex % 12) + 12) % 12;
  if (routine.monthMode === "nthWeekday")
    return nthWeekdayOfMonth(
      targetYear,
      targetMonth,
      routine.monthWeekday ?? (utcDate(dueDate).getUTCDay() as RoutineWeekday),
      routine.monthWeek ?? 1,
    );
  const targetDay = Math.min(
    routine.monthDay ?? day,
    new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate(),
  );
  return isoDate(new Date(Date.UTC(targetYear, targetMonth, targetDay)));
}
export function routineLabel(routine?: Routine) {
  if (!routine) return "ครั้งเดียว";
  const unit = { daily: "วัน", weekly: "สัปดาห์", monthly: "เดือน" }[
      routine.frequency
    ],
    base =
      routine.interval === 1
        ? "ทุก" + unit
        : "ทุก " + routine.interval + " " + unit;
  if (routine.frequency === "weekly" && routine.weekdays?.length) {
    const names = [
      "อาทิตย์",
      "จันทร์",
      "อังคาร",
      "พุธ",
      "พฤหัสบดี",
      "ศุกร์",
      "เสาร์",
    ];
    return (
      base +
      " · " +
      routine.weekdays.map((day) => "วัน" + names[day]).join(", ")
    );
  }
  if (
    routine.frequency === "monthly" &&
    routine.monthMode === "days" &&
    routine.monthDays?.length
  )
    return base + " · วันที่ " + routine.monthDays.join(", ");
  return base;
}
export function buildNextRoutineTask(
  task: Task,
  id: string,
  createdAt = new Date().toISOString(),
): Task | null {
  if (!task.routine) return null;
  const occurrence = task.routine.occurrence ?? 1;
  if (task.routine.maxOccurrences && occurrence >= task.routine.maxOccurrences)
    return null;
  const dueDate = nextRoutineDueDate(task.dueDate, task.routine);
  if (task.routine.endDate && dueDate > task.routine.endDate) return null;
  return {
    ...task,
    id,
    dueDate,
    status: "รอรับงาน",
    createdAt,
    completedAt: null,
    routine: { ...task.routine, occurrence: occurrence + 1 },
    checklist: task.checklist.map((c) => ({ ...c, done: false })),
    comments: [],
    attachments: [],
    submissionCount: 0,
    quickSubmit: undefined,
  };
}
export function buildAdvanceRoutineTasks(
  task: Task,
  id: () => string,
  createdAt = new Date().toISOString(),
) {
  if (!task.routine || task.routine.createMode !== "advance")
    return [] as Task[];
  const total = Math.min(
      task.routine.advanceCount ?? 3,
      12,
      task.routine.maxOccurrences ?? 12,
    ),
    tasks: Task[] = [];
  let current = task;
  while (tasks.length < total - 1) {
    const next = buildNextRoutineTask(current, id(), createdAt);
    if (!next) break;
    tasks.push(next);
    current = next;
  }
  return tasks;
}
export function metrics(tasks: Task[], today = dateKey(new Date())) {
  const done = tasks.filter((t) => t.status === "สำเร็จ");
  const ontime = done.filter(
    (t) => t.completedAt && dateKey(new Date(t.completedAt)) <= t.dueDate,
  );
  return {
    total: tasks.length,
    done: done.length,
    open: tasks.length - done.length,
    review: tasks.filter((t) => t.status === "รอตรวจ").length,
    overdue: tasks.filter((t) => late(t, today)).length,
    completion: tasks.length
      ? Math.round((done.length / tasks.length) * 100)
      : null,
    onTime: done.length
      ? Math.round((ontime.length / done.length) * 100)
      : null,
  };
}
export function transition(
  task: Task,
  next: Status,
  now = new Date().toISOString(),
  options: { allowIncompleteChecklist?: boolean } = {},
): Task {
  const allowed: Record<Status, Status[]> = {
    รอรับงาน: options.allowIncompleteChecklist
      ? ["กำลังทำ", "รอตรวจ"]
      : ["กำลังทำ"],
    กำลังทำ: ["รอตรวจ"],
    ต้องแก้ไข: ["กำลังทำ", "รอตรวจ"],
    รอตรวจ: ["สำเร็จ", "ต้องแก้ไข"],
    สำเร็จ: ["กำลังทำ"],
  };
  if (!allowed[task.status].includes(next))
    throw new Error("ขั้นตอนงานไม่ถูกต้อง");
  if (
    next === "รอตรวจ" &&
    task.checklist.some((c) => !c.done) &&
    !options.allowIncompleteChecklist
  )
    throw new Error("กรุณาทำ Checklist ให้ครบก่อนส่งตรวจ");
  if (
    next === "สำเร็จ" &&
    task.checklist.some((c) => !c.done) &&
    !task.quickSubmit?.incompleteChecklist
  )
    throw new Error("กรุณาทำ Checklist ให้ครบก่อนอนุมัติ");
  if (next === "ต้องแก้ไข" && !task.comments.length)
    throw new Error("กรุณาเพิ่มเหตุผลในความคิดเห็นก่อนส่งกลับแก้ไข");
  return {
    ...task,
    status: next,
    completedAt: next === "สำเร็จ" ? now : null,
    submissionCount:
      next === "รอตรวจ"
        ? (task.submissionCount || 0) + 1
        : task.submissionCount,
  };
}
export function validateState(value: unknown): asserts value is State {
  if (!value || typeof value !== "object") throw new Error("ข้อมูลไม่ถูกต้อง");
  const s = value as State;
  const str = (v: unknown, n = 200) =>
    typeof v === "string" && v.trim().length > 0 && v.length <= n;
  if (
    !Array.isArray(s.employees) ||
    s.employees.length > 1000 ||
    !Array.isArray(s.tasks) ||
    s.tasks.length > 5000 ||
    !Array.isArray(s.events) ||
    s.events.length > 2000 ||
    typeof s.sample !== "boolean"
  )
    throw new Error("รูปแบบข้อมูลหรือจำนวนรายการไม่ถูกต้อง");
  for (const list of [s.branches, s.departments])
    if (
      !Array.isArray(list) ||
      !list.length ||
      list.length > 100 ||
      list.some((x) => !str(x, 100)) ||
      new Set(list).size !== list.length
    )
      throw new Error("รายการฝ่ายหรือสาขาไม่ถูกต้อง");
  for (const list of [s.employees, s.tasks, s.events])
    if (
      list.some((x) => !x || !str(x.id, 100)) ||
      new Set(list.map((x) => x.id)).size !== list.length
    )
      throw new Error("รหัสรายการซ้ำหรือไม่ครบ");
  for (const e of s.employees) {
    if (
      !str(e.name, 100) ||
      !str(e.role, 100) ||
      !s.branches.includes(e.branch) ||
      !s.departments.includes(e.department) ||
      typeof e.active !== "boolean"
    )
      throw new Error("ข้อมูลพนักงานไม่ครบ");
    if (
      e.lineUserId !== undefined &&
      !/^U[0-9a-f]{32}$/i.test(e.lineUserId)
    )
      throw new Error("LINE User ID ของพนักงานไม่ถูกต้อง");
    if (e.avatar && !validStoredAvatar(e.avatar))
      throw new Error("Avatar ไม่ถูกต้อง");
  }
  const ids = new Set(s.employees.map((e) => e.id));
  for (const t of s.tasks) {
    if (
      !str(t.title, 200) ||
      typeof t.description !== "string" ||
      t.description.length > 5000 ||
      !ids.has(t.assigneeId) ||
      !ids.has(t.reviewerId) ||
      !validDate(t.dueDate) ||
      !statuses.includes(t.status) ||
      !["ปกติ", "สูง", "ด่วน"].includes(t.priority) ||
      !Number.isFinite(Date.parse(t.createdAt)) ||
      !(
        t.completedAt === null ||
        (typeof t.completedAt === "string" &&
          Number.isFinite(Date.parse(t.completedAt)))
      )
    )
      throw new Error("ข้อมูลงานไม่ถูกต้อง");
    if ((t.status === "สำเร็จ") !== (t.completedAt !== null))
      throw new Error("วันที่สำเร็จไม่ตรงกับสถานะงาน");
    if (
      !Array.isArray(t.checklist) ||
      t.checklist.length > 100 ||
      t.checklist.some(
        (c) => !str(c.id) || !str(c.label, 500) || typeof c.done !== "boolean",
      ) ||
      !Array.isArray(t.comments) ||
      t.comments.length > 200 ||
      t.comments.some(
        (c) =>
          !str(c.id) ||
          !str(c.text, 2000) ||
          !str(c.author) ||
          !Number.isFinite(Date.parse(c.at)),
      ) ||
      (t.attachments !== undefined &&
        (!Array.isArray(t.attachments) ||
          t.attachments.length > 20 ||
          t.attachments.some(
            (a) =>
              !str(a.id, 100) ||
              !str(a.name, 240) ||
              !str(a.type, 120) ||
              !Number.isSafeInteger(a.size) ||
              a.size < 1 ||
              a.size > 10 * 1024 * 1024 ||
              !str(a.uploadedBy, 200) ||
              !Number.isFinite(Date.parse(a.uploadedAt)) ||
              (a.submissionRound !== undefined &&
                (!Number.isSafeInteger(a.submissionRound) ||
                  a.submissionRound < 1 ||
                  a.submissionRound > 9999)),
          ))) ||
      (t.submissionCount !== undefined &&
        (!Number.isSafeInteger(t.submissionCount) ||
          t.submissionCount < 0 ||
          t.submissionCount > 9999)) ||
      (t.quickSubmit !== undefined &&
        (!str(t.quickSubmit.by, 200) ||
          !Number.isFinite(Date.parse(t.quickSubmit.at)) ||
          typeof t.quickSubmit.incompleteChecklist !== "boolean"))
    )
      throw new Error("Checklist หรือความคิดเห็นไม่ถูกต้อง");
    if (t.routine) {
      const r = t.routine;
      if (
        !["daily", "weekly", "monthly"].includes(r.frequency) ||
        !Number.isSafeInteger(r.interval) ||
        r.interval < 1 ||
        r.interval > 365 ||
        !str(r.seriesId, 100) ||
        !(
          r.endDate === null ||
          (validDate(r.endDate) && r.endDate >= t.dueDate)
        ) ||
        (r.startDate !== undefined &&
          (!validDate(r.startDate) || r.startDate > t.dueDate)) ||
        (r.weekdays !== undefined &&
          (!Array.isArray(r.weekdays) ||
            !r.weekdays.length ||
            new Set(r.weekdays).size !== r.weekdays.length ||
            r.weekdays.some(
              (day) => !Number.isInteger(day) || day < 0 || day > 6,
            ))) ||
        (r.monthMode !== undefined &&
          !["day", "days", "nthWeekday"].includes(r.monthMode)) ||
        (r.monthDay !== undefined &&
          (!Number.isInteger(r.monthDay) ||
            r.monthDay < 1 ||
            r.monthDay > 31)) ||
        (r.monthDays !== undefined &&
          (!Array.isArray(r.monthDays) ||
            !r.monthDays.length ||
            new Set(r.monthDays).size !== r.monthDays.length ||
            r.monthDays.some(
              (value) => !Number.isInteger(value) || value < 1 || value > 31,
            ))) ||
        (r.monthMode === "days" && !r.monthDays?.length) ||
        (r.monthWeek !== undefined &&
          ![1, 2, 3, 4, -1].includes(r.monthWeek)) ||
        (r.monthWeekday !== undefined &&
          (!Number.isInteger(r.monthWeekday) ||
            r.monthWeekday < 0 ||
            r.monthWeekday > 6)) ||
        (r.endMode !== undefined &&
          !["never", "date", "count"].includes(r.endMode)) ||
        (r.maxOccurrences !== undefined &&
          (!Number.isInteger(r.maxOccurrences) ||
            r.maxOccurrences < 2 ||
            r.maxOccurrences > 999)) ||
        (r.occurrence !== undefined &&
          (!Number.isInteger(r.occurrence) ||
            r.occurrence < 1 ||
            (r.maxOccurrences !== undefined &&
              r.occurrence > r.maxOccurrences))) ||
        (r.createMode !== undefined &&
          !["afterApproval", "advance"].includes(r.createMode)) ||
        (r.advanceCount !== undefined &&
          (!Number.isInteger(r.advanceCount) ||
            r.advanceCount < 2 ||
            r.advanceCount > 12))
      )
        throw new Error("การตั้งค่างานประจำไม่ถูกต้อง");
    }
  }
  for (const t of s.tasks) {
    if (
      new Set(t.checklist.map((c) => c.id)).size !== t.checklist.length ||
      new Set(t.comments.map((c) => c.id)).size !== t.comments.length
    )
      throw new Error("รหัสรายการย่อยซ้ำ");
    if (
      (t.status === "รอตรวจ" || t.status === "สำเร็จ") &&
      t.checklist.some((c) => !c.done) &&
      !t.quickSubmit?.incompleteChecklist
    )
      throw new Error("Checklist ต้องครบก่อนส่งตรวจหรืออนุมัติ");
    if (
      t.status !== "สำเร็จ" &&
      [t.assigneeId, t.reviewerId].some(
        (id) => !s.employees.find((e) => e.id === id)?.active,
      )
    )
      throw new Error("งานเปิดต้องมีผู้รับผิดชอบและผู้ตรวจที่ใช้งานอยู่");
  }
  for (const e of s.events)
    if (
      !validDate(e.date) ||
      !str(e.title, 200) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time) ||
      typeof e.important !== "boolean" ||
      !["yellow", "blue", "pink", "green", "purple"].includes(e.color)
    )
      throw new Error("ข้อมูลปฏิทินไม่ถูกต้อง");
}
export function sampleState(): State {
  const s = emptyState();
  s.sample = true;
  const names = ["มิ้นท์", "นนท์", "ฝน", "อาร์ม", "เปิ้ล", "เมย์"];
  s.employees = names.map((name, i) => ({
    id: "sample-employee-" + i,
    name,
    role: i === 4 ? "ผู้จัดการสาขา" : "พนักงาน",
    branch: s.branches[i % 5],
    department: s.departments[i % 5],
    active: true,
  }));
  const today = dateKey(new Date());
  s.tasks = [
    "ตรวจนับสต๊อกจอมือถือ",
    "อัปเดตราคาเครื่องมือสอง",
    "ถ่ายคลิปรีวิวสินค้า",
    "ติดตามเครื่องซ่อมค้างรับ",
    "ตรวจมาตรฐานหน้าร้าน",
  ].map((title, i) => ({
    id: "sample-task-" + i,
    title,
    description: "งานตัวอย่างสำหรับทดลองระบบ",
    assigneeId: s.employees[i].id,
    reviewerId: s.employees[4].id,
    dueDate: today,
    priority: "ปกติ",
    status: statuses[i],
    createdAt: new Date().toISOString(),
    completedAt: i === 4 ? new Date().toISOString() : null,
    checklist: [],
    comments: [],
  }));
  return s;
}
