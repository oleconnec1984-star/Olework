import { env } from "cloudflare:workers";
import { canViewTask, resolveActor } from "../../../../../lib/employee-auth";
import type { State } from "../../../../../lib/work-model";

export const dynamic = "force-dynamic";
const objectKey = (ownerId: string, taskId: string, attachmentId: string) =>
  `evidence/${encodeURIComponent(ownerId)}/${encodeURIComponent(taskId)}/${attachmentId}`;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await resolveActor(request, env.DB);
  if (!access)
    return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  const { id } = await context.params;
  if (!id || id.length > 100)
    return Response.json({ error: "รหัสไฟล์ไม่ถูกต้อง" }, { status: 400 });
  const row = await env.DB.prepare(
    "SELECT state FROM ole_workspaces WHERE owner_id=?",
  )
    .bind(access.ownerId)
    .first<{ state: string }>();
  if (!row)
    return Response.json({ error: "ไม่พบพื้นที่ทำงาน" }, { status: 404 });
  const state = JSON.parse(row.state) as State;
  const task = state.tasks.find((item) =>
    item.attachments?.some((attachment) => attachment.id === id),
  );
  const attachment = task?.attachments?.find((item) => item.id === id);
  if (!task || !attachment)
    return Response.json({ error: "ไม่พบไฟล์" }, { status: 404 });
  if (!canViewTask(access, state, task))
    return Response.json(
      { error: "คุณไม่มีสิทธิ์เปิดไฟล์นี้" },
      { status: 403 },
    );
  const bucket = (env as typeof env & { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket)
    return Response.json(
      { error: "พื้นที่เก็บหลักฐานยังไม่พร้อมใช้งาน" },
      { status: 503 },
    );
  const object = await bucket.get(objectKey(access.ownerId, task.id, id));
  if (!object) return Response.json({ error: "ไม่พบไฟล์" }, { status: 404 });
  const disposition =
    attachment.type.startsWith("image/") ||
    attachment.type === "application/pdf"
      ? "inline"
      : "attachment";
  return new Response(object.body, {
    headers: {
      "Content-Type": attachment.type,
      "Content-Length": String(attachment.size),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
