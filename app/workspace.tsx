"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type FormEvent,
} from "react";
import { AvatarStudio, PixelEmployeeAvatar } from "./avatar-studio";
import { SopCenter } from "./sop-center";
import { ChickenArena } from "./chicken-arena";
import { normalizePresetAvatar, type AvatarV3 } from "../lib/avatar";
import type { EmployeePermission, SopTabPermission } from "../lib/employee-auth";
import {
  emptyState,
  sampleState,
  defaultAvatar,
  buildAdvanceRoutineTasks,
  buildNextRoutineTask,
  dateKey,
  late,
  metrics,
  routineLabel,
  statuses,
  transition,
  validateState,
  type State,
  type Employee,
  type Task,
  type Mark,
  type Status,
  type Routine,
  type RoutineFrequency,
  type RoutineWeekday,
} from "../lib/work-model";
import "./workspace.css";

type View =
  | "dashboard"
  | "tasks"
  | "employees"
  | "calendar"
  | "reports"
  | "farm"
  | "sop"
  | "branches"
  | "departments"
  | "permissions"
  | "settings";
type EmployeeAccount = {
  employeeId: string;
  loginId: string;
  permissions: EmployeePermission[];
  visibleDepartments: string[];
  active: boolean;
};

const sopAccessOptions: { id: SopTabPermission; label: string }[] = [
  { id: "sop_library", label: "คลัง SOP (ดูอย่างเดียว)" },
  { id: "sop_quiz", label: "แบบทดสอบ" },
  { id: "sop_results", label: "ผลการเรียน" },
  { id: "sop_plans", label: "กำหนดการสอบ" },
  { id: "sop_manage", label: "จัดการ SOP (แก้ไขเนื้อหา SOP)" },
];

type SopAttemptSummary = {
  employeeId: string;
  score: number;
  level: string;
  criticalPassed: boolean;
  completedAt: string;
};

const MAX_EVIDENCE_FILE_SIZE = 10 * 1024 * 1024;
const MAX_EVIDENCE_TOTAL_SIZE = 30 * 1024 * 1024;

async function prepareEvidenceFile(file: File) {
  const type = file.type.toLowerCase();
  const compressible = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ].includes(type);
  const needsBrowserConversion = type === "image/heic" || type === "image/heif";
  if (
    !compressible ||
    (!needsBrowserConversion && file.size <= 2.5 * 1024 * 1024)
  )
    return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 1920 / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "evidence";
    return new File([blob], `${name}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
type BackupEntry = { date: string; size: number; uploadedAt: string };
type LineStatus = {
  connected: boolean;
  tokenConfigured: boolean;
  defaultTargetConfigured: boolean;
  employeeTargets: number;
  latestSentAt: string | null;
};
type DialogState =
  | { kind: "employee"; employee?: Employee }
  | { kind: "task"; task?: Task; assigneeId?: string; date?: string }
  | { kind: "event"; event?: Mark; date: string }
  | { kind: "organization"; field: "branches" | "departments"; name?: string }
  | null;
const menu: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "ภาพรวม", icon: "▦" },
  { id: "tasks", label: "งานทั้งหมด", icon: "✓" },
  { id: "employees", label: "พนักงาน", icon: "♙" },
  { id: "calendar", label: "ปฏิทิน", icon: "□" },
  { id: "reports", label: "รายงาน", icon: "↗" },
  { id: "farm", label: "OLE FARM", icon: "♜" },
  { id: "sop", label: "SOP & การสอบ", icon: "§" },
  { id: "branches", label: "สาขา", icon: "⌂" },
  { id: "departments", label: "ฝ่าย", icon: "⌘" },
  { id: "permissions", label: "สิทธิ์และการเชื่อมต่อ", icon: "◇" },
  { id: "settings", label: "ตั้งค่าและข้อมูล", icon: "⚙" },
];
const uid = () => crypto.randomUUID();
const pct = (n: number | null) => (n === null ? "—" : n + "%");
const displayDate = (value: string) =>
  new Date(value + "T12:00:00+07:00").toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
const addDays = (value: string, days: number) => {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
function download(content: string, name: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copyText(content: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return;
    } catch {
      // Fall through for in-app browsers that deny the Clipboard API.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy failed");
}
function csvCell(value: unknown) {
  let v = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(v)) v = "'" + v;
  return '"' + v.replaceAll('"', '""') + '"';
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="w-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function SopAccessFields({ permissions }: { permissions: EmployeePermission[] }) {
  const [enabled, setEnabled] = useState(permissions.includes("sop"));
  const legacy = enabled && !sopAccessOptions.some((option) => permissions.includes(option.id));
  return (
    <div className="w-sop-access-group">
      <label className="w-check">
        <input type="checkbox" name="menuPermission" value="sop" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        SOP &amp; การสอบ
      </label>
      {enabled && (
        <div className="w-sop-subpermissions">
          {sopAccessOptions.map((option) => (
            <label className={`w-check${option.id === "sop_manage" ? " w-sop-manage-permission" : ""}`} key={option.id}>
              <input
                type="checkbox"
                name="menuPermission"
                value={option.id}
                defaultChecked={option.id === "sop_manage" ? permissions.includes(option.id) : permissions.includes(option.id) || legacy}
              />
              <span>{option.label}</span>
              {option.id === "sop_manage" && <small>เฉพาะผู้ดูแลระบบเท่านั้น — ส่งผลต่อนโยบายบริษัททุกสาขา</small>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="w-empty">{children}</div>;
}
function Panel({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="w-panel">
      <header>
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="w-dialog"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label="ปิดหน้าต่าง" onClick={close}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

function DeleteTasksDialog({
  count,
  busy,
  close,
  confirmDelete,
}: {
  count: number;
  busy: boolean;
  close: () => void;
  confirmDelete: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="w-dialog w-confirm-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <h2>ยืนยันการลบงาน</h2>
      <p>
        งานจำนวน <strong>{count}</strong>{" "}
        รายการจะถูกลบพร้อมความคิดเห็นและหลักฐาน การกระทำนี้ย้อนกลับไม่ได้
      </p>
      <div className="w-actions">
        <button type="button" disabled={busy} onClick={close}>
          ยกเลิก
        </button>
        <button
          type="button"
          className="w-danger w-danger-solid"
          disabled={busy}
          onClick={confirmDelete}
        >
          {busy ? "กำลังลบ…" : `ลบ ${count} งาน`}
        </button>
      </div>
    </dialog>
  );
}

const statusColors = ["#8ea0b8", "#f0b429", "#5bb7d7", "#ef8b55", "#55bf87"];
function StatusDonut({ tasks }: { tasks: Task[] }) {
  const counts = statuses.map((status) => tasks.filter((task) => task.status === status).length);
  const total = tasks.length;
  let cursor = 0;
  const gradient = total
    ? `conic-gradient(${counts
        .map((count, index) => {
          const start = cursor;
          cursor += (count / total) * 100;
          return `${statusColors[index]} ${start}% ${cursor}%`;
        })
        .join(",")})`
    : "conic-gradient(#334058 0 100%)";
  return (
    <div className="w-donut-layout">
      <div className="w-donut" style={{ background: gradient }} role="img" aria-label={`สัดส่วนสถานะงานทั้งหมด ${total} งาน`}>
        <span><strong>{total}</strong><small>งาน</small></span>
      </div>
      {total ? (
        <ul className="w-chart-legend">
          {statuses.map((status, index) => (
            <li key={status}>
              <i style={{ background: statusColors[index] }} />
              <span>{status}</span>
              <strong>{counts[index]}</strong>
              <small>{Math.round((counts[index] / total) * 100)}%</small>
            </li>
          ))}
        </ul>
      ) : <Empty>ยังไม่มีงานสำหรับสร้างกราฟสถานะ</Empty>}
    </div>
  );
}

function QualityRings({ tasks, today }: { tasks: Task[]; today: string }) {
  const values = metrics(tasks, today);
  const rows = [
    ["อัตรางานสำเร็จ", values.completion, "สำเร็จ / งานทั้งหมด"],
    ["ส่งงานตรงเวลา", values.onTime, "ตรงเวลา / งานสำเร็จ"],
  ] as const;
  return (
    <div className="w-quality-rings">
      {rows.map(([label, value, detail]) => {
        const color = value === null ? "#526079" : value < 50 ? "#e66767" : value <= 80 ? "#e3b43d" : "#55bf87";
        return (
          <div key={label}>
            <div className="w-progress-ring" style={{ background: `conic-gradient(${color} ${(value || 0)}%, #303c53 0)` }}>
              <span>{pct(value)}</span>
            </div>
            <strong>{label}</strong><small>{detail}</small>
          </div>
        );
      })}
    </div>
  );
}

