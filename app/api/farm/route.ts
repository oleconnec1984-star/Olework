import { env } from "cloudflare:workers";
import { resolveActor, sameOrigin } from "../../../lib/employee-auth";
import { defaultFarmConfig, learningReward, levelFor, monthKey, stageFor, taskRewards, xpCategories, type FarmConfig, type XpCategory } from "../../../lib/ole-farm";
import type { State } from "../../../lib/work-model";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
type Reward = { employeeId: string; branchId: string | null; season: number; category: XpCategory; amount: number; sourceType: string; sourceId: string; idempotencyKey: string; createdAt: string; createdBy: string };
type Aggregate = { employeeId: string; category: XpCategory; total: number; monthly: number; previousMonthly: number };

async function workspace(ownerId: string) {
  const row = await env.DB.prepare("SELECT state FROM ole_workspaces WHERE owner_id=?").bind(ownerId).first<{ state: string }>();
  if (!row) return null;
  return JSON.parse(row.state) as State;
}
async function configFor(ownerId: string, actor: string) {
  const row = await env.DB.prepare("SELECT config FROM ole_farm_configs WHERE owner_id=?").bind(ownerId).first<{ config: string }>();
  if (row) try { return JSON.parse(row.config) as FarmConfig; } catch {}
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO ole_farm_configs (owner_id,config,updated_at,updated_by) VALUES (?,?,?,?)").bind(ownerId, JSON.stringify(defaultFarmConfig), now, actor).run();
  return defaultFarmConfig;
}
async function syncRewards(ownerId: string, state: State) {
  const attempts = await env.DB.prepare("SELECT id,employee_id employeeId,score,critical_passed criticalPassed,completed_at completedAt FROM ole_sop_attempts WHERE owner_id=?").bind(ownerId).all<{ id: string; employeeId: string; score: number; criticalPassed: number; completedAt: string }>();
  const rewards: Reward[] = [
    ...state.tasks.flatMap((task) => taskRewards(task, state)),
    ...attempts.results.map((attempt) => learningReward(attempt, state)),
  ];
  if (!rewards.length) return;
  const statements = rewards.map((reward) => env.DB.prepare(
    "INSERT OR IGNORE INTO ole_xp_reward_events (id,owner_id,employee_id,season,branch_id,category,amount,source_type,source_id,idempotency_key,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  ).bind(crypto.randomUUID(), ownerId, reward.employeeId, reward.season, reward.branchId, reward.category, reward.amount, reward.sourceType, reward.sourceId, reward.idempotencyKey, reward.createdAt, reward.createdBy));
  for (let offset = 0; offset < statements.length; offset += 80) await env.DB.batch(statements.slice(offset, offset + 80));
}
function monthBounds(now = new Date()) {
  const [year, month] = monthKey(now).split("-").map(Number);
  const utc = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1, -7)).toISOString();
  return { previous: utc(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1), current: utc(year, month), next: utc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1) };
}

