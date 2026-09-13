"use client";

import { useEffect, useMemo, useState } from "react";
import type { Employee } from "../lib/work-model";
import type { EmployeePermission } from "../lib/employee-auth";
import {
  sopCategories,
  sopLevels,
  sopMeta,
  type SopPublicQuestion,
} from "../lib/sop-content";
import { sopTopicDetails } from "../lib/sop-details";
import { ExamPlanner, SopManager, type ExamPlan, type TopicVersion } from "./sop-admin-panels";
import "./sop-center.css";

type Attempt = {
  id: string;
  employeeId: string;
  employeeName: string;
  planId?: string | null;
  score: number;
  level: string;
  criticalPassed: boolean;
  correctCount: number;
  totalQuestions: number;
  completedAt: string;
};

function levelClass(level: string) {
  return level.toLowerCase() === "ต้องพัฒนา" ? "develop" : level.toLowerCase();
}

function youtubeEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    const videoId = url.searchParams.get("v") || "";
    return /^[A-Za-z0-9_-]{6,20}$/.test(videoId) ? `https://www.youtube-nocookie.com/embed/${videoId}` : "";
  } catch { return ""; }
}

export function SopCenter({
  employees,
  isOwner,
  employeeId,
  permissions = [],
  visibleDepartments = [],
  previewQuestions = [],
}: {
  employees: Employee[];
  isOwner: boolean;
  employeeId: string | null;
  permissions?: EmployeePermission[];
  visibleDepartments?: string[];
  previewQuestions?: SopPublicQuestion[];
}) {
  const [tab, setTab] = useState<"library" | "quiz" | "results" | "manage" | "plans">("library");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "critical" | "pending">("all");
  const [selected, setSelected] = useState(sopCategories[0].id);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [questions, setQuestions] = useState<SopPublicQuestion[]>(previewQuestions);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(!previewQuestions.length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Attempt | null>(null);
  const [canSeeAll, setCanSeeAll] = useState(isOwner);
  const [plans, setPlans] = useState<ExamPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [publishedTopics, setPublishedTopics] = useState<TopicVersion[]>([]);
  const canLibrary = isOwner || permissions.includes("sop_library");
  const canQuiz = isOwner || permissions.includes("sop_quiz");
  const canResults = isOwner || permissions.includes("sop_results");
  const canPlans = isOwner || permissions.includes("sop_plans");
  const canManage = isOwner || permissions.includes("sop_manage");
  const allowedTabs = [canLibrary && "library", canQuiz && "quiz", canResults && "results", canManage && "manage", canPlans && "plans"].filter(Boolean) as ("library" | "quiz" | "results" | "manage" | "plans")[];
  const activeTab = allowedTabs.includes(tab) ? tab : allowedTabs[0] || "library";

  async function load() {
    setLoading(true);
    setError("");
    try {
      let loadedPlans: ExamPlan[] = [];
      if (canQuiz || canPlans) {
        const planResponse = await fetch("/api/sop/plans", { cache: "no-store" });
        const planPayload = await planResponse.json() as { plans?: ExamPlan[]; error?: string };
        if (!planResponse.ok) throw new Error(planPayload.error || "โหลดกำหนดการสอบไม่สำเร็จ");
        loadedPlans = planPayload.plans || [];
      }
      setPlans(loadedPlans);
      if (canLibrary || canManage) {
        const contentResponse = await fetch("/api/sop/content", { cache: "no-store" });
        const contentPayload = await contentResponse.json() as { published?: TopicVersion[]; error?: string };
        if (!contentResponse.ok) throw new Error(contentPayload.error || "โหลดคลัง SOP ไม่สำเร็จ");
        setPublishedTopics(contentPayload.published || []);
      } else setPublishedTopics([]);
      const preferredPlan = !isOwner && canQuiz ? loadedPlans[0] || null : null;
      const planId = preferredPlan?.id || "";
      setSelectedPlanId(planId);
      if (canQuiz || canResults || canPlans) {
        const response = await fetch(`/api/sop${planId ? `?plan_id=${encodeURIComponent(planId)}` : ""}`, { cache: "no-store" });
        const payload = (await response.json()) as {
          questions?: SopPublicQuestion[];
          attempts?: Attempt[];
          canSeeAll?: boolean;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลไม่สำเร็จ");
        setQuestions(payload.questions || []);
        setAttempts(payload.attempts || []);
        setCanSeeAll(Boolean(payload.canSeeAll));
      } else {
        setQuestions([]);
        setAttempts([]);
        setCanSeeAll(false);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (previewQuestions.length) return;
    queueMicrotask(() => void load());
  }, [previewQuestions.length]);
  async function choosePlan(planId: string) {
    setSelectedPlanId(planId);
    setAnswers({});
    setResult(null);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/sop?plan_id=${encodeURIComponent(planId)}`, { cache: "no-store" });
      const payload = await response.json() as { questions?: SopPublicQuestion[]; attempts?: Attempt[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "โหลดข้อสอบไม่สำเร็จ");
      setQuestions(payload.questions || []);
      setAttempts(payload.attempts || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "โหลดข้อสอบไม่สำเร็จ"); }
    finally { setLoading(false); }
  }

  async function reloadContent() {
    const response = await fetch("/api/sop/content", { cache: "no-store" });
    const payload = await response.json() as { published?: TopicVersion[]; error?: string };
    if (!response.ok) { setError(payload.error || "โหลดคลัง SOP ไม่สำเร็จ"); return; }
    setPublishedTopics(payload.published || []);
    setSelectedTopic(null);
  }

  const catalog = useMemo(() => sopCategories.map((category) => {
    const overrides = new Map(publishedTopics.filter((item) => item.categoryId === category.id).map((item) => [item.topicCode, item]));
    const baseCodes = new Set(category.topics.map((topic) => topic.code));
    return {
      ...category,
      topics: [
        ...category.topics.map((topic) => {
          const override = overrides.get(topic.code);
          return override ? { code: override.topicCode, title: override.title, critical: override.critical, recommended: override.recommended } : topic;
        }),
        ...publishedTopics.filter((item) => item.categoryId === category.id && !baseCodes.has(item.topicCode)).map((item) => ({ code: item.topicCode, title: item.title, critical: item.critical, recommended: item.recommended })),
      ].sort((left, right) => left.code.localeCompare(right.code, undefined, { numeric: true })),
    };
  }), [publishedTopics]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((category) => {
      const topics = category.topics.filter((topic) => {
        const matchesText = !needle || (topic.code + topic.title + category.title).toLowerCase().includes(needle);
        const matchesFilter = filter === "all" ||
          (filter === "critical" && topic.critical) ||
          (filter === "pending" && category.status === "pending");
        return matchesText && matchesFilter;
      });
      return topics.length > 0;
    });
  }, [catalog, filter, query]);
  const active = catalog.find((category) => category.id === selected) || catalog[0];
  const activeTopic = selectedTopic
    ? active.topics.find((topic) => topic.code === selectedTopic) || null
    : null;
  const activeOverride = activeTopic ? publishedTopics.find((item) => item.topicCode === activeTopic.code) : null;
  const activeTopicDetail = activeOverride ? { purpose: activeOverride.purpose, steps: activeOverride.steps, stepMedia: activeOverride.stepMedia || [] } : activeTopic ? sopTopicDetails[activeTopic.code] : null;
  const latestByEmployee = new Map<string, Attempt>();
  const relevantAttempts = selectedPlanId ? attempts.filter((attempt) => attempt.planId === selectedPlanId) : attempts;
  for (const attempt of relevantAttempts) {
    if (!latestByEmployee.has(attempt.employeeId)) latestByEmployee.set(attempt.employeeId, attempt);
  }
  const currentResult = employeeId ? latestByEmployee.get(employeeId) : null;
  const scopedEmployees = isOwner ? employees : employees.filter((employee) => visibleDepartments.includes(employee.department));

  async function submitQuiz() {
    if (Object.keys(answers).length !== questions.length) {
      setError(`กรุณาตอบให้ครบ ${questions.length} ข้อ`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, planId: selectedPlanId }),
      });
      const payload = (await response.json()) as Attempt & { error?: string };
      if (!response.ok) throw new Error(payload.error || "ส่งคำตอบไม่สำเร็จ");
      setResult(payload);
      setAttempts((items) => [{ ...payload, employeeName: employees.find((e) => e.id === payload.employeeId)?.name || "พนักงาน" }, ...items]);
      setAnswers({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ส่งคำตอบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sop-center">
      <section className="sop-hero">
        <div>
          <span className="sop-kicker">OLE SOP &amp; LEARNING</span>
          <h2>มาตรฐานเดียวกัน ทุกคน ทุกสาขา</h2>
          <p>อ่าน SOP ฉบับที่มีผลใช้งาน เรียนรู้หัวข้อ Critical และเก็บผลสอบไว้ในประวัติพนักงาน</p>
        </div>
        <dl>
          <div><dt>เวอร์ชัน</dt><dd>{sopMeta.version}</dd></div>
          <div><dt>มีผลใช้</dt><dd>{sopMeta.effectiveDate}</dd></div>
          <div><dt>ผู้อนุมัติ</dt><dd>{sopMeta.approver}</dd></div>
        </dl>
      </section>

      <nav className="sop-tabs" aria-label="เมนู SOP">
        {canLibrary && <button className={activeTab === "library" ? "active" : ""} aria-current={activeTab === "library" ? "page" : undefined} onClick={() => setTab("library")}>คลัง SOP</button>}
        {canQuiz && <button className={activeTab === "quiz" ? "active" : ""} aria-current={activeTab === "quiz" ? "page" : undefined} onClick={() => setTab("quiz")}>แบบทดสอบ</button>}
        {canResults && <button className={activeTab === "results" ? "active" : ""} aria-current={activeTab === "results" ? "page" : undefined} onClick={() => setTab("results")}>ผลการเรียน</button>}
        {canManage && <button className={activeTab === "manage" ? "active" : ""} aria-current={activeTab === "manage" ? "page" : undefined} onClick={() => setTab("manage")}>จัดการ SOP</button>}
        {canPlans && <button className={activeTab === "plans" ? "active" : ""} aria-current={activeTab === "plans" ? "page" : undefined} onClick={() => setTab("plans")}>กำหนดการสอบ</button>}
      </nav>

      {error && <p className="sop-error" role="alert">{error}</p>}

      {activeTab === "library" && canLibrary && (
        <>
          <div className="sop-toolbar">
            <label>
              <span>ค้นหาหัวข้อ</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="เช่น เงินทอน รับซ่อม ข้อมูลลูกค้า" />
            </label>
            <div role="group" aria-label="กรอง SOP">
              <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>ทั้งหมด</button>
              <button className={filter === "critical" ? "active" : ""} onClick={() => setFilter("critical")}>Critical</button>
              <button className={filter === "pending" ? "active" : ""} onClick={() => setFilter("pending")}>รอเพิ่มเติม</button>
            </div>
            <a className="sop-pdf" href={sopMeta.pdfUrl} target="_blank" rel="noreferrer">เปิด PDF ฉบับเต็ม</a>
          </div>
          <div className="sop-library">
            <aside aria-label="หมวด SOP">
              {visible.map((category, index) => (
                <button key={category.id} className={selected === category.id ? "active" : ""} onClick={() => { setSelected(category.id); setSelectedTopic(null); }}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <span><strong>{category.title}</strong><small>{category.topics.length} หัวข้อ</small></span>
                </button>
              ))}
              {!visible.length && <p>ไม่พบหัวข้อที่ค้นหา</p>}
            </aside>
            <article className="sop-document">
              {activeTopic ? (
                <div className="sop-topic-page">
                  <header>
                    <button type="button" className="sop-back" onClick={() => setSelectedTopic(null)}>← กลับไปหมวด</button>
                    <div className="sop-topic-title">
                      <span>{activeTopic.code}</span>
                      <h3>{activeTopic.title}</h3>
                      {activeTopic.critical && <em className="critical">Critical</em>}
                    </div>
                  </header>
                  <div className="sop-audience"><b>กลุ่มที่รับผิดชอบ</b>{(activeOverride?.audiences?.length ? activeOverride.audiences : active.audience).map((item) => <span key={item}>{item}</span>)}</div>
                  {activeTopicDetail?.steps?.length ? (
                    <section className="sop-topic-steps">
                      <h4>ขั้นตอนการทำงาน</h4>
                      <ol>{activeTopicDetail.steps.map((step, index) => {
                        const media = "stepMedia" in activeTopicDetail ? activeTopicDetail.stepMedia[index] : null;
                        return <li key={`${activeTopic.code}-${index}`}><b>{index + 1}</b><div><span>{step}</span>{Boolean(media?.images.length || media?.youtubeUrls.length) && <section className="sop-step-media">
                          {media?.images.map((image) => <a key={image.id} href={`/api/sop/content/media/${image.id}`} target="_blank" rel="noreferrer">{image.type.includes("heic") || image.type.includes("heif") ? <span>เปิดภาพ {image.name}</span> : <img src={`/api/sop/content/media/${image.id}`} alt={image.name} loading="lazy" />}</a>)}
                          {media?.youtubeUrls.map((url) => { const embedUrl = youtubeEmbedUrl(url); return embedUrl ? <iframe key={url} src={embedUrl} title={`วิดีโอขั้นตอนที่ ${index + 1}`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /> : null; })}
                        </section>}</div></li>;
                      })}</ol>
                      {activeTopicDetail.warning && <aside><strong>{activeTopic.critical ? "ข้อบังคับ Critical" : "ข้อควรระวัง"}</strong><p>{activeTopicDetail.warning}</p></aside>}
                    </section>
                  ) : <div className="sop-no-content"><strong>ยังไม่มีเนื้อหา</strong><p>รอฝ่ายที่เกี่ยวข้องกรอก</p></div>}
                  <footer><span>อ้างอิง SOP เวอร์ชัน {sopMeta.version}</span><button type="button" onClick={() => setSelectedTopic(null)}>กลับไปหมวด</button></footer>
                </div>
              ) : (
                <>
                  <header>
                    <div><span>หมวด {catalog.indexOf(active) + 1}</span><h3>{active.title}</h3><p>{active.english}</p></div>
                    {active.status === "pending" && <em>รอรายละเอียดเพิ่มเติม</em>}
                  </header>
                  <div className="sop-audience"><b>กลุ่มที่เกี่ยวข้อง</b>{active.audience.map((item) => <span key={item}>{item}</span>)}</div>
                  <ol>
                    {active.topics.map((topic) => (
                      <li key={topic.code}>
                        <b>{topic.code}</b>
                        <button className="sop-topic-link" type="button" onClick={() => setSelectedTopic(topic.code)}>
                          <span>{topic.title}</span><small>เปิดอ่านรายละเอียด →</small>
                        </button>
                        {topic.critical && <em className="critical">Critical</em>}
                        {topic.recommended && <em className="recommended">คำแนะนำ</em>}
                      </li>
                    ))}
                  </ol>
                  <footer>
                    <p><strong>Critical</strong> ต้องตอบคำถามบังคับถูกทั้งหมดจึงผ่าน</p>
                    <p><strong>KPI</strong> เป็นคำแนะนำ ยังไม่คิดคะแนนพนักงานอัตโนมัติ</p>
                  </footer>
                </>
              )}
            </article>
          </div>
        </>
      )}

      {activeTab === "quiz" && canQuiz && (
        <section className="sop-quiz">
          <header>
            <div><span>แบบทดสอบประจำปี {new Date().getFullYear() + 543}</span><h3>ทดสอบความเข้าใจ SOP หน้าร้าน</h3><p>คะแนนไม่มีวันหมดอายุ เก็บประวัติทุกครั้ง และสรุปรอบ Final สิ้นปี</p></div>
            {currentResult && <div className={`sop-score ${levelClass(currentResult.level)}`}><b>{currentResult.score}%</b><span>{currentResult.level}</span></div>}
          </header>
          {isOwner ? (
            <div className="sop-empty"><strong>มุมมองผู้ดูแล</strong><p>ไปที่ “กำหนดการสอบ” เพื่อเลือกคำถาม ผู้สอบ เวลา และเปิดหรือปิดข้อสอบ</p><button type="button" onClick={() => setTab("plans")}>ไปหน้ากำหนดการสอบ</button></div>
          ) : !plans.length ? (
            <div className="sop-empty"><strong>ยังไม่มีข้อสอบที่เปิดให้คุณ</strong><p>ข้อสอบจะแสดงเมื่อถึงเวลาและผู้ดูแลเปิดสอบแล้ว</p></div>
          ) : loading ? <div className="sop-empty">กำลังโหลดข้อสอบ…</div> : result ? (
            <div className="sop-result">
              <span>บันทึกผลเรียบร้อย</span>
              <b>{result.score}%</b>
              <h3>{result.level}</h3>
              <p>{result.criticalPassed ? "ผ่านคำถาม Critical ครบทุกข้อ" : "ยังไม่ผ่าน: ต้องตอบหัวข้อ Critical ให้ถูกทุกข้อ"}</p>
              <button onClick={() => setResult(null)}>สอบใหม่ทันที</button>
            </div>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); void submitQuiz(); }}>
              <label className="sop-plan-picker"><span>ชุดข้อสอบ</span><select value={selectedPlanId} onChange={(event) => void choosePlan(event.target.value)}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title} · {plan.questionCount} ข้อ</option>)}</select></label>
              {questions.map((question, index) => (
                <fieldset key={question.id}>
                  <legend><b>{index + 1}</b><span>{question.prompt}</span>{question.critical && <em>Critical</em>}</legend>
                  {question.choices.map((choice, choiceIndex) => (
                    <label key={`${question.id}-${choiceIndex}`}><input type="radio" name={question.id} checked={answers[question.id] === choiceIndex} onChange={() => setAnswers((current) => ({ ...current, [question.id]: choiceIndex }))} /><span>{choice}</span></label>
                  ))}
                </fieldset>
              ))}
              <div className="sop-submit"><span>ตอบแล้ว {Object.keys(answers).length}/{questions.length} ข้อ</span><button disabled={busy}>{busy ? "กำลังบันทึก…" : "ส่งคำตอบ"}</button></div>
            </form>
          )}
        </section>
      )}

      {activeTab === "manage" && canManage && <SopManager preview={Boolean(previewQuestions.length)} onChanged={() => void reloadContent()} />}
      {activeTab === "plans" && canPlans && <ExamPlanner employees={scopedEmployees} previewQuestions={previewQuestions} />}

      {activeTab === "results" && canResults && (
        <section className="sop-results">
          <div className="sop-levels">
            {sopLevels.map((level) => <div className={level.className} key={level.name}><span>{level.name}</span><b>{level.range}</b></div>)}
          </div>
          <div className="sop-results-head"><div><h3>{canSeeAll ? "Dashboard คะแนน SOP" : "ประวัติผลสอบของฉัน"}</h3><p>แยกจากยอดขาย โบนัส และคะแนนจิตพิสัย</p></div><button onClick={() => void load()} disabled={loading}>โหลดล่าสุด</button></div>
          {!attempts.length ? <div className="sop-empty"><strong>ยังไม่มีผลสอบ</strong><p>ผลจะปรากฏที่นี่ทันทีหลังพนักงานส่งแบบทดสอบ</p></div> : (
            <div className="sop-table-wrap"><table><thead><tr><th>พนักงาน</th><th>คะแนน</th><th>ระดับ</th><th>Critical</th><th>วันที่สอบ</th></tr></thead><tbody>{attempts.map((attempt) => <tr key={attempt.id}><td>{attempt.employeeName}</td><td><b>{attempt.score}%</b></td><td><span className={`sop-badge ${levelClass(attempt.level)}`}>{attempt.level}</span></td><td>{attempt.criticalPassed ? "ผ่าน" : "ไม่ผ่าน"}</td><td>{new Date(attempt.completedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })}</td></tr>)}</tbody></table></div>
          )}
        </section>
      )}
    </div>
  );
}
