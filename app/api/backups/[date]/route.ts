import { env } from "cloudflare:workers";
import { backupKey } from "../../../../lib/backups";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ date: string }> },
) {
  const ownerId = request.headers.get("oai-authenticated-user-id");
  if (!ownerId)
    return Response.json({ error: "เฉพาะผู้ดูแลเท่านั้น" }, { status: 401 });
  const { date } = await context.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return Response.json({ error: "วันที่สำรองไม่ถูกต้อง" }, { status: 400 });
  const bucket = (env as typeof env & { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket)
    return Response.json(
      { error: "พื้นที่สำรองข้อมูลยังไม่พร้อมใช้งาน" },
      { status: 503 },
    );
  const object = await bucket.get(backupKey(ownerId, date));
  if (!object)
    return Response.json({ error: "ไม่พบไฟล์สำรอง" }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ole-work-backup-${date}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
