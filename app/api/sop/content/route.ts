import { env } from "cloudflare:workers";
import { hasSopPermission, resolveActor, sameOrigin } from "../../../../lib/employee-auth";
import { sopCategories, type SopMediaRef, type SopStepMedia } from "../../../../lib/sop-content";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const validCategories = new Set(sopCategories.map((category) => category.id));

type TopicVersionRow = {
  id: string;
  topicCode: string;
  categoryId: string;
  title: string;
  purpose: string;
  steps: string;
  audiences: string;
  stepMedia: string;
  critical: number;
  recommended: number;
  documentVersion: string;
  state: "draft" | "published";
  changeNote: string;
  createdBy: string;
  createdAt: string;
};

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalizeYoutubeUrl(value: unknown) {
  try {
    const url = new URL(String(value || "").trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let videoId = "";
    if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    else if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v") || "";
      else if (/^\/(shorts|embed|live)\//.test(url.pathname)) videoId = url.pathname.split("/")[2] || "";
    }
    return /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : "";
  } catch { return ""; }
}

function parseStepMedia(value: string): SopStepMedia[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 40).map((item) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const images = Array.isArray(record.images) ? record.images.slice(0, 10).flatMap((image) => {
        if (!image || typeof image !== "object") return [];
        const media = image as Record<string, unknown>;
        const id = String(media.id || "");
        const name = String(media.name || "");
        const type = String(media.type || "");
        const size = Number(media.size);
        return id && name && type.startsWith("image/") && Number.isFinite(size) ? [{ id, name, type, size }] : [];
      }) : [];
      const youtubeUrls = Array.isArray(record.youtubeUrls)
        ? [...new Set(record.youtubeUrls.map(normalizeYoutubeUrl).filter(Boolean))].slice(0, 5)
        : [];
      return { images, youtubeUrls };
    });
  } catch { return []; }
}

function present(row: TopicVersionRow) {
  return {
    ...row,
    steps: parseStringArray(row.steps),
    audiences: parseStringArray(row.audiences),
    stepMedia: parseStepMedia(row.stepMedia),
    critical: Boolean(row.critical),
    recommended: Boolean(row.recommended),
  };
}

