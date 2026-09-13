import { dateKey, type State } from "./work-model";

const prefix = (ownerId: string) => `backups/${encodeURIComponent(ownerId)}/`;
export const backupKey = (ownerId: string, date: string) =>
  `${prefix(ownerId)}${date}.json`;

export async function ensureDailyBackup(
  bucket: R2Bucket,
  ownerId: string,
  state: State,
  now = new Date(),
) {
  const date = dateKey(now);
  const key = backupKey(ownerId, date);
  if (!(await bucket.head(key))) {
    const createdAt = now.toISOString();
    await bucket.put(
      key,
      JSON.stringify({ version: 1, createdAt, state }, null, 2),
      {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        customMetadata: { createdAt },
      },
    );
  }
  const listed = await bucket.list({ prefix: prefix(ownerId), limit: 100 });
  const ordered = [...listed.objects].sort((a, b) =>
    b.key.localeCompare(a.key),
  );
  if (ordered.length > 7)
    await bucket.delete(ordered.slice(7).map((object) => object.key));
  return ordered.slice(0, 7).map((object) => ({
    date: object.key.slice(prefix(ownerId).length, -5),
    size: object.size,
    uploadedAt: object.uploaded.toISOString(),
  }));
}

