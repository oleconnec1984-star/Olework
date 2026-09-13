"use client";

import { useEffect, useMemo, useState } from "react";
import type { SopMediaRef, SopPublicQuestion, SopStepMedia } from "../lib/sop-content";
import { sopCategories, sopMeta } from "../lib/sop-content";
import { sopTopicDetails } from "../lib/sop-details";
import type { Employee } from "../lib/work-model";

export type TopicVersion = {
  id: string; topicCode: string; categoryId: string; title: string; purpose: string; steps: string[];
  stepMedia: SopStepMedia[];
  audiences: string[]; critical: boolean; recommended: boolean; documentVersion: string;
  state: "draft" | "published"; changeNote: string; createdBy: string; createdAt: string;
};

type EditableStep = SopStepMedia & { text: string; youtubeInput: string };
type TopicForm = {
  topicCode: string; categoryId: string; title: string; purpose: string; steps: EditableStep[];
  audiencesText: string; critical: boolean; recommended: boolean; documentVersion: string; changeNote: string;
};
export type ExamPlan = {
  id: string; title: string; questionIds: string[]; audienceType: "all" | "department" | "branch" | "employee";
  audienceValues: string[]; startsAt: string; dueAt: string; questionCount: number; passScore: number;
  retakeWaitDays: number; status: "draft" | "open" | "closed" | "archived"; createdAt: string; updatedAt: string;
  attemptCount: number;
};

const blankStep = (text = "", media?: SopStepMedia): EditableStep => ({ text, images: media?.images || [], youtubeUrls: media?.youtubeUrls || [], youtubeInput: "" });
const blankTopic = (): TopicForm => ({
  topicCode: "", categoryId: sopCategories[0].id, title: "", purpose: "", steps: [blankStep()],
  audiencesText: sopCategories[0].audience.join(", "), critical: false, recommended: false,
  documentVersion: sopMeta.version, changeNote: "",
});

