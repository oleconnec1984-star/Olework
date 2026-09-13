export type SopTopic = {
  code: string;
  title: string;
  critical?: boolean;
  recommended?: boolean;
};

export type SopCategory = {
  id: string;
  title: string;
  english: string;
  audience: string[];
  status?: "active" | "pending";
  topics: SopTopic[];
};

export const sopMeta = {
  version: "1.1",
  effectiveDate: "8 กันยายน 2569",
  approver: "ผู้บริหาร หจก.โอเล่คอนเนค",
  pdfUrl: "/sop/ole-connect-front-store-v1.1.pdf",
};

export const sopCategories: SopCategory[] = [
  {
    id: "store-operations",
    title: "งานบริหารร้าน",
    english: "Store Operations",
    audience: ["ผู้จัดการร้าน", "พนักงานหน้าร้าน", "ฝ่ายเสมียน"],
    topics: [
      { code: "1.1", title: "ขั้นตอนการเปิดร้าน" },
      { code: "1.2", title: "การจัดการยอดเย็น การส่งเงิน และเงินทอน", critical: true },
      { code: "1.3", title: "การทำความสะอาดร้านก่อนปิดร้าน" },
      { code: "1.4", title: "การเรียงสินค้า FIFO / LIFO" },
      { code: "1.5", title: "การแจ้งสินค้าเมื่อสินค้าหมด" },
      { code: "1.6", title: "การรับสินค้าใหม่จากสาขาหลัก" },
      { code: "1.7", title: "สินค้าเก่า ซีด หรือห่อชำรุด" },
      { code: "1.8", title: "พื้นที่เครื่องซักผ้าหยอดเหรียญ" },
    ],
  },
  {
    id: "sales-service",
    title: "งานขายและบริการลูกค้า",
    english: "Sales & Customer Service",
    audience: ["พนักงานหน้าร้าน", "ผู้จัดการร้าน"],
    topics: [
      { code: "2.1", title: "การเสนอขายและแนะนำสินค้า" },
      { code: "2.2", title: "สายชาร์จ หัวปลั๊ก และชุดชาร์จ" },
      { code: "2.3", title: "เลือกแบตเตอรี่และตรวจรหัสให้ตรงรุ่น" },
      { code: "2.4", title: "การรับสั่งเคสจากลูกค้า" },
      { code: "2.5", title: "การแกะทดลองสินค้าที่คืนสภาพเดิมไม่ได้", critical: true },
      { code: "2.6", title: "การให้ของแถมหน้าร้าน" },
      { code: "2.7", title: "การเชื่อมต่อหูฟังบลูทูธ" },
      { code: "2.8", title: "การต่อหรือเปลี่ยนโปรอินเทอร์เน็ต" },
      { code: "2.9", title: "สินค้ามีปัญหาระหว่างทดลอง" },
    ],
  },
  {
    id: "finance",
    title: "งานผ่อนและสินเชื่อ",
    english: "Installment & Finance",
    audience: ["พนักงานหน้าร้าน", "ฝ่ายเสมียน", "ผู้จัดการร้าน"],
    status: "pending",
    topics: [{ code: "3.1", title: "ภาพรวมงานผ่อนและสินเชื่อ — รอเพิ่มรายละเอียด" }],
  },
  {
    id: "repair-pawn",
    title: "งานซ่อมและรับจำนำ",
    english: "Repair & Pawn",
    audience: ["ฝ่ายช่าง", "พนักงานหน้าร้าน", "ผู้จัดการร้าน"],
    topics: [
      { code: "4.1", title: "การรับงานซ่อม", critical: true },
      { code: "4.2", title: "การรับจำนำหรือซื้อเครื่องเข้า", critical: true },
    ],
  },
  {
    id: "after-sales",
    title: "งานบริการหลังการขาย",
    english: "After-Sales Service",
    audience: ["พนักงานหน้าร้าน", "ฝ่ายช่าง", "ผู้จัดการร้าน"],
    topics: [
      { code: "5.1", title: "การรับเคลม" },
      { code: "5.2", title: "การส่งศูนย์ซ่อม" },
      { code: "5.3", title: "การจัดการข้อร้องเรียนลูกค้า" },
    ],
  },
  {
    id: "customer-support",
    title: "งานซัพพอร์ตลูกค้า",
    english: "Customer Support",
    audience: ["พนักงานหน้าร้าน", "ฝ่ายช่าง", "ผู้จัดการร้าน"],
    topics: [
      { code: "6.1", title: "การตรวจสอบและต่อโปร" },
      { code: "6.2", title: "ช่วยเหลือเครื่องไวรัส อืด ดับ หรือไมค์เสีย" },
      { code: "6.3", title: "การติดฟิล์มหน้าจอ" },
      { code: "6.4", title: "มาตรฐานความปลอดภัยข้อมูลลูกค้า", critical: true },
      { code: "6.5", title: "ตัวชี้วัดแนะนำ", recommended: true },
    ],
  },
  {
    id: "customer-handling",
    title: "การจัดการลูกค้า",
    english: "Customer Handling",
    audience: ["ทุกตำแหน่ง"],
    topics: [
      { code: "7.1", title: "การรับมือลูกค้าไม่พอใจ" },
      { code: "7.2", title: "การดูแลลูกค้า VIP" },
      { code: "7.3", title: "ลูกค้าต่างชาติหรือสื่อสารยาก" },
      { code: "7.4", title: "ข้อควรระวังในการดูแลลูกค้า" },
      { code: "7.5", title: "ตัวชี้วัดแนะนำ", recommended: true },
    ],
  },
  {
    id: "marketing",
    title: "งานการตลาดและโปรโมต",
    english: "Marketing & Promotion",
    audience: ["ฝ่ายการตลาด", "ผู้จัดการร้าน"],
    topics: [
      { code: "8.1", title: "การทำคอนเทนต์รายวัน" },
      { code: "8.2", title: "การโพสต์และแชร์คอนเทนต์" },
      { code: "8.3", title: "การเก็บและวิเคราะห์สถิติ" },
      { code: "8.4", title: "คอนเทนต์มีปัญหา" },
      { code: "8.5", title: "ตัวชี้วัดแนะนำ", recommended: true },
    ],
  },
];

export const sopLevels = [
  { name: "Bronze", range: "80–89%", className: "bronze" },
  { name: "Silver", range: "90–94%", className: "silver" },
  { name: "Gold", range: "95–99%", className: "gold" },
  { name: "Diamond", range: "100%", className: "diamond" },
];

export type SopPublicQuestion = {
  id: string;
  categoryId: string;
  topicCode: string;
  prompt: string;
  choices: string[];
  critical: boolean;
};

export type SopMediaRef = {
  id: string;
  name: string;
  type: string;
  size: number;
};

export type SopStepMedia = {
  images: SopMediaRef[];
  youtubeUrls: string[];
};