type PerformanceRow = { label: string; total: number; done: number; open: number; overdue: number };
function PerformanceBars({ rows, emptyText }: { rows: PerformanceRow[]; emptyText: string }) {
  const visible = rows.filter((row) => row.total > 0).sort((a, b) => b.open - a.open || b.total - a.total).slice(0, 8);
  const max = Math.max(1, ...visible.map((row) => Math.max(row.done, row.open, row.overdue)));
  if (!visible.length) return <Empty>{emptyText}</Empty>;
  return (
    <div className="w-performance-bars">
      {visible.map((row) => (
        <div className="w-performance-row" key={row.label}>
          <div className="w-performance-name"><strong>{row.label}</strong><small>ทั้งหมด {row.total}</small></div>
          {(["done", "open", "overdue"] as const).map((key) => (
            <div className={`w-mini-bar ${key}`} key={key}>
              <span>{key === "done" ? "สำเร็จ" : key === "open" ? "คงค้าง" : "เกิน"}</span>
              <i><b style={{ width: `${(row[key] / max) * 100}%` }} /></i>
              <strong>{row[key]}</strong>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function DueTrend({ tasks, month }: { tasks: Task[]; month: string }) {
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const buckets = Array.from({ length: 5 }, (_, index) => ({
    label: `${index * 7 + 1}–${Math.min((index + 1) * 7, days)}`,
    count: tasks.filter((task) => task.dueDate.slice(0, 7) === month && Math.floor((Number(task.dueDate.slice(8)) - 1) / 7) === index).length,
  }));
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  if (!buckets.some((bucket) => bucket.count)) return <Empty>เดือนนี้ยังไม่มีงานครบกำหนด</Empty>;
  return (
    <div className="w-due-chart" role="img" aria-label={`จำนวนงานครบกำหนดรายสัปดาห์ เดือน ${month}`}>
      {buckets.map((bucket) => (
        <div key={bucket.label}>
          <strong>{bucket.count}</strong>
          <i><b style={{ height: `${Math.max(5, (bucket.count / max) * 100)}%` }} /></i>
          <span>วันที่ {bucket.label}</span>
        </div>
      ))}
    </div>
  );
}

const weekdayOptions: [RoutineWeekday, string][] = [
  [1, "จันทร์"],
  [2, "อังคาร"],
  [3, "พุธ"],
  [4, "พฤหัสบดี"],
  [5, "ศุกร์"],
  [6, "เสาร์"],
  [0, "อาทิตย์"],
];
function TaskScheduleFields({
  task,
  defaultDate,
}: {
  task?: Task;
  defaultDate: string;
}) {
  const routine = task?.routine,
    initialDue = task?.dueDate || defaultDate,
    [frequency, setFrequency] = useState<RoutineFrequency | "none">(
      routine?.frequency || "none",
    ),
    [interval, setInterval] = useState(routine?.interval || 1),
    [weekdays, setWeekdays] = useState<RoutineWeekday[]>(
      routine?.weekdays || [
        new Date(initialDue + "T00:00:00Z").getUTCDay() as RoutineWeekday,
      ],
    ),
    [monthMode, setMonthMode] = useState<"day" | "days" | "nthWeekday">(
      routine?.monthMode || "day",
    ),
    [monthDays, setMonthDays] = useState<number[]>(
      routine?.monthDays || [Number(initialDue.slice(8, 10))],
    ),
    [endMode, setEndMode] = useState<"never" | "date" | "count">(
      routine?.endMode ||
        (routine?.maxOccurrences
          ? "count"
          : routine?.endDate
            ? "date"
            : "never"),
    ),
    [createMode, setCreateMode] = useState<"afterApproval" | "advance">(
      routine?.createMode || "afterApproval",
    ),
    [dueDate, setDueDate] = useState(initialDue);
  const due = new Date(dueDate + "T00:00:00Z"),
    unit =
      frequency === "daily"
        ? "วัน"
        : frequency === "weekly"
          ? "สัปดาห์"
          : "เดือน";
  return (
    <section className="w-routine-box" aria-labelledby="routine-title">
      <h3 id="routine-title">↻ ตั้งค่างานทำซ้ำ</h3>
      <p className="w-routine-intro">
        แต่ละช่องมีผลต่อวันที่สร้างงานจริง ระบบจะแสดงเฉพาะตัวเลือกที่เกี่ยวข้อง
      </p>
      <div className="w-routine-fields">
        <Field label="วันครบกำหนดรอบแรก *">
          <input
            name="dueDate"
            required
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <small>วันส่งงานของรอบแรก และเป็นฐานคำนวณรอบถัดไป</small>
        </Field>
        <Field label="1. รูปแบบงาน">
          <select
            name="routineFrequency"
            value={frequency}
            onChange={(e) =>
              setFrequency(e.target.value as RoutineFrequency | "none")
            }
          >
            <option value="none">ทำครั้งเดียว — ไม่ทำซ้ำ</option>
            <option value="daily">ทุกวัน</option>
            <option value="weekly">ทุกสัปดาห์</option>
            <option value="monthly">ทุกเดือน</option>
          </select>
        </Field>
        {frequency !== "none" && (
          <>
            <Field label={`2. ความถี่ — ทุกกี่${unit}`}>
              <input
                name="routineInterval"
                type="number"
                min="1"
                max={frequency === "daily" ? 365 : 52}
                required
                value={interval}
                onChange={(e) =>
                  setInterval(Math.max(1, Number(e.target.value) || 1))
                }
              />
              <small>ตัวอย่าง: ใส่ 2 = ทุก 2 {unit}</small>
            </Field>
            <Field label="3. เริ่มตั้งแต่">
              <input
                name="routineStartDate"
                type="date"
                required
                max={dueDate}
                defaultValue={routine?.startDate || dueDate}
              />
              <small>วันที่เริ่มชุดงาน ต้องไม่เกินวันครบกำหนดรอบแรก</small>
            </Field>
          </>
        )}
      </div>
      {frequency === "weekly" && (
        <fieldset className="w-routine-group">
          <legend>4. วันที่ต้องทำในสัปดาห์</legend>
          <div className="w-weekdays">
            {weekdayOptions.map(([value, label]) => (
              <label key={value} className="w-check">
                <input
                  type="checkbox"
                  name="routineWeekday"
                  value={value}
                  checked={weekdays.includes(value)}
                  onChange={(e) =>
                    setWeekdays((current) =>
                      e.target.checked
                        ? [...current, value].sort((a, b) => a - b)
                        : current.filter((day) => day !== value),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <small>เลือกได้หลายวัน เช่น จันทร์ พุธ และศุกร์</small>
        </fieldset>
      )}
      {frequency === "monthly" && (
        <fieldset className="w-routine-group">
          <legend>4. รูปแบบวันของเดือน</legend>
          <div className="w-routine-fields">
            <Field label="กำหนดแบบ">
              <select
                name="routineMonthMode"
                value={monthMode}
                onChange={(e) =>
                  setMonthMode(e.target.value as "day" | "days" | "nthWeekday")
                }
              >
                <option value="day">วันที่เดียวของทุกเดือน</option>
                <option value="days">หลายวันที่ในเดือน</option>
                <option value="nthWeekday">ลำดับวันในสัปดาห์</option>
              </select>
            </Field>
            {monthMode === "day" ? (
              <Field label="วันที่ของเดือน">
                <input
                  name="routineMonthDay"
                  type="number"
                  min="1"
                  max="31"
                  required
                  defaultValue={routine?.monthDay || due.getUTCDate()}
                />
                <small>เดือนที่มีวันไม่ครบ ระบบใช้วันสุดท้ายของเดือน</small>
              </Field>
            ) : monthMode === "days" ? (
              <fieldset className="w-month-days-group">
                <legend>เลือกวันที่ได้หลายวัน</legend>
                <div className="w-month-days">
                  {Array.from({ length: 31 }, (_, index) => index + 1).map(
                    (value) => (
                      <label
                        key={value}
                        className={monthDays.includes(value) ? "selected" : ""}
                      >
                        <input
                          type="checkbox"
                          name="routineMonthDayChoice"
                          value={value}
                          checked={monthDays.includes(value)}
                          onChange={(e) =>
                            setMonthDays((current) =>
                              e.target.checked
                                ? [...current, value].sort((a, b) => a - b)
                                : current.filter((day) => day !== value),
                            )
                          }
                        />
                        <span>{value}</span>
                      </label>
                    ),
                  )}
                </div>
                <small>
                  วันที่ที่ไม่มีในเดือนนั้นจะถูกข้าม เช่น วันที่ 31
                  ในเดือนกุมภาพันธ์
                </small>
              </fieldset>
            ) : (
              <>
                <Field label="ลำดับ">
                  <select
                    name="routineMonthWeek"
                    defaultValue={routine?.monthWeek || 1}
                  >
                    <option value="1">สัปดาห์แรก</option>
                    <option value="2">สัปดาห์ที่ 2</option>
                    <option value="3">สัปดาห์ที่ 3</option>
                    <option value="4">สัปดาห์ที่ 4</option>
                    <option value="-1">สัปดาห์สุดท้าย</option>
                  </select>
                </Field>
                <Field label="วัน">
                  <select
                    name="routineMonthWeekday"
                    defaultValue={routine?.monthWeekday ?? due.getUTCDay()}
                  >
                    {weekdayOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
          </div>
        </fieldset>
      )}
      {frequency !== "none" && (
        <>
          <fieldset className="w-routine-group">
            <legend>5. สิ้นสุดการทำซ้ำ</legend>
            <div className="w-routine-fields">
              <Field label="เงื่อนไขสิ้นสุด">
                <select
                  name="routineEndMode"
                  value={endMode}
                  onChange={(e) =>
                    setEndMode(e.target.value as "never" | "date" | "count")
                  }
                >
                  <option value="never">ไม่มีกำหนด</option>
                  <option value="date">สิ้นสุดตามวันที่</option>
                  <option value="count">สิ้นสุดหลังครบจำนวนรอบ</option>
                </select>
              </Field>
              {endMode === "date" && (
                <Field label="วันที่สิ้นสุด">
                  <input
                    name="routineEndDate"
                    type="date"
                    required
                    min={dueDate}
                    defaultValue={routine?.endDate || dueDate}
                  />
                </Field>
              )}
              {endMode === "count" && (
                <Field label="จำนวนรอบทั้งหมด">
                  <input
                    name="routineMaxOccurrences"
                    type="number"
                    min="2"
                    max="999"
                    required
                    defaultValue={routine?.maxOccurrences || 5}
                  />
                  <small>นับรวมงานรอบแรก</small>
                </Field>
              )}
            </div>
          </fieldset>
          <fieldset className="w-routine-group">
            <legend>6. การสร้างรอบถัดไป</legend>
            <div className="w-routine-fields">
              <Field label="สร้างเมื่อใด">
                <select
                  name="routineCreateMode"
                  value={createMode}
                  onChange={(e) =>
                    setCreateMode(e.target.value as "afterApproval" | "advance")
                  }
                >
                  <option value="afterApproval">
                    หลังผู้ตรวจอนุมัติรอบปัจจุบัน
                  </option>
                  <option value="advance">สร้างล่วงหน้าทันที</option>
                </select>
              </Field>
              {createMode === "advance" && (
                <Field label="สร้างล่วงหน้ากี่รอบ">
                  <input
                    name="routineAdvanceCount"
                    type="number"
                    min="2"
                    max="12"
                    required
                    defaultValue={routine?.advanceCount || 3}
                  />
                  <small>นับรวมรอบแรก สูงสุด 12 รอบต่อครั้ง</small>
                </Field>
              )}
            </div>
            <small>
              {createMode === "afterApproval"
                ? "ไม่มีงานรอบถัดไปจนกว่าผู้ตรวจจะอนุมัติสำเร็จ"
                : "ทีมจะเห็นงานหลายรอบทันที โดยแต่ละรอบมีสถานะแยกกัน"}
            </small>
          </fieldset>
          {task?.routine && (
            <fieldset className="w-routine-group">
              <legend>7. ใช้การแก้ไขกับ</legend>
              <div className="w-edit-scope">
                <label className="w-check">
                  <input
                    type="radio"
                    name="routineEditScope"
                    value="this"
                    defaultChecked
                  />
                  เฉพาะรอบนี้
                </label>
                <label className="w-check">
                  <input
                    type="radio"
                    name="routineEditScope"
                    value="following"
                  />
                  รอบนี้และรอบถัดไป
                </label>
                <label className="w-check">
                  <input type="radio" name="routineEditScope" value="series" />
                  ทั้งชุดงาน
                </label>
              </div>
              <small>งานที่ทำสำเร็จแล้วจะคงวันที่และประวัติเดิมเสมอ</small>
            </fieldset>
          )}
          <p className="w-routine-summary">
            <strong>สรุป:</strong>{" "}
            {routineLabel({
              frequency,
              interval,
              endDate: null,
              seriesId: "preview",
              weekdays,
              monthMode,
              monthDays,
            })}{" "}
            · วันครบกำหนดรอบแรก {displayDate(dueDate)}
          </p>
        </>
      )}
    </section>
  );
}

export default function Workspace() {
  const [state, setState] = useState<State>(emptyState);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actor, setActor] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<"owner" | "employee" | "">("");
  const [sessionEmployeeId, setSessionEmployeeId] = useState<string | null>(
    null,
  );
  const [permissions, setPermissions] = useState<EmployeePermission[]>([]);
  const [visibleDepartments, setVisibleDepartments] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<EmployeeAccount[]>([]);
  const [sopResults, setSopResults] = useState<Record<string, SopAttemptSummary>>({});
  const [needsLogin, setNeedsLogin] = useState(false);
  const [onlineEmployeeIds, setOnlineEmployeeIds] = useState<string[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [status, setStatus] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [month, setMonth] = useState(dateKey(new Date()).slice(0, 7));
  const [period, setPeriod] = useState("all");
  const [taskPeriod, setTaskPeriod] = useState("all");
  const [hideFutureRoutine, setHideFutureRoutine] = useState(true);
  const [dashboardUpcoming, setDashboardUpcoming] = useState(true);
  const [reportBranch, setReportBranch] = useState("");
  const [comment, setComment] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [deleteTaskIds, setDeleteTaskIds] = useState<string[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceMessage, setEvidenceMessage] = useState("");
  const [evidenceTooLarge, setEvidenceTooLarge] = useState(false);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupLatestAt, setBackupLatestAt] = useState<string | null>(null);
  const [backupError, setBackupError] = useState("");
  const [lineStatus, setLineStatus] = useState<LineStatus | null>(null);
  const [lineBusy, setLineBusy] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [font, setFont] = useState("medium");
  const [dark, setDark] = useState(false);
  const [sound, setSound] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const [legacy, setLegacy] = useState(false);
  const today = dateKey(new Date());
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setFont(localStorage.getItem("ole-work-font-size") || "medium");
        setDark(localStorage.getItem("ole-work-dark") === "true");
        setSound(localStorage.getItem("ole-work-sound") === "on");
        setLegacy(
          !!(
            localStorage.getItem("ole-work-employees") ||
            localStorage.getItem("ole-work-calendar") ||
            localStorage.getItem("ole-work-avatar")
          ),
        );
      } catch {}
    });
  }, []);
  useEffect(() => {
    document.documentElement.style.fontSize =
      font === "large" ? "20px" : font === "small" ? "16px" : "18px";
    return () => {
      document.documentElement.style.fontSize = "";
    };
  }, [font]);
  const play = async (kind: "click" | "success" | "fail") => {
    if (!sound) return;
    try {
      const ctx = audioRef.current ?? new AudioContext();
      audioRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      (kind === "success"
        ? [523, 659, 784, 1047]
        : kind === "fail"
          ? [220, 165]
          : [440]
      ).forEach((freq, i) => {
        const o = ctx.createOscillator(),
          g = ctx.createGain(),
          start = ctx.currentTime + i * 0.11;
        o.type = "square";
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.025, start);
        g.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(start);
        o.stop(start + 0.11);
      });
    } catch {}
  };
  const celebrate = () => {
    setCelebrating(false);
    requestAnimationFrame(() => setCelebrating(true));
    setTimeout(() => setCelebrating(false), 2200);
  };
  const notify = (message: string) => {
    setToast(message);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(""), 4500);
  };
  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const payload = (await response.json()) as {
        state: State;
        revision: number;
        actor: string;
        updatedAt: string | null;
        role: "owner" | "employee";
        employeeId?: string | null;
        permissions: "all" | EmployeePermission[];
        visibleDepartments: "all" | string[];
        accounts?: EmployeeAccount[];
        error?: string;
      };
      if (response.status === 401) {
        setNeedsLogin(true);
        setActor("");
        setSessionRole("");
        setSessionEmployeeId(null);
        setOnlineEmployeeIds([]);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลไม่สำเร็จ");
      validateState(payload.state);
      setNeedsLogin(false);
      setState(payload.state);
      setRevision(payload.revision);
      setActor(payload.actor);
      setSavedAt(payload.updatedAt);
      setSessionRole(payload.role);
      setSessionEmployeeId(payload.employeeId || null);
      setPermissions(
        payload.permissions === "all"
          ? [...menu.map((m) => m.id), ...sopAccessOptions.map((option) => option.id)]
          : payload.permissions,
      );
      setVisibleDepartments(payload.visibleDepartments === "all" ? payload.state.departments : payload.visibleDepartments);
      setAccounts(payload.accounts || []);
      if (
        payload.role === "owner" ||
        (payload.permissions as EmployeePermission[]).includes("sop")
      ) {
        try {
          const sopResponse = await fetch("/api/sop", { cache: "no-store" });
          const sopPayload = (await sopResponse.json()) as {
            attempts?: SopAttemptSummary[];
          };
          if (sopResponse.ok) {
            const latest: Record<string, SopAttemptSummary> = {};
            for (const attempt of sopPayload.attempts || []) {
              if (!latest[attempt.employeeId]) latest[attempt.employeeId] = attempt;
            }
            setSopResults(latest);
          }
        } catch {}
      } else {
        setSopResults({});
      }
      if (payload.role === "owner") void loadServiceStatus();
      if (
        payload.role === "employee" &&
        view !== "farm" &&
        !(payload.permissions as EmployeePermission[]).includes(view)
      )
        setView((payload.permissions as EmployeePermission[]).find((permission): permission is View => menu.some((item) => item.id === permission)) || "tasks");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "ไม่สามารถเชื่อมต่อระบบข้อมูลได้",
      );
    } finally {
      setLoading(false);
    }
  }
  async function loadServiceStatus() {
    try {
      const [backupResponse, lineResponse] = await Promise.all([
        fetch("/api/backups", { cache: "no-store" }),
        fetch("/api/notifications/line", { cache: "no-store" }),
      ]);
      const backupPayload = (await backupResponse.json()) as {
        backups?: BackupEntry[];
        latestAt?: string | null;
        error?: string;
      };
      if (backupResponse.ok) {
        setBackups(backupPayload.backups || []);
        setBackupLatestAt(backupPayload.latestAt || null);
        setBackupError("");
      } else setBackupError(backupPayload.error || "ตรวจข้อมูลสำรองไม่สำเร็จ");
      const linePayload = (await lineResponse.json()) as LineStatus & { error?: string };
      if (lineResponse.ok) {
        setLineStatus(linePayload);
        if (linePayload.connected) void runLineAlerts("run", true);
      }
    } catch {
      setBackupError("ตรวจสถานะสำรองข้อมูลไม่สำเร็จ");
    }
  }
  async function loadPresence() {
    try {
      const response = await fetch("/api/presence", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { employeeIds?: string[] };
      setOnlineEmployeeIds(payload.employeeIds || []);
    } catch {}
  }
  async function runLineAlerts(action: "run" | "test", silent = false) {
    if (lineBusy) return;
    if (!silent) setLineBusy(true);
    try {
      const response = await fetch("/api/notifications/line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as {
        sent?: number;
        missingTarget?: number;
        latestSentAt?: string | null;
        error?: string;
      };
      if (!response.ok) {
        if (!silent) throw new Error(payload.error || "ส่ง LINE ไม่สำเร็จ");
        return;
      }
      setLineStatus((current) =>
        current
          ? { ...current, latestSentAt: payload.latestSentAt || current.latestSentAt }
          : current,
      );
      if (!silent)
        notify(
          action === "test"
            ? "ส่งข้อความทดสอบ LINE แล้ว"
            : `ส่งแจ้งเตือน ${payload.sent || 0} งาน${payload.missingTarget ? ` · ไม่มีปลายทาง ${payload.missingTarget} งาน` : ""}`,
        );
    } catch (error) {
      if (!silent)
        setError(error instanceof Error ? error.message : "ส่ง LINE ไม่สำเร็จ");
    } finally {
      if (!silent) setLineBusy(false);
    }
  }
  useEffect(() => {
    queueMicrotask(() => void load());
  }, []);
  useEffect(() => {
    if (!sessionRole) return;
    queueMicrotask(() => void loadPresence());
    const heartbeat = window.setInterval(() => void loadPresence(), 45000);
    return () => window.clearInterval(heartbeat);
  }, [sessionRole]);
  const isOwner = sessionRole === "owner",
    currentEmployee = state.employees.find(
      (employee) => employee.id === sessionEmployeeId,
    ),
    onlineEmployees = state.employees.filter(
      (employee) =>
        employee.active && onlineEmployeeIds.includes(employee.id),
    ),
    visibleMenu = isOwner
      ? menu
      : sessionRole === "employee"
        ? menu.filter((m) => m.id === "farm" || permissions.includes(m.id))
        : [];
  async function employeeLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const response = await fetch("/api/employee-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginId: String(f.get("loginId")),
          password: String(f.get("password")),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || "เข้าสู่ระบบไม่สำเร็จ");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function logoutEmployee() {
    setBusy(true);
    await fetch("/api/employee-auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    setState(emptyState());
    setActor("");
    setOnlineEmployeeIds([]);
    setSessionRole("");
    setSessionEmployeeId(null);
    setVisibleDepartments([]);
    setNeedsLogin(true);
    setBusy(false);
  }
  async function saveAccount(employeeId: string, form: FormData) {
    const active = form.get("accountActive") === "on",
      loginId = String(form.get("loginId") || ""),
      password = String(form.get("password") || ""),
      accountPermissions = form.getAll("menuPermission").map(String),
      visibleDepartments = form.getAll("visibleDepartment").map(String);
    if (!active && !loginId) return true;
    const response = await fetch("/api/employees/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        loginId,
        password: password || undefined,
        permissions: accountPermissions,
        visibleDepartments,
        active,
      }),
    });
    const payload = (await response.json()) as EmployeeAccount & {
      error?: string;
    };
    if (!response.ok) {
      setError(payload.error || "บันทึกบัญชีพนักงานไม่สำเร็จ");
      return false;
    }
    setAccounts((current) => [
      ...current.filter((a) => a.employeeId !== employeeId),
      payload,
    ]);
    return true;
  }
  async function save(
    next: State,
    action: string,
    kind: "success" | "fail" = "success",
  ) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      validateState(next);
      let url = "/api/workspace",
        body: unknown = { state: next, revision, action };
      if (sessionRole === "employee") {
        const created = next.tasks.filter(
            (task) => !state.tasks.some((current) => current.id === task.id),
          ),
          removed = state.tasks.filter(
            (task) => !next.tasks.some((current) => current.id === task.id),
          ),
          changedTasks = next.tasks.filter(
          (t) =>
            state.tasks.some((current) => current.id === t.id) &&
            JSON.stringify(t) !==
              JSON.stringify(state.tasks.find((x) => x.id === t.id)),
          );
        if (removed.length)
          throw new Error("เฉพาะผู้ดูแลเท่านั้นที่ลบงานได้");
        url = "/api/tasks/action";
        if (created.length) {
          if (changedTasks.length || !created[0])
            throw new Error("กรุณาสร้างหรือแก้ไขงานทีละรายการ");
          body = {
            task: created[0],
            revision,
            action,
            intent: "create",
          };
        } else if (changedTasks.length === 1) {
          body = { task: changedTasks[0], revision, action };
        } else
          throw new Error(
            "มุมมองพนักงานแก้ไขได้เฉพาะงานของตนเองครั้งละหนึ่งรายการ",
          );
      }
      const response = await fetch(url, {
        method: url === "/api/workspace" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        state: State;
        revision: number;
        actor: string;
        updatedAt: string | null;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "บันทึกไม่สำเร็จ");
      setState(payload.state);
      setRevision(payload.revision);
      setSavedAt(payload.updatedAt);
      notify(action + " — บันทึกแล้ว");
      void play(kind);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
      void play("fail");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const [avatarSaved, setAvatarSaved] = useState("");
  async function saveAvatar(employeeId: string, avatar: AvatarV3) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setAvatarSaved("");
    try {
      const response = await fetch("/api/employees/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, avatar, revision }),
      });
      const payload = (await response.json()) as {
        state: State;
        revision: number;
        updatedAt: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "บันทึก Avatar ไม่สำเร็จ");
      validateState(payload.state);
      setState(payload.state);
      setRevision(payload.revision);
      setSavedAt(payload.updatedAt);
      setAvatarSaved("บันทึก Avatar ลงระบบแล้ว");
      notify("บันทึก Avatar แล้ว");
      void play("success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึก Avatar ไม่สำเร็จ");
      void play("fail");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const go = (v: View) => {
    if (!isOwner && !permissions.includes(v)) return;
    setView(v);
    setProfileId(null);
    setTaskId(null);
    setDrawer(false);
    setQuery("");
    setStatus("");
    setEmployeeFilter("");
    setBranch("");
    setTaskPeriod("all");
    setSelectedTaskIds([]);
    setEvidenceFiles([]);
    window.scrollTo({ top: 0 });
  };
  const people = (id: string) => state.employees.find((e) => e.id === id);
  const currentTask = state.tasks.find((t) => t.id === taskId);
  const evidenceShareMessage = currentTask
    ? `⚠️ แจ้งเตือน: ไฟล์ที่ ${people(currentTask.assigneeId)?.name || "ผู้รับผิดชอบ"} แนบในงาน "${currentTask.title}" มีขนาดใหญ่เกินกำหนด\n(ไฟล์ละไม่เกิน 10MB / รวมไม่เกิน 30MB) หากไม่สะดวกย่อขนาดไฟล์เอง\nกรุณาแจ้งทีมในกลุ่มนี้เพื่อขอความช่วยเหลือ`
    : "";
  const canActOnCurrentTask = Boolean(
    currentTask &&
      (isOwner ||
        sessionEmployeeId === currentTask.assigneeId ||
        sessionEmployeeId === currentTask.reviewerId),
  );
  const profile = state.employees.find((e) => e.id === profileId);
  const avatarEmployee = state.employees.find((e) => e.id === avatarId);
  const activePeople = state.employees.filter((e) => e.active);
  const routineCutoff = addDays(today, 14);
  const selectedTasks = state.tasks.filter(
    (t) =>
      (!query ||
        (t.title + " " + people(t.assigneeId)?.name)
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!branch || people(t.assigneeId)?.branch === branch) &&
      (!employeeFilter || t.assigneeId === employeeFilter) &&
      (!status ||
        (status === "overdue" ? late(t, today) : t.status === status)) &&
      (taskPeriod === "all" || t.dueDate.slice(0, 7) === taskPeriod) &&
      (!hideFutureRoutine || !t.routine || t.dueDate <= routineCutoff),
  );
  const reportTasks = state.tasks.filter(
    (t) =>
      (!reportBranch || people(t.assigneeId)?.branch === reportBranch) &&
      (period === "all" ||
        t.dueDate.slice(0, 7) ===
          (period === "month" ? today.slice(0, 7) : period)),
  );
  const chartMonth =
    period === "all" || period === "month" ? today.slice(0, 7) : period;
  const dashboardFocusTasks = state.tasks.filter(
    (task) => task.status !== "สำเร็จ" && task.dueDate <= routineCutoff,
  );
  const metricTasks = view === "reports" ? reportTasks : state.tasks;
  const totals = metrics(metricTasks, today);
  const branchPerformance: PerformanceRow[] = state.branches.map((label) => ({
    label,
    ...metrics(
      metricTasks.filter((task) => people(task.assigneeId)?.branch === label),
      today,
    ),
  }));
  const employeePerformance: PerformanceRow[] = state.employees.map((employee) => ({
    label: employee.name,
    ...metrics(
      metricTasks.filter((task) => task.assigneeId === employee.id),
      today,
    ),
  }));
  function exportTasks(tasks: Task[]) {
    const rows = [
      [
        "รหัสงาน",
        "ชื่องาน",
        "ผู้รับผิดชอบ",
        "ผู้ตรวจ",
        "สาขาปัจจุบัน",
        "วันครบกำหนด",
        "รูปแบบงาน",
        "สถานะ",
        "วันที่สำเร็จ",
      ],
      ...tasks.map((t) => [
        t.id,
        t.title,
        people(t.assigneeId)?.name,
        people(t.reviewerId)?.name,
        people(t.assigneeId)?.branch,
        t.dueDate,
        routineLabel(t.routine),
        t.status,
        t.completedAt || "",
      ]),
    ];
    download(
      "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
      "ole-work-" + today + ".csv",
      "text/csv;charset=utf-8",
    );
    notify("ส่งออกรายการตามตัวกรองแล้ว");
  }
  async function changeStatus(task: Task, next: Status) {
    try {
      if (next === "ต้องแก้ไข") {
        const reason = prompt("ระบุสิ่งที่ต้องแก้ไข (จะบันทึกในความคิดเห็น)");
        if (!reason?.trim()) return;
        task = {
          ...task,
          comments: [
            ...task.comments,
            {
              id: uid(),
              text: reason.trim(),
              at: new Date().toISOString(),
              author: actor,
            },
          ],
        };
      }
      const updated = transition(task, next);
      const tasks = state.tasks.map((t) => (t.id === task.id ? updated : t));
      let action = `${task.title}: ${next}`;
      if (next === "สำเร็จ" && updated.routine) {
        const source =
          updated.routine.createMode === "advance"
            ? [...tasks]
                .filter(
                  (t) => t.routine?.seriesId === updated.routine?.seriesId,
                )
                .sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0] ||
              updated
            : updated;
        const nextTask = buildNextRoutineTask(source, uid());
        if (
          nextTask &&
          !tasks.some(
            (t) =>
              t.id !== updated.id &&
              t.routine?.seriesId === updated.routine?.seriesId &&
              t.dueDate === nextTask.dueDate,
          )
        ) {
          if (tasks.length >= 5000)
            throw new Error("รายการงานเต็มแล้ว ไม่สามารถสร้างรอบถัดไปได้");
          tasks.push(nextTask);
          action += ` · สร้างรอบถัดไป ${displayDate(nextTask.dueDate)}`;
        }
      }
      if (
        await save(
          { ...state, tasks },
          action,
          next === "ต้องแก้ไข" ? "fail" : "success",
        )
      ) {
        if (next === "สำเร็จ") celebrate();
      }
    } catch (e) {
      setError((e as Error).message);
      void play("fail");
    }
  }
  async function quickSubmitTask(task: Task) {
    const incomplete = task.checklist.filter((item) => !item.done).length;
    if (
      incomplete > 0 &&
      !confirm(
        `Checklist ยังไม่ครบ ${incomplete} รายการ ต้องการส่งตรวจทันทีต่อหรือไม่?`,
      )
    )
      return;
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/tasks/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: { ...task, status: "รอตรวจ" },
          revision,
          action: "ส่งงานทันที: " + task.title,
          intent: "quickSubmit",
        }),
      });
      const payload = (await response.json()) as {
        state: State;
        revision: number;
        updatedAt: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || "ส่งงานทันทีไม่สำเร็จ");
      validateState(payload.state);
      setState(payload.state);
      setRevision(payload.revision);
      setSavedAt(payload.updatedAt);
      notify("ส่งงานเข้าคิวตรวจแล้ว");
      void play("success");
    } catch (error) {
      setError(error instanceof Error ? error.message : "ส่งงานทันทีไม่สำเร็จ");
      void play("fail");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function uploadEvidence(task: Task, selectedFiles = evidenceFiles) {
    if (!selectedFiles.length || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setEvidenceTooLarge(false);
    setEvidenceMessage(`กำลังอัปโหลด ${selectedFiles.length} ไฟล์…`);
    try {
      const preparedFiles: File[] = [];
      for (const file of selectedFiles)
        preparedFiles.push(await prepareEvidenceFile(file));
      const oversized = preparedFiles.find(
        (file) => file.size > MAX_EVIDENCE_FILE_SIZE,
      );
      if (oversized) {
        setEvidenceTooLarge(true);
        throw new Error(
          `ไฟล์ ${oversized.name} ยังใหญ่เกิน 10 MB กรุณาเลือกรูปขนาดปกติหรือถ่ายภาพหน้าจอแล้วแนบใหม่`,
        );
      }
      if (
        preparedFiles.reduce((total, file) => total + file.size, 0) >
        MAX_EVIDENCE_TOTAL_SIZE
      ) {
        setEvidenceTooLarge(true);
        throw new Error("ไฟล์รวมใหญ่เกิน 30 MB กรุณาแบ่งแนบเป็น 2 ครั้ง");
      }
      const form = new FormData();
      form.set("taskId", task.id);
      form.set("revision", String(revision));
      for (const file of preparedFiles) form.append("files", file);
      const response = await fetch("/api/tasks/evidence", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        taskId?: string;
        attachments?: NonNullable<Task["attachments"]>;
        revision?: number;
        updatedAt?: string;
        error?: string;
      };
      if (response.status === 413) setEvidenceTooLarge(true);
      if (!response.ok) throw new Error(payload.error || "แนบหลักฐานไม่สำเร็จ");
      if (
        payload.taskId !== task.id ||
        !Array.isArray(payload.attachments) ||
        !Number.isSafeInteger(payload.revision) ||
        !payload.updatedAt
      )
        throw new Error("บันทึกไฟล์แล้วแต่รับข้อมูลยืนยันไม่ครบ กรุณาโหลดล่าสุด");
      const attachments = payload.attachments;
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((item) =>
          item.id === task.id ? { ...item, attachments } : item,
        ),
      }));
      setRevision(payload.revision!);
      setSavedAt(payload.updatedAt);
      setEvidenceFiles([]);
      setEvidenceMessage(
        `อัปโหลดสำเร็จ ${preparedFiles.length} ไฟล์ และบันทึกเป็นหลักฐานแล้ว`,
      );
      notify(`แนบหลักฐาน ${preparedFiles.length} ไฟล์แล้ว`);
      void play("success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "แนบหลักฐานไม่สำเร็จ";
      setEvidenceFiles(selectedFiles);
      setEvidenceMessage("อัปโหลดไม่สำเร็จ ไฟล์ยังอยู่ในรายการ กด ‘ลองอัปโหลดอีกครั้ง’ ได้");
      setError(message);
      void play("fail");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function deleteTasks(ids: string[]) {
    if (!isOwner || !ids.length) return;
    const idSet = new Set(ids);
    const names = state.tasks.filter((task) => idSet.has(task.id));
    const action =
      names.length === 1
        ? "ลบงาน: " + names[0].title
        : `ลบงานที่เลือก ${names.length} งาน`;
    if (
      await save(
        { ...state, tasks: state.tasks.filter((task) => !idSet.has(task.id)) },
        action,
      )
    ) {
      setSelectedTaskIds((current) => current.filter((id) => !idSet.has(id)));
      if (taskId && idSet.has(taskId)) setTaskId(null);
      setDeleteTaskIds([]);
    }
  }
  function openTask(id: string) {
    setTaskId(id);
    setProfileId(null);
    setView("tasks");
    setComment("");
    setEvidenceFiles([]);
  }
  const filteredLink = (s: string) => {
    go("tasks");
    setStatus(s);
    if (view === "reports") {
      setBranch(reportBranch);
      setTaskPeriod(period === "month" ? today.slice(0, 7) : period);
    }
  };
  function cards(tasks: Task[], selectable = false) {
    return tasks.length ? (
      <div className="w-task-grid">
        {tasks.map((t) => {
          const checked = selectedTaskIds.includes(t.id);
          return (
            <article
              key={t.id}
              className={`w-task-card ${checked ? "selected" : ""}`}
            >
              {selectable && isOwner && (
                <label
                  className="w-task-select"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      setSelectedTaskIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, t.id])]
                          : current.filter((id) => id !== t.id),
                      )
                    }
                  />
                  <span>เลือกงานนี้</span>
                </label>
              )}
              <button className="w-task" onClick={() => openTask(t.id)}>
                <div className="w-task-tags">
                  <span className={"w-status s" + statuses.indexOf(t.status)}>
                    {t.status}
                  </span>
                  {late(t, today) && <span className="w-late">เกินกำหนด</span>}
                  {t.routine && (
                    <span className="w-routine">
                      ↻ {routineLabel(t.routine)}
                    </span>
                  )}
                  <small>{t.priority}</small>
                </div>
                <h3>{t.title}</h3>
                <p className="av-task-assignee">
                  {people(t.assigneeId)?.avatar && (
                    <PixelEmployeeAvatar
                      size="small"
                      config={people(t.assigneeId)!.avatar!}
                      label={"ผู้รับผิดชอบ " + people(t.assigneeId)!.name}
                    />
                  )}{" "}
                  {people(t.assigneeId)?.name} · {people(t.assigneeId)?.branch}
                </p>
                <footer>
                  <span>ครบกำหนด {displayDate(t.dueDate)}</span>
                  <span>
                    {t.checklist.filter((c) => c.done).length}/
                    {t.checklist.length} ขั้นตอน
                  </span>
                </footer>
              </button>
            </article>
          );
        })}
      </div>
    ) : (
      <Empty>ไม่มีงานตรงกับตัวเลือกนี้</Empty>
    );
  }
  const busyLabel = busy ? "กำลังบันทึก…" : "บันทึก";
  async function deleteOrganization(
    field: "branches" | "departments",
    name: string,
  ) {
    const label = field === "branches" ? "สาขา" : "ฝ่าย/ตำแหน่ง";
    if (
      state.employees.some(
        (e) => (field === "branches" ? e.branch : e.department) === name,
      )
    ) {
      setError(
        `ยังลบ${label} “${name}” ไม่ได้ เพราะมีพนักงานใช้งานอยู่ กรุณาย้ายพนักงานก่อน`,
      );
      return;
    }
    if (state[field].length <= 1) {
      setError(`ต้องเหลือ${label}อย่างน้อย 1 รายการ`);
      return;
    }
    if (confirm(`ลบ${label} “${name}” ออกจากตัวเลือก?`))
      await save(
        { ...state, [field]: state[field].filter((x) => x !== name) },
        "ลบ" + label + ": " + name,
      );
  }
  async function importLegacy() {
    try {
      const rawEmployees = JSON.parse(
        localStorage.getItem("ole-work-employees") || "[]",
      );
      const rawEvents = JSON.parse(
        localStorage.getItem("ole-work-calendar") || "[]",
      );
      if (!Array.isArray(rawEmployees) || !Array.isArray(rawEvents))
        throw new Error("รูปแบบข้อมูลเก่าไม่ถูกต้อง");
      const next = structuredClone(state);
      let count = 0;
      for (const e of rawEmployees) {
        if (
          typeof e.name !== "string" ||
          !e.name.trim() ||
          typeof e.role !== "string" ||
          !next.branches.includes(e.branch) ||
          !next.departments.includes(e.dept)
        )
          continue;
        if (
          next.employees.some(
            (x) => x.name === e.name.trim() && x.branch === e.branch,
          )
        )
          continue;
        next.employees.push({
          id: uid(),
          name: e.name.trim(),
          role: e.role,
          department: e.dept,
          branch: e.branch,
          active: true,
        });
        count++;
      }
      for (const e of rawEvents) {
        if (next.events.some((x) => x.date === e.date && x.title === e.title))
          continue;
        next.events.push({
          id: uid(),
          date: e.date,
          title: e.title,
          time: e.time || "09:00",
          important: !!e.important,
          color: ["yellow", "blue", "pink", "green", "purple"].includes(e.color)
            ? e.color
            : "yellow",
        });
        count++;
      }
      const legacyAvatar = JSON.parse(
        localStorage.getItem("ole-work-avatar") || "null",
      );
      const mint = next.employees.find((e) => e.name === "มิ้นท์");
      if (legacyAvatar && mint && !mint.avatar) {
        mint.avatar = normalizePresetAvatar(legacyAvatar);
        count++;
      }
      validateState(next);
      if (!count) {
        notify("ไม่มีรายการใหม่ที่ต้องนำเข้า");
        return;
      }
      if (
        !confirm(
          `นำเข้ารายการเดิม ${count} รายการ? ไม่ลบข้อมูลเดิมและไม่ย้ายคะแนนสมมติ`,
        )
      )
        return;
      await save(next, "นำเข้าข้อมูลจากเครื่องเดิม");
    } catch (e) {
      setError("นำเข้าไม่สำเร็จ: " + (e as Error).message);
    }
  }

  return (
    <div
      className={"work-v2 " + (dark ? "w-dark" : "")}
      onClickCapture={(e) => {
        const button = (e.target as HTMLElement).closest("button");
        if (button && !button.disabled && button.dataset.sound !== "none")
          void play("click");
      }}
    >
      {celebrating && (
        <div
          className="w-celebration"
          role="status"
          aria-label="ผ่านด่าน งานสำเร็จ"
        >
          <strong>ผ่านด่าน!</strong>
          <div className="w-firework" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <i key={i} style={{ "--i": i } as CSSProperties} />
            ))}
          </div>
        </div>
      )}
      {deleteTaskIds.length > 0 && (
        <DeleteTasksDialog
          count={deleteTaskIds.length}
          busy={busy}
          close={() => setDeleteTaskIds([])}
          confirmDelete={() => void deleteTasks(deleteTaskIds)}
        />
      )}
      <aside className={"w-sidebar " + (drawer ? "w-open" : "")}>
        <button
          className="w-brand"
          onClick={() => go(visibleMenu[0]?.id || "tasks")}
        >
          <img src="/ole-profile.png" alt="มาสคอต OLE" />
          <span>
            <b>OLE WORK</b>
            <small>งานชัดเจน ทีมไปด้วยกัน</small>
          </span>
        </button>
        <nav>
          {visibleMenu.map((m) => (
            <button
              key={m.id}
              className={view === m.id ? "active" : ""}
              onClick={() => go(m.id)}
            >
              <i>{m.icon}</i>
              {m.label}
              {m.id === "tasks" && <em>{state.tasks.length}</em>}
            </button>
          ))}
        </nav>
        <div className="w-owner">
          <strong>{isOwner ? "พื้นที่ของผู้ดูแล" : "มุมมองพนักงาน"}</strong>
          {!isOwner && currentEmployee ? (
            <div className="w-current-employee">
              <span className="w-current-avatar">
                <PixelEmployeeAvatar
                  config={currentEmployee.avatar || defaultAvatar}
                  size="small"
                  label={`โปรไฟล์ของ ${currentEmployee.name}`}
                />
                <i aria-hidden="true" />
              </span>
              <span>
                <b>{currentEmployee.name}</b>
                <small>{currentEmployee.role}</small>
              </span>
            </div>
          ) : (
            <small>{actor || "ต้องเข้าสู่ระบบ"}</small>
          )}
          <p>
            {isOwner
              ? "ข้อมูลกลางของร้าน"
              : "เห็นเฉพาะเมนูและงานที่ได้รับสิทธิ์"}
          </p>
          {sessionRole === "employee" && sessionEmployeeId && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setAvatarSaved("");
                setAvatarId(sessionEmployeeId);
              }}
            >
              เลือกตัวละครของฉัน
            </button>
          )}
          {sessionRole === "employee" && (
            <button type="button" onClick={() => void logoutEmployee()}>
              ออกจากระบบ
            </button>
          )}
        </div>
      </aside>
      {drawer && (
        <button
          className="w-scrim"
          aria-label="ปิดเมนู"
          onClick={() => setDrawer(false)}
        />
      )}
      <div className="w-main">
        <header className="w-top">
          <div>
            <button
              className="w-menu-button"
              aria-label="เปิดเมนู"
              onClick={() => setDrawer(true)}
            >
              ☰
            </button>
            <h1>{menu.find((m) => m.id === view)?.label}</h1>
            <span className="w-data-label">
              {state.sample ? "ข้อมูลตัวอย่าง" : "ข้อมูลจากรายการจริง"}
            </span>
          </div>
          <div className="w-top-actions">
            <div className="w-fonts" role="group" aria-label="ขนาดตัวอักษร">
              {[
                ["small", "เล็ก"],
                ["medium", "กลาง"],
                ["large", "ใหญ่"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  aria-pressed={font === v}
                  onClick={() => {
                    setFont(v);
                    try {
                      localStorage.setItem("ole-work-font-size", v);
                    } catch {}
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              aria-label={sound ? "ปิดเสียง" : "เปิดเสียง"}
              title={sound ? "ปิดเสียง" : "เปิดเสียง"}
              onClick={() => {
                setSound(!sound);
                try {
                  localStorage.setItem("ole-work-sound", !sound ? "on" : "off");
                } catch {}
              }}
            >
              {sound ? "🔊" : "🔇"}
            </button>
            <button
              disabled={loading || busy}
              onClick={() => {
                if (
                  (dialog || taskId) &&
                  !confirm("โหลดข้อมูลใหม่? ข้อความที่ยังไม่บันทึกอาจหาย")
                )
                  return;
                setDialog(null);
                setTaskId(null);
                void load();
              }}
            >
              ↻ โหลดล่าสุด
            </button>
          </div>
        </header>
        <div className="w-content">
          <div className="w-sync" role="status">
            {busy
              ? "กำลังบันทึกข้อมูลกลาง…"
              : savedAt
                ? "บันทึกล่าสุด " +
                  new Date(savedAt).toLocaleString("th-TH", {
                    timeZone: "Asia/Bangkok",
                  })
                : "ยังไม่มีรายการบันทึก"}
            {state.sample && <b>ตัวอย่างสำหรับทดลอง ไม่ใช่ผลการทำงานจริง</b>}
          </div>
          {error && (
            <div className="w-error" role="alert">
              {error}
              <span> กรุณาคัดลอกข้อความที่ยังไม่บันทึกไว้ก่อนโหลดใหม่</span>
              <button
                onClick={() => setError("")}
                aria-label="ปิดข้อความผิดพลาด"
              >
                ×
              </button>
            </div>
          )}
          {toast && (
            <div className="w-toast" role="status">
              {toast}
            </div>
          )}
          {loading ? (
            <Empty>กำลังโหลดข้อมูล…</Empty>
          ) : needsLogin ? (
            <section className="w-login">
              <img src="/ole-profile.png" alt="มาสคอต OLE" />
              <div>
                <small>OLE WORK / EMPLOYEE</small>
                <h2>เข้าสู่มุมมองพนักงาน</h2>
                <p>ใช้ไอดีและรหัสผ่านที่ผู้ดูแลตั้งให้</p>
                <form onSubmit={employeeLogin}>
                  <Field label="ไอดีพนักงาน">
                    <input
                      name="loginId"
                      required
                      minLength={4}
                      maxLength={32}
                      autoComplete="username"
                    />
                  </Field>
                  <Field label="รหัสผ่าน">
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={8}
                      maxLength={72}
                      autoComplete="current-password"
                    />
                  </Field>
                  <button className="w-primary" disabled={busy}>
                    {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
                  </button>
                </form>
                <a href="/signin-with-chatgpt?return_to=/" target="_top">
                  ผู้ดูแลเข้าสู่ระบบด้วย ChatGPT
                </a>
              </div>
            </section>
          ) : !actor ? (
            <Empty>
              <p>ยังเข้าใช้ข้อมูลกลางไม่ได้</p>
              <button onClick={() => void load()}>ลองโหลดใหม่</button>
            </Empty>
          ) : (
            <>
              {state.employees.length === 0 && view !== "settings" && (
                <div className="w-start">
                  <img src="/ole-profile.png" alt="" />
                  <div>
                    <h2>เริ่มจากรายชื่อทีม แล้วค่อยมอบหมายงาน</h2>
                    <p>
                      ยังไม่มีข้อมูลกลาง{" "}
                      {legacy
                        ? "พบข้อมูลเดิมในเครื่องนี้ สามารถนำเข้าได้โดยไม่ลบต้นฉบับ"
                        : "ตัวเลขจะเกิดจากงานที่บันทึกจริง ไม่มีคะแนนสมมติ"}
                    </p>
                    <button
                      className="w-primary"
                      onClick={() => setDialog({ kind: "employee" })}
                    >
                      ＋ เพิ่มพนักงาน
                    </button>
                    {legacy && (
                      <button
                        disabled={busy}
                        onClick={() => void importLegacy()}
                      >
                        นำเข้าข้อมูลเดิม
                      </button>
                    )}
                    <button onClick={() => go("settings")}>
                      ข้อมูลตัวอย่าง / สำรองข้อมูล
                    </button>
                  </div>
                </div>
              )}

              {(view === "dashboard" || view === "reports") && (
                <>
                  <div className="w-heading">
                    <div>
                      <small>
                        {view === "reports"
                          ? "TEAM PERFORMANCE"
                          : "MISSION CONTROL"}
                      </small>
                      <h2>
                        {view === "reports"
                          ? "ผลงานที่ตรวจสอบย้อนกลับได้"
                          : "ภาพรวมงานของทุกสาขา"}
                      </h2>
                      <p>เวลาไทย · {displayDate(today)}</p>
                    </div>
                    {view === "dashboard" ? (
                      <button
                        className="w-primary"
                        disabled={!activePeople.length}
                        onClick={() => setDialog({ kind: "task" })}
                      >
                        ＋ สร้างงาน
                      </button>
                    ) : (
                      <button onClick={() => exportTasks(reportTasks)}>
                        ↓ ส่งออก CSV
                      </button>
                    )}
                  </div>
                  {view === "reports" && (
                    <div className="w-filters">
                      <Field label="ช่วงครบกำหนด">
                        <select
                          value={period}
                          onChange={(e) => setPeriod(e.target.value)}
                        >
                          <option value="all">ทุกช่วงเวลา</option>
                          <option value="month">เดือนนี้</option>
                          {Array.from(
                            new Set(
                              state.tasks.map((t) => t.dueDate.slice(0, 7)),
                            ),
                          )
                            .sort()
                            .reverse()
                            .map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="สาขาของผู้รับผิดชอบปัจจุบัน">
                        <select
                          value={reportBranch}
                          onChange={(e) => setReportBranch(e.target.value)}
                        >
                          <option value="">ทุกสาขา</option>
                          {state.branches.map((b) => (
                            <option key={b}>{b}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  )}
                  {view === "dashboard" && (
                    <div className="w-dashboard-scope" role="group" aria-label="ช่วงงานในภาพรวม">
                      <button
                        type="button"
                        className={dashboardUpcoming ? "active" : ""}
                        onClick={() => setDashboardUpcoming(true)}
                      >
                        งานเปิดถึงกำหนดภายใน 2 สัปดาห์
                        <strong>{dashboardFocusTasks.length}</strong>
                      </button>
                      <button
                        type="button"
                        className={!dashboardUpcoming ? "active" : ""}
                        onClick={() => setDashboardUpcoming(false)}
                      >
                        งานทั้งหมด
                        <strong>{state.tasks.length}</strong>
                      </button>
                    </div>
                  )}
                  <div className="w-kpis">
                    {[
                      [
                        view === "dashboard" && dashboardUpcoming
                          ? "งานเปิดที่ถึงกำหนดเร็ว ๆ นี้"
                          : "งานทั้งหมด",
                        view === "dashboard" && dashboardUpcoming
                          ? dashboardFocusTasks.length
                          : totals.total,
                        "",
                      ],
                      ["สำเร็จ", totals.done, "สำเร็จ"],
                      ["รอตรวจ", totals.review, "รอตรวจ"],
                      ["เกินกำหนด", totals.overdue, "overdue"],
                    ].map(([label, value, s], i) => (
                      <button
                        key={label}
                        className={"w-kpi k" + i}
                        onClick={() => {
                          filteredLink(String(s));
                          if (view === "reports") {
                            setBranch(reportBranch);
                          }
                        }}
                      >
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <small>เปิดรายการงาน →</small>
                      </button>
                    ))}
                  </div>
                  <div className="w-report-grid">
                    <Panel title="สถานะงาน">
                      <StatusDonut tasks={metricTasks} />
                    </Panel>
                    <Panel title="คุณภาพการส่งงาน">
                      <QualityRings tasks={metricTasks} today={today} />
                      <p className="w-muted">
                        ยังไม่มีงานเป็นตัวหารจะแสดง “—”
                        วันที่สำเร็จบันทึกเมื่ออนุมัติงาน ไม่ใช่วันที่กดส่งตรวจ
                      </p>
                    </Panel>
                  </div>
                  {view === "dashboard" && (
                    <div className="w-dashboard-charts">
                      <Panel title={`แนวโน้มงานครบกำหนด · ${today.slice(0, 7)}`}>
                        <DueTrend tasks={state.tasks} month={today.slice(0, 7)} />
                      </Panel>
                      <Panel title="ผลงานตามสาขา">
                        <PerformanceBars rows={branchPerformance} emptyText="ยังไม่มีงานสำหรับเปรียบเทียบสาขา" />
                      </Panel>
                      <Panel title="ภาระงานรายพนักงาน">
                        <PerformanceBars rows={employeePerformance} emptyText="ยังไม่มีงานสำหรับเปรียบเทียบพนักงาน" />
                        <p className="w-muted">เรียงตามงานคงค้าง แสดงสูงสุด 8 คน เพื่อให้อ่านง่ายบนมือถือ</p>
                      </Panel>
                    </div>
                  )}
                  {view === "reports" ? (
                    <>
                      <Panel title={"งานครบกำหนด · " + chartMonth}>
                        <div className="w-week-bars">
                          {Array.from({ length: 5 }, (_, i) => {
                            const subset = reportTasks.filter(
                              (t) =>
                                t.dueDate.slice(0, 7) === chartMonth &&
                                Math.floor(
                                  (Number(t.dueDate.slice(8)) - 1) / 7,
                                ) === i,
                            );
                            return (
                              <div key={i}>
                                <div
                                  style={{
                                    height: Math.max(
                                      2,
                                      (subset.length /
                                        Math.max(
                                          1,
                                          ...Array.from(
                                            { length: 5 },
                                            (_, j) =>
                                              reportTasks.filter(
                                                (t) =>
                                                  t.dueDate.slice(0, 7) ===
                                                    chartMonth &&
                                                  Math.floor(
                                                    (Number(
                                                      t.dueDate.slice(8),
                                                    ) -
                                                      1) /
                                                      7,
                                                  ) === j,
                                              ).length,
                                          ),
                                        )) *
                                        130,
                                    ),
                                  }}
                                >
                                  <b>{subset.length}</b>
                                </div>
                                <span>
                                  {i * 7 + 1}–
                                  {Math.min(
                                    (i + 1) * 7,
                                    new Date(
                                      Number(chartMonth.slice(0, 4)),
                                      Number(chartMonth.slice(5, 7)),
                                      0,
                                    ).getDate(),
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <p className="w-muted">
                          จำนวนงานตามวันครบกำหนดในเดือนที่เลือก
                          (ทุกช่วงเวลาใช้เดือนปัจจุบัน)
                        </p>
                      </Panel>
                      <Panel title="ผลการทำงานตามสาขา">
                        <div className="w-table">
                          <table>
                            <thead>
                              <tr>
                                <th>สาขา</th>
                                <th>งาน</th>
                                <th>สำเร็จ</th>
                                <th>คงค้าง</th>
                                <th>เกินกำหนด</th>
                                <th>ตรงเวลา</th>
                              </tr>
                            </thead>
                            <tbody>
                              {state.branches
                                .filter(
                                  (b) => !reportBranch || b === reportBranch,
                                )
                                .map((b) => {
                                  const m = metrics(
                                    reportTasks.filter(
                                      (t) => people(t.assigneeId)?.branch === b,
                                    ),
                                    today,
                                  );
                                  return (
                                    <tr key={b}>
                                      <td>
                                        <button
                                          className="w-link"
                                          onClick={() => {
                                            go("tasks");
                                            setBranch(b);
                                            setTaskPeriod(
                                              period === "month"
                                                ? today.slice(0, 7)
                                                : period,
                                            );
                                          }}
                                        >
                                          {b}
                                        </button>
                                      </td>
                                      <td>{m.total}</td>
                                      <td>{m.done}</td>
                                      <td>{m.open}</td>
                                      <td>{m.overdue}</td>
                                      <td>{pct(m.onTime)}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </Panel>
                      <Panel title="ภาระงานรายคน">
                        <div className="w-table">
                          <table>
                            <thead>
                              <tr>
                                <th>พนักงาน</th>
                                <th>งานเปิด</th>
                                <th>รอตรวจ</th>
                                <th>เกินกำหนด</th>
                              </tr>
                            </thead>
                            <tbody>
                              {state.employees
                                .filter(
                                  (e) =>
                                    !reportBranch || e.branch === reportBranch,
                                )
                                .map((e) => {
                                  const m = metrics(
                                    reportTasks.filter(
                                      (t) => t.assigneeId === e.id,
                                    ),
                                    today,
                                  );
                                  return (
                                    <tr key={e.id}>
                                      <td>
                                        <button
                                          className="w-link"
                                          onClick={() => {
                                            go("tasks");
                                            setEmployeeFilter(e.id);
                                            setBranch(reportBranch);
                                            setTaskPeriod(
                                              period === "month"
                                                ? today.slice(0, 7)
                                                : period,
                                            );
                                          }}
                                        >
                                          {e.name}
                                        </button>
                                      </td>
                                      <td>{m.open}</td>
                                      <td>{m.review}</td>
                                      <td>{m.overdue}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                        <p className="w-muted">
                          จำนวนงานใช้เห็นการกระจายงาน ไม่ใช่คะแนนความสามารถ
                          เพราะความยากแต่ละงานไม่เท่ากัน
                        </p>
                      </Panel>
                    </>
                  ) : (
                    <>
                      <Panel
                        title="งานที่ต้องช่วยเคลียร์"
                        aside={
                          <button
                            className="w-link"
                            onClick={() => filteredLink("overdue")}
                          >
                            ดูงานเกินกำหนด
                          </button>
                        }
                      >
                        {cards(
                          state.tasks
                            .filter(
                              (t) => late(t, today) || t.status === "รอตรวจ",
                            )
                            .slice(0, 6),
                        )}
                      </Panel>
                      <Panel title="การเปลี่ยนแปลงล่าสุด">
                        {state.activity.length ? (
                          <ul className="w-activity">
                            {state.activity.slice(0, 6).map((a) => (
                              <li key={a.id}>
                                <strong>{a.text}</strong>
                                <small>
                                  {new Date(a.at).toLocaleString("th-TH", {
                                    timeZone: "Asia/Bangkok",
                                  })}{" "}
                                  · {a.actor}
                                </small>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <Empty>ยังไม่มีการเปลี่ยนแปลงที่บันทึก</Empty>
                        )}
                      </Panel>
                    </>
                  )}
                </>
              )}

              {view === "tasks" && !currentTask && (
                <>
                  <div className="w-heading">
                    <h2>จัดการงานตั้งแต่รับงานจนอนุมัติ</h2>
                    <button
                      className="w-primary"
                      disabled={!activePeople.length}
                      onClick={() => setDialog({ kind: "task" })}
                    >
                      ＋ สร้างงาน
                    </button>
                  </div>
                  <div className="w-filters">
                    <Field label="ค้นหางานหรือผู้รับผิดชอบ">
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="ชื่อ…"
                      />
                    </Field>
                    <Field label="สาขา">
                      <select
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                      >
                        <option value="">ทุกสาขา</option>
                        {state.branches.map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="ผู้รับผิดชอบ">
                      <select
                        value={employeeFilter}
                        onChange={(e) => setEmployeeFilter(e.target.value)}
                      >
                        <option value="">ทุกคน</option>
                        {state.employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="สถานะ">
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="">ทุกสถานะ</option>
                        {statuses.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                        <option value="overdue">เกินกำหนด</option>
                      </select>
                    </Field>
                    <Field label="เดือนครบกำหนด">
                      <select
                        value={taskPeriod}
                        onChange={(e) => setTaskPeriod(e.target.value)}
                      >
                        <option value="all">ทุกเดือน</option>
                        {Array.from(
                          new Set([
                            ...state.tasks.map((t) => t.dueDate.slice(0, 7)),
                            today.slice(0, 7),
                          ]),
                        )
                          .sort()
                          .reverse()
                          .map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                      </select>
                    </Field>
                    <label className="w-filter-toggle">
                      <input
                        type="checkbox"
                        checked={hideFutureRoutine}
                        onChange={(event) =>
                          setHideFutureRoutine(event.target.checked)
                        }
                      />
                      <span>
                        <strong>แสดงเฉพาะสัปดาห์นี้และสัปดาห์หน้า</strong>
                        <small>
                          ซ่อนเฉพาะงานประจำหลัง {displayDate(routineCutoff)}
                          โดยไม่ลบจากปฏิทิน
                        </small>
                      </span>
                    </label>
                    <button
                      onClick={() => {
                        setQuery("");
                        setBranch("");
                        setStatus("");
                        setEmployeeFilter("");
                        setTaskPeriod("all");
                      }}
                    >
                      ล้างตัวกรอง
                    </button>
                    <button onClick={() => exportTasks(selectedTasks)}>
                      CSV
                    </button>
                  </div>
                  <div className="w-task-list-summary">
                    <p className="w-muted">พบ {selectedTasks.length} งาน</p>
                    {isOwner && selectedTasks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const visibleIds = selectedTasks.map(
                            (task) => task.id,
                          );
                          const allVisibleSelected = visibleIds.every((id) =>
                            selectedTaskIds.includes(id),
                          );
                          setSelectedTaskIds((current) =>
                            allVisibleSelected
                              ? current.filter((id) => !visibleIds.includes(id))
                              : [...new Set([...current, ...visibleIds])],
                          );
                        }}
                      >
                        {selectedTasks.every((task) =>
                          selectedTaskIds.includes(task.id),
                        )
                          ? "ยกเลิกเลือกทั้งหมด"
                          : "เลือกทั้งหมด"}
                      </button>
                    )}
                  </div>
                  {cards(selectedTasks, true)}
                  {isOwner && selectedTaskIds.length > 0 && (
                    <div
                      className="w-bulk-bar"
                      role="region"
                      aria-label="จัดการงานที่เลือก"
                    >
                      <strong>เลือกแล้ว {selectedTaskIds.length} งาน</strong>
                      <button
                        type="button"
                        onClick={() => setSelectedTaskIds([])}
                      >
                        ยกเลิกเลือกทั้งหมด
                      </button>
                      <button
                        type="button"
                        className="w-danger-solid"
                        onClick={() => setDeleteTaskIds(selectedTaskIds)}
                      >
                        ลบงานที่เลือก
                      </button>
                    </div>
                  )}
                </>
              )}
              {view === "tasks" && currentTask && (
                <>
                  <button className="w-link" onClick={() => setTaskId(null)}>
                    ← กลับรายการงาน
                  </button>
                  <Panel
                    title={currentTask.title}
                    aside={
                      isOwner ? (
                        <button
                          onClick={() =>
                            setDialog({ kind: "task", task: currentTask })
                          }
                        >
                          แก้ไข / เปลี่ยนผู้รับผิดชอบ
                        </button>
                      ) : undefined
                    }
                  >
                    <p>
                      {currentTask.description || "ไม่มีรายละเอียดเพิ่มเติม"}
                    </p>
                    <div className="w-task-info">
                      <span>
                        ผู้รับผิดชอบ{" "}
                        <button
                          className="w-link"
                          onClick={() => {
                            go("employees");
                            setProfileId(currentTask.assigneeId);
                          }}
                        >
                          {people(currentTask.assigneeId)?.name}
                        </button>
                      </span>
                      <span>
                        ผู้ตรวจ: {people(currentTask.reviewerId)?.name}
                      </span>
                      <span>ครบกำหนด: {displayDate(currentTask.dueDate)}</span>
                      {currentTask.routine && (
                        <span className="w-routine">
                          ↻ {routineLabel(currentTask.routine)}
                          {currentTask.routine.endDate
                            ? " · ถึง " +
                              displayDate(currentTask.routine.endDate)
                            : ""}
                        </span>
                      )}
                      <span
                        className={
                          "w-status s" + statuses.indexOf(currentTask.status)
                        }
                      >
                        {currentTask.status}
                      </span>
                      {late(currentTask, today) && (
                        <b className="w-late">เกินกำหนด</b>
                      )}
                    </div>
                    <div className="w-actions">
                      {(isOwner ||
                        sessionEmployeeId === currentTask.assigneeId) &&
                        (currentTask.status === "รอรับงาน" ||
                          currentTask.status === "ต้องแก้ไข") && (
                          <>
                            <button
                              className="w-primary"
                              disabled={busy}
                              onClick={() =>
                                void changeStatus(currentTask, "กำลังทำ")
                              }
                            >
                              รับงาน / เริ่มทำ
                            </button>
                            {currentTask.status === "รอรับงาน" && (
                              <button
                                className="w-quick-submit"
                                disabled={busy}
                                onClick={() =>
                                  void quickSubmitTask(currentTask)
                                }
                              >
                                ส่งงานทันที
                              </button>
                            )}
                          </>
                        )}
                      {(isOwner ||
                        sessionEmployeeId === currentTask.assigneeId) &&
                        ["กำลังทำ", "ต้องแก้ไข"].includes(
                          currentTask.status,
                        ) && (
                          <button
                            className="w-primary"
                            disabled={busy}
                            onClick={() =>
                              void changeStatus(currentTask, "รอตรวจ")
                            }
                          >
                            ส่งตรวจ
                          </button>
                        )}
                      {(isOwner ||
                        sessionEmployeeId === currentTask.reviewerId) &&
                        currentTask.status === "รอตรวจ" && (
                          <>
                            <button
                              className="w-primary"
                              disabled={busy}
                              onClick={() =>
                                void changeStatus(currentTask, "สำเร็จ")
                              }
                            >
                              ✓ อนุมัติสำเร็จ
                            </button>
                            <button
                              disabled={busy}
                              onClick={() =>
                                void changeStatus(currentTask, "ต้องแก้ไข")
                              }
                            >
                              ส่งกลับแก้ไข
                            </button>
                          </>
                        )}
                      {isOwner && currentTask.status === "สำเร็จ" && (
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                "เปิดงานนี้กลับมาทำใหม่? วันที่สำเร็จจะถูกล้าง",
                              )
                            )
                              void changeStatus(currentTask, "กำลังทำ");
                          }}
                        >
                          เปิดงานใหม่
                        </button>
                      )}
                    </div>
                    {currentTask.routine && (
                      <p className="w-routine-note">
                        {currentTask.routine.createMode === "advance"
                          ? "ชุดงานนี้สร้างรอบล่วงหน้าแล้ว แต่ละรอบแยกสถานะและประวัติออกจากกัน"
                          : "เมื่อผู้ตรวจอนุมัติงาน ระบบจะสร้างรอบถัดไปตามกติกาที่กำหนด"}
                      </p>
                    )}
                    <p className="w-muted">
                      {isOwner ? (
                        <>
                          โหมดผู้ดูแล: การกดแทนพนักงานถูกบันทึกด้วยบัญชี {actor}
                        </>
                      ) : (
                        <>
                          พนักงานอัปเดตได้เฉพาะสถานะ Checklist
                          และความคิดเห็นของงานที่เกี่ยวข้อง
                          ไม่สามารถแก้ไขหรือลบงาน
                        </>
                      )}
                    </p>
                  </Panel>
                  <div className="w-report-grid">
                    <Panel title="Checklist">
                      {currentTask.checklist.length ? (
                        currentTask.checklist.map((c) => (
                          <label className="w-check" key={c.id}>
                            <input
                              type="checkbox"
                              disabled={
                                busy ||
                                (!isOwner &&
                                  sessionEmployeeId !==
                                    currentTask.assigneeId) ||
                                currentTask.status === "สำเร็จ" ||
                                currentTask.status === "รอตรวจ"
                              }
                              checked={c.done}
                              onChange={() =>
                                void save(
                                  {
                                    ...state,
                                    tasks: state.tasks.map((t) =>
                                      t.id === currentTask.id
                                        ? {
                                            ...t,
                                            checklist: t.checklist.map((x) =>
                                              x.id === c.id
                                                ? { ...x, done: !x.done }
                                                : x,
                                            ),
                                          }
                                        : t,
                                    ),
                                  },
                                  "อัปเดต Checklist: " + currentTask.title,
                                )
                              }
                            />
                            {c.label}
                          </label>
                        ))
                      ) : (
                        <Empty>ไม่มีรายการย่อย เพิ่มได้ที่ “แก้ไข”</Empty>
                      )}
                    </Panel>
                    <Panel title="ความคิดเห็นและเหตุผลที่ส่งกลับ">
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!comment.trim()) return;
                          const next = {
                            ...currentTask,
                            comments: [
                              ...currentTask.comments,
                              {
                                id: uid(),
                                text: comment.trim(),
                                at: new Date().toISOString(),
                                author: actor,
                              },
                            ],
                          };
                          if (
                            await save(
                              {
                                ...state,
                                tasks: state.tasks.map((t) =>
                                  t.id === next.id ? next : t,
                                ),
                              },
                              "เพิ่มความคิดเห็น: " + currentTask.title,
                            )
                          )
                            setComment("");
                        }}
                      >
                        <Field label="ข้อความ">
                          <textarea
                            required
                            maxLength={2000}
                            disabled={!canActOnCurrentTask}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                          />
                        </Field>
                        <button disabled={busy || !canActOnCurrentTask}>
                          เพิ่มความคิดเห็น
                        </button>
                      </form>
                      {!canActOnCurrentTask && (
                        <p className="w-muted">
                          งานนี้เปิดให้ดูตามสิทธิ์ฝ่าย คุณจึงดูรายละเอียดได้
                          แต่เปลี่ยนสถานะ แสดงความคิดเห็น หรือแนบหลักฐานไม่ได้
                        </p>
                      )}
                      <ul className="w-activity">
                        {[...currentTask.comments].reverse().map((c) => (
                          <li key={c.id}>
                            <p>{c.text}</p>
                            <small>
                              {c.author} ·{" "}
                              {new Date(c.at).toLocaleString("th-TH", {
                                timeZone: "Asia/Bangkok",
                              })}
                            </small>
                          </li>
                        ))}
                      </ul>
                      <div className="w-evidence-box">
                        <h3>แนบรูป/ไฟล์สำหรับรอบส่งตรวจ</h3>
                        <p className="w-muted">
                          เลือกพร้อมกันได้สูงสุด 10 ไฟล์ ไฟล์ละไม่เกิน 10 MB
                          และรวมไม่เกิน 30 MB ต่อครั้ง เมื่อเลือกแล้วระบบจะอัปโหลดทันที
                          กรุณารอจนขึ้นคำว่า “อัปโหลดสำเร็จ” ก่อนกดส่งตรวจ
                          แล้วระบบจะผูกไฟล์กับรอบส่งถัดไปอัตโนมัติ
                          รูปถ่ายขนาดใหญ่จะถูกย่อให้อัตโนมัติก่อนส่ง
                        </p>
                        <label className="w-file-picker">
                          <input
                            type="file"
                            multiple
                            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                            disabled={
                              busy ||
                              !canActOnCurrentTask ||
                              currentTask.status === "สำเร็จ"
                            }
                            onChange={(event) => {
                              const files = Array.from(event.target.files || []);
                              const selected = files.slice(0, 10);
                              setEvidenceFiles(selected);
                              setEvidenceMessage("");
                              setEvidenceTooLarge(false);
                              if (files.length > 10)
                                setError("เลือกได้สูงสุดครั้งละ 10 ไฟล์ ระบบเก็บ 10 ไฟล์แรกไว้แล้ว");
                              event.target.value = "";
                              if (selected.length)
                                void uploadEvidence(currentTask, selected);
                            }}
                          />
                          <span>＋ เลือกรูปหรือไฟล์ (อัปโหลดทันที)</span>
                        </label>
                        {!!evidenceMessage && (
                          <p
                            className={
                              evidenceMessage.startsWith("อัปโหลดสำเร็จ")
                                ? "w-evidence-message success"
                                : "w-evidence-message"
                            }
                            role="status"
                            aria-live="polite"
                          >
                            {evidenceMessage}
                          </p>
                        )}
                        {evidenceTooLarge && (
                          <aside className="w-evidence-size-help" role="note">
                            <p>
                              หากไม่สะดวกย่อขนาดไฟล์เอง กดปุ่มด้านล่างเพื่อแจ้งเข้ากลุ่มแชทแทน
                            </p>
                            <div>
                              <a
                                className="w-evidence-line-share"
                                href={`https://line.me/R/msg/text/?${encodeURIComponent(evidenceShareMessage)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                แจ้งเตือนเข้า LINE
                              </a>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await copyText(evidenceShareMessage);
                                    setEvidenceMessage(
                                      "คัดลอกข้อความแล้ว นำไปวางในกลุ่มแชทได้เลย",
                                    );
                                    notify("คัดลอกข้อความแล้ว");
                                  } catch {
                                    setError(
                                      "คัดลอกอัตโนมัติไม่สำเร็จ กรุณากดแชร์เข้า LINE แทน",
                                    );
                                  }
                                }}
                              >
                                คัดลอกข้อความ
                              </button>
                            </div>
                          </aside>
                        )}
                        {!!evidenceFiles.length && (
                          <ul className="w-selected-files">
                            {evidenceFiles.map((file, index) => (
                              <li key={file.name + file.size + index}>
                                <span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></span>
                                <button
                                  type="button"
                                  aria-label={`เอา ${file.name} ออกจากรายการ`}
                                  onClick={() =>
                                    setEvidenceFiles((current) =>
                                      current.filter((_, itemIndex) => itemIndex !== index),
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !canActOnCurrentTask ||
                            !evidenceFiles.length ||
                            currentTask.status === "สำเร็จ"
                          }
                          onClick={() => void uploadEvidence(currentTask)}
                        >
                          {busy
                            ? "กำลังอัปโหลด…"
                            : `ลองอัปโหลดอีกครั้ง ${evidenceFiles.length || ""} ไฟล์`}
                        </button>
                        {currentTask.attachments?.length ? (
                          <div className="w-evidence-rounds">
                            {[...new Set(currentTask.attachments.map((attachment) => attachment.submissionRound || 1))]
                              .sort((a, b) => b - a)
                              .map((round) => (
                                <section key={round}>
                                  <h4>รอบส่งตรวจที่ {round}</h4>
                                  <ul className="w-evidence-list">
                                    {currentTask.attachments!
                                      .filter((attachment) => (attachment.submissionRound || 1) === round)
                                      .map((attachment) => (
                                        <li key={attachment.id}>
                                          <a
                                            className={attachment.type.startsWith("image/") ? "w-evidence-image" : ""}
                                            href={`/api/tasks/evidence/${attachment.id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            {["image/jpeg", "image/png", "image/webp"].includes(attachment.type) && (
                                              <img
                                                src={`/api/tasks/evidence/${attachment.id}`}
                                                alt={`หลักฐาน ${attachment.name}`}
                                                loading="lazy"
                                              />
                                            )}
                                            {(attachment.type === "image/heic" ||
                                              attachment.type === "image/heif") && (
                                              <b className="w-evidence-format">ไฟล์ภาพ HEIC</b>
                                            )}
                                            <span>{attachment.name}</span>
                                          </a>
                                          <small>
                                            {(attachment.size / 1024 / 1024).toFixed(2)} MB · {attachment.uploadedBy} · {new Date(attachment.uploadedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                                          </small>
                                        </li>
                                      ))}
                                  </ul>
                                </section>
                              ))}
                          </div>
                        ) : (
                          <p className="w-muted">ยังไม่มีไฟล์หลักฐาน</p>
                        )}
                      </div>
                    </Panel>
                  </div>
                  {isOwner && (
                    <button
                      className="w-danger"
                      disabled={busy}
                      onClick={() => setDeleteTaskIds([currentTask.id])}
                    >
                      ลบงานนี้
                    </button>
                  )}
                </>
              )}

              {view === "employees" && !profile && (
                <>
                  <div className="w-heading">
                    <h2>ทีม OLE CONNECT</h2>
                    <button
                      className="w-primary"
                      onClick={() => setDialog({ kind: "employee" })}
                    >
                      ＋ เพิ่มพนักงาน
                    </button>
                  </div>
                  <section className="w-online-team" aria-label="พนักงานที่กำลังออนไลน์">
                    <header>
                      <div>
                        <strong>กำลังออนไลน์</strong>
                        <small>อัปเดตอัตโนมัติจากการใช้งานใน 2 นาทีล่าสุด</small>
                      </div>
                      <b>{onlineEmployees.length} คน</b>
                    </header>
                    <div className="w-online-list">
                      {onlineEmployees.map((employee) => (
                          <button
                            type="button"
                            key={employee.id}
                            onClick={() => setProfileId(employee.id)}
                            aria-label={`เปิดโปรไฟล์ ${employee.name} ซึ่งกำลังออนไลน์`}
                          >
                            <span className="w-online-avatar">
                              {employee.avatar ? (
                                <PixelEmployeeAvatar config={employee.avatar} size="small" />
                              ) : (
                                <span className="w-online-initial">{employee.name[0]}</span>
                              )}
                              <i aria-hidden="true" />
                            </span>
                            <span>
                              <strong>{employee.name}</strong>
                              <small>{employee.role}</small>
                            </span>
                          </button>
                        ))}
                      {!onlineEmployees.length && <p>ยังไม่มีพนักงานออนไลน์</p>}
                    </div>
                  </section>
                  <div className="w-filters">
                    <Field label="ค้นหาชื่อ / ตำแหน่ง / ฝ่าย">
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </Field>
                    <Field label="สาขา">
                      <select
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                      >
                        <option value="">ทุกสาขา</option>
                        {state.branches.map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="w-people">
                    {state.employees
                      .filter(
                        (e) =>
                          (e.name + e.role + e.department)
                            .toLowerCase()
                            .includes(query.toLowerCase()) &&
                          (!branch || e.branch === branch),
                      )
                      .map((e) => {
                        const m = metrics(
                          state.tasks.filter((t) => t.assigneeId === e.id),
                          today,
                        );
                        return (
                          <button
                            key={e.id}
                            className="w-person"
                            onClick={() => setProfileId(e.id)}
                          >
                            {e.avatar ? (
                              <PixelEmployeeAvatar config={e.avatar} />
                            ) : (
                              <span className="w-initial">{e.name[0]}</span>
                            )}
                            <h3>{e.name}</h3>
                            <p>
                              {e.role} · {e.branch}
                            </p>
                            <small>
                              {e.department} ·{" "}
                              {e.active ? "ใช้งาน" : "ปิดใช้งาน"}
                            </small>
                            {sopResults[e.id] && (
                              <span className={`w-sop-profile-badge ${sopResults[e.id].level.toLowerCase()}`}>
                                SOP {sopResults[e.id].score}% · {sopResults[e.id].level}
                              </span>
                            )}
                            <footer>
                              <span>
                                งานเปิด <b>{m.open}</b>
                              </span>
                              <span>
                                สำเร็จ <b>{pct(m.completion)}</b>
                              </span>
                            </footer>
                          </button>
                        );
                      })}
                  </div>
                </>
              )}
              {view === "employees" && profile && (
                <>
                  <button className="w-link" onClick={() => setProfileId(null)}>
                    ← รายชื่อพนักงาน
                  </button>
                  <Panel
                    title={profile.name}
                    aside={
                      isOwner ? (
                        <button
                          onClick={() =>
                            setDialog({ kind: "employee", employee: profile })
                          }
                        >
                          แก้ไขข้อมูล
                        </button>
                      ) : undefined
                    }
                  >
                    <div className="w-profile">
                      {profile.avatar ? (
                        <PixelEmployeeAvatar
                          config={profile.avatar}
                          label={"ตัวละครของ " + profile.name}
                        />
                      ) : (
                        <span className="w-initial">{profile.name[0]}</span>
                      )}
                      <div>
                        <h3>{profile.role}</h3>
                        <p>
                          {profile.department} · {profile.branch}
                        </p>
                        <p>
                          {profile.active ? "ใช้งานอยู่" : "ปิดใช้งาน"} ·
                          เป็นรายชื่อพนักงาน ยังไม่ใช่บัญชีเข้าสู่ระบบ
                        </p>
                        <span className={`w-sop-profile-badge ${sopResults[profile.id]?.level.toLowerCase() || "not-tested"}`}>
                          {sopResults[profile.id]
                            ? `SOP ${sopResults[profile.id].score}% · ${sopResults[profile.id].level}`
                            : "SOP · ยังไม่มีผลสอบ"}
                        </span>
                        {(isOwner || profile.id === sessionEmployeeId) && (
                          <button
                            onClick={() => {
                              setError("");
                              setAvatarSaved("");
                              setAvatarId(profile.id);
                            }}
                          >
                            เลือกตัวละครของ {profile.name}
                          </button>
                        )}
                      </div>
                    </div>
                    {isOwner && (
                      <div className="w-actions">
                        <button
                          className="w-primary"
                          disabled={!profile.active}
                          onClick={() =>
                            setDialog({ kind: "task", assigneeId: profile.id })
                          }
                        >
                          มอบหมายงาน
                        </button>
                        <button
                          disabled={busy}
                          onClick={async () => {
                            if (
                              profile.active &&
                              state.tasks.some(
                                (t) =>
                                  (t.assigneeId === profile.id ||
                                    t.reviewerId === profile.id) &&
                                  t.status !== "สำเร็จ",
                              )
                            ) {
                              setError(
                                "ต้องเปลี่ยนผู้รับผิดชอบและผู้ตรวจงานที่ยังเปิดอยู่ก่อนปิดใช้งาน",
                              );
                              return;
                            }
                            if (
                              confirm(
                                (profile.active ? "ปิด" : "เปิด") +
                                  "ใช้งาน " +
                                  profile.name +
                                  "?",
                              )
                            )
                              await save(
                                {
                                  ...state,
                                  employees: state.employees.map((e) =>
                                    e.id === profile.id
                                      ? { ...e, active: !e.active }
                                      : e,
                                  ),
                                },
                                "เปลี่ยนสถานะพนักงาน: " + profile.name,
                              );
                          }}
                        >
                          {profile.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                        </button>
                      </div>
                    )}
                  </Panel>
                  <Panel title="งานที่รับผิดชอบ">
                    {cards(
                      state.tasks.filter((t) => t.assigneeId === profile.id),
                    )}
                  </Panel>
                  <Panel title="งานที่ต้องตรวจ">
                    {cards(
                      state.tasks.filter(
                        (t) =>
                          t.reviewerId === profile.id && t.status === "รอตรวจ",
                      ),
                    )}
                  </Panel>
                </>
              )}

              {view === "sop" && (
                <SopCenter
                  employees={state.employees}
                  isOwner={isOwner}
                  employeeId={sessionEmployeeId}
                  permissions={permissions}
                  visibleDepartments={visibleDepartments}
                />
              )}

              {view === "farm" && <ChickenArena />}

              {view === "calendar" && (
                <>
                  <div className="w-heading">
                    <h2>
                      {new Date(
                        month + "-01T12:00:00+07:00",
                      ).toLocaleDateString("th-TH", {
                        year: "numeric",
                        month: "long",
                        timeZone: "Asia/Bangkok",
                      })}
                    </h2>
                    <div className="w-actions">
                      <button
                        onClick={() => {
                          const [y, m] = month.split("-").map(Number);
                          setMonth(
                            dateKey(new Date(Date.UTC(y, m - 2, 1, 5))).slice(
                              0,
                              7,
                            ),
                          );
                        }}
                      >
                        ← เดือนก่อน
                      </button>
                      <button onClick={() => setMonth(today.slice(0, 7))}>
                        เดือนนี้
                      </button>
                      <button
                        onClick={() => {
                          const [y, m] = month.split("-").map(Number);
                          setMonth(
                            dateKey(new Date(Date.UTC(y, m, 1, 5))).slice(0, 7),
                          );
                        }}
                      >
                        เดือนถัดไป →
                      </button>
                      <button
                        className="w-primary"
                        onClick={() =>
                          setDialog({
                            kind: "event",
                            date:
                              month === today.slice(0, 7)
                                ? today
                                : month + "-01",
                          })
                        }
                      >
                        ＋ วันสำคัญ
                      </button>
                    </div>
                  </div>
                  <p className="w-muted">
                    งานแสดงจากวันครบกำหนดจริง · กดงานเพื่อเปิดรายละเอียด ·
                    กดกิจกรรมเพื่อแก้ไข/ลบ · ปุ่มวันที่เพื่อเพิ่มกิจกรรม
                  </p>
                  <div className="w-calendar">
                    <div className="w-weekdays">
                      {["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."].map((d) => (
                        <b key={d}>{d}</b>
                      ))}
                    </div>
                    <div className="w-days">
                      {(() => {
                        const [y, m] = month.split("-").map(Number),
                          lead = (new Date(y, m - 1, 1).getDay() + 6) % 7,
                          days = new Date(y, m, 0).getDate();
                        return Array.from(
                          { length: Math.ceil((lead + days) / 7) * 7 },
                          (_, i) => {
                            const n = i - lead + 1;
                            if (n < 1 || n > days)
                              return (
                                <div className="w-day w-outside" key={i} />
                              );
                            const date =
                              month + "-" + String(n).padStart(2, "0");
                            return (
                              <div
                                className={
                                  "w-day " + (date === today ? "w-today" : "")
                                }
                                key={date}
                              >
                                <button
                                  className="w-date-button"
                                  aria-label={
                                    "เพิ่มกิจกรรมวันที่ " + displayDate(date)
                                  }
                                  onClick={() =>
                                    setDialog({ kind: "event", date })
                                  }
                                >
                                  {n}
                                  {date === today ? " วันนี้" : ""} ＋
                                </button>
                                {state.tasks
                                  .filter((t) => t.dueDate === date)
                                  .map((t) => (
                                    <button
                                      key={t.id}
                                      className={
                                        "w-cal-item " +
                                        (late(t, today) ? "w-cal-late" : "")
                                      }
                                      onClick={() => openTask(t.id)}
                                    >
                                      ✓ {t.title}
                                      <small>
                                        {people(t.assigneeId)?.name}
                                      </small>
                                    </button>
                                  ))}
                                {state.events
                                  .filter((e) => e.date === date)
                                  .sort((a, b) => a.time.localeCompare(b.time))
                                  .map((e) => (
                                    <button
                                      key={e.id}
                                      className={"w-cal-item color-" + e.color}
                                      onClick={() =>
                                        setDialog({
                                          kind: "event",
                                          date,
                                          event: e,
                                        })
                                      }
                                    >
                                      {e.important ? "★ " : ""}
                                      {e.title}
                                      <small>{e.time}</small>
                                    </button>
                                  ))}
                              </div>
                            );
                          },
                        );
                      })()}
                    </div>
                  </div>
                  <Panel title="รายการในเดือนนี้">
                    {[
                      ...state.tasks
                        .filter((t) => t.dueDate.startsWith(month))
                        .map((t) => ({
                          key: t.id,
                          date: t.dueDate,
                          title: t.title,
                          open: () => openTask(t.id),
                        })),
                      ...state.events
                        .filter((e) => e.date.startsWith(month))
                        .map((e) => ({
                          key: e.id,
                          date: e.date,
                          title: e.title,
                          open: () =>
                            setDialog({
                              kind: "event",
                              date: e.date,
                              event: e,
                            }),
                        })),
                    ]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((e) => (
                        <button
                          className="w-agenda"
                          key={e.key}
                          onClick={e.open}
                        >
                          <b>{displayDate(e.date)}</b>
                          <span>{e.title}</span>
                        </button>
                      ))}
                  </Panel>
                </>
              )}

              {(view === "branches" || view === "departments") && (
                <>
                  <div className="w-heading">
                    <h2>{view === "branches" ? "สาขา" : "ฝ่ายและตำแหน่ง"}</h2>
                    <button
                      className="w-primary"
                      onClick={() =>
                        setDialog({ kind: "organization", field: view })
                      }
                    >
                      ＋ เพิ่ม{view === "branches" ? "สาขา" : "ฝ่าย/ตำแหน่ง"}
                    </button>
                  </div>
                  <div className="w-people">
                    {state[view].map((name) => {
                      const peopleHere = state.employees.filter(
                          (e) =>
                            (view === "branches" ? e.branch : e.department) ===
                            name,
                        ),
                        tasksHere = state.tasks.filter((t) =>
                          peopleHere.some((e) => e.id === t.assigneeId),
                        );
                      return (
                        <section className="w-panel" key={name}>
                          <h2>{name}</h2>
                          <p>
                            {peopleHere.filter((e) => e.active).length} คนใช้งาน
                            · {metrics(tasksHere, today).open} งานเปิด
                          </p>
                          <p>
                            {peopleHere.map((e) => e.name).join(", ") ||
                              "ยังไม่มีพนักงาน"}
                          </p>
                          <div className="w-actions">
                            <button
                              onClick={() =>
                                setDialog({
                                  kind: "organization",
                                  field: view,
                                  name,
                                })
                              }
                            >
                              เปลี่ยนชื่อ
                            </button>
                            <button
                              className="w-danger"
                              disabled={
                                peopleHere.length > 0 || state[view].length <= 1
                              }
                              title={
                                peopleHere.length ? "ย้ายพนักงานออกก่อนลบ" : ""
                              }
                              onClick={() =>
                                void deleteOrganization(view, name)
                              }
                            >
                              ลบ
                            </button>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </>
              )}

              {view === "permissions" && (
                <>
                  <Panel title="สิทธิ์เข้าใช้งานจริง">
                    <p>
                      พื้นที่นี้ผูกกับบัญชี ChatGPT ของผู้ดูแล:{" "}
                      <strong>{actor}</strong>
                    </p>
                    <p>
                      ข้อมูลผู้ดูแลและบัญชีพนักงานถูกตรวจสิทธิ์ฝั่งเซิร์ฟเวอร์
                      พนักงานแต่ละคนใช้ไอดีของตนเองและเห็นเฉพาะเมนูกับงานที่ได้รับสิทธิ์
                    </p>
                    <p>
                      ผู้รับผิดชอบรับงาน อัปเดต Checklist และส่งตรวจได้
                      ส่วนผู้ตรวจเป็นผู้ส่งกลับแก้ไขหรืออนุมัติงานสำเร็จ
                    </p>
                    <p className="w-note">
                      ตั้งไอดี รหัสผ่าน และเมนูที่มองเห็นได้จากหน้าพนักงาน
                      พนักงานไม่สามารถแก้โครงสร้างหรือลบงาน
                      และไม่ควรใช้บัญชีร่วมกัน
                    </p>
                  </Panel>
                  <Panel title="การเชื่อมต่อภายนอก">
                    <ul>
                      <li>
                        LINE OA: {lineStatus?.connected ? "พร้อมส่งข้อความ" : "ยังตั้งค่าไม่ครบ"}
                        {lineStatus?.latestSentAt
                          ? ` · ส่งล่าสุด ${new Date(lineStatus.latestSentAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`
                          : ""}
                      </li>
                      <li>
                        Google Calendar: ยังไม่ซิงก์ ปฏิทินนี้ใช้ข้อมูลใน OLE
                        WORK
                      </li>
                      <li>
                        หลักฐานรูป/ไฟล์: แนบในรายละเอียดงานได้สูงสุด 20 ไฟล์
                        ไฟล์ละไม่เกิน 10 MB
                        และเปิดดูได้เฉพาะผู้ที่เกี่ยวข้องกับงาน
                      </li>
                    </ul>
                    <p>
                      ไม่มีปุ่มอนุมัติสิทธิ์หรือปุ่มเชื่อมต่อที่กดแล้วอ้างว่าสำเร็จโดยไม่ได้ทำงานจริง
                    </p>
                  </Panel>
                  <Panel title="ตั้งค่าแจ้งเตือน LINE Official Account">
                    <div className={`w-line-status ${lineStatus?.connected ? "connected" : ""}`}>
                      <strong>{lineStatus?.connected ? "พร้อมใช้งาน" : "รอการตั้งค่าจากผู้ดูแล"}</strong>
                      <span>
                        Token {lineStatus?.tokenConfigured ? "✓" : "—"} · ปลายทางกลาง {lineStatus?.defaultTargetConfigured ? "✓" : "—"} · พนักงานที่มี LINE User ID {lineStatus?.employeeTargets || 0} คน
                      </span>
                    </div>
                    <ol className="w-setup-steps">
                      <li>สร้างหรือเลือก LINE Official Account แล้วเปิด Messaging API ใน LINE Official Account Manager</li>
                      <li>ออก Channel Access Token จาก LINE Developers Console</li>
                      <li>นำ Token ไปตั้งเป็นค่าลับ <code>LINE_CHANNEL_ACCESS_TOKEN</code> ของเว็บไซต์</li>
                      <li>ถ้าส่งเข้ากลุ่ม ให้เพิ่ม OA เข้ากลุ่มแล้วตั้ง <code>LINE_TARGET_ID</code>; ถ้าส่งรายคน ให้ใส่ LINE User ID ในหน้าตั้งค่าพนักงาน</li>
                      <li>กลับมาหน้านี้ กดทดสอบ แล้วกดตรวจและส่งแจ้งเตือน</li>
                    </ol>
                    <div className="w-actions">
                      <button
                        type="button"
                        disabled={!lineStatus?.connected || lineBusy}
                        onClick={() => void runLineAlerts("test")}
                      >
                        ทดสอบส่ง LINE
                      </button>
                      <button
                        type="button"
                        className="w-primary"
                        disabled={!lineStatus?.connected || lineBusy}
                        onClick={() => void runLineAlerts("run")}
                      >
                        ตรวจและส่งแจ้งเตือนตอนนี้
                      </button>
                    </div>
                    <p className="w-muted">
                      LINE Notify ปิดบริการแล้ว จึงใช้ LINE Messaging API แทน ระบบจะตรวจอัตโนมัติเมื่อผู้ดูแลเปิดเว็บ และไม่ส่งงานเดิมซ้ำในเงื่อนไขเดิม
                      แต่ยังทำงานตอนเว็บไม่มีผู้เปิดไม่ได้จนกว่าแพลตฟอร์มจะรองรับงานตามเวลา
                    </p>
                  </Panel>
                </>
              )}
              {view === "settings" && (
                <>
                  <Panel title="หน้าตาและเสียง">
                    <label className="w-check">
                      <input
                        type="checkbox"
                        checked={dark}
                        onChange={(e) => {
                          setDark(e.target.checked);
                          try {
                            localStorage.setItem(
                              "ole-work-dark",
                              String(e.target.checked),
                            );
                          } catch {}
                        }}
                      />
                      โหมดมืด
                    </label>
                    <label className="w-check">
                      <input
                        type="checkbox"
                        checked={sound}
                        onChange={(e) => {
                          setSound(e.target.checked);
                          try {
                            localStorage.setItem(
                              "ole-work-sound",
                              e.target.checked ? "on" : "off",
                            );
                          } catch {}
                        }}
                      />
                      เปิดเสียงกดปุ่มและผลการบันทึก
                    </label>
                    <p className="w-muted">
                      การตั้งค่าหน้าตาและเสียงจำเฉพาะเครื่อง
                      ส่วนข้อมูลพนักงานและงานบันทึกกลาง
                    </p>
                  </Panel>
                  <Panel title="ข้อมูลและสำรอง">
                    <div className={`w-backup-status ${backupError ? "failed" : ""}`}>
                      <strong>
                        {backupError
                          ? backupError
                          : backupLatestAt
                            ? `สำรองข้อมูลล่าสุดเมื่อ ${new Date(backupLatestAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`
                            : "กำลังเตรียมข้อมูลสำรองรายวัน"}
                      </strong>
                      <span>
                        ระบบสร้างไฟล์อัตโนมัติวันละ 1 ครั้งเมื่อผู้ดูแลเปิด OLE WORK และเก็บย้อนหลัง 7 วัน
                      </span>
                    </div>
                    {!!backups.length && (
                      <div className="w-backup-list">
                        <h3>ไฟล์สำรองย้อนหลัง</h3>
                        {backups.map((backup) => (
                          <a key={backup.date} href={`/api/backups/${backup.date}`}>
                            <span>ข้อมูลวันที่ {displayDate(backup.date)}</span>
                            <small>{(backup.size / 1024).toFixed(1)} KB · ดาวน์โหลด JSON</small>
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="w-actions">
                      <button
                        onClick={() =>
                          download(
                            JSON.stringify(state, null, 2),
                            "ole-work-backup-" + today + ".json",
                          )
                        }
                      >
                        ↓ สำรองข้อมูล JSON
                      </button>
                      <button onClick={() => exportTasks(state.tasks)}>
                        ↓ ส่งออกงาน CSV
                      </button>
                      {legacy && (
                        <button
                          disabled={busy}
                          onClick={() => void importLegacy()}
                        >
                          นำเข้ารายชื่อ / ปฏิทิน / Avatar จากเครื่องเดิม
                        </button>
                      )}
                      <button
                        disabled={
                          busy ||
                          state.tasks.length > 0 ||
                          state.employees.length > 0 ||
                          state.events.length > 0
                        }
                        onClick={() => {
                          if (
                            confirm(
                              "โหลดข้อมูลตัวอย่างสำหรับทดลอง? ระบบจะระบุว่าทั้งหมดเป็นตัวอย่าง",
                            )
                          )
                            void save(sampleState(), "โหลดข้อมูลตัวอย่าง");
                        }}
                      >
                        โหลดข้อมูลตัวอย่าง
                      </button>
                      {state.sample && (
                        <button
                          className="w-danger"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                "เริ่มข้อมูลจริงและลบชุดทดลองทั้งหมด? ควรดาวน์โหลดสำรองก่อน หากมีรายการจริงปะปนให้กดยกเลิก",
                              )
                            )
                              void save(emptyState(), "เริ่มชุดข้อมูลจริง");
                          }}
                        >
                          เริ่มข้อมูลจริง (ลบชุดทดลอง)
                        </button>
                      )}
                    </div>
                    <p className="w-muted">
                      แพลตฟอร์มนี้ยังไม่มีตัวตั้งเวลาเบื้องหลังสำหรับเว็บนี้
                      ถ้าไม่มีผู้ดูแลเปิดระบบทั้งวัน จะยังไม่เกิดไฟล์ของวันนั้น
                      ปุ่มสำรอง JSON ด้านบนยังใช้ดาวน์โหลดทันทีได้ตามปกติ
                    </p>
                  </Panel>
                  <Panel title="บันทึกการตรวจและแก้ระบบ">
                    <ul>
                      <li>อ้างอิงพนักงานด้วยรหัสประจำรายการ ไม่ผูกด้วยชื่อ</li>
                      <li>
                        สร้าง/เปลี่ยนผู้รับผิดชอบแล้ว โปรไฟล์ ปฏิทิน
                        และรายงานอัปเดตจากงานชุดเดียว
                      </li>
                      <li>
                        ข้อมูลคงอยู่หลังรีเฟรช มีข้อความแจ้งข้อผิดพลาด
                        และป้องกันบันทึกทับจากสองหน้าจอ
                      </li>
                      <li>
                        สถิติทั้งหมดคำนวณจากรายการ ไม่มีคะแนน XP / Team Health /
                        ค่าเฉลี่ยที่ตั้งลอย ๆ
                      </li>
                      <li>
                        ปฏิทินใช้วันและเดือนปัจจุบันในเวลาไทย
                        พร้อมแก้ไขและลบกิจกรรม
                      </li>
                      <li>
                        ฟอนต์อ่านง่ายขึ้น ปุ่มใช้งานได้ด้วยคีย์บอร์ด
                        และรูปโปรไฟล์บันทึกแยกคน
                      </li>
                    </ul>
                  </Panel>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {dialog && (
        <Modal
          title={
            dialog.kind === "employee"
              ? dialog.employee
                ? "แก้ไขพนักงาน"
                : "เพิ่มพนักงาน"
              : dialog.kind === "task"
                ? dialog.task
                  ? "แก้ไขงาน"
                  : "สร้างและมอบหมายงาน"
                : dialog.kind === "event"
                  ? dialog.event
                    ? "แก้ไขกิจกรรม"
                    : "เพิ่มวันสำคัญ / กิจกรรม"
                  : "จัดการ" + (dialog.field === "branches" ? "สาขา" : "ฝ่าย")
          }
          close={() => {
            if (!busy) setDialog(null);
          }}
        >
          {error && (
            <p className="w-error" role="alert">
              {error}
            </p>
          )}
          {dialog.kind === "employee" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const record: Employee = {
                  ...dialog.employee,
                  id: dialog.employee?.id || uid(),
                  name: String(f.get("name")).trim(),
                  role: String(f.get("role")).trim(),
                  branch: String(f.get("branch")),
                  department: String(f.get("department")),
                  active: dialog.employee?.active ?? true,
                  lineUserId: String(f.get("lineUserId") || "").trim() || undefined,
                };
                if (
                  state.employees.some(
                    (x) =>
                      x.id !== record.id &&
                      x.name === record.name &&
                      x.branch === record.branch,
                  )
                ) {
                  setError("มีชื่อพนักงานนี้ในสาขาเดียวกันแล้ว");
                  return;
                }
                const saved = await save(
                  {
                    ...state,
                    employees: dialog.employee
                      ? state.employees.map((x) =>
                          x.id === record.id ? record : x,
                        )
                      : [...state.employees, record],
                  },
                  "บันทึกพนักงาน: " + record.name,
                );
                if (saved && (await saveAccount(record.id, f))) setDialog(null);
              }}
            >
              <fieldset disabled={busy}>
                <Field label="ชื่อหรือชื่อเล่น *">
                  <input
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={dialog.employee?.name}
                  />
                </Field>
                <Field label="ตำแหน่ง *">
                  <input
                    name="role"
                    required
                    maxLength={100}
                    defaultValue={dialog.employee?.role}
                  />
                </Field>
                <Field label="สาขา">
                  <select name="branch" defaultValue={dialog.employee?.branch}>
                    {state.branches.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </Field>
                <Field label="ฝ่าย">
                  <select
                    name="department"
                    defaultValue={dialog.employee?.department}
                  >
                    {state.departments.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </Field>
                {isOwner && (
                  <Field label="LINE User ID (ถ้ามี)">
                    <input
                      name="lineUserId"
                      maxLength={33}
                      pattern="U[0-9A-Fa-f]{32}"
                      placeholder="U ตามด้วยตัวอักษร 32 ตัว"
                      defaultValue={dialog.employee?.lineUserId || ""}
                    />
                    <small>
                      ใช้ส่งแจ้งเตือนตรงหาพนักงาน ต้องได้จาก Webhook ของ LINE OA
                    </small>
                  </Field>
                )}
                {isOwner &&
                  (() => {
                    const account = accounts.find(
                      (a) => a.employeeId === dialog.employee?.id,
                    );
                    return (
                      <section className="w-account-box">
                        <h3>บัญชีเข้าใช้งานของพนักงาน</h3>
                        <label className="w-check">
                          <input
                            type="checkbox"
                            name="accountActive"
                            defaultChecked={account?.active ?? false}
                          />
                          เปิดให้เข้าสู่ระบบ
                        </label>
                        <Field label="ไอดี (อังกฤษ/ตัวเลข 4–32 ตัว)">
                          <input
                            name="loginId"
                            minLength={4}
                            maxLength={32}
                            pattern="[A-Za-z0-9][A-Za-z0-9._-]{3,31}"
                            defaultValue={account?.loginId || ""}
                            autoComplete="off"
                          />
                        </Field>
                        <Field
                          label={
                            account
                              ? "รหัสผ่านใหม่ (เว้นว่างเพื่อใช้รหัสเดิม)"
                              : "รหัสผ่านอย่างน้อย 8 ตัว"
                          }
                        >
                          <input
                            name="password"
                            type="password"
                            minLength={8}
                            maxLength={72}
                            autoComplete="new-password"
                          />
                        </Field>
                        <fieldset className="w-menu-access">
                          <legend>เมนูที่มองเห็น</legend>
                          {menu
                            .filter((m) =>
                              [
                                "dashboard",
                                "tasks",
                                "employees",
                                "calendar",
                                "reports",
                              ].includes(m.id),
                            )
                            .map((m) => (
                              <label className="w-check" key={m.id}>
                                <input
                                  type="checkbox"
                                  name="menuPermission"
                                  value={m.id}
                                  defaultChecked={
                                    account?.permissions.includes(m.id) ??
                                    m.id === "tasks"
                                  }
                                />
                                {m.label}
                              </label>
                            ))}
                          <SopAccessFields permissions={account?.permissions || []} />
                        </fieldset>
                        <fieldset className="w-menu-access">
                          <legend>งานของฝ่ายที่มองเห็น</legend>
                          {state.departments.map((department) => (
                            <label className="w-check" key={department}>
                              <input
                                type="checkbox"
                                name="visibleDepartment"
                                value={department}
                                defaultChecked={
                                  account
                                    ? account.visibleDepartments?.includes(
                                        department,
                                      )
                                    : department === dialog.employee?.department
                                }
                              />
                              {department}
                            </label>
                          ))}
                        </fieldset>
                        <p className="w-muted">
                          พนักงานเห็นงานที่ตนรับผิดชอบ/เป็นผู้ตรวจเสมอ
                          และเห็นเพิ่มตามฝ่ายที่เลือก แต่แก้สถานะงานของคนอื่นไม่ได้
                          หากไม่เลือกฝ่ายใด จะเห็นเฉพาะงานที่เกี่ยวข้องกับตนเอง
                        </p>
                      </section>
                    );
                  })()}
                <button className="w-primary">{busyLabel}</button>
              </fieldset>
            </form>
          )}
          {dialog.kind === "task" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  old = dialog.task;
                const labels = Array.from(
                    new Set(
                      String(f.get("checklist"))
                        .split("\n")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    ),
                  ),
                  frequency = String(f.get("routineFrequency")),
                  dueDate = String(f.get("dueDate")),
                  endMode = String(f.get("routineEndMode") || "never"),
                  createMode = String(
                    f.get("routineCreateMode") || "afterApproval",
                  ),
                  weekdays = f
                    .getAll("routineWeekday")
                    .map(Number)
                    .sort((a, b) => a - b) as RoutineWeekday[],
                  monthMode = String(f.get("routineMonthMode") || "day"),
                  monthDays = f
                    .getAll("routineMonthDayChoice")
                    .map(Number)
                    .sort((a, b) => a - b);
                const routineEndDate =
                    endMode === "date" ? String(f.get("routineEndDate")) : null,
                  startDate = String(f.get("routineStartDate") || dueDate);
                if (frequency === "weekly" && !weekdays.length) {
                  setError("กรุณาเลือกวันที่ต้องทำอย่างน้อย 1 วัน");
                  return;
                }
                if (
                  frequency === "monthly" &&
                  monthMode === "days" &&
                  !monthDays.length
                ) {
                  setError("กรุณาเลือกวันที่ในเดือนอย่างน้อย 1 วัน");
                  return;
                }
                if (startDate > dueDate) {
                  setError("วันที่เริ่มชุดงานต้องไม่เกินวันครบกำหนดรอบแรก");
                  return;
                }
                if (routineEndDate && routineEndDate < dueDate) {
                  setError("วันสิ้นสุดงานประจำต้องไม่ก่อนวันครบกำหนดรอบแรก");
                  return;
                }
                const routine: Routine | undefined =
                  frequency === "none"
                    ? undefined
                    : {
                        frequency: frequency as RoutineFrequency,
                        interval: Number(f.get("routineInterval")),
                        startDate,
                        endMode: endMode as Routine["endMode"],
                        endDate: routineEndDate,
                        seriesId: old?.routine?.seriesId || uid(),
                        occurrence: old?.routine?.occurrence || 1,
                        createMode: createMode as Routine["createMode"],
                        ...(frequency === "weekly" ? { weekdays } : {}),
                        ...(frequency === "monthly"
                          ? {
                              monthMode: monthMode as Routine["monthMode"],
                              monthDay: Number(f.get("routineMonthDay") || 1),
                              monthWeek: Number(
                                f.get("routineMonthWeek") || 1,
                              ) as Routine["monthWeek"],
                              monthWeekday: Number(
                                f.get("routineMonthWeekday") || 0,
                              ) as RoutineWeekday,
                              ...(monthMode === "days" ? { monthDays } : {}),
                            }
                          : {}),
                        ...(endMode === "count"
                          ? {
                              maxOccurrences: Number(
                                f.get("routineMaxOccurrences"),
                              ),
                            }
                          : {}),
                        ...(createMode === "advance"
                          ? {
                              advanceCount: Number(
                                f.get("routineAdvanceCount"),
                              ),
                            }
                          : {}),
                      };
                const record: Task = {
                  id: old?.id || uid(),
                  title: String(f.get("title")).trim(),
                  description: String(f.get("description")).trim(),
                  assigneeId: String(f.get("assignee")),
                  reviewerId: String(f.get("reviewer")),
                  dueDate,
                  priority: String(f.get("priority")) as Task["priority"],
                  status: old?.status || "รอรับงาน",
                  createdAt: old?.createdAt || new Date().toISOString(),
                  completedAt: old?.completedAt || null,
                  checklist: labels.map(
                    (label) =>
                      old?.checklist.find((c) => c.label === label) || {
                        id: uid(),
                        label,
                        done: false,
                      },
                  ),
                  comments: old?.comments || [],
                  attachments: old?.attachments || [],
                  submissionCount: old?.submissionCount || 0,
                  ...(old?.quickSubmit ? { quickSubmit: old.quickSubmit } : {}),
                  ...(routine ? { routine } : {}),
                };
                if (
                  !people(record.assigneeId)?.active ||
                  !people(record.reviewerId)?.active
                ) {
                  setError("เลือกผู้รับผิดชอบและผู้ตรวจที่ใช้งานอยู่");
                  return;
                }
                if (
                  (record.status === "สำเร็จ" || record.status === "รอตรวจ") &&
                  record.checklist.some((c) => !c.done) &&
                  !record.quickSubmit?.incompleteChecklist
                ) {
                  setError(
                    "ต้องเปิดงานกลับมาทำหรือส่งกลับแก้ไข ก่อนเพิ่ม Checklist ที่ยังไม่เสร็จ",
                  );
                  return;
                }
                const scope = String(f.get("routineEditScope") || "this");
                let tasks: Task[];
                if (old && old.routine && scope !== "this") {
                  tasks = state.tasks.map((task) => {
                    const inScope =
                      task.routine?.seriesId === old.routine?.seriesId &&
                      (scope === "series" || task.dueDate >= old.dueDate);
                    if (!inScope) return task;
                    if (task.id === old.id) return record;
                    if (task.status === "สำเร็จ") return task;
                    return {
                      ...task,
                      title: record.title,
                      description: record.description,
                      assigneeId: record.assigneeId,
                      reviewerId: record.reviewerId,
                      priority: record.priority,
                      checklist: labels.map(
                        (label) =>
                          task.checklist.find((c) => c.label === label) || {
                            id: uid(),
                            label,
                            done: false,
                          },
                      ),
                      routine: routine
                        ? { ...routine, occurrence: task.routine?.occurrence }
                        : undefined,
                    };
                  });
                } else
                  tasks = old
                    ? state.tasks.map((task) =>
                        task.id === record.id ? record : task,
                      )
                    : [...state.tasks, record];
                if (
                  routine?.createMode === "advance" &&
                  (!old || scope !== "this")
                ) {
                  for (const planned of buildAdvanceRoutineTasks(record, uid)) {
                    if (
                      !tasks.some(
                        (task) =>
                          task.routine?.seriesId ===
                            planned.routine?.seriesId &&
                          task.dueDate === planned.dueDate,
                      )
                    )
                      tasks.push(planned);
                  }
                }
                if (tasks.length > 5000) {
                  setError("รายการงานเต็มแล้ว ไม่สามารถสร้างรอบล่วงหน้าได้");
                  return;
                }
                if (
                  await save(
                    { ...state, tasks },
                    (old ? "แก้ไข" : "สร้าง") + "งาน: " + record.title,
                  )
                ) {
                  if (!old) celebrate();
                  setDialog(null);
                }
              }}
            >
              <fieldset disabled={busy}>
                <Field label="ชื่องาน *">
                  <input
                    name="title"
                    required
                    maxLength={200}
                    defaultValue={dialog.task?.title}
                  />
                </Field>
                <Field label="รายละเอียด">
                  <textarea
                    name="description"
                    maxLength={5000}
                    defaultValue={dialog.task?.description}
                  />
                </Field>
                <div className="w-form-grid">
                  <Field label="ผู้รับผิดชอบ *">
                    <select
                      name="assignee"
                      required
                      defaultValue={
                        dialog.task?.assigneeId ||
                        dialog.assigneeId ||
                        activePeople[0]?.id
                      }
                    >
                      {activePeople.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name} · {e.branch}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="ผู้ตรวจ *">
                    <select
                      name="reviewer"
                      required
                      defaultValue={
                        dialog.task?.reviewerId || activePeople[0]?.id
                      }
                    >
                      {activePeople.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="ความสำคัญ">
                    <select
                      name="priority"
                      defaultValue={dialog.task?.priority || "ปกติ"}
                    >
                      {["ปกติ", "สูง", "ด่วน"].map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <TaskScheduleFields
                  task={dialog.task}
                  defaultDate={dialog.date || today}
                />
                <Field label="Checklist — หนึ่งบรรทัดต่อหนึ่งขั้นตอน">
                  <textarea
                    name="checklist"
                    defaultValue={dialog.task?.checklist
                      .map((c) => c.label)
                      .join("\n")}
                  />
                </Field>
                <p className="w-muted">
                  สาขาและฝ่ายตามผู้รับผิดชอบปัจจุบัน หากย้ายสาขา
                  รายงานย้อนหลังจะจัดตามสาขาปัจจุบันด้วย
                </p>
                <button className="w-primary">{busyLabel}</button>
              </fieldset>
            </form>
          )}
          {dialog.kind === "event" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  record: Mark = {
                    id: dialog.event?.id || uid(),
                    title: String(f.get("title")).trim(),
                    date: String(f.get("date")),
                    time: String(f.get("time")),
                    color: String(f.get("color")),
                    important: f.get("important") === "on",
                  };
                if (
                  await save(
                    {
                      ...state,
                      events: dialog.event
                        ? state.events.map((x) =>
                            x.id === record.id ? record : x,
                          )
                        : [...state.events, record],
                    },
                    "บันทึกกิจกรรม: " + record.title,
                  )
                )
                  setDialog(null);
              }}
            >
              <fieldset disabled={busy}>
                <Field label="กิจกรรม *">
                  <input
                    name="title"
                    required
                    maxLength={200}
                    defaultValue={dialog.event?.title}
                  />
                </Field>
                <div className="w-form-grid">
                  <Field label="วันที่ *">
                    <input
                      name="date"
                      type="date"
                      required
                      defaultValue={dialog.date}
                    />
                  </Field>
                  <Field label="เวลา">
                    <input
                      name="time"
                      type="time"
                      required
                      defaultValue={dialog.event?.time || "09:00"}
                    />
                  </Field>
                </div>
                <Field label="สี">
                  <select
                    name="color"
                    defaultValue={dialog.event?.color || "yellow"}
                  >
                    {[
                      ["yellow", "เหลือง"],
                      ["blue", "ฟ้า"],
                      ["pink", "ชมพู"],
                      ["green", "เขียว"],
                      ["purple", "ม่วง"],
                    ].map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="w-check">
                  <input
                    type="checkbox"
                    name="important"
                    defaultChecked={dialog.event?.important ?? true}
                  />
                  วันสำคัญ ★
                </label>
                <button className="w-primary">{busyLabel}</button>
                {dialog.event && (
                  <button
                    type="button"
                    className="w-danger"
                    onClick={async () => {
                      if (
                        confirm("ลบกิจกรรมนี้?") &&
                        (await save(
                          {
                            ...state,
                            events: state.events.filter(
                              (x) => x.id !== dialog.event!.id,
                            ),
                          },
                          "ลบกิจกรรม: " + dialog.event!.title,
                        ))
                      )
                        setDialog(null);
                    }}
                  >
                    ลบกิจกรรม
                  </button>
                )}
              </fieldset>
            </form>
          )}
          {dialog.kind === "organization" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const name = String(
                    new FormData(e.currentTarget).get("name"),
                  ).trim(),
                  old = dialog.name,
                  field = dialog.field;
                if (state[field].includes(name) && name !== old) {
                  setError("ชื่อนี้มีอยู่แล้ว");
                  return;
                }
                const next = {
                  ...state,
                  [field]: old
                    ? state[field].map((x) => (x === old ? name : x))
                    : [...state[field], name],
                  employees: state.employees.map((e) =>
                    field === "branches" && e.branch === old
                      ? { ...e, branch: name }
                      : field === "departments" && e.department === old
                        ? { ...e, department: name }
                        : e,
                  ),
                };
                if (
                  await save(
                    next,
                    "บันทึก" +
                      (field === "branches" ? "สาขา" : "ฝ่าย") +
                      ": " +
                      name,
                  )
                )
                  setDialog(null);
              }}
            >
              <fieldset disabled={busy}>
                <Field label="ชื่อ *">
                  <input
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={dialog.name}
                  />
                </Field>
                <p>
                  เมื่อเปลี่ยนชื่อ
                  รายชื่อพนักงานและรายงานที่เกี่ยวข้องจะเปลี่ยนตาม
                </p>
                <button className="w-primary">{busyLabel}</button>
              </fieldset>
            </form>
          )}
        </Modal>
      )}
      {avatarEmployee && (
        <Modal
          title={"เลือกตัวละครของ " + avatarEmployee.name}
          close={() => {
            if (!busy) {
              setAvatarId(null);
              setAvatarSaved("");
            }
          }}
        >
          <AvatarStudio
            key={avatarEmployee.id}
            name={avatarEmployee.name}
            busy={busy}
            error={error}
            savedMessage={avatarSaved}
            onReload={() => void load()}
            initial={avatarEmployee.avatar || defaultAvatar}
            close={() => {
              if (!busy) {
                setAvatarId(null);
                setAvatarSaved("");
              }
            }}
            onSave={(config) => void saveAvatar(avatarEmployee.id, config)}
          />
        </Modal>
      )}
    </div>
  );
}