export function SopManager({ onChanged, preview = false }: { onChanged?: () => void; preview?: boolean }) {
  const [published, setPublished] = useState<TopicVersion[]>([]);
  const [drafts, setDrafts] = useState<TopicVersion[]>([]);
  const [history, setHistory] = useState<TopicVersion[]>([]);
  const [form, setForm] = useState(blankTopic);
  const [busy, setBusy] = useState(false);
  const [uploadingStep, setUploadingStep] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const allTopics = sopCategories.flatMap((category) => category.topics.map((topic) => ({ ...topic, categoryId: category.id })));

  async function load() {
    const response = await fetch("/api/sop/content", { cache: "no-store" });
    const payload = await response.json() as { published?: TopicVersion[]; drafts?: TopicVersion[]; history?: TopicVersion[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลไม่สำเร็จ");
    setPublished(payload.published || []); setDrafts(payload.drafts || []); setHistory(payload.history || []);
  }
  useEffect(() => {
    if (preview) return;
    queueMicrotask(() => void load().catch((reason) => setMessage(reason instanceof Error ? reason.message : "โหลดข้อมูลไม่สำเร็จ")));
  }, [preview]);

  function chooseTopic(code: string) {
    if (!code) { setForm(blankTopic()); return; }
    const stored = drafts.find((item) => item.topicCode === code) || published.find((item) => item.topicCode === code);
    const base = allTopics.find((item) => item.code === code);
    const category = sopCategories.find((item) => item.id === (stored?.categoryId || base?.categoryId)) || sopCategories[0];
    const detail = sopTopicDetails[code];
    const sourceSteps = stored?.steps || detail?.steps || [];
    setForm({
      topicCode: code,
      categoryId: stored?.categoryId || base?.categoryId || category.id,
      title: stored?.title || base?.title || "",
      purpose: stored?.purpose || detail?.purpose || "",
      steps: sourceSteps.length ? sourceSteps.map((text, index) => blankStep(text, stored?.stepMedia?.[index])) : [blankStep()],
      audiencesText: (stored?.audiences?.length ? stored.audiences : category.audience).join(", "),
      critical: stored?.critical ?? Boolean(base?.critical),
      recommended: stored?.recommended ?? Boolean(base?.recommended),
      documentVersion: stored?.documentVersion || sopMeta.version,
      changeNote: stored?.changeNote || "",
    });
  }

  function youtubeUrl(value: string) {
    try {
      const url = new URL(value.trim());
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

  async function uploadImages(stepIndex: number, files: FileList | null) {
    if (!files?.length) return;
    if (form.steps[stepIndex].images.length + files.length > 10) { setMessage("หนึ่งขั้นตอนแนบรูปได้สูงสุด 10 รูป"); return; }
    const targetTopicCode = form.topicCode;
    setUploadingStep(stepIndex); setMessage("");
    try {
      const data = new FormData();
      [...files].forEach((file) => data.append("files", file));
      const response = await fetch("/api/sop/content/media", { method: "POST", body: data });
      const payload = await response.json() as { images?: SopMediaRef[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "อัปโหลดรูปไม่สำเร็จ");
      setForm((current) => current.topicCode !== targetTopicCode ? current : ({ ...current, steps: current.steps.map((step, index) => index === stepIndex ? { ...step, images: [...step.images, ...(payload.images || [])] } : step) }));
      setMessage(`แนบรูปในขั้นตอนที่ ${stepIndex + 1} แล้ว ${payload.images?.length || 0} รูป`);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "อัปโหลดรูปไม่สำเร็จ"); }
    finally { setUploadingStep(null); }
  }

  function addYoutube(stepIndex: number) {
    const normalized = youtubeUrl(form.steps[stepIndex].youtubeInput);
    if (!normalized) { setMessage("กรุณาวางลิงก์ YouTube ที่ถูกต้อง"); return; }
    setForm((current) => ({ ...current, steps: current.steps.map((step, index) => index === stepIndex ? { ...step, youtubeUrls: [...new Set([...step.youtubeUrls, normalized])].slice(0, 5), youtubeInput: "" } : step) }));
    setMessage("");
  }

  async function save(state: "draft" | "published") {
    setBusy(true); setMessage("");
    try {
      const filledSteps = form.steps.filter((step) => step.text.trim());
      const response = await fetch("/api/sop/content", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form, state,
          steps: filledSteps.map((step) => step.text.trim()),
          stepMedia: filledSteps.map((step) => ({ images: step.images, youtubeUrls: step.youtubeUrls })),
          audiences: form.audiencesText.split(",").map((item) => item.trim()).filter(Boolean),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "บันทึกไม่สำเร็จ");
      setMessage(state === "published" ? "เผยแพร่เวอร์ชันใหม่ในคลัง SOP แล้ว" : "บันทึกร่างแล้ว");
      await load(); onChanged?.();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  return (
    <section className="sop-admin">
      <header><div><span>เฉพาะผู้ดูแลระบบ</span><h3>เพิ่มและแก้ไข SOP</h3><p>ทุกครั้งที่บันทึกจะสร้างเวอร์ชันใหม่ ประวัติเก่าจะไม่ถูกลบ</p></div><b>{history.length} เวอร์ชัน</b></header>
      {message && <p className="sop-admin-message" role="status">{message}</p>}
      <div className="sop-admin-layout">
        <form onSubmit={(event) => { event.preventDefault(); void save("draft"); }}>
          <label><span>เลือกหัวข้อเดิม หรือเพิ่มหัวข้อใหม่</span>
            <select value={form.topicCode} onChange={(event) => chooseTopic(event.target.value)}>
              <option value="">＋ เพิ่มหัวข้อใหม่</option>
              {sopCategories.map((category) => <optgroup key={category.id} label={category.title}>{category.topics.map((topic) => <option key={topic.code} value={topic.code}>{topic.code} {topic.title}</option>)}</optgroup>)}
            </select>
          </label>
          <div className="sop-admin-grid">
            <label><span>หมวด SOP</span><select value={form.categoryId} onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}>{sopCategories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}</select></label>
            <label><span>รหัสหัวข้อ</span><input value={form.topicCode} onChange={(event) => setForm((current) => ({ ...current, topicCode: event.target.value }))} placeholder="เช่น 2.10" /></label>
          </div>
          <label><span>ชื่อหัวข้อ</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
          <label><span>วัตถุประสงค์</span><textarea rows={3} value={form.purpose} onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} /></label>
          <section className="sop-step-editor">
            <header><div><b>ขั้นตอนการทำงาน</b><small>แต่ละขั้นตอนแนบได้สูงสุด 10 รูป และ 5 ลิงก์ YouTube</small></div><button type="button" onClick={() => setForm((current) => ({ ...current, steps: [...current.steps, blankStep()] }))}>＋ เพิ่มขั้นตอน</button></header>
            {form.steps.map((step, stepIndex) => <article key={stepIndex}>
              <div className="sop-step-editor-head"><b>{stepIndex + 1}</b><label><span>รายละเอียดขั้นตอน</span><textarea rows={2} value={step.text} onChange={(event) => setForm((current) => ({ ...current, steps: current.steps.map((item, index) => index === stepIndex ? { ...item, text: event.target.value } : item) }))} /></label>{form.steps.length > 1 && <button type="button" aria-label={`ลบขั้นตอนที่ ${stepIndex + 1}`} onClick={() => setForm((current) => ({ ...current, steps: current.steps.filter((_, index) => index !== stepIndex) }))}>ลบ</button>}</div>
              <div className="sop-step-assets">
                <label className="sop-image-upload"><span>{uploadingStep === stepIndex ? "กำลังอัปโหลด…" : "แนบรูปภาพ"}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple disabled={uploadingStep !== null} onChange={(event) => { void uploadImages(stepIndex, event.target.files); event.currentTarget.value = ""; }} /></label>
                <div className="sop-youtube-add"><input type="url" value={step.youtubeInput} onChange={(event) => setForm((current) => ({ ...current, steps: current.steps.map((item, index) => index === stepIndex ? { ...item, youtubeInput: event.target.value } : item) }))} placeholder="วางลิงก์ YouTube" /><button type="button" onClick={() => addYoutube(stepIndex)}>เพิ่มลิงก์</button></div>
              </div>
              {Boolean(step.images.length || step.youtubeUrls.length) && <div className="sop-step-asset-list">
                {step.images.map((image) => <div key={image.id}><a href={`/api/sop/content/media/${image.id}`} target="_blank" rel="noreferrer">{image.type.includes("heic") || image.type.includes("heif") ? <span>เปิดภาพ HEIC</span> : <img src={`/api/sop/content/media/${image.id}`} alt={image.name} />}</a><button type="button" aria-label={`เอารูป ${image.name} ออกจากขั้นตอน`} onClick={() => setForm((current) => ({ ...current, steps: current.steps.map((item, index) => index === stepIndex ? { ...item, images: item.images.filter((media) => media.id !== image.id) } : item) }))}>×</button></div>)}
                {step.youtubeUrls.map((url) => <div className="youtube" key={url}><a href={url} target="_blank" rel="noreferrer">YouTube</a><button type="button" aria-label="เอาลิงก์ YouTube ออกจากขั้นตอน" onClick={() => setForm((current) => ({ ...current, steps: current.steps.map((item, index) => index === stepIndex ? { ...item, youtubeUrls: item.youtubeUrls.filter((itemUrl) => itemUrl !== url) } : item) }))}>×</button></div>)}
              </div>}
            </article>)}
          </section>
          <label><span>กลุ่มที่รับผิดชอบ — คั่นด้วยจุลภาค</span><input value={form.audiencesText} onChange={(event) => setForm((current) => ({ ...current, audiencesText: event.target.value }))} /></label>
          <div className="sop-admin-checks">
            <label><input type="checkbox" checked={form.critical} onChange={(event) => setForm((current) => ({ ...current, critical: event.target.checked }))} /> Critical</label>
            <label><input type="checkbox" checked={form.recommended} onChange={(event) => setForm((current) => ({ ...current, recommended: event.target.checked }))} /> คำแนะนำ/KPI</label>
          </div>
          <div className="sop-admin-grid">
            <label><span>เวอร์ชันเอกสาร</span><input value={form.documentVersion} onChange={(event) => setForm((current) => ({ ...current, documentVersion: event.target.value }))} /></label>
            <label><span>เหตุผลที่แก้ไข (ไม่บังคับ)</span><input value={form.changeNote} onChange={(event) => setForm((current) => ({ ...current, changeNote: event.target.value }))} placeholder="เว้นว่างได้ ระบบจะบันทึกให้อัตโนมัติ" /></label>
          </div>
          <div className="sop-admin-actions"><button type="submit" disabled={busy || uploadingStep !== null}>{busy ? "กำลังบันทึก…" : "บันทึกร่าง"}</button><button type="button" className="primary" disabled={busy || uploadingStep !== null} onClick={() => void save("published")}>{busy ? "กำลังบันทึก…" : "เผยแพร่เวอร์ชันใหม่"}</button></div>
          {message && <p className="sop-admin-message sop-admin-message-bottom" role="status">{message}</p>}
        </form>
        <aside className="sop-version-list"><h4>ประวัติการแก้ไขล่าสุด</h4>{!history.length ? <p>ยังไม่มีการแก้ไขผ่านระบบ</p> : history.slice(0, 12).map((item) => <article key={item.id}><div><b>{item.topicCode}</b><span className={item.state}>{item.state === "published" ? "เผยแพร่แล้ว" : "ร่าง"}</span></div><strong>{item.title}</strong><small>เวอร์ชัน {item.documentVersion} · {new Date(item.createdAt).toLocaleString("th-TH")}</small><p>{item.changeNote}</p></article>)}</aside>
      </div>
    </section>
  );
}

const initialPlan = (questions: SopPublicQuestion[]) => ({
  title: "ทดสอบ SOP ประจำปี",
  questionIds: questions.slice(0, Math.min(10, questions.length)).map((question) => question.id),
  questionCount: Math.min(10, questions.length || 38),
  audienceType: "all" as ExamPlan["audienceType"],
  audienceValues: [] as string[],
  startsAt: new Date().toISOString().slice(0, 16),
  dueAt: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 16),
  passScore: 80, retakeWaitDays: 0, status: "draft" as ExamPlan["status"],
});

export function ExamPlanner({ employees, previewQuestions = [] }: { employees: Employee[]; previewQuestions?: SopPublicQuestion[] }) {
  const [plans, setPlans] = useState<ExamPlan[]>([]);
  const [questions, setQuestions] = useState<SopPublicQuestion[]>(previewQuestions);
  const [form, setForm] = useState(() => initialPlan(previewQuestions));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewIds, setPreviewIds] = useState<string[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [planView, setPlanView] = useState<"active" | "archived">("active");
  const departments = useMemo(() => [...new Set(employees.map((item) => item.department).filter(Boolean))], [employees]);
  const branches = useMemo(() => [...new Set(employees.map((item) => item.branch).filter(Boolean))], [employees]);

  async function load(reset = false) {
    const response = await fetch("/api/sop/plans", { cache: "no-store" });
    const payload = await response.json() as { plans?: ExamPlan[]; questionBank?: SopPublicQuestion[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "โหลดกำหนดการสอบไม่สำเร็จ");
    const bank = payload.questionBank || []; setPlans(payload.plans || []); setQuestions(bank);
    if (reset) setForm(initialPlan(bank));
    else setForm((current) => current.questionIds.length ? current : {
      ...current,
      questionIds: bank.slice(0, Math.min(current.questionCount, bank.length)).map((question) => question.id),
      questionCount: Math.min(current.questionCount, bank.length || 38),
    });
  }
  useEffect(() => {
    if (previewQuestions.length) return;
    queueMicrotask(() => void load(false).catch((reason) => setMessage(reason instanceof Error ? reason.message : "โหลดไม่สำเร็จ")));
  }, [previewQuestions.length]);

  const targets = form.audienceType === "employee" ? employees.map((item) => ({ value: item.id, label: `${item.name} · ${item.branch}` }))
    : form.audienceType === "department" ? departments.map((item) => ({ value: item, label: item }))
      : form.audienceType === "branch" ? branches.map((item) => ({ value: item, label: item })) : [];
  const previewItems = previewIds ? questions.filter((question) => previewIds.includes(question.id)) : [];
  const editingPlan = plans.find((plan) => plan.id === editingId);
  const visiblePlans = plans.filter((plan) => planView === "archived" ? plan.status === "archived" : plan.status !== "archived");

  function localDateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function editPlan(plan: ExamPlan) {
    setEditingId(plan.id);
    setForm({ title: plan.title, questionIds: plan.questionIds, questionCount: plan.questionCount, audienceType: plan.audienceType, audienceValues: plan.audienceValues, startsAt: localDateTime(plan.startsAt), dueAt: localDateTime(plan.dueAt), passScore: plan.passScore, retakeWaitDays: plan.retakeWaitDays, status: plan.status });
    setMessage(plan.attemptCount ? "ชุดนี้มีผลสอบแล้ว แก้ผู้เข้าสอบและกำหนดเวลาได้ แต่คำถามถูกล็อกไว้" : "กำลังแก้ไขชุดข้อสอบเดิม");
    document.querySelector(".sop-plan-compose")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function copyPlan(plan: ExamPlan) {
    setEditingId(null);
    setForm({ title: `${plan.title} (สำเนา)`, questionIds: plan.questionIds, questionCount: plan.questionCount, audienceType: plan.audienceType, audienceValues: plan.audienceValues, startsAt: localDateTime(plan.startsAt), dueAt: localDateTime(plan.dueAt), passScore: plan.passScore, retakeWaitDays: plan.retakeWaitDays, status: "draft" });
    setMessage("สร้างสำเนาเป็นชุดใหม่แล้ว ตรวจข้อมูลก่อนกดบันทึก");
    document.querySelector(".sop-plan-compose")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fitQuestionCount(count: number, preferredIds = form.questionIds) {
    const maximum = Math.max(1, questions.length);
    const safeCount = Math.max(1, Math.min(maximum, Math.round(count || 1)));
    const validIds = new Set(questions.map((question) => question.id));
    const chosen = preferredIds.filter((id) => validIds.has(id)).slice(0, safeCount);
    const remaining = questions.filter((question) => !chosen.includes(question.id));
    for (let index = remaining.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [remaining[index], remaining[target]] = [remaining[target], remaining[index]];
    }
    return { count: safeCount, ids: [...chosen, ...remaining.map((question) => question.id)].slice(0, safeCount) };
  }

  function applyQuestionCount(openPreview = false) {
    const next = fitQuestionCount(form.questionCount, openPreview ? form.questionIds : []);
    setForm((current) => ({ ...current, questionCount: next.count, questionIds: next.ids }));
    if (openPreview) setPreviewIds(next.ids);
  }

  async function save() {
    setBusy(true); setMessage("");
    try {
      const exactQuestions = fitQuestionCount(form.questionCount);
      setForm((current) => ({ ...current, questionCount: exactQuestions.count, questionIds: exactQuestions.ids }));
      const response = await fetch("/api/sop/plans", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: editingId, questionIds: exactQuestions.ids, questionCount: exactQuestions.count, startsAt: new Date(form.startsAt).toISOString(), dueAt: new Date(form.dueAt).toISOString() }) });
      const payload = await response.json() as ExamPlan & { error?: string };
      if (!response.ok) throw new Error(payload.error || "บันทึกไม่สำเร็จ");
      setMessage(editingId ? "บันทึกการแก้ไขชุดข้อสอบแล้ว" : "บันทึกกำหนดการสอบแล้ว"); setEditingId(null); await load(true);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  async function setStatus(id: string, status: ExamPlan["status"]) {
    const response = await fetch("/api/sop/plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error || "เปลี่ยนสถานะไม่สำเร็จ"); return; }
    setPlans((items) => items.map((item) => item.id === id ? { ...item, status } : item));
    setMessage(status === "archived" ? "เก็บชุดข้อสอบเข้าคลังแล้ว ผลสอบเดิมยังอยู่ครบ" : status === "open" ? "เปิดสอบแล้ว" : status === "closed" ? "ปิดสอบแล้ว" : "เปลี่ยนเป็นแบบร่างแล้ว");
  }
  async function deletePlan(plan: ExamPlan) {
    if (!window.confirm(`ลบชุดข้อสอบ “${plan.title}” ถาวรหรือไม่?\nการลบทำได้เฉพาะแบบร่างที่ยังไม่มีผลสอบ`)) return;
    const response = await fetch(`/api/sop/plans?id=${encodeURIComponent(plan.id)}`, { method: "DELETE" });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMessage(payload.error || "ลบชุดข้อสอบไม่สำเร็จ"); return; }
    setPlans((items) => items.filter((item) => item.id !== plan.id));
    if (editingId === plan.id) { setEditingId(null); setForm(initialPlan(questions)); }
    setMessage("ลบชุดข้อสอบแบบร่างแล้ว");
  }

  return (
    <section className="sop-admin sop-planner">
      <header><div><span>EXAM CONTROL</span><h3>กำหนดข้อสอบและผู้เข้าสอบ</h3><p>ผู้ดูแลเห็นคำถามจริงก่อนเปิดสอบ และเปิด–ปิดข้อสอบได้ทันที</p></div><b>สูงสุด {questions.length || 38} ข้อ</b></header>
      {message && <p className="sop-admin-message" role="status">{message}</p>}
      <div className="sop-plan-compose">
        <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
          {editingId && <div className="sop-editing-banner"><div><b>กำลังแก้ไขชุดข้อสอบเดิม</b><span>{editingPlan?.attemptCount ? `มีผลสอบแล้ว ${editingPlan.attemptCount} ครั้ง — คำถามถูกล็อก` : "ยังไม่มีผลสอบ แก้ไขได้ทุกส่วน"}</span></div><button type="button" onClick={() => { setEditingId(null); setForm(initialPlan(questions)); setMessage(""); }}>ยกเลิกแก้ไข</button></div>}
          <label><span>ชื่อชุดข้อสอบ</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
          <section className="sop-question-count">
            <label><span>จำนวนข้อสอบ</span><input type="number" min={1} max={questions.length || 38} disabled={Boolean(editingPlan?.attemptCount)} value={form.questionCount} onChange={(event) => setForm((current) => ({ ...current, questionCount: Math.max(1, Math.min(questions.length || 38, Number(event.target.value) || 1)) }))} /></label>
            <div><b>เลือกไว้ {form.questionIds.length} ข้อ</b><small>กำหนดได้สูงสุด {questions.length || 38} ข้อ</small></div>
            <button type="button" disabled={Boolean(editingPlan?.attemptCount)} onClick={() => applyQuestionCount(false)}>สุ่มตามจำนวน</button>
            <button type="button" className="preview" disabled={!questions.length} onClick={() => applyQuestionCount(true)}>ดูตัวอย่างข้อสอบ</button>
          </section>
          <div className="sop-admin-grid"><label><span>เริ่มสอบ</span><input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} /></label><label><span>ปิดรับคำตอบ</span><input type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} /></label></div>
          <fieldset><legend>กำหนดผู้เข้าสอบ</legend><div className="sop-audience-types">{(["all", "department", "branch", "employee"] as const).map((type) => <label key={type}><input type="radio" checked={form.audienceType === type} onChange={() => setForm((current) => ({ ...current, audienceType: type, audienceValues: [] }))} />{{ all: "ทุกคน", department: "ตามฝ่าย", branch: "ตามสาขา", employee: "รายบุคคล" }[type]}</label>)}</div>{targets.length > 0 && <div className="sop-target-grid">{targets.map((target) => <label key={target.value}><input type="checkbox" checked={form.audienceValues.includes(target.value)} onChange={() => setForm((current) => ({ ...current, audienceValues: current.audienceValues.includes(target.value) ? current.audienceValues.filter((item) => item !== target.value) : [...current.audienceValues, target.value] }))} />{target.label}</label>)}</div>}</fieldset>
          <div className="sop-admin-grid"><label><span>คะแนนผ่าน</span><input type="number" min={0} max={100} value={form.passScore} onChange={(event) => setForm((current) => ({ ...current, passScore: Number(event.target.value) }))} /></label><label><span>สอบใหม่ได้เมื่อ</span><select value={form.retakeWaitDays} onChange={(event) => setForm((current) => ({ ...current, retakeWaitDays: Number(event.target.value) }))}><option value={0}>ทันที</option><option value={1}>หลัง 1 วัน</option><option value={3}>หลัง 3 วัน</option></select></label></div>
          <label><span>สถานะ</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ExamPlan["status"] }))}><option value="draft">ร่าง</option><option value="open">เปิดสอบ</option><option value="closed">ปิดสอบ</option>{editingPlan?.status === "archived" && <option value="archived">เก็บในคลัง</option>}</select></label>
          <button className="sop-plan-save" disabled={busy || !form.questionIds.length}>{busy ? "กำลังบันทึก…" : editingId ? `บันทึกการแก้ไข (${form.questionCount} ข้อ)` : `บันทึกกำหนดการสอบ (${form.questionCount} ข้อ)`}</button>
        </form>
        <section className="sop-question-bank">
          <header><div><h4>เลือกข้อสอบเอง</h4><p>{editingPlan?.attemptCount ? "มีผลสอบแล้ว จึงล็อกคำถามไว้เพื่อรักษาคะแนนเดิม" : `เลือกแล้ว ${form.questionIds.length}/${questions.length} หัวข้อ`}</p></div><div><button type="button" disabled={Boolean(editingPlan?.attemptCount)} onClick={() => setForm((current) => ({ ...current, questionCount: questions.length, questionIds: questions.map((question) => question.id) }))}>เลือกทั้งหมด</button><button type="button" disabled={Boolean(editingPlan?.attemptCount)} onClick={() => setForm((current) => ({ ...current, questionIds: [] }))}>ล้าง</button><button type="button" className="bank-preview" disabled={!form.questionIds.length} onClick={() => setPreviewIds(form.questionIds)}>ดูตัวอย่าง</button></div></header>
          <div>{questions.map((question) => <label key={question.id} className={form.questionIds.includes(question.id) ? "selected" : ""}><input type="checkbox" disabled={Boolean(editingPlan?.attemptCount)} checked={form.questionIds.includes(question.id)} onChange={() => setForm((current) => { const questionIds = current.questionIds.includes(question.id) ? current.questionIds.filter((id) => id !== question.id) : [...current.questionIds, question.id]; return { ...current, questionIds, questionCount: Math.max(1, questionIds.length) }; })} /><b>{question.topicCode}</b><span>{question.prompt}</span>{question.critical && <em>Critical</em>}</label>)}</div>
        </section>
      </div>
      <section className="sop-existing-plans">
        <header><h4>ชุดข้อสอบที่บันทึกแล้ว</h4><div><button type="button" className={planView === "active" ? "active" : ""} onClick={() => setPlanView("active")}>ใช้งานอยู่ ({plans.filter((plan) => plan.status !== "archived").length})</button><button type="button" className={planView === "archived" ? "active" : ""} onClick={() => setPlanView("archived")}>คลัง ({plans.filter((plan) => plan.status === "archived").length})</button></div></header>
        {!visiblePlans.length ? <p>{planView === "archived" ? "ยังไม่มีชุดข้อสอบในคลัง" : "ยังไม่มีชุดข้อสอบที่ใช้งานอยู่"}</p> : visiblePlans.map((plan) => <article key={plan.id}>
          <div><span className={plan.status}>{plan.status === "open" ? "เปิดสอบ" : plan.status === "closed" ? "ปิดสอบ" : plan.status === "archived" ? "ในคลัง" : "ร่าง"}</span><h5>{plan.title}</h5></div>
          <p>{plan.questionCount} ข้อ · ผลสอบ {plan.attemptCount || 0} ครั้ง</p><p>{new Date(plan.startsAt).toLocaleString("th-TH")} – {new Date(plan.dueAt).toLocaleString("th-TH")}</p>
          <div className="sop-plan-buttons"><button type="button" onClick={() => setPreviewIds(plan.questionIds)}>ดูข้อสอบ</button><button type="button" onClick={() => editPlan(plan)}>แก้ไข</button><button type="button" onClick={() => copyPlan(plan)}>ทำสำเนา</button>{plan.status === "archived" ? <button type="button" onClick={() => void setStatus(plan.id, "closed")}>นำกลับมาใช้</button> : <><button type="button" onClick={() => void setStatus(plan.id, "open")}>เปิดสอบ</button><button type="button" onClick={() => void setStatus(plan.id, "closed")}>ปิดสอบ</button><button type="button" onClick={() => void setStatus(plan.id, "archived")}>เก็บเข้าคลัง</button></>}{plan.status === "draft" && !plan.attemptCount && <button type="button" className="danger" onClick={() => void deletePlan(plan)}>ลบถาวร</button>}</div>
        </article>)}
      </section>
      {previewIds && <div className="sop-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewIds(null); }}>
        <section className="sop-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="sop-preview-title">
          <header><div><span>EXAM PREVIEW</span><h4 id="sop-preview-title">ตัวอย่างข้อสอบที่จะออก</h4><p>{previewItems.length} ข้อ · ยังไม่แสดงเฉลย</p></div><button type="button" aria-label="ปิดตัวอย่างข้อสอบ" onClick={() => setPreviewIds(null)}>×</button></header>
          <ol>{previewItems.map((question, index) => <li key={question.id}><div className="sop-preview-question"><b>{index + 1}</b><span><small>หัวข้อ {question.topicCode}</small><strong>{question.prompt}</strong></span>{question.critical && <em>Critical</em>}</div><ul>{question.choices.map((choice, choiceIndex) => <li key={choice}><span>{String.fromCharCode(65 + choiceIndex)}</span>{choice}</li>)}</ul></li>)}</ol>
          <footer><span>ตรวจครบแล้วจึงกดบันทึกกำหนดการสอบ</span><button type="button" onClick={() => setPreviewIds(null)}>ปิดตัวอย่าง</button></footer>
        </section>
      </div>}
    </section>
  );
}
