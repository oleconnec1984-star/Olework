import { env } from "cloudflare:workers";
import { emptyState, validateState, type State } from "../../../lib/work-model";
import { canViewTask, normalizeEmployeePermissions, resolveActor } from "../../../lib/employee-auth";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function identity(request: Request) {
  return request.headers.get("oai-authenticated-user-id");
}
export async function GET(request: Request) {
  try {
    const access = await resolveActor(request, env.DB);
    if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const row = await env.DB.prepare(
      "SELECT state, revision, updated_at FROM ole_workspaces WHERE owner_id = ?",
    )
      .bind(access.ownerId)
      .first<{ state: string; revision: number; updated_at: string }>();
    let state = row ? JSON.parse(row.state) : emptyState();
    let accounts: unknown[] = [];
    if (access.kind === "employee") {
      const tasks = state.tasks.filter(
          (task: { assigneeId: string; reviewerId: string }) =>
            canViewTask(access, state, task),
        ),
        ids = new Set<string>([
          access.employeeId,
          ...tasks.flatMap((t: { assigneeId: string; reviewerId: string }) => [
            t.assigneeId,
            t.reviewerId,
          ]),
        ]);
      if (access.permissions.includes("sop_plans")) {
        for (const employee of state.employees as { id: string; department?: string }[])
          if (employee.department && access.visibleDepartments.includes(employee.department)) ids.add(employee.id);
      }
      state = {
        ...state,
        tasks,
        employees:
          access.permissions.includes("employees") ||
          access.permissions.includes("tasks")
          ? state.employees
          : state.employees.filter((e: { id: string }) => ids.has(e.id)),
        events: access.permissions.includes("calendar") ? state.events : [],
        activity: [],
      };
    } else {
      accounts = (
        await env.DB.prepare(
          "SELECT employee_id employeeId,login_id loginId,permissions,visible_departments visibleDepartments,active FROM ole_employee_accounts WHERE owner_id=?",
        )
          .bind(access.ownerId)
          .all<{
            employeeId: string;
            loginId: string;
            permissions: string;
            visibleDepartments: string;
            active: number;
          }>()
      ).results.map((a) => ({
        ...a,
        permissions: normalizeEmployeePermissions(JSON.parse(a.permissions)),
        visibleDepartments: JSON.parse(a.visibleDepartments),
        active: !!a.active,
      }));
    }
    return json({
      state,
      revision: row?.revision ?? 0,
      updatedAt: row?.updated_at ?? null,
      actor: access.name,
      role: access.kind,
      employeeId: access.employeeId,
      permissions: access.permissions,
      visibleDepartments: access.visibleDepartments,
      accounts,
    });
  } catch (error) {
    console.error("workspace read failed", error);
    return json(
      { error: "โหลดข้อมูลกลางไม่ได้ กรุณาลองใหม่ ข้อมูลเดิมยังไม่ถูกเปลี่ยน" },
      503,
    );
  }
}
export async function PUT(request: Request) {
  const owner = identity(request);
  if (!owner) return json({ error: "กรุณาเข้าสู่ระบบด้วย ChatGPT" }, 401);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return json({ error: "คำขอจากแหล่งที่มาไม่ถูกต้อง" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    return json({ error: "ต้องใช้ JSON" }, 415);
  const text = await request.text();
  if (text.length > 1500000)
    return json(
      { error: "ข้อมูลใหญ่เกินกำหนด กรุณาส่งออกสำรองและติดต่อผู้ดูแล" },
      413,
    );
  let body;
  try {
    body = JSON.parse(text);
    validateState(body.state);
    if (
      !Number.isSafeInteger(body.revision) ||
      body.revision < 0 ||
      typeof body.action !== "string" ||
      !body.action.trim() ||
      body.action.length > 1000
    )
      throw new Error("ข้อมูลเวอร์ชันหรือรายการเปลี่ยนแปลงไม่ถูกต้อง");
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "ข้อมูลไม่ถูกต้อง" },
      400,
    );
  }
  try {
    const now = new Date().toISOString();
    const row = await env.DB.prepare(
      "SELECT state, revision FROM ole_workspaces WHERE owner_id = ?",
    )
      .bind(owner)
      .first<{ state: string; revision: number }>();
    if ((row?.revision ?? 0) !== body.revision)
      return json(
        {
          error:
            "มีการเปลี่ยนแปลงจากอีกหน้าจอแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก",
        },
        409,
      );
    const previous = (row ? JSON.parse(row.state) : emptyState()) as State;
    body.state.activity = [
      {
        id: crypto.randomUUID(),
        text: body.action,
        at: now,
        actor: request.headers.get("oai-authenticated-user-email") || "ผู้ดูแล",
      },
      ...previous.activity,
    ].slice(0, 200);
    const result = row
      ? await env.DB.prepare(
          "UPDATE ole_workspaces SET state = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ?",
        )
          .bind(JSON.stringify(body.state), now, owner, body.revision)
          .run()
      : await env.DB.prepare(
          "INSERT OR IGNORE INTO ole_workspaces (owner_id,state,revision,updated_at) VALUES (?,?,1,?)",
        )
          .bind(owner, JSON.stringify(body.state), now)
          .run();
    if (result.meta.changes !== 1)
      return json(
        { error: "ข้อมูลถูกแก้ไขพร้อมกัน กรุณาโหลดล่าสุดแล้วลองอีกครั้ง" },
        409,
      );
    const remainingIds = new Set(
      (body.state as State).tasks.map((task) => task.id),
    );
    const removedEvidence = previous.tasks.flatMap((task) =>
      remainingIds.has(task.id)
        ? []
        : (task.attachments || []).map(
            (attachment) =>
              `evidence/${encodeURIComponent(owner)}/${encodeURIComponent(task.id)}/${attachment.id}`,
          ),
    );
    const bucket = (env as typeof env & { BUCKET?: R2Bucket }).BUCKET;
    if (bucket && removedEvidence.length)
      try {
        await bucket.delete(removedEvidence);
      } catch (error) {
        console.error("removed task evidence cleanup failed", error);
      }
    return json({
      state: body.state,
      revision: body.revision + 1,
      updatedAt: now,
    });
  } catch (error) {
    console.error("workspace save failed", error);
    return json(
      { error: "บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองใหม่" },
      503,
    );
  }
}