export async function GET(request: Request) {
  try {
    const access = await resolveActor(request, env.DB);
    if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    if (!hasSopPermission(access, "sop_library") && !hasSopPermission(access, "sop_manage"))
      return json({ error: "ไม่ได้รับสิทธิ์เข้าถึง SOP" }, 403);
    const published = await env.DB.prepare(
      `SELECT id,topic_code topicCode,category_id categoryId,title,purpose,steps,audiences,step_media stepMedia,critical,recommended,document_version documentVersion,state,change_note changeNote,created_by createdBy,created_at createdAt
       FROM ole_sop_topic_versions current
       WHERE owner_id=? AND state='published' AND NOT EXISTS (
         SELECT 1 FROM ole_sop_topic_versions newer
         WHERE newer.owner_id=current.owner_id AND newer.topic_code=current.topic_code AND newer.state='published' AND newer.created_at>current.created_at
       ) ORDER BY topic_code`,
    ).bind(access.ownerId).all<TopicVersionRow>();
    if (!hasSopPermission(access, "sop_manage")) return json({ published: published.results.map(present), drafts: [], history: [], canManage: false });
    const drafts = await env.DB.prepare(
      `SELECT id,topic_code topicCode,category_id categoryId,title,purpose,steps,audiences,step_media stepMedia,critical,recommended,document_version documentVersion,state,change_note changeNote,created_by createdBy,created_at createdAt
       FROM ole_sop_topic_versions current
       WHERE owner_id=? AND state='draft' AND NOT EXISTS (
         SELECT 1 FROM ole_sop_topic_versions newer
         WHERE newer.owner_id=current.owner_id AND newer.topic_code=current.topic_code AND newer.state='draft' AND newer.created_at>current.created_at
       ) ORDER BY created_at DESC`,
    ).bind(access.ownerId).all<TopicVersionRow>();
    const history = await env.DB.prepare(
      `SELECT id,topic_code topicCode,category_id categoryId,title,purpose,steps,audiences,step_media stepMedia,critical,recommended,document_version documentVersion,state,change_note changeNote,created_by createdBy,created_at createdAt
       FROM ole_sop_topic_versions WHERE owner_id=? ORDER BY created_at DESC LIMIT 100`,
    ).bind(access.ownerId).all<TopicVersionRow>();
    return json({
      published: published.results.map(present),
      drafts: drafts.results.map(present),
      history: history.results.map(present),
      canManage: true,
    });
  } catch (error) {
    console.error("sop content read failed", error);
    return json({ error: "โหลดข้อมูลจัดการ SOP ไม่สำเร็จ" }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "คำขอจากแหล่งที่มาไม่ถูกต้อง" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return json({ error: "ต้องใช้ JSON" }, 415);
  try {
    const access = await resolveActor(request, env.DB);
    if (!access) return json({ error: "กรุณาเข้าสู่ระบบ" }, 401);
    if (!hasSopPermission(access, "sop_manage")) return json({ error: "เฉพาะผู้ที่ได้รับสิทธิ์จัดการ SOP เท่านั้นที่แก้ไข SOP ได้" }, 403);
    const body = await request.json() as Record<string, unknown>;
    const topicCode = String(body.topicCode || "").trim();
    const categoryId = String(body.categoryId || "").trim();
    const title = String(body.title || "").trim().slice(0, 160);
    const purpose = String(body.purpose || "").trim().slice(0, 800);
    const documentVersion = String(body.documentVersion || "").trim().slice(0, 30);
    const submittedChangeNote = String(body.changeNote || "").trim().slice(0, 500);
    const state = body.state === "published" ? "published" : "draft";
    const steps = Array.isArray(body.steps)
      ? body.steps.map((item) => String(item).trim()).filter(Boolean).slice(0, 40)
      : [];
    const audiences = Array.isArray(body.audiences)
      ? [...new Set(body.audiences.map((item) => String(item).trim()).filter(Boolean))].slice(0, 30)
      : [];
    const requestedStepMedia = Array.isArray(body.stepMedia) ? body.stepMedia.slice(0, steps.length) : [];
    const requestedImageIds = [...new Set(requestedStepMedia.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const images = (item as Record<string, unknown>).images;
      return Array.isArray(images) ? images.map((image) => image && typeof image === "object" ? String((image as Record<string, unknown>).id || "") : "").filter(Boolean) : [];
    }))];
    if (!/^\d{1,2}\.\d{1,2}$/.test(topicCode)) return json({ error: "รหัสหัวข้อต้องเป็นรูปแบบ เช่น 1.1" }, 400);
    if (!validCategories.has(categoryId)) return json({ error: "กรุณาเลือกหมวด SOP" }, 400);
    if (!title) return json({ error: "กรุณากรอกชื่อหัวข้อ SOP" }, 400);
    if (!purpose) return json({ error: "กรุณากรอกวัตถุประสงค์" }, 400);
    if (!steps.length) return json({ error: "กรุณากรอกรายละเอียดอย่างน้อย 1 ขั้นตอน" }, 400);
    if (!documentVersion) return json({ error: "กรุณากรอกเวอร์ชันเอกสาร" }, 400);
    if (requestedImageIds.length > 80) return json({ error: "หนึ่งหัวข้อ SOP แนบรูปได้สูงสุด 80 รูป" }, 400);
    const mediaRows = requestedImageIds.length
      ? await env.DB.prepare(`SELECT id,name,type,size FROM ole_sop_media WHERE owner_id=? AND id IN (${requestedImageIds.map(() => "?").join(",")})`).bind(access.ownerId, ...requestedImageIds).all<SopMediaRef>()
      : { results: [] as SopMediaRef[] };
    if (mediaRows.results.length !== requestedImageIds.length)
      return json({ error: "มีรูปภาพที่ไม่พบหรือไม่ได้อยู่ในพื้นที่ของร้าน" }, 400);
    const mediaById = new Map(mediaRows.results.map((item) => [item.id, item]));
    const stepMedia: SopStepMedia[] = steps.map((_, index) => {
      const source = requestedStepMedia[index] && typeof requestedStepMedia[index] === "object"
        ? requestedStepMedia[index] as Record<string, unknown>
        : {};
      const images = Array.isArray(source.images)
        ? [...new Set(source.images.map((image) => image && typeof image === "object" ? String((image as Record<string, unknown>).id || "") : "").filter(Boolean))]
          .slice(0, 10).flatMap((id) => mediaById.get(id) || [])
        : [];
      const youtubeUrls = Array.isArray(source.youtubeUrls)
        ? [...new Set(source.youtubeUrls.map(normalizeYoutubeUrl).filter(Boolean))].slice(0, 5)
        : [];
      return { images, youtubeUrls };
    });
    const now = new Date().toISOString();
    const existingTopic = await env.DB.prepare(
      "SELECT id FROM ole_sop_topic_versions WHERE owner_id=? AND topic_code=? LIMIT 1",
    ).bind(access.ownerId, topicCode).first<{ id: string }>();
    const changeNote = submittedChangeNote || (existingTopic ? "แก้ไข SOP ผ่านระบบ" : "เพิ่มหัวข้อ SOP ผ่านระบบ");
    const record = {
      id: crypto.randomUUID(),
      topicCode,
      categoryId,
      title,
      purpose,
      steps,
      audiences,
      stepMedia,
      critical: Boolean(body.critical),
      recommended: Boolean(body.recommended),
      documentVersion,
      state,
      changeNote,
      createdBy: access.name,
      createdAt: now,
    };
    await env.DB.prepare(
      `INSERT INTO ole_sop_topic_versions
       (id,owner_id,topic_code,category_id,title,purpose,steps,audiences,step_media,critical,recommended,document_version,state,change_note,created_by,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      record.id,
      access.ownerId,
      record.topicCode,
      record.categoryId,
      record.title,
      record.purpose,
      JSON.stringify(record.steps),
      JSON.stringify(record.audiences),
      JSON.stringify(record.stepMedia),
      record.critical ? 1 : 0,
      record.recommended ? 1 : 0,
      record.documentVersion,
      record.state,
      record.changeNote,
      record.createdBy,
      record.createdAt,
    ).run();
    return json(record, 201);
  } catch (error) {
    console.error("sop content write failed", error);
    return json({ error: "บันทึก SOP ไม่สำเร็จ ข้อมูลในฟอร์มยังอยู่" }, 503);
  }
}
