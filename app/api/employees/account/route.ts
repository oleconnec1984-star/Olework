import { env } from "cloudflare:workers";
import {
  employeePermissions,
  hashPassword,
  normalizeEmployeePermissions,
  normalizeLogin,
  sameOrigin,
  sopTabPermissions,
  validLogin,
  type EmployeePermission,
} from "../../../../lib/employee-auth";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const owner = (request: Request) =>
  request.headers.get("oai-authenticated-user-id");

export async function PATCH(request: Request) {
  const ownerId = owner(request);
  if (!ownerId) return json({ error: "เฉพาะผู้ดูแลเท่านั้น" }, 401);
  if (!sameOrigin(request)) return json({ error: "คำขอไม่ถูกต้อง" }, 403);
  let body: {
    employeeId?: string;
    loginId?: string;
    password?: string;
    permissions?: string[];
    visibleDepartments?: string[];
    active?: boolean;
  };
  try {
    const raw = await request.text();
    if (raw.length > 5000) throw new Error();
    body = JSON.parse(raw);
  } catch {
    return json({ error: "ข้อมูลบัญชีไม่ถูกต้อง" }, 400);
  }
  const employeeId = body.employeeId || "",
    loginId = normalizeLogin(body.loginId || ""),
    requestedPermissions = body.permissions || [],
    permissions = [...new Set(requestedPermissions.filter((permission): permission is EmployeePermission => employeePermissions.includes(permission as EmployeePermission)))],
    requestedDepartments = body.visibleDepartments || [];
  if (
    !employeeId ||
    employeeId.length > 100 ||
    !validLogin(loginId) ||
    typeof body.active !== "boolean" ||
    new Set(requestedPermissions).size !== requestedPermissions.length ||
    requestedPermissions.some((permission) => !employeePermissions.includes(permission as EmployeePermission)) ||
    (permissions.some((permission) => permission.startsWith("sop_")) && !permissions.includes("sop")) ||
    (permissions.includes("sop") && !permissions.some((permission) => sopTabPermissions.includes(permission as (typeof sopTabPermissions)[number]))) ||
    requestedDepartments.some(
      (department) => typeof department !== "string" || department.length > 100,
    )
  )
    return json({ error: "ไอดีหรือสิทธิ์ไม่ถูกต้อง" }, 400);

  const workspace = await env.DB.prepare(
    "SELECT state FROM ole_workspaces WHERE owner_id=?",
  )
    .bind(ownerId)
    .first<{ state: string }>();
  if (!workspace) return json({ error: "ไม่พบพื้นที่ทำงาน" }, 404);
  const state = JSON.parse(workspace.state) as {
    departments: string[];
    employees: { id: string; name: string }[];
  };
  if (!state.employees.some((employee) => employee.id === employeeId))
    return json({ error: "ไม่พบพนักงานในพื้นที่นี้" }, 404);
  const visibleDepartments = [...new Set(requestedDepartments)];
  if (
    visibleDepartments.length !== requestedDepartments.length ||
    visibleDepartments.some((department) => !state.departments.includes(department))
  )
    return json({ error: "ฝ่ายที่อนุญาตให้มองเห็นไม่ถูกต้อง" }, 400);
  if (!permissions.length)
    return json({ error: "กรุณาเลือกเมนูให้พนักงานอย่างน้อย 1 เมนู" }, 400);

  const existing = await env.DB.prepare(
    "SELECT password_salt salt,password_hash hash,permissions FROM ole_employee_accounts WHERE owner_id=? AND employee_id=?",
  )
    .bind(ownerId, employeeId)
    .first<{ salt: string; hash: string; permissions: string }>();
  if (
    (body.password && body.password.length < 8) ||
    (body.password && body.password.length > 72) ||
    (!existing && !body.password)
  )
    return json(
      { error: "บัญชีใหม่ต้องมีรหัสผ่านอย่างน้อย 8 ตัวอักษร" },
      400,
    );
  const password = body.password ? await hashPassword(body.password) : existing!;
  try {
    const now = new Date().toISOString();
    const accountStatement = env.DB.prepare(
      `INSERT INTO ole_employee_accounts (owner_id,employee_id,login_id,password_salt,password_hash,permissions,visible_departments,active,failed_attempts,locked_until,updated_at)
       VALUES (?,?,?,?,?,?,?,?,0,NULL,?)
       ON CONFLICT(owner_id,employee_id) DO UPDATE SET
       login_id=excluded.login_id,password_salt=excluded.password_salt,password_hash=excluded.password_hash,
       permissions=excluded.permissions,visible_departments=excluded.visible_departments,active=excluded.active,
       failed_attempts=0,locked_until=NULL,updated_at=excluded.updated_at`,
    )
      .bind(
        ownerId,
        employeeId,
        loginId,
        password.salt,
        password.hash,
        JSON.stringify(permissions),
        JSON.stringify(visibleDepartments),
        body.active ? 1 : 0,
        now,
      );
    let previousPermissions: EmployeePermission[] = [];
    if (existing) try { previousPermissions = normalizeEmployeePermissions(JSON.parse(existing.permissions)); } catch {}
    const manageChanged = previousPermissions.includes("sop_manage") !== permissions.includes("sop_manage");
    if (manageChanged) {
      const target = state.employees.find((employee) => employee.id === employeeId);
      const actor = request.headers.get("oai-authenticated-user-email") || "ผู้ดูแลระบบ";
      await env.DB.batch([
        accountStatement,
        env.DB.prepare(
          "INSERT INTO ole_permission_audit (id,owner_id,employee_id,permission,enabled,actor,created_at) VALUES (?,?,?,?,?,?,?)",
        ).bind(crypto.randomUUID(), ownerId, employeeId, "sop_manage", permissions.includes("sop_manage") ? 1 : 0, `${actor} → ${target?.name || employeeId}`, now),
      ]);
    } else {
      await accountStatement.run();
    }
    return json({
      employeeId,
      loginId,
      permissions,
      visibleDepartments,
      active: body.active,
    });
  } catch (error) {
    if (String(error).includes("UNIQUE"))
      return json({ error: "ไอดีนี้มีผู้ใช้งานแล้ว กรุณาใช้ไอดีอื่น" }, 409);
    console.error("account save failed", error);
    return json({ error: "บันทึกบัญชีพนักงานไม่สำเร็จ" }, 503);
  }
}