export async function GET(request: Request) {
  try {
    const access = await resolveActor(request, env.DB);
    if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    const state = await workspace(access.ownerId);
    if (!state) return json({ error: "ยังไม่มีข้อมูลพนักงาน" }, 404);
    await syncRewards(access.ownerId, state);
    const params = new URL(request.url).searchParams;
    const season = Math.max(2024, Math.min(2100, Number(params.get("season")) || Number(monthKey(new Date()).slice(0, 4))));
    const ranking = ["annual", "monthly", "growth"].includes(params.get("ranking") || "") ? params.get("ranking")! : "annual";
    const selectedBranch = params.get("branch") || "";
    const bounds = monthBounds();
    const rows = await env.DB.prepare(
      `SELECT employee_id employeeId,category,SUM(amount) total,
       SUM(CASE WHEN created_at>=? AND created_at<? THEN amount ELSE 0 END) monthly,
       SUM(CASE WHEN created_at>=? AND created_at<? THEN amount ELSE 0 END) previousMonthly
       FROM ole_xp_reward_events WHERE owner_id=? AND season=? GROUP BY employee_id,category`,
    ).bind(bounds.current, bounds.next, bounds.previous, bounds.current, access.ownerId, season).all<Aggregate>();
    const byEmployee = new Map<string, { total: number; monthly: number; previousMonthly: number; categories: Record<XpCategory, number> }>();
    for (const row of rows.results) {
      const current = byEmployee.get(row.employeeId) || { total: 0, monthly: 0, previousMonthly: 0, categories: { learning: 0, work: 0, quality: 0, teamwork: 0 } };
      current.total += Number(row.total); current.monthly += Number(row.monthly); current.previousMonthly += Number(row.previousMonthly); current.categories[row.category] = Number(row.total);
      byEmployee.set(row.employeeId, current);
    }
    const config = await configFor(access.ownerId, access.name);
    const employees = state.employees.filter((employee) => employee.active && (!selectedBranch || employee.branch === selectedBranch)).map((employee) => {
      const xp = byEmployee.get(employee.id) || { total: 0, monthly: 0, previousMonthly: 0, categories: { learning: 0, work: 0, quality: 0, teamwork: 0 } };
      const growth = xp.monthly - xp.previousMonthly;
      return { employeeId: employee.id, name: employee.name, branch: employee.branch, department: employee.department, totalXp: xp.total, monthlyXp: xp.monthly, growthXp: growth, categories: xp.categories, stage: stageFor(xp.total, config), ...levelFor(xp.total, config), isCurrentUser: access.kind === "employee" && access.employeeId === employee.id };
    });
    const score = (item: typeof employees[number]) => ranking === "monthly" ? item.monthlyXp : ranking === "growth" ? item.growthXp : item.totalXp;
    employees.sort((a, b) => score(b) - score(a) || b.totalXp - a.totalXp || a.name.localeCompare(b.name, "th"));
    let rank = 0, prior: number | null = null;
    const leaderboard = employees.map((item, index) => { const value = score(item); if (prior === null || value !== prior) rank = index + 1; prior = value; return { ...item, rank }; });
    return json({ season, ranking, branches: state.branches, leaderboard, config, canAdjust: access.kind === "owner", currentEmployeeId: access.employeeId });
  } catch (error) {
    console.error("farm leaderboard failed", error);
    return json({ error: "โหลดคะแนน OLE FARM ไม่สำเร็จ คะแนนเดิมไม่ได้ถูกเปลี่ยน" }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "คำขอจากแหล่งที่มาไม่ถูกต้อง" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "ต้องใช้ JSON" }, 415);
  try {
    const access = await resolveActor(request, env.DB);
    if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    if (access.kind !== "owner") return json({ error: "เฉพาะผู้ดูแลระบบเท่านั้นที่ปรับ XP ได้" }, 403);
    const body = await request.json() as { employeeId?: unknown; category?: unknown; amount?: unknown; reason?: unknown; season?: unknown; idempotencyKey?: unknown };
    const employeeId = String(body.employeeId || ""), category = String(body.category || "") as XpCategory, amount = Number(body.amount), reason = String(body.reason || "").trim(), season = Number(body.season), key = String(body.idempotencyKey || "");
    if (!employeeId || !xpCategories.includes(category) || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1000 || !reason || reason.length > 500 || !Number.isInteger(season) || !/^admin:[a-zA-Z0-9-]{8,}$/.test(key)) return json({ error: "ข้อมูลการปรับ XP ไม่ถูกต้อง" }, 400);
    const state = await workspace(access.ownerId), employee = state?.employees.find((item) => item.id === employeeId);
    if (!employee) return json({ error: "ไม่พบพนักงาน" }, 404);
    const existing = await env.DB.prepare("SELECT id FROM ole_xp_reward_events WHERE owner_id=? AND idempotency_key=?").bind(access.ownerId, key).first();
    if (existing) return json({ ok: true, duplicate: true });
    const totalRow = await env.DB.prepare("SELECT COALESCE(SUM(amount),0) total FROM ole_xp_reward_events WHERE owner_id=? AND employee_id=? AND season=?").bind(access.ownerId, employeeId, season).first<{ total: number }>();
    const before = Number(totalRow?.total || 0), after = before + amount, now = new Date().toISOString(), eventId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO ole_xp_reward_events (id,owner_id,employee_id,season,branch_id,category,amount,source_type,source_id,idempotency_key,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(eventId, access.ownerId, employeeId, season, employee.branch, category, amount, "admin_adjustment", eventId, key, now, access.name),
      env.DB.prepare("INSERT INTO ole_xp_adjustment_audit (id,owner_id,employee_id,season,category,before_total,adjustment,after_total,reason,actor,created_at,reward_event_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), access.ownerId, employeeId, season, category, before, amount, after, reason, access.name, now, eventId),
    ]);
    return json({ ok: true, before, after });
  } catch (error) {
    console.error("farm adjustment failed", error);
    return json({ error: "ปรับ XP ไม่สำเร็จ กรุณาลองใหม่" }, 503);
  }
}
