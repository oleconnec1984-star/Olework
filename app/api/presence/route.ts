import { env } from "cloudflare:workers";
import { resolveActor } from "../../../lib/employee-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await resolveActor(request, env.DB);
    if (!access)
      return Response.json(
        { error: "กรุณาเข้าสู่ระบบ" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    const now = new Date();
    const cutoff = new Date(now.getTime() - 2 * 60 * 1000).toISOString();
    const rows = await env.DB.prepare(
      `SELECT DISTINCT s.employee_id employeeId
       FROM ole_employee_sessions s
       JOIN ole_employee_accounts a
         ON a.owner_id=s.owner_id AND a.employee_id=s.employee_id
       WHERE s.owner_id=? AND a.active=1 AND s.expires_at>? AND s.last_seen_at>=?`,
    )
      .bind(access.ownerId, now.toISOString(), cutoff)
      .all<{ employeeId: string }>();
    return Response.json(
      {
        employeeIds: rows.results.map((row) => row.employeeId),
        asOf: now.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("presence read failed", error);
    return Response.json(
      { error: "ตรวจสถานะออนไลน์ไม่ได้" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
