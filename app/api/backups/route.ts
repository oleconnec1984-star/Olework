import { env } from "cloudflare:workers";
import { ensureDailyBackup } from "../../../lib/backups";
import { type State } from "../../../lib/work-model";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const ownerId = request.headers.get("oai-authenticated-user-id");
  if (!ownerId) return json({ error: "เฉพาะผู้ดูแลเท่านั้น" }, 401);
  const bucket = (env as typeof env & { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket)
    return json({ error: "พื้นที่สำรองข้อมูลยังไม่พร้อมใช้งาน" }, 503);
  try {
    const row = await env.DB.prepare(
      "SELECT state FROM ole_workspaces WHERE owner_id=?",
    )
      .bind(ownerId)
      .first<{ state: string }>();
    if (!row) return json({ backups: [], latestAt: null });
    const backups = await ensureDailyBackup(
      bucket,
      ownerId,
      JSON.parse(row.state) as State,
    );
    return json({ backups, latestAt: backups[0]?.uploadedAt || null });
  } catch (error) {
    console.error("daily backup failed", error);
    return json({ error: "สำรองข้อมูลอัตโนมัติไม่สำเร็จ" }, 503);
  }
}

