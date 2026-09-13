import { env } from "cloudflare:workers";
import { hasSopPermission, resolveActor, sameOrigin, type AccessActor } from "../../../../lib/employee-auth";
import { publicQuestions, sopQuestions } from "../../../../lib/sop-quiz";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const validAudience = new Set(["all", "department", "branch", "employee"]);
const validStatus = new Set(["draft", "open", "closed", "archived"]);

type PlanRow = {
  id: string; title: string; questionIds: string; audienceType: string; audienceValues: string;
  scopeDepartments: string;
  startsAt: string; dueAt: string; questionCount: number; passScore: number; retakeWaitDays: number;
  status: string; createdAt: string; updatedAt: string; attemptCount: number;
};

type PlanInput = {
  title: string; questionIds: string[]; audienceType: string; audienceValues: string[];
  startsAt: string; dueAt: string; passScore: number; retakeWaitDays: number; status: string;
};

function parseArray(value: string) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; }
  catch { return []; }
}

function present(row: PlanRow) {
  return { ...row, questionIds: parseArray(row.questionIds), audienceValues: parseArray(row.audienceValues) };
}

function allows(row: PlanRow, employee: { id: string; department?: string; branch?: string } | undefined) {
  if (!employee) return false;
  const values = parseArray(row.audienceValues);
  const scope = parseArray(row.scopeDepartments);
  if (scope.length && (!employee.department || !scope.includes(employee.department))) return false;
  return row.audienceType === "all" ||
    (row.audienceType === "employee" && values.includes(employee.id)) ||
    (row.audienceType === "department" && Boolean(employee.department) && values.includes(employee.department!)) ||
    (row.audienceType === "branch" && Boolean(employee.branch) && values.includes(employee.branch!));
}

async function allRows(ownerId: string) {
  return env.DB.prepare(
    `SELECT plan.id,plan.title,plan.question_ids questionIds,plan.audience_type audienceType,plan.audience_values audienceValues,plan.scope_departments scopeDepartments,plan.starts_at startsAt,plan.due_at dueAt,plan.question_count questionCount,plan.pass_score passScore,plan.retake_wait_days retakeWaitDays,plan.status,plan.created_at createdAt,plan.updated_at updatedAt,
       (SELECT COUNT(*) FROM ole_sop_attempts attempt WHERE attempt.owner_id=plan.owner_id AND attempt.plan_id=plan.id) attemptCount
     FROM ole_sop_exam_plans plan WHERE plan.owner_id=? ORDER BY plan.starts_at DESC`,
  ).bind(ownerId).all<PlanRow>();
}

function normalizePlan(body: Record<string, unknown>): { value?: PlanInput; error?: string } {
  const title = String(body.title || "").trim().slice(0, 120);
  const requestedIds = Array.isArray(body.questionIds) ? body.questionIds.filter((item): item is string => typeof item === "string") : [];
  const questionIds = [...new Set(requestedIds)];
  const validIds = new Set(sopQuestions.map((question) => question.id));
  const audienceType = String(body.audienceType || "all");
  const audienceValues = Array.isArray(body.audienceValues) ? [...new Set(body.audienceValues.filter((item): item is string => typeof item === "string" && item.trim().length > 0))].slice(0, 200) : [];
  const startsAt = String(body.startsAt || "");
  const dueAt = String(body.dueAt || "");
  const passScore = Number(body.passScore);
  const retakeWaitDays = Number(body.retakeWaitDays);
  const status = validStatus.has(String(body.status)) ? String(body.status) : "draft";
  if (!title || !validAudience.has(audienceType)) return { error: "กรุณากรอกชื่อและกลุ่มผู้สอบ" };
  if (!questionIds.length || questionIds.length > sopQuestions.length || questionIds.some((id) => !validIds.has(id))) return { error: `เลือกข้อสอบได้ 1–${sopQuestions.length} ข้อ และต้องมาจากหัวข้อ SOP` };
  if (requestedIds.length !== questionIds.length) return { error: "ไม่สามารถเลือกข้อสอบซ้ำได้" };
  if (audienceType !== "all" && !audienceValues.length) return { error: "กรุณาเลือกผู้สอบอย่างน้อย 1 รายการ" };
  if (!startsAt || !dueAt || Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(dueAt)) || Date.parse(dueAt) <= Date.parse(startsAt)) return { error: "วันปิดสอบต้องอยู่หลังวันเปิดสอบ" };
  if (!Number.isInteger(passScore) || passScore < 0 || passScore > 100) return { error: "คะแนนผ่านต้องอยู่ระหว่าง 0–100" };
  if (![0, 1, 3].includes(retakeWaitDays)) return { error: "เงื่อนไขสอบใหม่ไม่ถูกต้อง" };
  return { value: { title, questionIds, audienceType, audienceValues, startsAt, dueAt, passScore, retakeWaitDays, status } };
}

