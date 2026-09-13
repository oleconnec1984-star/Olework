import { env } from "cloudflare:workers";
import { hasSopPermission, resolveActor, sameOrigin } from "../../../../../lib/employee-auth";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const extensionTypes: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };
const objectKey = (ownerId: string, mediaId: string) => `sop-media/${encodeURIComponent(ownerId)}/${mediaId}`;

function imageType(file: File) {
  const reported = file.type.toLowerCase() === "image/jpg" ? "image/jpeg" : file.type.toLowerCase();
  if (allowedTypes.has(reported)) return reported;
  if (reported && reported !== "application/octet-stream") return "";
  return extensionTypes[file.name.toLowerCase().split(".").pop() || ""] || "";
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "คำขอไม่ถูกต้อง" }, 403);
  const access = await resolveActor(request, env.DB);
  if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
  if (!hasSopPermission(access, "sop_manage")) return json({ error: "เฉพาะผู้ที่ได้รับสิทธิ์จัดการ SOP เท่านั้นที่แนบรูป SOP ได้" }, 403);
  if (Number(request.headers.get("content-length") || 0) > 32 * 1024 * 1024)
    return json({ error: "ไฟล์รวมใหญ่เกิน 30 MB ต่อครั้ง" }, 413);
  const bucket = (env as typeof env & { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket) return json({ error: "พื้นที่เก็บรูป SOP ยังไม่พร้อมใช้งาน" }, 503);
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (!files.length || files.length > 10) return json({ error: "เลือกภาพได้ครั้งละ 1–10 รูป" }, 400);
    if (files.some((file) => file.size < 1 || file.size > 10 * 1024 * 1024))
      return json({ error: "แต่ละรูปต้องมีขนาดไม่เกิน 10 MB" }, 413);
    if (files.reduce((sum, file) => sum + file.size, 0) > 30 * 1024 * 1024)
      return json({ error: "ไฟล์รวมต้องมีขนาดไม่เกิน 30 MB ต่อครั้ง" }, 413);
    const types = files.map(imageType);
    if (types.some((type) => !type)) return json({ error: "รองรับรูป JPG, PNG, WEBP และ HEIC เท่านั้น" }, 415);

    const uploaded: { id: string; key: string; name: string; type: string; size: number }[] = [];
    const uploadedAt = new Date().toISOString();
    try {
      for (const [index, file] of files.entries()) {
        const id = crypto.randomUUID();
        const key = objectKey(access.ownerId, id);
        const type = types[index];
        const name = file.name.slice(0, 240);
        await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: type }, customMetadata: { originalName: name } });
        const stored = await bucket.head(key);
        if (!stored || stored.size !== file.size) throw new Error("SOP image verification failed");
        uploaded.push({ id, key, name, type, size: file.size });
      }
      await env.DB.batch(uploaded.map((item) => env.DB.prepare(
        "INSERT INTO ole_sop_media (id,owner_id,name,type,size,uploaded_by,uploaded_at) VALUES (?,?,?,?,?,?,?)",
      ).bind(item.id, access.ownerId, item.name, item.type, item.size, access.name, uploadedAt)));
    } catch (error) {
      if (uploaded.length) await bucket.delete(uploaded.map((item) => item.key));
      throw error;
    }
    return json({ images: uploaded.map((item) => ({ id: item.id, name: item.name, type: item.type, size: item.size })) }, 201);
  } catch (error) {
    console.error("SOP image upload failed", error);
    return json({ error: "อัปโหลดรูป SOP ไม่สำเร็จ กรุณาลองใหม่" }, 503);
  }
}
