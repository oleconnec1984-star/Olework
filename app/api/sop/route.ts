import { env } from "cloudflare:workers";
import { hasSopPermission, resolveActor, sameOrigin } from "../../../lib/employee-auth";
import { gradeSopAnswers, publicQuestions, questionsForPlan } from "../../../lib/sop-quiz";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
type AttemptRow = { id: string; employeeId: string; planId: string | null; score: number; level: string; criticalPassed: number; correctCount: number; totalQuestions: number; completedAt: string };
type PlanRow = { id: string; questionIds: string; audienceType: string; audienceValues: string; scopeDepartments: string; startsAt: string; dueAt: string; retakeWaitDays: number; status: string };

function parseArray(value: string) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; }
  catch { return []; }
}
function planAllows(row: PlanRow, employee: { id: string; department?: string; branch?: string } | undefined) {
  if (!employee) return false;
  const values = parseArray(row.audienceValues);
  const scope = parseArray(row.scopeDepartments);
  if (scope.length && (!employee.department || !scope.includes(employee.department))) return false;
  return row.audienceType === "all" ||
    (row.audienceType === "employee" && values.includes(employee.id)) ||
    (row.audienceType === "department" && Boolean(employee.department) && values.includes(employee.department!)) ||
    (row.audienceType === "branch" && Boolean(employee.branch) && values.includes(employee.branch!));
}
async function workspaceState(ownerId: string) {
  const workspace = await env.DB.prepare("SELECT state FROM ole_workspaces WHERE owner_id=?").bind(ownerId).first<{ state: string }>();
  return workspace ? JSON.parse(workspace.state) as { employees: { id: string; name: string; role?: string; department?: string; branch?: string }[] } : { employees: [] };
}
async function findPlan(ownerId: string, planId: string) {
  return env.DB.prepare("SELECT id,question_ids questionIds,audience_type audienceType,audience_values audienceValues,scope_departments scopeDepartments,starts_at startsAt,due_at dueAt,retake_wait_days retakeWaitDays,status FROM ole_sop_exam_plans WHERE owner_id=? AND id=?")
    .bind(ownerId, planId).first<PlanRow>();
}

