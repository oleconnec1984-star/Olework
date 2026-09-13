import { env } from "cloudflare:workers";
import { resolveActor, sameOrigin } from "../../../../lib/employee-auth";
import { validateState, type State } from "../../../../lib/work-model";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const extensionTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
function evidenceType(file: File) {
  const reported = file.type.toLowerCase();
  if (reported === "image/jpg") return "image/jpeg";
  if (allowedTypes.has(reported)) return reported;
  if (reported && reported !== "application/octet-stream") return "";
  const extension = file.name.toLowerCase().split(".").pop() || "";
  return extensionTypes[extension] || "";
}
const objectKey = (ownerId: string, taskId: string, attachmentId: string) =>
  `evidence/${encodeURIComponent(ownerId)}/${encodeURIComponent(taskId)}/${attachmentId}`;

export async function POST(request: Request) {
  const access = await resolveActor(request, env.DB);
  if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
  if (!sameOrigin(request)) return json({ error: "คำขอไม่ถูกต้อง" }, 403);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 32 * 1024 * 1024)
    return json({ error: "ไฟล์รวมใหญ่เกิน 30 MB ต่อครั้ง" }, 413);
  const bucket = (env as typeof env & { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket)
    return json({ error: "พื้นที่เก็บหลักฐานยังไม่พร้อมใช้งาน" }, 503);
  try {
    const form = await request.formData();
    const taskId = String(form.get("taskId") || "");
    const revision = Number(form.get("revision"));
    const files = [
      ...form.getAll("files"),
      ...(form.get("file") ? [form.get("file")] : []),
    ].filter((value): value is File => value instanceof File);
    if (
      !taskId ||
      taskId.length > 100 ||
      !Number.isSafeInteger(revision) ||
      !files.length ||
      files.length > 10
    )
      return json({ error: "ข้อมูลไฟล์ไม่ครบ" }, 400);
    if (files.some((file) => file.size < 1 || file.size > 10 * 1024 * 1024))
      return json({ error: "ไฟล์ต้องมีขนาดไม่เกิน 10 MB" }, 413);
    if (files.reduce((sum, file) => sum + file.size, 0) > 30 * 1024 * 1024)
      return json({ error: "ไฟล์รวมต้องมีขนาดไม่เกิน 30 MB ต่อครั้ง" }, 413);
    const fileTypes = files.map(evidenceType);
    if (fileTypes.some((type) => !type))
      return json({ error: "รองรับเฉพาะรูปภาพ PDF Word และ Excel" }, 415);

    const row = await env.DB.prepare(
      "SELECT state,revision FROM ole_workspaces WHERE owner_id=?",
    )
      .bind(access.ownerId)
      .first<{ state: string; revision: number }>();
    if (!row) return json({ error: "ไม่พบพื้นที่ทำงาน" }, 404);
    if (row.revision !== revision)
      return json({ error: "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดล่าสุด" }, 409);
    const state = JSON.parse(row.state) as State;
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return json({ error: "ไม่พบงานนี้" }, 404);
    if (
      access.kind === "employee" &&
      task.assigneeId !== access.employeeId &&
      task.reviewerId !== access.employeeId
    )
      return json({ error: "คุณไม่มีสิทธิ์แนบหลักฐานในงานนี้" }, 403);
    if (task.status === "สำเร็จ")
      return json({ error: "งานสำเร็จแล้ว ไม่สามารถเพิ่มหลักฐาน" }, 409);
    if ((task.attachments?.length || 0) + files.length > 20)
      return json({ error: "งานหนึ่งแนบหลักฐานได้สูงสุด 20 ไฟล์" }, 409);

    const now = new Date().toISOString();
    const submissionRound =
      task.status === "รอตรวจ"
        ? Math.max(1, task.submissionCount || 1)
        : (task.submissionCount || 0) + 1;
    const uploaded: { id: string; key: string; file: File; type: string }[] = [];
    try {
      for (const [index, file] of files.entries()) {
        const id = crypto.randomUUID();
        const key = objectKey(access.ownerId, task.id, id);
        const type = fileTypes[index];
        await bucket.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: type },
          customMetadata: { originalName: file.name.slice(0, 240) },
        });
        uploaded.push({ id, key, file, type });
        const stored = await bucket.head(key);
        if (!stored || stored.size !== file.size)
          throw new Error("uploaded evidence verification failed");
      }
    } catch (error) {
      if (uploaded.length) await bucket.delete(uploaded.map((item) => item.key));
      throw error;
    }
    task.attachments = [
      ...(task.attachments || []),
      ...uploaded.map(({ id, file, type }) => ({
        id,
        name: file.name.slice(0, 240),
        type,
        size: file.size,
        uploadedAt: now,
        uploadedBy: access.name,
        submissionRound,
      })),
    ];
    state.activity = [
      {
        id: crypto.randomUUID(),
        text: `แนบหลักฐาน ${files.length} ไฟล์: ${task.title} · รอบส่งตรวจที่ ${submissionRound}`,
        at: now,
        actor: access.name,
      },
      ...state.activity,
    ].slice(0, 200);
    validateState(state);
    const result = await env.DB.prepare(
      "UPDATE ole_workspaces SET state=?,revision=revision+1,updated_at=? WHERE owner_id=? AND revision=?",
    )
      .bind(JSON.stringify(state), now, access.ownerId, revision)
      .run();
    if (result.meta.changes !== 1) {
      await bucket.delete(uploaded.map((item) => item.key));
      return json({ error: "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดล่าสุด" }, 409);
    }
    return json({
      taskId: task.id,
      attachments: task.attachments,
      revision: revision + 1,
      updatedAt: now,
    });
  } catch (error) {
    console.error("task evidence upload failed", error);
    return json({ error: "แนบหลักฐานไม่สำเร็จ กรุณาลองใหม่" }, 503);
  }
}
