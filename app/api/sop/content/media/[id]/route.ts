import { env } from "cloudflare:workers";
import { hasSopPermission, resolveActor } from "../../../../../../lib/employee-auth";

export const dynamic = "force-dynamic";
const objectKey = (ownerId: string, mediaId: string) => `sop-media/${encodeURIComponent(ownerId)}/${mediaId}`;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await resolveActor(request, env.DB);
  if (!access) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  if (!hasSopPermission(access, "sop_library") && !hasSopPermission(access, "sop_manage"))
    return Response.json({ error: "ไม่ได้รับสิทธิ์เข้าถึง SOP" }, { status: 403 });
  const { id } = await context.params;
  if (!id || id.length > 100) return Response.json({ error: "รหัสรูปไม่ถูกต้อง" }, { status: 400 });
  const media = await env.DB.prepare("SELECT name,type,size FROM ole_sop_media WHERE owner_id=? AND id=?")
    .bind(access.ownerId, id).first<{ name: string; type: string; size: number }>();
  if (!media) return Response.json({ error: "ไม่พบรูป" }, { status: 404 });
  const bucket = (env as typeof env & { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket) return Response.json({ error: "พื้นที่เก็บรูป SOP ยังไม่พร้อมใช้งาน" }, { status: 503 });
  const object = await bucket.get(objectKey(access.ownerId, id));
  if (!object) return Response.json({ error: "ไม่พบรูป" }, { status: 404 });
  return new Response(object.body, { headers: {
    "Content-Type": media.type,
    "Content-Length": String(media.size),
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(media.name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
