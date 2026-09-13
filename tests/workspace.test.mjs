import assert from "node:assert/strict";
import { test, after } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { Miniflare } from "miniflare";

// Exercise production validation and API handlers against a real local D1 binding.
// No browser, network service, deployed data, or sign-in impersonation is involved.
const compile = (source) =>
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64");
const injectTestEnv = (source) =>
  source.replace(
    /import\s*\{\s*env\s*\}\s*from\s*["']cloudflare:workers["'];/,
    "const env=globalThis.__oleTestEnv;",
  );
const replaceSpecifier = (source, specifier, replacement) =>
  source
    .replaceAll(`"${specifier}"`, JSON.stringify(replacement))
    .replaceAll(`'${specifier}'`, JSON.stringify(replacement));
const avatarUrl = compile(
  await readFile(new URL("../lib/avatar.ts", import.meta.url), "utf8"),
);
const modelUrl = compile(
  (await readFile(new URL("../lib/work-model.ts", import.meta.url), "utf8"))
    .replaceAll("'./avatar'", JSON.stringify(avatarUrl))
    .replaceAll('"./avatar"', JSON.stringify(avatarUrl)),
);
const {
  emptyState,
  sampleState,
  metrics,
  late,
  dateKey,
  validDate,
  transition,
  validateState,
  nextRoutineDueDate,
  buildNextRoutineTask,
  buildAdvanceRoutineTasks,
  routineLabel,
} = await import(modelUrl);
const mf = new Miniflare({
  modules: true,
  script: 'export default {fetch(){return new Response("test")}}',
  compatibilityDate: "2026-05-15",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"],
});
after(async () => {
  await mf.dispose();
  delete globalThis.__oleTestEnv;
});
const DB = await mf.getD1Database("DB");
const evidenceObjects = new Map();
const BUCKET = {
  async put(key, value) {
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    evidenceObjects.set(key, { bytes, uploaded: new Date(), size: bytes.length });
  },
  async get(key) {
    const object = evidenceObjects.get(key);
    return object ? { ...object, body: new Blob([object.bytes]).stream() } : null;
  },
  async head(key) {
    return evidenceObjects.get(key) || null;
  },
  async list({ prefix }) {
    return {
      objects: [...evidenceObjects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, object]) => ({ key, ...object })),
    };
  },
  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys])
      evidenceObjects.delete(key);
  },
};
await DB.prepare(
  await readFile(
    new URL("../drizzle/0000_needy_makkari.sql", import.meta.url),
    "utf8",
  ),
).run();
for (const migration of [
  "../drizzle/0001_cynical_mystique.sql",
  "../drizzle/0002_tearful_liz_osborn.sql",
  "../drizzle/0003_shiny_microbe.sql",
  "../drizzle/0004_curvy_salo.sql",
  "../drizzle/0005_last_stick.sql",
  "../drizzle/0006_high_bloodaxe.sql",
  "../drizzle/0007_petite_thunderbolt.sql",
  "../drizzle/0008_productive_penance.sql",
  "../drizzle/0009_dark_morlun.sql",
])
  for (const statement of (await readFile(new URL(migration, import.meta.url), "utf8"))
    .split("--> statement-breakpoint")
    .map((x) => x.trim())
    .filter(Boolean))
    await DB.prepare(statement).run();
globalThis.__oleTestEnv = { DB, BUCKET };
const employeeAuthUrl = compile(
  await readFile(new URL("../lib/employee-auth.ts", import.meta.url), "utf8"),
);
const employeeAuth = await import(employeeAuthUrl);
const routeSource = replaceSpecifier(
  replaceSpecifier(
    injectTestEnv(
  await readFile(
    new URL("../app/api/workspace/route.ts", import.meta.url),
    "utf8",
      ),
    ),
    "../../../lib/work-model",
    modelUrl,
  ),
  "../../../lib/employee-auth",
  employeeAuthUrl,
);
const { GET, PUT } = await import(compile(routeSource));
const avatarModel = await import(avatarUrl);
const avatarStoreUrl = compile(
  (
    await readFile(new URL("../lib/avatar-store.ts", import.meta.url), "utf8")
  ).replaceAll("'./avatar'", JSON.stringify(avatarUrl)),
);
const avatarRoute = (
  await readFile(
    new URL("../app/api/employees/avatar/route.ts", import.meta.url),
    "utf8",
  )
)
  .replace(
    "import {env} from 'cloudflare:workers';",
    "const env=globalThis.__oleTestEnv;",
  )
  .replace("'../../../../lib/avatar-store'", JSON.stringify(avatarStoreUrl))
  .replace("'../../../../lib/employee-auth'", JSON.stringify(employeeAuthUrl));
const { PATCH } = await import(compile(avatarRoute));
const accountRoute = replaceSpecifier(
  injectTestEnv(
    await readFile(
      new URL("../app/api/employees/account/route.ts", import.meta.url),
      "utf8",
    ),
  ),
  "../../../../lib/employee-auth",
  employeeAuthUrl,
);
const { PATCH: saveEmployeeAccount } = await import(compile(accountRoute));
const loginRoute = (
  await readFile(
    new URL("../app/api/employee-auth/login/route.ts", import.meta.url),
    "utf8",
  )
)
  .replace(
    "import {env} from 'cloudflare:workers';",
    "const env=globalThis.__oleTestEnv;",
  )
  .replace("'../../../../lib/employee-auth'", JSON.stringify(employeeAuthUrl));
const { POST: employeeLogin } = await import(compile(loginRoute));
const logoutRoute = (
  await readFile(
    new URL("../app/api/employee-auth/logout/route.ts", import.meta.url),
    "utf8",
  )
)
  .replace(
    "import {env} from 'cloudflare:workers';",
    "const env=globalThis.__oleTestEnv;",
  )
  .replace("'../../../../lib/employee-auth'", JSON.stringify(employeeAuthUrl));
const { POST: employeeLogout } = await import(compile(logoutRoute));
const presenceRoute = (
  await readFile(
    new URL("../app/api/presence/route.ts", import.meta.url),
    "utf8",
  )
)
  .replace(
    'import { env } from "cloudflare:workers";',
    "const env=globalThis.__oleTestEnv;",
  )
  .replace('"../../../lib/employee-auth"', JSON.stringify(employeeAuthUrl));
const { GET: readPresence } = await import(compile(presenceRoute));
const taskActionRoute = replaceSpecifier(
  replaceSpecifier(
    injectTestEnv(
  await readFile(
    new URL("../app/api/tasks/action/route.ts", import.meta.url),
    "utf8",
      ),
    ),
    "../../../../lib/work-model",
    modelUrl,
  ),
  "../../../../lib/employee-auth",
  employeeAuthUrl,
);
const { POST: employeeTaskAction } = await import(compile(taskActionRoute));
const evidenceRoute = (
  await readFile(
    new URL("../app/api/tasks/evidence/route.ts", import.meta.url),
    "utf8",
  )
)
  .replace(
    'import { env } from "cloudflare:workers";',
    "const env=globalThis.__oleTestEnv;",
  )
  .replace('"../../../../lib/employee-auth"', JSON.stringify(employeeAuthUrl))
  .replace('"../../../../lib/work-model"', JSON.stringify(modelUrl));
const { POST: uploadEvidence } = await import(compile(evidenceRoute));
const evidenceReadRoute = (
  await readFile(
    new URL("../app/api/tasks/evidence/[id]/route.ts", import.meta.url),
    "utf8",
  )
)
  .replace(
    'import { env } from "cloudflare:workers";',
    "const env=globalThis.__oleTestEnv;",
  )
  .replace(
    '"../../../../../lib/employee-auth"',
    JSON.stringify(employeeAuthUrl),
  )
  .replace('"../../../../../lib/work-model"', JSON.stringify(modelUrl));
