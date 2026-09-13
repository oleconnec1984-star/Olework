import { notFound } from "next/navigation";
import { publicQuestions } from "../../lib/sop-quiz";
import type { Employee } from "../../lib/work-model";
import { SopCenter } from "../sop-center";

const previewEmployees: Employee[] = [
  { id: "mint", name: "เมจิ", role: "ผู้จัดการร้าน", branch: "บ้านแซม", department: "ผู้จัดการร้าน", active: true },
  { id: "fon", name: "ฝน", role: "พนักงานหน้าร้าน", branch: "ป่าซาง", department: "พนักงานหน้าร้าน", active: true },
  { id: "ple", name: "เปิ้ล", role: "ฝ่ายเสมียน", branch: "บ้านเส้ง", department: "ฝ่ายเสมียน", active: true },
];

export default function SopPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <main style={{ maxWidth: 1480, margin: "0 auto", padding: 24, background: "#111b2d", minHeight: "100vh" }}><SopCenter employees={previewEmployees} isOwner employeeId={null} previewQuestions={publicQuestions()} /></main>;
}