type WorkspaceEmployee = { id: string; department?: string; branch?: string };
async function workspaceEmployees(ownerId: string) {
  const workspace = await env.DB.prepare("SELECT state FROM ole_workspaces WHERE owner_id=?").bind(ownerId).first<{ state: string }>();
  const state = workspace ? JSON.parse(workspace.state) as { employees?: WorkspaceEmployee[] } : {};
  return state.employees || [];
}
function scopeFor(access: AccessActor) {
  return access.kind === "owner" ? [] : [...new Set(access.visibleDepartments)];
}
function canManageRow(access: AccessActor, row: PlanRow) {
  if (access.kind === "owner") return true;
  const scope = parseArray(row.scopeDepartments);
  return scope.length > 0 && scope.every((department) => access.visibleDepartments.includes(department));
}
function validateScopedAudience(access: AccessActor, plan: PlanInput, employees: WorkspaceEmployee[]) {
  if (access.kind === "owner") return "";
  const scope = scopeFor(access);
  if (!scope.length) return "กรุณาเลือกงานของฝ่ายที่มองเห็นก่อนกำหนดผู้เข้าสอบ";
  const scopedEmployees = employees.filter((employee) => employee.department && scope.includes(employee.department));
  if (plan.audienceType === "department" && plan.audienceValues.some((value) => !scope.includes(value))) return "เลือกผู้สอบได้เฉพาะฝ่ายที่ได้รับสิทธิ์มองเห็น";
  if (plan.audienceType === "employee" && plan.audienceValues.some((value) => !scopedEmployees.some((employee) => employee.id === value))) return "เลือกพนักงานได้เฉพาะฝ่ายที่ได้รับสิทธิ์มองเห็น";
  if (plan.audienceType === "branch" && plan.audienceValues.some((value) => !scopedEmployees.some((employee) => employee.branch === value))) return "เลือกสาขาได้เฉพาะที่มีพนักงานในฝ่ายที่ได้รับสิทธิ์มองเห็น";
  return "";
}