const { GET: readEvidence } = await import(compile(evidenceReadRoute));
const sopContentLibraryUrl = compile(
  await readFile(new URL("../lib/sop-content.ts", import.meta.url), "utf8"),
);
const sopQuizLibraryUrl = compile(
  replaceSpecifier(
    await readFile(new URL("../lib/sop-quiz.ts", import.meta.url), "utf8"),
    "./sop-content",
    sopContentLibraryUrl,
  ),
);
const sopPlansRoute = replaceSpecifier(
  replaceSpecifier(
    injectTestEnv(await readFile(new URL("../app/api/sop/plans/route.ts", import.meta.url), "utf8")),
    "../../../../lib/employee-auth",
    employeeAuthUrl,
  ),
  "../../../../lib/sop-quiz",
  sopQuizLibraryUrl,
);
const { GET: readExamPlans, POST: createExamPlan, PATCH: updateExamPlan, DELETE: deleteExamPlan } = await import(compile(sopPlansRoute));
const sopContentRoute = replaceSpecifier(
  replaceSpecifier(
    injectTestEnv(
      await readFile(new URL("../app/api/sop/content/route.ts", import.meta.url), "utf8"),
    ),
    "../../../../lib/employee-auth",
    employeeAuthUrl,
  ),
  "../../../../lib/sop-content",
  sopContentLibraryUrl,
);
const { GET: readSopContent, POST: saveSopContent } = await import(compile(sopContentRoute));
const sopRoute = replaceSpecifier(
  replaceSpecifier(
    injectTestEnv(await readFile(new URL("../app/api/sop/route.ts", import.meta.url), "utf8")),
    "../../../lib/employee-auth",
    employeeAuthUrl,
  ),
  "../../../lib/sop-quiz",
  sopQuizLibraryUrl,
);
const { GET: readSopResults } = await import(compile(sopRoute));
const sopMediaRoute = replaceSpecifier(
  injectTestEnv(
    await readFile(new URL("../app/api/sop/content/media/route.ts", import.meta.url), "utf8"),
  ),
  "../../../../../lib/employee-auth",
  employeeAuthUrl,
);
const { POST: uploadSopMedia } = await import(compile(sopMediaRoute));
const sopMediaReadRoute = replaceSpecifier(
  injectTestEnv(
    await readFile(new URL("../app/api/sop/content/media/[id]/route.ts", import.meta.url), "utf8"),
  ),
  "../../../../../../lib/employee-auth",
  employeeAuthUrl,
);
const { GET: readSopMedia } = await import(compile(sopMediaReadRoute));
const farmLibraryUrl = compile(
  replaceSpecifier(
    await readFile(new URL("../lib/ole-farm.ts", import.meta.url), "utf8"),
    "./work-model",
    modelUrl,
  ),
);
const farmRoute = replaceSpecifier(
  replaceSpecifier(
    replaceSpecifier(
      injectTestEnv(await readFile(new URL("../app/api/farm/route.ts", import.meta.url), "utf8")),
      "../../../lib/employee-auth",
      employeeAuthUrl,
    ),
    "../../../lib/ole-farm",
    farmLibraryUrl,
  ),
  "../../../lib/work-model",
  modelUrl,
);
const { GET: readFarm, POST: adjustFarm } = await import(compile(farmRoute));
const backupsLibUrl = compile(
  replaceSpecifier(
    await readFile(new URL("../lib/backups.ts", import.meta.url), "utf8"),
    "./work-model",
    modelUrl,
  ),
);
const backupsRoute = replaceSpecifier(
  replaceSpecifier(
    injectTestEnv(
      await readFile(new URL("../app/api/backups/route.ts", import.meta.url), "utf8"),
    ),
    "../../../lib/backups",
    backupsLibUrl,
  ),
  "../../../lib/work-model",
  modelUrl,
);
const { GET: listBackups } = await import(compile(backupsRoute));
const backupReadRoute = replaceSpecifier(
  injectTestEnv(
    await readFile(new URL("../app/api/backups/[date]/route.ts", import.meta.url), "utf8"),
  ),
  "../../../../lib/backups",
  backupsLibUrl,
);
const { GET: readBackup } = await import(compile(backupReadRoute));
const lineRoute = replaceSpecifier(
  replaceSpecifier(
    injectTestEnv(
      await readFile(new URL("../app/api/notifications/line/route.ts", import.meta.url), "utf8"),
    ),
    "../../../../lib/employee-auth",
    employeeAuthUrl,
  ),
  "../../../../lib/work-model",
  modelUrl,
);
const { GET: lineConnectionStatus, POST: runLineNotification } = await import(
  compile(lineRoute)
);
const origin = "http://localhost";
function request(owner = "owner-a", body, requestOrigin = origin) {
  const headers = { "Content-Type": "application/json", origin: requestOrigin };
  if (owner) headers["oai-authenticated-user-id"] = owner;
  return new Request(origin + "/api/workspace", {
    method: body ? "PUT" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}
const payload = (state, revision = 0, action = "test update") => ({
  state,
  revision,
  action,
});

test("calendar: Thai date rollover, leap years and year boundaries", () => {
  assert.equal(dateKey(new Date("2026-09-03T17:00:00Z")), "2026-09-04");
  assert.equal(dateKey(new Date("2026-12-31T17:00:00Z")), "2027-01-01");
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2026-04-31"), false);
});
test("routine tasks: calculate the next round safely and stop at the end date", () => {
  const daily = {
    frequency: "daily",
    interval: 2,
    endDate: null,
    seriesId: "daily-series",
  };
  const weekly = {
    frequency: "weekly",
    interval: 2,
    endDate: null,
    seriesId: "weekly-series",
  };
  const monthly = {
    frequency: "monthly",
    interval: 1,
    endDate: "2028-03-31",
    seriesId: "monthly-series",
  };
  assert.equal(nextRoutineDueDate("2026-09-04", daily), "2026-09-06");
  assert.equal(nextRoutineDueDate("2026-09-04", weekly), "2026-09-18");
  assert.equal(nextRoutineDueDate("2028-01-31", monthly), "2028-02-29");
  assert.equal(routineLabel({ ...weekly, interval: 1 }), "ทุกสัปดาห์");
  const task = {
    ...sampleState().tasks[4],
    routine: { ...monthly, endDate: "2028-02-29" },
    dueDate: "2028-01-31",
  };
  const next = buildNextRoutineTask(task, "next-id", "2028-01-31T12:00:00Z");
  assert.equal(next.dueDate, "2028-02-29");
  assert.equal(next.status, "รอรับงาน");
  assert.equal(next.completedAt, null);
  assert.deepEqual(next.comments, []);
  assert.equal(
    buildNextRoutineTask({ ...next, dueDate: "2028-02-29" }, "past-end"),
    null,
  );
  const selectedDays = {
    frequency: "weekly",
    interval: 1,
    startDate: "2026-09-07",
    weekdays: [1, 3, 5],
    endDate: null,
    seriesId: "selected-days",
  };
  assert.equal(nextRoutineDueDate("2026-09-07", selectedDays), "2026-09-09");
  assert.equal(nextRoutineDueDate("2026-09-09", selectedDays), "2026-09-11");
  assert.equal(nextRoutineDueDate("2026-09-11", selectedDays), "2026-09-14");
  assert.equal(
    nextRoutineDueDate("2026-09-07", {
      ...selectedDays,
      interval: 2,
      weekdays: [1],
    }),
    "2026-09-21",
  );
  const thursday = {
    frequency: "weekly",
    interval: 1,
    startDate: "2026-09-03",
    weekdays: [4],
    endDate: null,
    seriesId: "thursday",
  };
  assert.equal(nextRoutineDueDate("2026-09-03", thursday), "2026-09-10");
  assert.equal(nextRoutineDueDate("2026-09-10", thursday), "2026-09-17");
  assert.equal(
    nextRoutineDueDate("2026-09-07", {
      frequency: "monthly",
      interval: 1,
      monthMode: "nthWeekday",
      monthWeek: 1,
      monthWeekday: 1,
      endDate: null,
      seriesId: "first-monday",
    }),
    "2026-10-05",
  );
  const reportDays = {
    frequency: "monthly",
    interval: 1,
    monthMode: "days",
    monthDays: [5, 10, 15, 20],
    endDate: null,
    seriesId: "staff-report",
  };
  assert.equal(nextRoutineDueDate("2026-01-05", reportDays), "2026-01-10");
  assert.equal(nextRoutineDueDate("2026-01-10", reportDays), "2026-01-15");
  assert.equal(nextRoutineDueDate("2026-01-20", reportDays), "2026-02-05");
  assert.equal(routineLabel(reportDays), "ทุกเดือน · วันที่ 5, 10, 15, 20");
  let reportCursor = "2026-01-05";
  const generatedReportDates = [reportCursor];
  for (let occurrence = 0; occurrence < 11; occurrence += 1) {
    reportCursor = nextRoutineDueDate(reportCursor, reportDays);
    generatedReportDates.push(reportCursor);
  }
  assert.equal(new Set(generatedReportDates).size, generatedReportDates.length);
  const lateMonthDays = { ...reportDays, monthDays: [29, 30, 31] };
  assert.equal(nextRoutineDueDate("2026-01-31", lateMonthDays), "2026-03-29");
  assert.equal(nextRoutineDueDate("2028-01-31", lateMonthDays), "2028-02-29");
  const counted = {
    ...task,
    routine: { ...daily, maxOccurrences: 2, occurrence: 2 },
  };
  assert.equal(buildNextRoutineTask(counted, "over-count"), null);
  const advance = {
    ...task,
    id: "advance-first",
    dueDate: "2026-09-07",
    routine: {
      ...daily,
      createMode: "advance",
      advanceCount: 3,
      occurrence: 1,
    },
  };
  const planned = buildAdvanceRoutineTasks(
    advance,
    (() => {
      let i = 0;
      return () => `advance-${++i}`;
    })(),
  );
  assert.equal(planned.length, 2);
  assert.deepEqual(
    planned.map((t) => t.dueDate),
    ["2026-09-09", "2026-09-11"],
  );
});
test("workflow: receive, checklist gate, review, reject, approve, reopen", () => {
  let t = {
    ...sampleState().tasks[0],
    checklist: [{ id: "one", label: "check stock", done: false }],
  };
  assert.throws(() => transition(t, "สำเร็จ"));
  t = transition(t, "กำลังทำ");
  assert.throws(() => transition(t, "รอตรวจ"));
  t.checklist[0].done = true;
  t = transition(t, "รอตรวจ");
  assert.throws(() => transition(t, "ต้องแก้ไข"));
  t.comments = [
    {
      id: "comment",
      text: "แก้จำนวน",
      at: new Date().toISOString(),
      author: "tester",
    },
  ];
  t = transition(t, "ต้องแก้ไข");
  t = transition(t, "รอตรวจ");
  t = transition(t, "สำเร็จ", "2026-09-04T05:00:00Z");
  assert.equal(t.completedAt, "2026-09-04T05:00:00Z");
  assert.equal(transition(t, "กำลังทำ").completedAt, null);
  const quickSource = {
    ...sampleState().tasks[0],
    checklist: [
      { id: "quick-check", label: "optional confirmation", done: false },
    ],
  };
  const quick = transition(quickSource, "รอตรวจ", "2026-09-04T06:00:00Z", {
    allowIncompleteChecklist: true,
  });
  quick.quickSubmit = {
    at: "2026-09-04T06:00:00Z",
    by: "tester",
    incompleteChecklist: true,
  };
  validateState({ ...sampleState(), tasks: [quick] });
  assert.equal(transition(quick, "สำเร็จ").status, "สำเร็จ");
});
test("metrics: no fake score, completed jobs not overdue, correct denominator", () => {
  assert.equal(metrics([]).completion, null);
  assert.equal(metrics([]).onTime, null);
  const tasks = sampleState().tasks.map((t) => ({
    ...t,
    dueDate: "2026-09-04",
  }));
  tasks[4].completedAt = "2026-09-04T18:00:00Z";
  const m = metrics(tasks, "2026-09-05");
  assert.equal(m.total, 5);
  assert.equal(m.done, 1);
  assert.equal(m.overdue, 4);
  assert.equal(m.completion, 20);
  assert.equal(m.onTime, 0);
  assert.equal(late(tasks[4], "2027-01-01"), false);
  tasks[4].completedAt = "2026-09-04T10:00:00Z";
  assert.equal(metrics(tasks).onTime, 100);
});
test("validation: reject orphan employee IDs, duplicates and invalid completion", () => {
  validateState(emptyState());
  validateState(sampleState());
  let s = sampleState();
  s.tasks[0].assigneeId = "missing";
  assert.throws(() => validateState(s));
  s = sampleState();
  s.employees.push(s.employees[0]);
  assert.throws(() => validateState(s));
  s = sampleState();
  s.tasks[4].checklist = [{ id: "c", label: "unfinished", done: false }];
  assert.throws(() => validateState(s));
  s = sampleState();
  s.employees[0].active = false;
  assert.throws(() => validateState(s));
  s = sampleState();
  s.tasks[4].completedAt = null;
  assert.throws(() => validateState(s));
  s = sampleState();
  s.tasks[0].routine = {
    frequency: "weekly",
    interval: 0,
    endDate: null,
    seriesId: "bad",
  };
  assert.throws(() => validateState(s));
  s = sampleState();
  s.tasks[0].routine = {
    frequency: "monthly",
    interval: 1,
    endDate: "2020-01-01",
    seriesId: "bad-end",
  };
  assert.throws(() => validateState(s));
  s = sampleState();
  s.tasks[0].routine = {
    frequency: "weekly",
    interval: 1,
    endDate: null,
    seriesId: "bad-days",
    weekdays: [1, 1],
  };
  assert.throws(() => validateState(s));
  s = sampleState();
  s.tasks[0].routine = {
    frequency: "monthly",
    interval: 1,
    endDate: null,
    seriesId: "bad-month-days",
    monthMode: "days",
    monthDays: [5, 5, 32],
  };
  assert.throws(() => validateState(s));
});
test("API: auth, durable roundtrip, server audit, owner isolation and conflicts", async () => {
  assert.equal((await GET(request(""))).status, 401);
  assert.equal((await PUT(request("", payload(emptyState())))).status, 401);
  assert.equal(
    (
      await PUT(
        request("owner-a", payload(emptyState()), "https://untrusted.invalid"),
      )
    ).status,
    403,
  );
  const initial = await (await GET(request())).json();
  assert.equal(initial.revision, 0);
  assert.equal(initial.state.tasks.length, 0);
  const s = sampleState();
  s.activity = [
    {
      id: "fake",
      text: "forged",
      actor: "someone",
      at: new Date().toISOString(),
    },
  ];
  s.tasks[0].routine = {
    frequency: "weekly",
    interval: 1,
    endDate: null,
    seriesId: "stock-weekly",
  };
  const first = await PUT(request("owner-a", payload(s)));
  assert.equal(first.status, 200);
  const saved = await first.json();
  assert.equal(saved.revision, 1);
  assert.equal(saved.state.activity.length, 1);
  assert.equal(saved.state.activity[0].text, "test update");
  const read = await (await GET(request())).json();
  assert.deepEqual(read.state, saved.state);
  assert.equal(read.revision, 1);
  const other = await (await GET(request("owner-b"))).json();
  assert.equal(other.state.tasks.length, 0);
  assert.equal((await PUT(request("owner-a", payload(s, 0)))).status, 409);
  const changed = structuredClone(saved.state);
  changed.employees[1].name = "คนที่สอง";
  changed.employees[1].avatar = {
    face: "round",
    skin: "#E9AE80",
    eyes: "● ●",
    hair: "short",
    glasses: "none",
    mouth: "smile",
    hat: "none",
    background: "#AEE4FF",
  };
  changed.tasks[0].assigneeId = changed.employees[1].id;
  changed.events.push({
    id: "mark",
    date: "2026-09-12",
    time: "09:00",
    title: "ประชุม",
    important: true,
    color: "yellow",
  });
  const race = await Promise.all([
    PUT(request("owner-a", payload(changed, 1, "assign task"))),
    PUT(request("owner-a", payload(saved.state, 1, "stale edit"))),
  ]);
  assert.deepEqual(race.map((x) => x.status).sort(), [200, 409]);
  const winner = await race.find((x) => x.status === 200).json();
  const latest = await (await GET(request())).json();
  assert.deepEqual(latest.state, winner.state);
  assert.equal(latest.revision, 2);
  const invalid = structuredClone(latest.state);
  invalid.tasks[0].reviewerId = "unknown";
  assert.equal(
    (await PUT(request("owner-a", payload(invalid, 2)))).status,
    400,
  );
  assert.equal((await (await GET(request())).json()).revision, 2);
});
test("backup and LINE readiness: durable daily JSON, owner-only access, no fake connection", async () => {
  const owner = "backup-owner";
  assert.equal(
    (await listBackups(new Request(origin + "/api/backups"))).status,
    401,
  );
  assert.equal(
    (await PUT(request(owner, payload(sampleState())))).status,
    200,
  );
  const backupResponse = await listBackups(
    new Request(origin + "/api/backups", {
      headers: { "oai-authenticated-user-id": owner },
    }),
  );
  assert.equal(backupResponse.status, 200);
  const backupPayload = await backupResponse.json();
  assert.equal(backupPayload.backups.length, 1);
  const backup = await readBackup(
    new Request(origin + "/api/backups/" + backupPayload.backups[0].date, {
      headers: { "oai-authenticated-user-id": owner },
    }),
    { params: Promise.resolve({ date: backupPayload.backups[0].date }) },
  );
  assert.equal(backup.status, 200);
  assert.equal((await backup.json()).state.tasks.length > 0, true);
  const lineStatus = await lineConnectionStatus(
    new Request(origin + "/api/notifications/line", {
      headers: { "oai-authenticated-user-id": owner },
    }),
  );
  assert.equal(lineStatus.status, 200);
  assert.equal((await lineStatus.json()).connected, false);
  const lineRun = await runLineNotification(
    new Request(origin + "/api/notifications/line", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin,
        "oai-authenticated-user-id": owner,
      },
      body: JSON.stringify({ action: "run" }),
    }),
  );
  assert.equal(lineRun.status, 503);
});
test("employee account: save, persist, login and enforce scoped access", async () => {
  assert.equal(employeeAuth.passwordHashIterations, 100000);
  const owner = "owner-auth-test",
    state = sampleState();
  state.tasks.push({
    ...state.tasks[0],
    id: "quick-submit-task",
    title: "quick submit proof",
    checklist: [{ id: "quick-check", label: "optional proof", done: false }],
  });
  state.tasks.push({
    ...state.tasks[0],
    id: "department-visible-task",
    title: "งานฝ่ายที่เปิดให้มองเห็น",
    assigneeId: state.employees[1].id,
    reviewerId: state.employees[2].id,
  });
  const saved = await PUT(request(owner, payload(state)));
  assert.equal(saved.status, 200);
  const employee = state.employees[0],
    loginId = "qa.employee.26",
    password = "synthetic-test-password";
  const accountRequest = new Request(origin + "/api/employees/account", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      origin,
      "oai-authenticated-user-id": owner,
    },
    body: JSON.stringify({
      employeeId: employee.id,
      loginId,
      password,
      permissions: ["tasks"],
      visibleDepartments: [state.employees[1].department],
      active: true,
    }),
  });
  const accountResponse = await saveEmployeeAccount(accountRequest);
  assert.equal(accountResponse.status, 200);
  const account = await DB.prepare(
    "SELECT login_id loginId,password_hash passwordHash,visible_departments visibleDepartments FROM ole_employee_accounts WHERE owner_id=? AND employee_id=?",
  )
    .bind(owner, employee.id)
    .first();
  assert.equal(account.loginId, loginId);
  assert.notEqual(account.passwordHash, password);
  assert.deepEqual(JSON.parse(account.visibleDepartments), [
    state.employees[1].department,
  ]);
  const wrong = await employeeLogin(
    new Request(origin + "/api/employee-auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({
        loginId,
        password: "different-synthetic-password",
      }),
    }),
  );
  assert.equal(wrong.status, 401);
  const login = await employeeLogin(
    new Request(origin + "/api/employee-auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({ loginId, password }),
    }),
  );
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /^ole_employee_session=/);
  assert.match(setCookie, /HttpOnly/);
  const sessionCookie = setCookie.split(";", 1)[0];
  const ownerPresence = await readPresence(
    new Request(origin + "/api/presence", {
      headers: { "oai-authenticated-user-id": owner },
    }),
  );
  assert.equal(ownerPresence.status, 200);
  assert.ok((await ownerPresence.json()).employeeIds.includes(employee.id));
  const employeeWorkspace = await GET(
    new Request(origin + "/api/workspace", {
      headers: { cookie: sessionCookie },
    }),
  );
  assert.equal(employeeWorkspace.status, 200);
  let employeePayload = await employeeWorkspace.json();
  assert.equal(employeePayload.role, "employee");
  assert.deepEqual(employeePayload.permissions, ["tasks"]);
  assert.ok(
    employeePayload.state.tasks.every((task) => {
      const assigneeDepartment = state.employees.find(
        (person) => person.id === task.assigneeId,
      )?.department;
      return (
        task.assigneeId === employee.id ||
        task.reviewerId === employee.id ||
        assigneeDepartment === state.employees[1].department
      );
    }),
  );
  assert.ok(
    employeePayload.state.tasks.some(
      (task) => task.id === "department-visible-task",
    ),
  );
  const selfAvatar = { version: 3, presetId: "avatar-04" };
  const avatarSaved = await PATCH(
    new Request(origin + "/api/employees/avatar", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        origin,
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        employeeId: employee.id,
        avatar: selfAvatar,
        revision: employeePayload.revision,
      }),
    }),
  );
  assert.equal(avatarSaved.status, 200);
  const blockedAvatar = await PATCH(
    new Request(origin + "/api/employees/avatar", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        origin,
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        employeeId: state.employees[1].id,
        avatar: selfAvatar,
        revision: employeePayload.revision + 1,
      }),
    }),
  );
  assert.equal(blockedAvatar.status, 403);
  employeePayload = await (
    await GET(
      new Request(origin + "/api/workspace", {
        headers: { cookie: sessionCookie },
      }),
    )
  ).json();
  assert.deepEqual(
    employeePayload.state.employees.find((person) => person.id === employee.id)
      .avatar,
    selfAvatar,
  );
  assert.equal(employeePayload.state.employees.length, state.employees.length);
  const employeeCreatedTask = {
    id: "employee-created-task",
    title: "งานที่พนักงานสร้าง",
    description: "ตรวจว่าพนักงานสร้างและมอบหมายงานได้จริง",
    assigneeId: employee.id,
    reviewerId: state.employees[1].id,
    dueDate: "2026-10-01",
    priority: "ปกติ",
    status: "รอรับงาน",
    createdAt: "2020-01-01T00:00:00.000Z",
    completedAt: null,
    checklist: [{ id: "employee-create-check", label: "ตรวจงาน", done: true }],
    comments: [{ id: "unsafe-comment", text: "must be removed", author: "fake", at: "2020-01-01T00:00:00.000Z" }],
    attachments: [],
    submissionCount: 9,
  };
  const createdByEmployee = await employeeTaskAction(
    new Request(origin + "/api/tasks/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin,
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        task: employeeCreatedTask,
        revision: employeePayload.revision,
        action: "untrusted create action",
        intent: "create",
      }),
    }),
  );
  assert.equal(createdByEmployee.status, 200);
  employeePayload = await createdByEmployee.json();
  const safelyCreated = employeePayload.state.tasks.find(
    (task) => task.id === employeeCreatedTask.id,
  );
  assert.equal(safelyCreated.status, "รอรับงาน");
  assert.equal(safelyCreated.checklist[0].done, false);
  assert.deepEqual(safelyCreated.comments, []);
  assert.equal(safelyCreated.submissionCount, 0);
  assert.notEqual(safelyCreated.createdAt, employeeCreatedTask.createdAt);
  const employeeDeleteAttempt = await PUT(
    new Request(origin + "/api/workspace", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        origin,
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        state: {
          ...employeePayload.state,
          tasks: employeePayload.state.tasks.filter(
            (task) => task.id !== employeeCreatedTask.id,
          ),
        },
        revision: employeePayload.revision,
        action: "พยายามลบงาน",
      }),
    }),
  );
  assert.equal(employeeDeleteAttempt.status, 401);
  const quickTask = employeePayload.state.tasks.find(
    (task) => task.id === "quick-submit-task",
  );
  const quickResponse = await employeeTaskAction(
    new Request(origin + "/api/tasks/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin,
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        task: { ...quickTask, status: "รอตรวจ" },
        revision: employeePayload.revision,
        action: "untrusted quick text",
        intent: "quickSubmit",
      }),
    }),
  );
  assert.equal(quickResponse.status, 200);
  employeePayload = await quickResponse.json();
  const quickSaved = employeePayload.state.tasks.find(
    (task) => task.id === quickTask.id,
  );
  assert.equal(quickSaved.status, "รอตรวจ");
  assert.equal(quickSaved.quickSubmit.incompleteChecklist, true);
  assert.equal(quickSaved.quickSubmit.by, employee.name);
  const assigned = employeePayload.state.tasks.find(
    (task) => task.assigneeId === employee.id && task.status === "รอรับงาน",
  );
  const forbiddenEdit = await employeeTaskAction(
    new Request(origin + "/api/tasks/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin,
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        task: { ...assigned, title: "employee cannot rewrite assigned work" },
        revision: employeePayload.revision,
        action: "forbidden structural edit",
      }),
    }),
  );
  assert.equal(forbiddenEdit.status, 403);
  const started = await employeeTaskAction(
    new Request(origin + "/api/tasks/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin,
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        task: { ...assigned, status: "กำลังทำ" },
        revision: employeePayload.revision,
        action: "employee started assigned task",
      }),
    }),
  );
  assert.equal(started.status, 200);
  const startedPayload = await started.json();
  const evidenceForm = new FormData();
  evidenceForm.set("taskId", assigned.id);
  evidenceForm.set("revision", String(startedPayload.revision));
  evidenceForm.append(
    "files",
    new File(["synthetic evidence"], "proof.pdf", { type: "application/pdf" }),
  );
  evidenceForm.append(
    "files",
    new File(["second evidence"], "photo.png", { type: "image/png" }),
  );
  const evidenceResponse = await uploadEvidence(
    new Request(origin + "/api/tasks/evidence", {
      method: "POST",
      headers: { origin, cookie: sessionCookie },
      body: evidenceForm,
    }),
  );
  assert.equal(evidenceResponse.status, 200);
  const evidence = await evidenceResponse.json();
  assert.equal(evidence.attachments.length, 2);
  assert.equal(evidence.attachments[0].name, "proof.pdf");
  assert.equal(evidence.attachments[0].submissionRound, 1);
  assert.equal(evidence.taskId, assigned.id);
  assert.ok(evidence.updatedAt);
  const nextEvidenceForm = new FormData();
  nextEvidenceForm.set("taskId", assigned.id);
  nextEvidenceForm.set("revision", String(evidence.revision));
  nextEvidenceForm.append(
    "files",
    new File(["third evidence"], "photo-2.jpg", { type: "" }),
  );
  const nextEvidenceResponse = await uploadEvidence(
    new Request(origin + "/api/tasks/evidence", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin", cookie: sessionCookie },
      body: nextEvidenceForm,
    }),
  );
  assert.equal(nextEvidenceResponse.status, 200);
  const nextEvidence = await nextEvidenceResponse.json();
  assert.equal(nextEvidence.attachments.length, 3);
  assert.equal(nextEvidence.attachments[2].name, "photo-2.jpg");
  assert.equal(nextEvidence.attachments[2].type, "image/jpeg");
  const evidenceRead = await readEvidence(
    new Request(origin + "/api/tasks/evidence/" + evidence.attachments[0].id, {
      headers: { cookie: sessionCookie },
    }),
    { params: Promise.resolve({ id: evidence.attachments[0].id }) },
  );
  assert.equal(evidenceRead.status, 200);
  assert.equal(await evidenceRead.text(), "synthetic evidence");
  const storedState = JSON.parse(
    (
      await DB.prepare("SELECT state FROM ole_workspaces WHERE owner_id=?")
        .bind(owner)
        .first()
    ).state,
  );
  assert.equal(
    storedState.tasks.find((task) => task.id === assigned.id).status,
    "กำลังทำ",
  );
  assert.equal(
    storedState.tasks.find((task) => task.id === assigned.id).attachments
      .length,
    3,
  );
  assert.equal(
    (
      await PUT(
        new Request(origin + "/api/workspace", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            origin,
            cookie: sessionCookie,
          },
          body: JSON.stringify(payload(state, 1)),
        }),
      )
    ).status,
    401,
  );
  const logout = await employeeLogout(
    new Request(origin + "/api/employee-auth/logout", {
      method: "POST",
      headers: { origin, cookie: sessionCookie },
    }),
  );
  assert.equal(logout.status, 200);
  const afterLogout = await readPresence(
    new Request(origin + "/api/presence", {
      headers: { "oai-authenticated-user-id": owner },
    }),
  );
  assert.equal(afterLogout.status, 200);
  assert.equal((await afterLogout.json()).employeeIds.includes(employee.id), false);
});

