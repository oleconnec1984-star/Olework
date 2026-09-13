import { env } from "cloudflare:workers";
import { sameOrigin } from "../../../../lib/employee-auth";
import { dateKey, type State, type Task } from "../../../../lib/work-model";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const targetPattern = /^[UCR][0-9a-f]{32}$/i;

function config() {
  const runtime = env as typeof env & {
    LINE_CHANNEL_ACCESS_TOKEN?: string;
    LINE_TARGET_ID?: string;
  };
  return {
    token: runtime.LINE_CHANNEL_ACCESS_TOKEN?.trim() || "",
    defaultTarget: runtime.LINE_TARGET_ID?.trim() || "",
  };
}

async function sendLine(token: string, to: string, text: string) {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!response.ok)
    throw new Error(`LINE Messaging API ตอบกลับ ${response.status}`);
}

async function workspace(ownerId: string) {
  const row = await env.DB.prepare(
    "SELECT state FROM ole_workspaces WHERE owner_id=?",
  )
    .bind(ownerId)
    .first<{ state: string }>();
  return row ? (JSON.parse(row.state) as State) : null;
}

export async function GET(request: Request) {
  const ownerId = request.headers.get("oai-authenticated-user-id");
  if (!ownerId) return json({ error: "เฉพาะผู้ดูแลเท่านั้น" }, 401);
  const state = await workspace(ownerId);
  const { token, defaultTarget } = config();
  const latest = await env.DB.prepare(
    "SELECT MAX(sent_at) latest FROM ole_notification_deliveries WHERE owner_id=?",
  )
    .bind(ownerId)
    .first<{ latest: string | null }>();
  return json({
    connected:
      !!token &&
      (targetPattern.test(defaultTarget) ||
        !!state?.employees.some((e) => e.lineUserId)),
    tokenConfigured: !!token,
    defaultTargetConfigured: targetPattern.test(defaultTarget),
    employeeTargets: state?.employees.filter((e) => e.lineUserId).length || 0,
    latestSentAt: latest?.latest || null,
  });
}

export async function POST(request: Request) {
  const ownerId = request.headers.get("oai-authenticated-user-id");
  if (!ownerId) return json({ error: "เฉพาะผู้ดูแลเท่านั้น" }, 401);
  if (!sameOrigin(request)) return json({ error: "คำขอไม่ถูกต้อง" }, 403);
  let action: "test" | "run";
  try {
    const body = (await request.json()) as { action?: "test" | "run" };
    action = body.action === "test" ? "test" : "run";
  } catch {
    return json({ error: "ข้อมูลไม่ถูกต้อง" }, 400);
  }
  const state = await workspace(ownerId);
  if (!state) return json({ error: "ยังไม่มีข้อมูลพื้นที่ทำงาน" }, 404);
  const { token, defaultTarget } = config();
  if (!token)
    return json({ error: "ยังไม่ได้ตั้งค่า LINE Channel Access Token" }, 503);
  const fallback = targetPattern.test(defaultTarget) ? defaultTarget : "";
  const employeeTargets = new Map(
    state.employees
      .filter((employee) => employee.lineUserId)
      .map((employee) => [employee.id, employee.lineUserId!]),
  );
  if (action === "test") {
    const target = fallback || employeeTargets.values().next().value;
    if (!target)
      return json({ error: "ยังไม่มี LINE User ID หรือ LINE_TARGET_ID" }, 503);
    try {
      await sendLine(token, target, "OLE WORK เชื่อมต่อ LINE สำเร็จ ✅");
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : "ทดสอบ LINE ไม่สำเร็จ" },
        502,
      );
    }
    return json({ sent: 1, tested: true, latestSentAt: new Date().toISOString() });
  }

  const now = new Date();
  const today = dateKey(now);
  const tomorrow = dateKey(new Date(now.getTime() + 86400000));
  const cutoff = new Date(now.getTime() - 120 * 86400000).toISOString();
  await env.DB.prepare(
    "DELETE FROM ole_notification_deliveries WHERE owner_id=? AND sent_at<=?",
  )
    .bind(ownerId, cutoff)
    .run();
  const sentRows = await env.DB.prepare(
    "SELECT notification_key notificationKey FROM ole_notification_deliveries WHERE owner_id=? AND sent_at>?",
  )
    .bind(ownerId, cutoff)
    .all<{ notificationKey: string }>();
  const sent = new Set(sentRows.results.map((row) => row.notificationKey));
  const groups = new Map<
    string,
    { task: Task; kind: "ใกล้ครบกำหนด" | "เกินกำหนด"; key: string }[]
  >();
  let missingTarget = 0;
  for (const task of state.tasks) {
    const kind =
      task.status !== "สำเร็จ" && task.dueDate >= today && task.dueDate <= tomorrow
        ? "ใกล้ครบกำหนด"
        : task.dueDate < today && !["รอตรวจ", "สำเร็จ"].includes(task.status)
          ? "เกินกำหนด"
          : null;
    if (!kind) continue;
    const key = `${kind}:${task.id}:${task.dueDate}`;
    if (sent.has(key)) continue;
    const target = employeeTargets.get(task.assigneeId) || fallback;
    if (!target) {
      missingTarget++;
      continue;
    }
    groups.set(target, [...(groups.get(target) || []), { task, kind, key }]);
  }
  let sentCount = 0;
  let latestSentAt: string | null = null;
  for (const [target, items] of [...groups.entries()].slice(0, 20)) {
    const lines = items.slice(0, 20).map(
      ({ task, kind }) =>
        `• ${kind}: ${task.title} (${task.dueDate}) — ${task.status}`,
    );
    const text = ["OLE WORK แจ้งเตือนงาน", ...lines].join("\n").slice(0, 4900);
    try {
      await sendLine(token, target, text);
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : "ส่ง LINE ไม่สำเร็จ",
          sent: sentCount,
        },
        502,
      );
    }
    const at = new Date().toISOString();
    latestSentAt = at;
    await env.DB.batch(
      items.slice(0, 20).map((item) =>
        env.DB.prepare(
          "INSERT OR IGNORE INTO ole_notification_deliveries (owner_id,notification_key,sent_at) VALUES (?,?,?)",
        ).bind(ownerId, item.key, at),
      ),
    );
    sentCount += items.slice(0, 20).length;
  }
  return json({
    sent: sentCount,
    missingTarget,
    latestSentAt,
  });
}