export async function GET(request: Request) {
  try {
    const access = await resolveActor(request, env.DB);
    if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    if (!hasSopPermission(access, "sop_quiz") && !hasSopPermission(access, "sop_plans")) return json({ error: "ไม่ได้รับสิทธิ์เข้าถึงกำหนดการสอบ" }, 403);
    const rows = await allRows(access.ownerId);
    if (access.kind === "owner") return json({ plans: rows.results.map(present), questionBank: publicQuestions(), maxQuestions: sopQuestions.length, canManage: true });
    if (hasSopPermission(access, "sop_plans")) {
      const managed = rows.results.filter((row) => canManageRow(access, row)).map(present);
      return json({ plans: managed, questionBank: publicQuestions(), maxQuestions: sopQuestions.length, canManage: true });
    }
    const employees = await workspaceEmployees(access.ownerId);
    const employee = employees.find((item) => item.id === access.employeeId);
    const now = Date.now();
    const plans = rows.results.filter((row) => row.status === "open" && Date.parse(row.startsAt) <= now && Date.parse(row.dueAt) >= now && allows(row, employee)).map(present);
    return json({ plans, questionBank: [], maxQuestions: sopQuestions.length, canManage: false });
  } catch (error) {
    console.error("sop exam plans read failed", error);
    return json({ error: "โหลดกำหนดการสอบไม่สำเร็จ" }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "คำขอจากแหล่งที่มาไม่ถูกต้อง" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "ต้องใช้ JSON" }, 415);
  try {
    const access = await resolveActor(request, env.DB);
    if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    if (!hasSopPermission(access, "sop_plans")) return json({ error: "ไม่ได้รับสิทธิ์กำหนดการสอบ" }, 403);
    const body = await request.json() as Record<string, unknown>;
    const normalized = normalizePlan(body);
    if (!normalized.value) return json({ error: normalized.error }, 400);
    const { title, questionIds, audienceType, audienceValues, startsAt, dueAt, passScore, retakeWaitDays, status } = normalized.value;
    const scopeDepartments = scopeFor(access);
    const scopeError = validateScopedAudience(access, normalized.value, await workspaceEmployees(access.ownerId));
    if (scopeError) return json({ error: scopeError }, 403);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO ole_sop_exam_plans (id,owner_id,title,question_ids,audience_type,audience_values,scope_departments,starts_at,due_at,question_count,pass_score,retake_wait_days,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id, access.ownerId, title, JSON.stringify(questionIds), audienceType, JSON.stringify(audienceValues), JSON.stringify(scopeDepartments), startsAt, dueAt, questionIds.length, passScore, retakeWaitDays, status, now, now).run();
    return json({ id, title, questionIds, audienceType, audienceValues, scopeDepartments, startsAt, dueAt, questionCount: questionIds.length, passScore, retakeWaitDays, status, createdAt: now, updatedAt: now }, 201);
  } catch (error) {
    console.error("sop exam plan create failed", error);
    return json({ error: "บันทึกกำหนดการสอบไม่สำเร็จ" }, 503);
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return json({ error: "คำขอจากแหล่งที่มาไม่ถูกต้อง" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "ต้องใช้ JSON" }, 415);
  try {
    const access = await resolveActor(request, env.DB);
    if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    if (!hasSopPermission(access, "sop_plans")) return json({ error: "ไม่ได้รับสิทธิ์แก้ไขข้อสอบ" }, 403);
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id || "");
    const status = String(body.status || "");
    if (!id) return json({ error: "ไม่พบรหัสชุดข้อสอบ" }, 400);
    const existing = await env.DB.prepare(
      `SELECT plan.id,plan.title,plan.question_ids questionIds,plan.audience_type audienceType,plan.audience_values audienceValues,plan.scope_departments scopeDepartments,plan.starts_at startsAt,plan.due_at dueAt,plan.question_count questionCount,plan.pass_score passScore,plan.retake_wait_days retakeWaitDays,plan.status,plan.created_at createdAt,plan.updated_at updatedAt,
        (SELECT COUNT(*) FROM ole_sop_attempts attempt WHERE attempt.owner_id=plan.owner_id AND attempt.plan_id=plan.id) attemptCount
       FROM ole_sop_exam_plans plan WHERE plan.owner_id=? AND plan.id=?`,
    ).bind(access.ownerId, id).first<PlanRow>();
    if (!existing) return json({ error: "ไม่พบกำหนดการสอบ" }, 404);
    if (!canManageRow(access, existing)) return json({ error: "ชุดข้อสอบนี้อยู่นอกฝ่ายที่ได้รับสิทธิ์มองเห็น" }, 403);
    const updatedAt = new Date().toISOString();
    if (!("title" in body)) {
      if (!validStatus.has(status)) return json({ error: "สถานะข้อสอบไม่ถูกต้อง" }, 400);
      await env.DB.prepare("UPDATE ole_sop_exam_plans SET status=?,updated_at=? WHERE owner_id=? AND id=?").bind(status, updatedAt, access.ownerId, id).run();
      return json({ ...present(existing), status, updatedAt });
    }
    const normalized = normalizePlan(body);
    if (!normalized.value) return json({ error: normalized.error }, 400);
    const next = normalized.value;
    const scopeError = validateScopedAudience(access, next, await workspaceEmployees(access.ownerId));
    if (scopeError) return json({ error: scopeError }, 403);
    if (existing.attemptCount > 0 && JSON.stringify(next.questionIds) !== JSON.stringify(parseArray(existing.questionIds)))
      return json({ error: "ชุดนี้มีผลสอบแล้ว จึงเปลี่ยนคำถามไม่ได้ กรุณาทำสำเนาเป็นชุดใหม่" }, 409);
    await env.DB.prepare(
      `UPDATE ole_sop_exam_plans SET title=?,question_ids=?,audience_type=?,audience_values=?,scope_departments=?,starts_at=?,due_at=?,question_count=?,pass_score=?,retake_wait_days=?,status=?,updated_at=? WHERE owner_id=? AND id=?`,
    ).bind(next.title, JSON.stringify(next.questionIds), next.audienceType, JSON.stringify(next.audienceValues), JSON.stringify(scopeFor(access)), next.startsAt, next.dueAt, next.questionIds.length, next.passScore, next.retakeWaitDays, next.status, updatedAt, access.ownerId, id).run();
    return json({ ...next, id, questionCount: next.questionIds.length, createdAt: existing.createdAt, updatedAt, attemptCount: existing.attemptCount });
  } catch (error) {
    console.error("sop exam plan status failed", error);
    return json({ error: "เปลี่ยนสถานะข้อสอบไม่สำเร็จ" }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "คำขอจากแหล่งที่มาไม่ถูกต้อง" }, 403);
  try {
    const access = await resolveActor(request, env.DB);
    if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    if (!hasSopPermission(access, "sop_plans")) return json({ error: "ไม่ได้รับสิทธิ์ลบกำหนดการสอบ" }, 403);
    const id = new URL(request.url).searchParams.get("id") || "";
    const plan = await env.DB.prepare(
      `SELECT plan.id,plan.title,plan.question_ids questionIds,plan.audience_type audienceType,plan.audience_values audienceValues,plan.scope_departments scopeDepartments,plan.starts_at startsAt,plan.due_at dueAt,plan.question_count questionCount,plan.pass_score passScore,plan.retake_wait_days retakeWaitDays,plan.status,plan.created_at createdAt,plan.updated_at updatedAt,
       (SELECT COUNT(*) FROM ole_sop_attempts attempt WHERE attempt.owner_id=plan.owner_id AND attempt.plan_id=plan.id) attemptCount
       FROM ole_sop_exam_plans plan WHERE plan.owner_id=? AND plan.id=?`,
    ).bind(access.ownerId, id).first<PlanRow>();
    if (!plan) return json({ error: "ไม่พบกำหนดการสอบ" }, 404);
    if (!canManageRow(access, plan)) return json({ error: "ชุดข้อสอบนี้อยู่นอกฝ่ายที่ได้รับสิทธิ์มองเห็น" }, 403);
    if (plan.attemptCount > 0) return json({ error: "ชุดนี้มีผลสอบแล้ว ลบถาวรไม่ได้ แต่เก็บเข้าคลังได้" }, 409);
    if (plan.status !== "draft") return json({ error: "ลบถาวรได้เฉพาะชุดแบบร่างที่ยังไม่มีผลสอบ กรุณาเก็บเข้าคลังแทน" }, 409);
    await env.DB.prepare("DELETE FROM ole_sop_exam_plans WHERE owner_id=? AND id=?").bind(access.ownerId, id).run();
    return json({ ok: true });
  } catch (error) {
    console.error("sop exam plan delete failed", error);
    return json({ error: "ลบกำหนดการสอบไม่สำเร็จ" }, 503);
  }
}
