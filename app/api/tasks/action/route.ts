import { env } from "cloudflare:workers";
import {
  buildNextRoutineTask,
  buildAdvanceRoutineTasks,
  transition,
  validateState,
  type State,
  type Task,
  type Status,
} from "../../../../lib/work-model";
import {
  canViewTask,
  resolveActor,
  sameOrigin,
} from "../../../../lib/employee-auth";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const statuses: Status[] = [
  "รอรับงาน",
  "กำลังทำ",
  "รอตรวจ",
  "ต้องแก้ไข",
  "สำเร็จ",
];

export async function POST(request: Request) {
  const access = await resolveActor(request, env.DB);
  if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
  if (!sameOrigin(request)) return json({ error: "คำขอไม่ถูกต้อง" }, 403);
  let body: {
    task?: Task;
    revision?: number;
    action?: string;
    intent?: "standard" | "quickSubmit" | "create";
  };
  try {
    const raw = await request.text();
    if (raw.length > 30000) throw new Error();
    body = JSON.parse(raw);
  } catch {
    return json({ error: "ข้อมูลรายการงานไม่ถูกต้อง" }, 400);
  }
  if (
    !body.task ||
    !Number.isSafeInteger(body.revision) ||
    typeof body.action !== "string"
  )
    return json({ error: "ข้อมูลรายการงานไม่ครบ" }, 400);
  try {
    const row = await env.DB.prepare(
      "SELECT state,revision FROM ole_workspaces WHERE owner_id=?",
    )
      .bind(access.ownerId)
      .first<{ state: string; revision: number }>();
    if (!row) return json({ error: "ไม่พบพื้นที่ทำงาน" }, 404);
    if (row.revision !== body.revision)
      return json({ error: "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดล่าสุด" }, 409);
    const state = JSON.parse(row.state) as State,
      old = state.tasks.find((t) => t.id === body.task!.id),
      now = new Date().toISOString();
    if (!old) {
      if (
        access.kind !== "employee" ||
        body.intent !== "create" ||
        !access.permissions.includes("tasks")
      )
        return json({ error: "ไม่พบงานนี้" }, 404);
      const assignee = state.employees.find(
          (employee) => employee.id === body.task!.assigneeId && employee.active,
        ),
        reviewer = state.employees.find(
          (employee) => employee.id === body.task!.reviewerId && employee.active,
        );
      if (!assignee || !reviewer)
        return json({ error: "เลือกผู้รับผิดชอบและผู้ตรวจที่ใช้งานอยู่" }, 400);
      const created: Task = {
        ...body.task,
        status: "รอรับงาน",
        createdAt: now,
        completedAt: null,
        checklist: body.task.checklist.map((item) => ({ ...item, done: false })),
        comments: [],
        attachments: [],
        submissionCount: 0,
      };
      delete created.quickSubmit;
      state.tasks.push(created);
      if (created.routine?.createMode === "advance") {
        for (const planned of buildAdvanceRoutineTasks(
          created,
          () => crypto.randomUUID(),
        )) {
          if (
            !state.tasks.some(
              (task) =>
                task.routine?.seriesId === planned.routine?.seriesId &&
                task.dueDate === planned.dueDate,
            )
          )
            state.tasks.push(planned);
        }
      }
      state.activity = [
        {
          id: crypto.randomUUID(),
          text: `สร้างงาน: ${created.title}`,
          at: now,
          actor: access.name,
        },
        ...state.activity,
      ].slice(0, 200);
      validateState(state);
      const result = await env.DB.prepare(
        "UPDATE ole_workspaces SET state=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=?",
      )
        .bind(JSON.stringify(state), now, access.ownerId, row.revision)
        .run();
      if (result.meta.changes !== 1)
        return json({ error: "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดล่าสุด" }, 409);
      const tasks = state.tasks.filter((task) => canViewTask(access, state, task)),
        ids = new Set([
          access.employeeId,
          ...tasks.flatMap((task) => [task.assigneeId, task.reviewerId]),
        ]);
      return json({
        state: {
          ...state,
          tasks,
          employees:
            access.permissions.includes("employees") ||
            access.permissions.includes("tasks")
              ? state.employees
              : state.employees.filter((employee) => ids.has(employee.id)),
          events: access.permissions.includes("calendar") ? state.events : [],
          activity: [],
        },
        revision: row.revision + 1,
        updatedAt: now,
      });
    }
    const isOwner = access.kind === "owner",
      assignee = isOwner || old.assigneeId === access.employeeId,
      reviewer = isOwner || old.reviewerId === access.employeeId;
    if (!isOwner && !assignee && !reviewer)
      return json({ error: "คุณไม่มีสิทธิ์แก้ไขงานนี้" }, 403);
    const proposed = body.task;
    for (const key of [
      "id",
      "title",
      "description",
      "assigneeId",
      "reviewerId",
      "dueDate",
      "priority",
      "createdAt",
      "routine",
      "attachments",
      "quickSubmit",
      "submissionCount",
    ] as const)
      if (JSON.stringify(proposed[key]) !== JSON.stringify(old[key]))
        return json(
          { error: "พนักงานแก้ไขได้เฉพาะสถานะ Checklist และความคิดเห็น" },
          403,
        );
    if (
      proposed.checklist.length !== old.checklist.length ||
      proposed.checklist.some(
        (c, i) =>
          c.id !== old.checklist[i]?.id || c.label !== old.checklist[i]?.label,
      )
    )
      return json({ error: "โครงสร้าง Checklist เปลี่ยนไม่ได้" }, 403);
    if (
      !assignee &&
      JSON.stringify(proposed.checklist) !== JSON.stringify(old.checklist)
    )
      return json({ error: "เฉพาะผู้รับผิดชอบที่อัปเดต Checklist ได้" }, 403);
    if (
      proposed.comments.length < old.comments.length ||
      proposed.comments.length > old.comments.length + 1 ||
      old.comments.some(
        (c, i) => JSON.stringify(c) !== JSON.stringify(proposed.comments[i]),
      )
    )
      return json({ error: "แก้ไขความคิดเห็นเดิมไม่ได้" }, 403);
    if (proposed.comments.length > old.comments.length) {
      const last = proposed.comments.at(-1)!;
      last.author = access.name;
      last.at = new Date().toISOString();
      last.text = last.text.trim();
      if (!last.text || last.text.length > 2000)
        return json({ error: "ความคิดเห็นไม่ถูกต้อง" }, 400);
    }
    if (!statuses.includes(proposed.status))
      return json({ error: "สถานะไม่ถูกต้อง" }, 400);
    const quickSubmit = body.intent === "quickSubmit";
    if (
      quickSubmit &&
      (!assignee ||
        old.status !== "รอรับงาน" ||
        proposed.status !== "รอตรวจ" ||
        JSON.stringify(proposed.checklist) !== JSON.stringify(old.checklist) ||
        JSON.stringify(proposed.comments) !== JSON.stringify(old.comments))
    )
      return json(
        { error: "ส่งงานทันทีได้เฉพาะผู้รับผิดชอบในงานที่รอรับ" },
        403,
      );
    if (proposed.status !== old.status) {
      const allowed =
        quickSubmit ||
        (assignee &&
          (((old.status === "รอรับงาน" || old.status === "ต้องแก้ไข") &&
            proposed.status === "กำลังทำ") ||
            (old.status === "กำลังทำ" && proposed.status === "รอตรวจ"))) ||
        (reviewer &&
          old.status === "รอตรวจ" &&
          (proposed.status === "สำเร็จ" || proposed.status === "ต้องแก้ไข"));
      if (!allowed)
        return json({ error: "คุณไม่มีสิทธิ์เปลี่ยนสถานะขั้นตอนนี้" }, 403);
    }
    let updated: Task = { ...proposed, completedAt: old.completedAt };
    if (quickSubmit) {
      const incompleteChecklist = old.checklist.some((item) => !item.done);
      updated = {
        ...transition(old, "รอตรวจ", now, {
          allowIncompleteChecklist: true,
        }),
        quickSubmit: { at: now, by: access.name, incompleteChecklist },
      };
    } else if (proposed.status !== old.status)
      updated = transition(
        { ...old, checklist: proposed.checklist, comments: proposed.comments },
        proposed.status,
      );
    state.tasks = state.tasks.map((t) => (t.id === old.id ? updated : t));
    if (
      old.status !== "สำเร็จ" &&
      updated.status === "สำเร็จ" &&
      updated.routine
    ) {
      const source =
        updated.routine.createMode === "advance"
          ? [...state.tasks]
              .filter((t) => t.routine?.seriesId === updated.routine?.seriesId)
              .sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0] || updated
          : updated;
      const next = buildNextRoutineTask(source, crypto.randomUUID());
      if (
        next &&
        !state.tasks.some(
          (t) =>
            t.routine?.seriesId === next.routine?.seriesId &&
            t.dueDate === next.dueDate,
        )
      )
        state.tasks.push(next);
    }
    const actionText = quickSubmit
      ? `ส่งงานทันที: ${old.title}${updated.quickSubmit?.incompleteChecklist ? " · Checklist ยังไม่ครบ" : ""}`
      : body.action.slice(0, 1000);
    state.activity = [
      {
        id: crypto.randomUUID(),
        text: actionText,
        at: now,
        actor: access.name,
      },
      ...state.activity,
    ].slice(0, 200);
    validateState(state);
    const result = await env.DB.prepare(
      "UPDATE ole_workspaces SET state=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=?",
    )
      .bind(JSON.stringify(state), now, access.ownerId, row.revision)
      .run();
    if (result.meta.changes !== 1)
      return json({ error: "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดล่าสุด" }, 409);
    if (isOwner)
      return json({
        state,
        revision: row.revision + 1,
        updatedAt: now,
      });
    const tasks = state.tasks.filter((task) => canViewTask(access, state, task)),
      ids = new Set([
        access.employeeId,
        ...tasks.flatMap((t) => [t.assigneeId, t.reviewerId]),
      ]);
    return json({
      state: {
        ...state,
        tasks,
        employees:
          access.permissions.includes("employees") ||
          access.permissions.includes("tasks")
          ? state.employees
          : state.employees.filter((e) => ids.has(e.id)),
        events: access.permissions.includes("calendar") ? state.events : [],
        activity: [],
      },
      revision: row.revision + 1,
      updatedAt: now,
    });
  } catch (error) {
    console.error("employee task action failed", error);
    return json({ error: "บันทึกงานไม่สำเร็จ" }, 503);
  }
}