test("SOP permissions: legacy-safe defaults, server enforcement, department scope and audit", async () => {
  assert.deepEqual(
    employeeAuth.normalizeEmployeePermissions(["sop"]),
    ["sop", "sop_library", "sop_quiz", "sop_results"],
  );
  assert.equal(
    employeeAuth.normalizeEmployeePermissions(["sop"]).includes("sop_manage"),
    false,
  );

  const owner = "sop-permission-owner";
  const state = sampleState();
  assert.equal((await PUT(request(owner, payload(state)))).status, 200);
  const employee = state.employees[0];
  const allowedDepartment = state.employees[1].department;
  const outsideEmployee = state.employees[2];
  const loginId = "sop.scope.employee";
  const password = "synthetic-sop-password";
  const ownerHeaders = {
    "Content-Type": "application/json",
    origin,
    "oai-authenticated-user-id": owner,
    "oai-authenticated-user-email": "owner@example.test",
  };
  const accountBody = {
    employeeId: employee.id,
    loginId,
    password,
    permissions: ["sop", "sop_library", "sop_plans"],
    visibleDepartments: [allowedDepartment],
    active: true,
  };
  assert.equal(
    (
      await saveEmployeeAccount(
        new Request(origin + "/api/employees/account", {
          method: "PATCH",
          headers: ownerHeaders,
          body: JSON.stringify(accountBody),
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await DB.prepare(
        "SELECT COUNT(*) count FROM ole_permission_audit WHERE owner_id=? AND employee_id=?",
      )
        .bind(owner, employee.id)
        .first()
    ).count,
    0,
  );

  const login = await employeeLogin(
    new Request(origin + "/api/employee-auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({ loginId, password }),
    }),
  );
  const sessionCookie = login.headers.get("set-cookie").split(";", 1)[0];
  const employeeHeaders = {
    "Content-Type": "application/json",
    origin,
    cookie: sessionCookie,
  };
  const contentBody = {
    topicCode: "8.8",
    categoryId: "store-operations",
    title: "หัวข้อทดสอบสิทธิ์",
    purpose: "ทดสอบการป้องกัน API",
    steps: ["ขั้นตอนทดสอบ"],
    stepMedia: [{ images: [], youtubeUrls: [] }],
    audiences: ["พนักงานหน้าร้าน"],
    documentVersion: "test",
    changeNote: "ทดสอบสิทธิ์",
    state: "draft",
  };
  assert.equal(
    (
      await saveSopContent(
        new Request(origin + "/api/sop/content", {
          method: "POST",
          headers: employeeHeaders,
          body: JSON.stringify(contentBody),
        }),
      )
    ).status,
    403,
  );
  const deniedMedia = new FormData();
  deniedMedia.append(
    "files",
    new File(["blocked"], "blocked.png", { type: "image/png" }),
  );
  assert.equal(
    (
      await uploadSopMedia(
        new Request(origin + "/api/sop/content/media", {
          method: "POST",
          headers: { origin, cookie: sessionCookie },
          body: deniedMedia,
        }),
      )
    ).status,
    403,
  );

  const basePlan = {
    title: "ชุดสอบในฝ่ายที่ได้รับสิทธิ์",
    questionIds: ["q01"],
    audienceType: "employee",
    audienceValues: [state.employees[1].id],
    startsAt: "2026-09-01T00:00:00.000Z",
    dueAt: "2026-12-31T23:59:59.000Z",
    passScore: 80,
    retakeWaitDays: 0,
    status: "draft",
  };
  const scopedPlan = await createExamPlan(
    new Request(origin + "/api/sop/plans", {
      method: "POST",
      headers: employeeHeaders,
      body: JSON.stringify(basePlan),
    }),
  );
  assert.equal(scopedPlan.status, 201);
  assert.deepEqual((await scopedPlan.json()).scopeDepartments, [allowedDepartment]);
  assert.equal(
    (
      await createExamPlan(
        new Request(origin + "/api/sop/plans", {
          method: "POST",
          headers: employeeHeaders,
          body: JSON.stringify({
            ...basePlan,
            title: "ชุดสอบนอกฝ่าย",
            audienceValues: [outsideEmployee.id],
          }),
        }),
      )
    ).status,
    403,
  );

  await DB.prepare(
    "INSERT INTO ole_sop_attempts (id,owner_id,employee_id,plan_id,score,level,critical_passed,correct_count,total_questions,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  )
    .bind("scope-visible-attempt", owner, state.employees[1].id, null, 90, "Silver", 1, 1, 1, "2026-09-10T00:00:00.000Z")
    .run();
  await DB.prepare(
    "INSERT INTO ole_sop_attempts (id,owner_id,employee_id,plan_id,score,level,critical_passed,correct_count,total_questions,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  )
    .bind("scope-hidden-attempt", owner, outsideEmployee.id, null, 100, "Diamond", 1, 1, 1, "2026-09-10T01:00:00.000Z")
    .run();
  const scopedResults = await readSopResults(
    new Request(origin + "/api/sop", { headers: { cookie: sessionCookie } }),
  );
  assert.equal(scopedResults.status, 200);
  const scopedPayload = await scopedResults.json();
  assert.deepEqual(
    scopedPayload.attempts.map((attempt) => attempt.id),
    ["scope-visible-attempt"],
  );

  assert.equal(
    (
      await saveEmployeeAccount(
        new Request(origin + "/api/employees/account", {
          method: "PATCH",
          headers: ownerHeaders,
          body: JSON.stringify({
            ...accountBody,
            password: "",
            permissions: [...accountBody.permissions, "sop_manage"],
          }),
        }),
      )
    ).status,
    200,
  );
  assert.notEqual(
    (
      await saveSopContent(
        new Request(origin + "/api/sop/content", {
          method: "POST",
          headers: employeeHeaders,
          body: JSON.stringify(contentBody),
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await saveEmployeeAccount(
        new Request(origin + "/api/employees/account", {
          method: "PATCH",
          headers: ownerHeaders,
          body: JSON.stringify({ ...accountBody, password: "" }),
        }),
      )
    ).status,
    200,
  );
  const audit = await DB.prepare(
    "SELECT permission,enabled,actor,created_at createdAt FROM ole_permission_audit WHERE owner_id=? AND employee_id=? ORDER BY created_at",
  )
    .bind(owner, employee.id)
    .all();
  assert.deepEqual(
    audit.results.map((entry) => [entry.permission, entry.enabled]),
    [
      ["sop_manage", 1],
      ["sop_manage", 0],
    ],
  );
  assert.match(String(audit.results[0].actor), /owner@example\.test/);
  assert.ok(audit.results.every((entry) => !Number.isNaN(Date.parse(String(entry.createdAt)))));
});

test("SOP exam plans: edit access, archive, guarded delete and retained attempts", async () => {
  const owner = "sop-plan-owner";
  const headers = { origin, "oai-authenticated-user-id": owner, "Content-Type": "application/json" };
  const base = {
    title: "สอบ SOP หน้าร้าน",
    questionIds: ["q01", "q02"],
    audienceType: "all",
    audienceValues: [],
    startsAt: "2026-09-01T00:00:00.000Z",
    dueAt: "2026-12-31T23:59:59.000Z",
    passScore: 80,
    retakeWaitDays: 0,
    status: "draft",
  };
  const created = await createExamPlan(new Request(origin + "/api/sop/plans", { method: "POST", headers, body: JSON.stringify(base) }));
  assert.equal(created.status, 201);
  const plan = await created.json();

  const accessEdit = await updateExamPlan(new Request(origin + "/api/sop/plans", {
    method: "PATCH", headers,
    body: JSON.stringify({ ...base, id: plan.id, audienceType: "department", audienceValues: ["ฝ่ายหน้าร้าน"], questionIds: ["q01", "q03"], status: "open" }),
  }));
  assert.equal(accessEdit.status, 200);
  assert.deepEqual((await accessEdit.json()).audienceValues, ["ฝ่ายหน้าร้าน"]);

  await DB.prepare("INSERT INTO ole_sop_attempts (id,owner_id,employee_id,plan_id,score,level,critical_passed,correct_count,total_questions,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind("attempt-kept", owner, "employee-1", plan.id, 90, "Silver", 1, 2, 2, "2026-09-10T00:00:00.000Z").run();

  const audienceAfterAttempt = await updateExamPlan(new Request(origin + "/api/sop/plans", {
    method: "PATCH", headers,
    body: JSON.stringify({ ...base, id: plan.id, title: "สอบ SOP เฉพาะสาขา", audienceType: "branch", audienceValues: ["บ้านแซม"], questionIds: ["q01", "q03"], status: "closed" }),
  }));
  assert.equal(audienceAfterAttempt.status, 200);
  assert.equal((await audienceAfterAttempt.json()).attemptCount, 1);

  const changedQuestions = await updateExamPlan(new Request(origin + "/api/sop/plans", {
    method: "PATCH", headers,
    body: JSON.stringify({ ...base, id: plan.id, questionIds: ["q01", "q04"] }),
  }));
  assert.equal(changedQuestions.status, 409);
  assert.equal((await deleteExamPlan(new Request(origin + `/api/sop/plans?id=${plan.id}`, { method: "DELETE", headers }))).status, 409);

  const archived = await updateExamPlan(new Request(origin + "/api/sop/plans", { method: "PATCH", headers, body: JSON.stringify({ id: plan.id, status: "archived" }) }));
  assert.equal(archived.status, 200);
  const listing = await readExamPlans(new Request(origin + "/api/sop/plans", { headers: { "oai-authenticated-user-id": owner } }));
  const listedPlan = (await listing.json()).plans.find((item) => item.id === plan.id);
  assert.equal(listedPlan.status, "archived");
  assert.equal(listedPlan.attemptCount, 1);
  assert.equal((await DB.prepare("SELECT COUNT(*) count FROM ole_sop_attempts WHERE owner_id=? AND plan_id=?").bind(owner, plan.id).first()).count, 1);

  const unused = await createExamPlan(new Request(origin + "/api/sop/plans", { method: "POST", headers, body: JSON.stringify({ ...base, title: "ร่างที่ไม่ใช้" }) }));
  const unusedPlan = await unused.json();
  assert.equal((await deleteExamPlan(new Request(origin + `/api/sop/plans?id=${unusedPlan.id}`, { method: "DELETE", headers }))).status, 200);
});

test("SOP media: multiple images and YouTube links persist per step", async () => {
  const owner = "sop-media-owner";
  const headers = { origin, "oai-authenticated-user-id": owner };
  const mediaForm = new FormData();
  mediaForm.append("files", new File(["image-one"], "step-1.png", { type: "image/png" }));
  mediaForm.append("files", new File(["image-two"], "step-2.jpg", { type: "image/jpeg" }));
  const upload = await uploadSopMedia(new Request(origin + "/api/sop/content/media", { method: "POST", headers, body: mediaForm }));
  assert.equal(upload.status, 201);
  const uploaded = await upload.json();
  assert.equal(uploaded.images.length, 2);

  const save = await saveSopContent(new Request(origin + "/api/sop/content", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      topicCode: "2.10",
      categoryId: "sales-service",
      title: "ขั้นตอนพร้อมสื่อ",
      purpose: "ทดสอบการบันทึกสื่อประจำขั้นตอน",
      steps: ["ตรวจข้อมูล", "ยืนยันผล"],
      stepMedia: [
        { images: uploaded.images, youtubeUrls: ["https://youtu.be/dQw4w9WgXcQ"] },
        { images: [], youtubeUrls: [] },
      ],
      audiences: ["พนักงานหน้าร้าน"],
      documentVersion: "test-1",
      changeNote: "",
      state: "published",
    }),
  }));
  assert.equal(save.status, 201);

  const content = await readSopContent(new Request(origin + "/api/sop/content", { headers: { "oai-authenticated-user-id": owner } }));
  assert.equal(content.status, 200);
  const contentPayload = await content.json();
  const topic = contentPayload.published.find((item) => item.topicCode === "2.10");
  assert.equal(topic.stepMedia[0].images.length, 2);
  assert.deepEqual(topic.stepMedia[0].youtubeUrls, ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
  assert.equal(topic.changeNote, "เพิ่มหัวข้อ SOP ผ่านระบบ");

  const update = await saveSopContent(new Request(origin + "/api/sop/content", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      topicCode: "2.10",
      categoryId: "sales-service",
      title: "ขั้นตอนพร้อมสื่อ (แก้ไข)",
      purpose: "ยืนยันว่าการแก้ไขพร้อมรูปบันทึกได้",
      steps: ["ตรวจข้อมูลฉบับแก้ไข"],
      stepMedia: [{ images: uploaded.images.slice(0, 1), youtubeUrls: [] }],
      audiences: ["พนักงานหน้าร้าน"],
      documentVersion: "test-2",
      changeNote: "",
      state: "draft",
    }),
  }));
  assert.equal(update.status, 201);
  assert.equal((await update.json()).changeNote, "แก้ไข SOP ผ่านระบบ");

  const image = await readSopMedia(
    new Request(origin + "/api/sop/content/media/" + uploaded.images[0].id, { headers: { "oai-authenticated-user-id": owner } }),
    { params: Promise.resolve({ id: uploaded.images[0].id }) },
  );
  assert.equal(image.status, 200);
  assert.equal(await image.text(), "image-one");
});

test("Avatar catalog: 50 presets, unique IDs, and stable legacy migration", () => {
  const {
    avatarOptions: o,
    normalizeAvatar,
    validateAvatarV2,
    exampleAvatars,
    presetAvatars,
    normalizePresetAvatar,
    validateAvatarV3,
  } = avatarModel;
  assert.equal(presetAvatars.length, 50);
  assert.equal(new Set(presetAvatars.map((x) => x.id)).size, 50);
  presetAvatars.forEach((preset) =>
    validateAvatarV3({ version: 3, presetId: preset.id }),
  );
  assert.throws(() => validateAvatarV3({ version: 3, presetId: "missing" }));
  for (const [key, min] of Object.entries({
    face: 4,
    skin: 8,
    hair: 12,
    hairColor: 8,
    eyes: 1,
    eyeColor: 6,
    brow: 4,
    browColor: 6,
    mouth: 4,
    facialHair: 9,
    top: 8,
    bottom: 5,
    shoes: 4,
  }))
    assert.ok(o[key].length >= min, key);
  assert.equal(o.eyes.length, 1);
  assert.equal(o.headphones.length, 2);
  assert.equal(o.hat.length, 4);
  for (const choices of Object.values(o))
    assert.equal(new Set(choices.map((x) => x.id)).size, choices.length);
  assert.equal(new Set(exampleAvatars.map((x) => JSON.stringify(x))).size, 6);
  exampleAvatars.forEach(validateAvatarV2);
  const legacy = {
    face: "round",
    skin: "#E9AE80",
    eyes: "● ●",
    hair: "short",
    glasses: "none",
    mouth: "smile",
    hat: "none",
    background: "#AEE4FF",
  };
  const before = JSON.stringify(legacy),
    next = normalizeAvatar(legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(next.hair, "crop");
  assert.equal(next.skin, legacy.skin);
  validateAvatarV2(next);
  assert.deepEqual(normalizePresetAvatar(legacy), normalizePresetAvatar(legacy));
  assert.throws(() => validateAvatarV2({ ...next, hair: "unknown" }));
  assert.throws(() => validateAvatarV2({ ...next, ownerId: "foreign" }));
});

test("Avatar API: scoped durable update, preserves others/photos/tasks, denies foreign IDs and stale writes", async () => {
  const owner = "avatar-owner";
  const state = sampleState();
  state.employees[0].photoUrl = "/existing-upload.png";
  await GET(request(owner));
  assert.equal((await PUT(request(owner, payload(state)))).status, 200);
  const before = await (await GET(request(owner))).json();
  const employeeId = state.employees[0].id;
  const req = (body, actor = owner, from = origin) =>
    new Request(origin + "/api/employees/avatar", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        origin: from,
        ...(actor ? { "oai-authenticated-user-id": actor } : {}),
      },
      body: JSON.stringify(body),
    });
  const body = {
    employeeId,
    avatar: { version: 3, presetId: "avatar-03" },
    revision: 1,
  };
  assert.equal((await PATCH(req(body, ""))).status, 401);
  assert.equal(
    (await PATCH(req(body, owner, "https://bad.invalid"))).status,
    403,
  );
  assert.equal((await PATCH(req(body, "foreign-owner"))).status, 404);
  assert.equal(
    (await PATCH(req({ ...body, employeeId: "does-not-exist" }))).status,
    404,
  );
  assert.equal(
    (await PATCH(req({ ...body, ownerId: "foreign-owner" }))).status,
    400,
  );
  assert.equal(
    (await PATCH(req({ ...body, avatar: { ...body.avatar, presetId: "invalid" } })))
      .status,
    400,
  );
  const result = await PATCH(req(body));
  assert.equal(result.status, 200);
  const saved = await result.json();
  assert.equal(saved.revision, 2);
  const reloaded = await (await GET(request(owner))).json();
  assert.deepEqual(reloaded.state.employees[0].avatar, body.avatar);
  assert.equal(reloaded.state.employees[0].photoUrl, "/existing-upload.png");
  assert.deepEqual(
    reloaded.state.employees.slice(1),
    before.state.employees.slice(1),
  );
  assert.deepEqual(reloaded.state.tasks, before.state.tasks);
  assert.deepEqual(reloaded.state.events, before.state.events);
  assert.equal((await PATCH(req(body))).status, 409);
  const race = await Promise.all([
    PATCH(req({ ...body, revision: 2 })),
    PATCH(req({ ...body, revision: 2, avatar: { version: 3, presetId: "avatar-04" } })),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  const real = globalThis.__oleTestEnv.DB;
  const log = console.error;
  try {
    globalThis.__oleTestEnv.DB = {
      prepare() {
        throw new Error("synthetic D1 outage");
      },
    };
    console.error = () => {};
    const failed = await PATCH(req({ ...body, revision: 3 }));
    assert.equal(failed.status, 503);
    assert.ok((await failed.json()).error);
  } finally {
    globalThis.__oleTestEnv.DB = real;
    console.error = log;
  }
  assert.equal((await (await GET(request(owner))).json()).revision, 3);
});

test("OLE FARM: deterministic rewards, tie ranking, branch move, season, idempotency, error and permission", async () => {
  const owner = "farm-owner";
  const state = sampleState();
  state.sample = false;
  const [first, second, reviewer] = state.employees;
  first.branch = "บ้านแซม";
  second.branch = "ป่าซาง";
  const baseTask = {
    ...state.tasks[0],
    status: "สำเร็จ",
    priority: "ปกติ",
    completedAt: "2026-09-10T05:00:00.000Z",
    submissionCount: 1,
    reviewerId: reviewer.id,
  };
  state.tasks = [
    { ...baseTask, id: "farm-task-a", assigneeId: first.id },
    { ...baseTask, id: "farm-task-b", assigneeId: second.id },
  ];
  await GET(request(owner));
  assert.equal((await PUT(request(owner, payload(state)))).status, 200);

  const headers = { "oai-authenticated-user-id": owner };
  const firstRead = await readFarm(new Request(origin + "/api/farm?ranking=annual", { headers }));
  assert.equal(firstRead.status, 200);
  const firstPayload = await firstRead.json();
  const a = firstPayload.leaderboard.find((item) => item.employeeId === first.id);
  const b = firstPayload.leaderboard.find((item) => item.employeeId === second.id);
  assert.equal(a.totalXp, 30);
  assert.equal(b.totalXp, 30);
  assert.equal(a.rank, b.rank);
  assert.deepEqual(a.categories, { learning: 0, work: 20, quality: 10, teamwork: 0 });

  const refresh = await (await readFarm(new Request(origin + "/api/farm", { headers }))).json();
  assert.equal(refresh.leaderboard.find((item) => item.employeeId === first.id).totalXp, 30);
  assert.equal((await DB.prepare("SELECT COUNT(*) count FROM ole_xp_reward_events WHERE owner_id=? AND source_id=?").bind(owner, "farm-task-a").first()).count, 3);

  state.employees.find((item) => item.id === first.id).branch = "ป่าซาง";
  assert.equal((await PUT(request(owner, payload(state, 1, "ย้ายสาขา")))).status, 200);
  const moved = await (await readFarm(new Request(origin + "/api/farm?branch=" + encodeURIComponent("ป่าซาง"), { headers }))).json();
  assert.ok(moved.leaderboard.some((item) => item.employeeId === first.id));
  const nextSeason = await (await readFarm(new Request(origin + "/api/farm?season=2027", { headers }))).json();
  assert.equal(nextSeason.leaderboard.find((item) => item.employeeId === first.id).totalXp, 0);

  const adjustment = { employeeId: first.id, category: "teamwork", amount: 12, reason: "ช่วยสอนงานทีม", season: 2026, idempotencyKey: "admin:farm-adjustment-001" };
  const postHeaders = { ...headers, origin, "Content-Type": "application/json" };
  assert.equal((await adjustFarm(new Request(origin + "/api/farm", { method: "POST", headers: postHeaders, body: JSON.stringify(adjustment) }))).status, 200);
  const duplicate = await adjustFarm(new Request(origin + "/api/farm", { method: "POST", headers: postHeaders, body: JSON.stringify(adjustment) }));
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal((await DB.prepare("SELECT COUNT(*) count FROM ole_xp_adjustment_audit WHERE owner_id=?").bind(owner).first()).count, 1);

  const accountResponse = await saveEmployeeAccount(new Request(origin + "/api/employees/account", { method: "PATCH", headers: postHeaders, body: JSON.stringify({ employeeId: first.id, loginId: "farm.employee", password: "safe-pass-123", permissions: ["tasks"], visibleDepartments: [], active: true }) }));
  assert.equal(accountResponse.status, 200);
  const login = await employeeLogin(new Request(origin + "/api/employee-auth/login", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ loginId: "farm.employee", password: "safe-pass-123" }) }));
  const cookie = login.headers.get("set-cookie").split(";", 1)[0];
  assert.equal((await readFarm(new Request(origin + "/api/farm", { headers: { cookie } }))).status, 200);
  assert.equal((await adjustFarm(new Request(origin + "/api/farm", { method: "POST", headers: { cookie, origin, "Content-Type": "application/json" }, body: JSON.stringify({ ...adjustment, idempotencyKey: "admin:employee-denied" }) }))).status, 403);

  const real = globalThis.__oleTestEnv.DB, log = console.error;
  try {
    globalThis.__oleTestEnv.DB = { prepare() { throw new Error("synthetic outage"); } };
    console.error = () => {};
    const failed = await readFarm(new Request(origin + "/api/farm", { headers }));
    assert.equal(failed.status, 503);
    assert.equal("leaderboard" in await failed.json(), false);
  } finally { globalThis.__oleTestEnv.DB = real; console.error = log; }
});

test("OLE FARM UI: fixed responsive grid, lazy art and no polling loop", async () => {
  const css = await readFile(new URL("../app/chicken-arena.css", import.meta.url), "utf8");
  const component = await readFile(new URL("../app/chicken-arena.tsx", import.meta.url), "utf8");
  assert.match(css, /repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /max-width:1350px[^}]*repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /max-width:980px[^}]*repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /max-width:620px[\s\S]*?repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(component, /loading="lazy"/);
  assert.match(component, /วิธีเล่นและการเติบโต/);
  assert.match(component, /ทำอะไรแล้วได้ XP/);
  assert.match(component, /data\.config\.levels\.map/);
  assert.doesNotMatch(component, /setInterval|setTimeout\s*\(/);
});

test("task evidence UI: oversized files offer LINE share and copy fallback", async () => {
  const component = await readFile(new URL("../app/workspace.tsx", import.meta.url), "utf8");
  assert.match(component, /หากไม่สะดวกย่อขนาดไฟล์เอง กดปุ่มด้านล่างเพื่อแจ้งเข้ากลุ่มแชทแทน/);
  assert.match(component, /https:\/\/line\.me\/R\/msg\/text\/\?\$\{encodeURIComponent\(evidenceShareMessage\)\}/);
  assert.match(component, /แจ้งเตือนเข้า LINE/);
  assert.match(component, /async function copyText/);
  assert.match(component, /navigator\.clipboard\?\.writeText/);
  assert.match(component, /people\(currentTask\.assigneeId\)\?\.name/);
});