export async function GET(request: Request) {
  try {
    const access = await resolveActor(request, env.DB);
    if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    if (access.kind === "employee" && !["sop_quiz", "sop_results", "sop_plans"].some((permission) => access.permissions.includes(permission as "sop_quiz" | "sop_results" | "sop_plans"))) return json({ error: "ไม่ได้รับสิทธิ์เข้าถึงข้อมูลการสอบ" }, 403);
    const state = await workspaceState(access.ownerId);
    const employee = access.kind === "employee" ? state.employees.find((item) => item.id === access.employeeId) : undefined;
    const planId = new URL(request.url).searchParams.get("plan_id") || "";
    let questions = publicQuestions();
    if (planId) {
      if (!hasSopPermission(access, "sop_quiz")) return json({ error: "ไม่ได้รับสิทธิ์ทำแบบทดสอบ" }, 403);
      const plan = await findPlan(access.ownerId, planId);
      if (!plan) return json({ error: "ไม่พบข้อสอบที่เลือก" }, 404);
      const now = Date.now();
      if (access.kind === "employee" && (plan.status !== "open" || Date.parse(plan.startsAt) > now || Date.parse(plan.dueAt) < now || !planAllows(plan, employee))) return json({ error: "ข้อสอบนี้ยังไม่เปิดหรือไม่ได้กำหนดให้คุณ" }, 403);
      questions = questionsForPlan(parseArray(plan.questionIds)).map((question) => ({
        id: question.id,
        categoryId: question.categoryId,
        topicCode: question.topicCode,
        prompt: question.prompt,
        choices: question.choices,
        critical: question.critical,
      }));
    } else if (access.kind === "employee") questions = [];
    const canSeeScopedResults = access.kind === "employee" && hasSopPermission(access, "sop_plans");
    const canSeeAll = access.kind === "owner" || canSeeScopedResults;
    const result = canSeeAll
      ? await env.DB.prepare("SELECT id,employee_id employeeId,plan_id planId,score,level,critical_passed criticalPassed,correct_count correctCount,total_questions totalQuestions,completed_at completedAt FROM ole_sop_attempts WHERE owner_id=? ORDER BY completed_at DESC LIMIT 500").bind(access.ownerId).all<AttemptRow>()
      : await env.DB.prepare("SELECT id,employee_id employeeId,plan_id planId,score,level,critical_passed criticalPassed,correct_count correctCount,total_questions totalQuestions,completed_at completedAt FROM ole_sop_attempts WHERE owner_id=? AND employee_id=? ORDER BY completed_at DESC LIMIT 100").bind(access.ownerId, access.employeeId).all<AttemptRow>();
    const names = new Map(state.employees.map((item) => [item.id, item.name]));
    const visibleEmployeeIds = canSeeScopedResults ? new Set(state.employees.filter((item) => item.department && access.visibleDepartments.includes(item.department)).map((item) => item.id)) : null;
    const attempts = visibleEmployeeIds ? result.results.filter((row) => visibleEmployeeIds.has(row.employeeId)) : result.results;
    return json({ questions, attempts: attempts.map((row) => ({ ...row, criticalPassed: Boolean(row.criticalPassed), employeeName: names.get(row.employeeId) || "พนักงาน" })), canSeeAll, employeeId: access.employeeId });
  } catch (error) {
    console.error("sop read failed", error);
    return json({ error: "โหลดข้อมูล SOP ไม่สำเร็จ กรุณาลองใหม่" }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "คำขอจากแหล่งที่มาไม่ถูกต้อง" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "ต้องใช้ JSON" }, 415);
  try {
    const access = await resolveActor(request, env.DB);
    if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    if (access.kind !== "employee" || !hasSopPermission(access, "sop_quiz")) return json({ error: "แบบทดสอบใช้สำหรับบัญชีพนักงานที่ได้รับสิทธิ์" }, 403);
    const body = await request.json() as { answers?: Record<string, unknown>; planId?: unknown };
    const planId = String(body.planId || "");
    if (!planId) return json({ error: "กรุณาเลือกข้อสอบที่ผู้ดูแลเปิดไว้" }, 400);
    const plan = await findPlan(access.ownerId, planId);
    const state = await workspaceState(access.ownerId);
    const employee = state.employees.find((item) => item.id === access.employeeId);
    const now = Date.now();
    if (!plan || plan.status !== "open" || Date.parse(plan.startsAt) > now || Date.parse(plan.dueAt) < now || !planAllows(plan, employee)) return json({ error: "ข้อสอบนี้ปิดแล้วหรือไม่ได้กำหนดให้คุณ" }, 403);
    if (plan.retakeWaitDays > 0) {
      const latest = await env.DB.prepare("SELECT completed_at completedAt FROM ole_sop_attempts WHERE owner_id=? AND employee_id=? AND plan_id=? ORDER BY completed_at DESC LIMIT 1").bind(access.ownerId, access.employeeId, planId).first<{ completedAt: string }>();
      if (latest && Date.parse(latest.completedAt) + plan.retakeWaitDays * 86400000 > now) return json({ error: `ต้องรอ ${plan.retakeWaitDays} วันก่อนสอบรอบนี้อีกครั้ง` }, 429);
    }
    if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) return json({ error: "คำตอบไม่ครบ" }, 400);
    const selectedQuestions = questionsForPlan(parseArray(plan.questionIds));
    const selectedIds = new Set(selectedQuestions.map((question) => question.id));
    const answers: Record<string, number> = {};
    for (const [id, value] of Object.entries(body.answers)) {
      if (!selectedIds.has(id) || !Number.isInteger(value) || Number(value) < 0 || Number(value) > 3) return json({ error: "รูปแบบคำตอบไม่ถูกต้อง" }, 400);
      answers[id] = Number(value);
    }
    if (Object.keys(answers).length !== selectedQuestions.length) return json({ error: "กรุณาตอบคำถามให้ครบทุกข้อ" }, 400);
    const result = gradeSopAnswers(answers, selectedQuestions);
    const attempt = { id: crypto.randomUUID(), employeeId: access.employeeId, planId, ...result, completedAt: new Date().toISOString() };
    await env.DB.prepare("INSERT INTO ole_sop_attempts (id,owner_id,employee_id,plan_id,score,level,critical_passed,correct_count,total_questions,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(attempt.id, access.ownerId, attempt.employeeId, attempt.planId, attempt.score, attempt.level, attempt.criticalPassed ? 1 : 0, attempt.correct, attempt.total, attempt.completedAt).run();
    return json(attempt, 201);
  } catch (error) {
    console.error("sop submit failed", error);
    return json({ error: "บันทึกผลสอบไม่สำเร็จ คำตอบยังอยู่ กรุณาลองใหม่" }, 503);
  }
}
