import { type SopPublicQuestion } from "./sop-content";

type Question = SopPublicQuestion & { answer: number };

const curatedQuestions: Question[] = [
  { id: "q01", categoryId: "store-operations", topicCode: "1.1", prompt: "สิ่งใดควรเปิดและตรวจสอบก่อนเริ่มขาย?", choices: ["เฉพาะไฟหน้าร้าน", "POS เครื่องคิดเงิน และเครื่องสแกนบาร์โค้ด", "เฉพาะโทรศัพท์ส่วนตัว", "ไม่ต้องตรวจ"], answer: 1, critical: false },
  { id: "q02", categoryId: "store-operations", topicCode: "1.2", prompt: "ก่อนปิดรอบเงินสดต้องทำอย่างไร?", choices: ["ประมาณยอดด้วยสายตา", "ตรวจยอด เงินทอน หลักฐาน และผู้ส่ง/ผู้ตรวจให้ครบ", "เก็บเงินไว้ตรวจวันถัดไป", "ส่งเฉพาะยอดขาย"], answer: 1, critical: true },
  { id: "q03", categoryId: "store-operations", topicCode: "1.4", prompt: "FIFO หมายถึงข้อใด?", choices: ["สินค้าใหม่ขายก่อน", "สินค้าที่เข้าก่อนขายก่อน", "สินค้าราคาแพงขายก่อน", "วางสินค้าแบบใดก็ได้"], answer: 1, critical: false },
  { id: "q04", categoryId: "store-operations", topicCode: "1.5", prompt: "เมื่อพบสินค้าหมดระหว่างวันควรทำอย่างไร?", choices: ["รอสิ้นเดือน", "แจ้งหัวหน้าและบันทึกสถานะรอเติม", "ลบรายการสินค้า", "ไม่ต้องทำอะไร"], answer: 1, critical: false },
  { id: "q05", categoryId: "sales-service", topicCode: "2.5", prompt: "ก่อนแกะสินค้าที่คืนสภาพซีลเดิมไม่ได้ ต้องทำอะไร?", choices: ["แกะให้ลูกค้าดูก่อน", "ยืนยันรุ่นและขอความยินยอมลูกค้าก่อน", "ให้ลูกค้าแกะเองโดยไม่บันทึก", "เก็บกล่องไว้ก็พอ"], answer: 1, critical: true },
  { id: "q06", categoryId: "sales-service", topicCode: "2.1", prompt: "การแนะนำสินค้าควรเริ่มจากอะไร?", choices: ["สินค้าที่แพงที่สุด", "สอบถามงบและการใช้งาน", "ของที่เหลือเยอะที่สุด", "โปรโมชั่นเท่านั้น"], answer: 1, critical: false },
  { id: "q07", categoryId: "sales-service", topicCode: "2.4", prompt: "เมื่อลูกค้าสั่งเคสควรบันทึกอะไร?", choices: ["ชื่อเล่นอย่างเดียว", "รุ่น รูปแบบ สี ระยะเวลา และมัดจำเมื่อมี", "เฉพาะเบอร์โทร", "ไม่ต้องออกหลักฐาน"], answer: 1, critical: false },
  { id: "q08", categoryId: "sales-service", topicCode: "2.3", prompt: "ก่อนเปลี่ยนแบตเตอรี่ต้องตรวจสิ่งใด?", choices: ["สีตัวเครื่อง", "รหัสแบตให้ตรงกับรุ่น", "ภาพพื้นหลัง", "จำนวนแอป"], answer: 1, critical: false },
  { id: "q09", categoryId: "repair-pawn", topicCode: "4.1", prompt: "รับเครื่องซ่อมต้องเก็บหลักฐานใด?", choices: ["คำบอกเล่าอย่างเดียว", "รายละเอียดอาการ ภาพสภาพเครื่อง และหลักฐานรับเครื่อง", "เฉพาะราคา", "ไม่ต้องมีหลักฐาน"], answer: 1, critical: true },
  { id: "q10", categoryId: "repair-pawn", topicCode: "4.2", prompt: "ก่อนรับจำนำหรือซื้อเครื่องเข้าต้องตรวจอะไร?", choices: ["เฉพาะสีเครื่อง", "ตัวตน เอกสาร IMEI/Serial และสภาพเครื่อง", "จำนวนผู้ติดตาม", "กล่องอย่างเดียว"], answer: 1, critical: true },
  { id: "q11", categoryId: "after-sales", topicCode: "5.1", prompt: "การรับเคลมควรเริ่มจากอะไร?", choices: ["ส่งศูนย์ทันที", "ตรวจสภาพและสิทธิ์ประกัน", "คืนเงินทันที", "ลบข้อมูลลูกค้า"], answer: 1, critical: false },
  { id: "q12", categoryId: "after-sales", topicCode: "5.2", prompt: "เลขเคสส่งศูนย์ควรทำอย่างไร?", choices: ["จำไว้", "ติดให้ตรงกับเอกสารและบันทึกในระบบ", "เขียนเฉพาะบนกล่อง", "ไม่ต้องใช้"], answer: 1, critical: false },
  { id: "q13", categoryId: "customer-support", topicCode: "6.2", prompt: "การรีเซ็ตหรืออัปเดตเครื่องลูกค้าต้องทำอย่างไร?", choices: ["ทำได้ทันที", "ขออนุญาตและบันทึกความยินยอม", "เก็บรหัสผ่านไว้", "เปิดดูรูปก่อน"], answer: 1, critical: true },
  { id: "q14", categoryId: "customer-support", topicCode: "6.4", prompt: "ข้อมูลใดห้ามบันทึกไว้ในที่ไม่ปลอดภัย?", choices: ["รุ่นเครื่อง", "รหัสผ่าน Apple ID/Google Account", "สีเคส", "ชื่อสินค้า"], answer: 1, critical: true },
  { id: "q15", categoryId: "customer-support", topicCode: "6.3", prompt: "ก่อนติดฟิล์มควรทำอะไร?", choices: ["เปิดเพลง", "ตรวจสภาพหน้าจอและเลือกรุ่นให้ตรง", "รีเซ็ตเครื่อง", "ปิดบลูทูธ"], answer: 1, critical: false },
  { id: "q16", categoryId: "customer-handling", topicCode: "7.1", prompt: "เมื่อลูกค้าไม่พอใจควรทำอย่างไรเป็นอันดับแรก?", choices: ["โต้แย้งทันที", "ตั้งสติและรับฟังโดยไม่ขัดจังหวะ", "ส่งต่อทุกกรณี", "หลีกเลี่ยงลูกค้า"], answer: 1, critical: false },
  { id: "q17", categoryId: "customer-handling", topicCode: "7.3", prompt: "หากสื่อสารกับลูกค้าต่างชาติไม่ได้ควรทำอย่างไร?", choices: ["ยกเลิกบริการ", "ใช้เครื่องมือแปลหรือขอคนที่ช่วยแปล", "เดาความต้องการ", "ให้เซ็นเอกสารทันที"], answer: 1, critical: false },
  { id: "q18", categoryId: "customer-handling", topicCode: "7.4", prompt: "ข้อใดเป็นสิ่งที่ห้ามทำกับลูกค้า?", choices: ["สรุปข้อมูลเป็นลายลักษณ์อักษร", "ใช้อารมณ์หรือเถียงลูกค้า", "ขอข้อมูลเพิ่ม", "แจ้งผู้จัดการ"], answer: 1, critical: false },
  { id: "q19", categoryId: "marketing", topicCode: "8.1", prompt: "ก่อนโพสต์คอนเทนต์ควรตรวจอะไร?", choices: ["ยอดขายวันก่อนเท่านั้น", "ข้อความ ภาพ ราคา และความถูกต้อง", "จำนวนพนักงาน", "ไม่ต้องตรวจ"], answer: 1, critical: false },
  { id: "q20", categoryId: "marketing", topicCode: "8.5", prompt: "KPI ใน SOP เวอร์ชันนี้มีสถานะใด?", choices: ["คิดโบนัสอัตโนมัติ", "เป็นคำแนะนำ ยังไม่คิดคะแนนพนักงานอัตโนมัติ", "ใช้หักเงินเดือน", "ยกเลิกแล้ว"], answer: 1, critical: false },
];

const supplementalQuestions: Question[] = [
  { id: "topic-1-3", categoryId: "store-operations", topicCode: "1.3", prompt: "ก่อนปิดร้าน ควรตรวจความสะอาดส่วนใดให้ครบ?", choices: ["เฉพาะพื้นที่หน้าประตู", "เฉพาะหลังเคาน์เตอร์", "พื้น ชั้นวาง กระจก เคาน์เตอร์ ตู้โชว์ ป้ายราคา และขยะ", "เฉพาะจุดที่ลูกค้าร้องเรียน"], answer: 2, critical: false },
  { id: "topic-1-6", categoryId: "store-operations", topicCode: "1.6", prompt: "เมื่อรับสินค้าใหม่จากสาขาหลัก ขั้นตอนใดควรทำก่อนกดรับเข้าระบบ?", choices: ["เทียบจำนวน สภาพกล่อง บาร์โค้ด และราคา", "นำสินค้าใหม่วางหน้าล็อตเก่าทันที", "แกะทุกกล่องเพื่อทดลองขาย", "กดรับตามยอดที่ผู้ส่งแจ้งโดยไม่ตรวจ"], answer: 0, critical: false },
  { id: "topic-1-7", categoryId: "store-operations", topicCode: "1.7", prompt: "พบสินค้าซีดหรือห่อชำรุดบนชั้นขาย ควรจัดการอย่างไร?", choices: ["ลดราคาเองและขายต่อ", "นำออกจากชั้น แยกโซน ถ่ายรูป และแจ้งหัวหน้า", "วางไว้หลังสินค้าใหม่โดยไม่บันทึก", "ส่งให้ลูกค้าทดลองก่อนตัดสินใจ"], answer: 1, critical: false },
  { id: "topic-1-8", categoryId: "store-operations", topicCode: "1.8", prompt: "หากเครื่องซักผ้าหยอดเหรียญเตือนและแก้พื้นฐานไม่ได้ ควรทำอย่างไร?", choices: ["เปิดเครื่องทิ้งไว้ให้ลูกค้าใช้ต่อ", "ถอดชิ้นส่วนเพื่อตรวจเอง", "ปิดพื้นที่ทั้งหมดโดยไม่แจ้งใคร", "หยุดแก้เองและแจ้งผู้ดูแล"], answer: 3, critical: false },
  { id: "topic-2-2", categoryId: "sales-service", topicCode: "2.2", prompt: "การเลือกหัวและสายชาร์จให้ลูกค้า ข้อใดถูกต้อง?", choices: ["เลือกจากสีที่เข้ากับเครื่องเป็นหลัก", "ใช้สายกำลังต่ำกว่าหัวเพื่อประหยัด", "ตรวจรุ่นและกำลังชาร์จ แล้วเลือกหัวกับสายที่รองรับ", "เลือกรุ่นที่ราคาสูงสุดโดยไม่ต้องทดสอบ"], answer: 2, critical: false },
  { id: "topic-2-6", categoryId: "sales-service", topicCode: "2.6", prompt: "หากเปลี่ยนของแถมเป็นส่วนลดเงินสด ต้องทำอย่างไร?", choices: ["ชำระด้วยเงินโอนและบันทึกหลักฐานใน POS", "หักจากเงินสดหน้าลิ้นชักโดยไม่บันทึก", "ให้ส่วนลดเกินงบได้เมื่อใกล้ปิดร้าน", "แจ้งภายหลังเมื่อสรุปยอดเดือน"], answer: 0, critical: false },
  { id: "topic-2-7", categoryId: "sales-service", topicCode: "2.7", prompt: "หลังเชื่อมต่อหูฟัง Bluetooth สำเร็จ ควรทำขั้นตอนใดต่อ?", choices: ["ลบชื่ออุปกรณ์ออกทันที", "ทดสอบเสียงและสาธิตปุ่มควบคุม", "รีเซ็ตโทรศัพท์ลูกค้า", "ปิดหูฟังแล้วส่งมอบโดยไม่ทดลอง"], answer: 1, critical: false },
  { id: "topic-2-8", categoryId: "sales-service", topicCode: "2.8", prompt: "ก่อนเปลี่ยนแพ็กเกจอินเทอร์เน็ตให้ลูกค้า ต้องยืนยันข้อมูลใด?", choices: ["เฉพาะชื่อเครือข่าย", "เฉพาะยอดเงินที่ลูกค้าพกมา", "สีซิมและรุ่นเคส", "ราคา เน็ต โทร สัญญา และผลต่อรอบบิล"], answer: 3, critical: false },
  { id: "topic-2-9", categoryId: "sales-service", topicCode: "2.9", prompt: "เมื่อสินค้ามีปัญหาระหว่างทดลองต่อหน้าลูกค้า ควรทำอย่างไร?", choices: ["ให้ลูกค้ารับสินค้าไปทดสอบต่อ", "หยุดขาย ขอโทษ เปลี่ยนตัวใหม่ แจ้งหัวหน้า และบันทึกปัญหา", "เก็บสินค้ากลับชั้นเดิมหลังลูกค้าออก", "ตัดสินว่าเป็นความผิดของลูกค้าโดยไม่ตรวจ"], answer: 1, critical: false },
  { id: "topic-3-1", categoryId: "finance", topicCode: "3.1", prompt: "งานผ่อนและสินเชื่อใน SOP ฉบับนี้ควรยึดหลักใดก่อนส่งมอบสินค้า?", choices: ["ส่งมอบทันทีเมื่อกรอกชื่อครบ", "ใช้เงื่อนไขจากความจำของพนักงาน", "รอผลอนุมัติและยึดเงื่อนไขล่าสุดของผู้ให้บริการ", "รับเงินดาวน์แล้วข้ามการตรวจเอกสาร"], answer: 2, critical: false },
  { id: "topic-5-3", categoryId: "after-sales", topicCode: "5.3", prompt: "ข้อร้องเรียนที่เกินอำนาจพนักงานควรดำเนินการอย่างไร?", choices: ["ปิดเคสเพื่อไม่ให้ค้าง", "ส่งต่อผู้จัดการพร้อมข้อมูลและสาเหตุที่ตรวจพบ", "ให้ลูกค้าเริ่มเล่าใหม่กับทุกคน", "รับปากผลลัพธ์แทนผู้จัดการ"], answer: 1, critical: false },
  { id: "topic-6-1", categoryId: "customer-support", topicCode: "6.1", prompt: "ก่อนเปลี่ยนโปรให้ลูกค้า ควรแสดงข้อมูลใดให้ลูกค้ายืนยัน?", choices: ["ราคา ปริมาณเน็ต โทร สัญญา และผลต่อรอบบิล", "เฉพาะชื่อโปรโมชั่น", "เฉพาะความเร็วสูงสุดในโฆษณา", "ยอดขายของร้านในเดือนนั้น"], answer: 0, critical: false },
  { id: "topic-6-5", categoryId: "customer-support", topicCode: "6.5", prompt: "ตัวชี้วัดในหัวข้อ 6.5 ใช้อย่างไรใน SOP เวอร์ชันนี้?", choices: ["ใช้หักคะแนนทันทีเมื่อเวลารอเกิน 5 นาที", "ใช้ตัดโบนัสอัตโนมัติทุกเดือน", "เป็นตัวชี้วัดทดลอง ยังไม่คิดคะแนนอัตโนมัติ", "ใช้เฉพาะกับผู้จัดการร้าน"], answer: 2, critical: false },
  { id: "topic-7-2", categoryId: "customer-handling", topicCode: "7.2", prompt: "การดูแลลูกค้า VIP ตาม SOP ควรเป็นแบบใด?", choices: ["ให้สิทธิ์ข้ามเงื่อนไขร้านทุกกรณี", "ต้อนรับเป็นส่วนตัว ลดเวลารอตามนโยบาย และติดตามหลังบริการ", "เสนอสินค้าราคาแพงที่สุดก่อนเสมอ", "ส่งต่อผู้จัดการโดยไม่สอบถามความต้องการ"], answer: 1, critical: false },
  { id: "topic-7-5", categoryId: "customer-handling", topicCode: "7.5", prompt: "ข้อใดตรงกับสถานะตัวชี้วัดการดูแลลูกค้าใน SOP ปัจจุบัน?", choices: ["เป็นเกณฑ์ทดลองประเมินบริการ", "เป็นเงื่อนไขตัดเงินเดือน", "เป็นคะแนนสอบ Critical ทุกข้อ", "ยกเลิกการติดตามความพึงพอใจ"], answer: 0, critical: false },
  { id: "topic-8-2", categoryId: "marketing", topicCode: "8.2", prompt: "การแชร์คอนเทนต์ในกลุ่มพื้นที่ควรปฏิบัติอย่างไร?", choices: ["โพสต์ข้อความเดิมซ้ำทุกชั่วโมง", "แชร์โดยไม่ใส่ช่องทางติดต่อ", "ใช้ข้อความเหมาะสมและไม่โพสต์ซ้ำเกิน 1–2 ครั้งต่อกลุ่มต่อวัน", "รอครบหนึ่งสัปดาห์จึงตอบข้อความ"], answer: 2, critical: false },
  { id: "topic-8-3", categoryId: "marketing", topicCode: "8.3", prompt: "ข้อมูลใดควรเก็บเพื่อวิเคราะห์ผลงานคอนเทนต์?", choices: ["เฉพาะจำนวนโพสต์", "ไลก์ แชร์ คอมเมนต์ ข้อความ วันที่ และประเภทโพสต์", "เฉพาะยอดผู้ติดตามปลายเดือน", "ชื่อพนักงานที่เข้าเวรเท่านั้น"], answer: 1, critical: false },
  { id: "topic-8-4", categoryId: "marketing", topicCode: "8.4", prompt: "เมื่อพบว่าคอนเทนต์มีข้อมูลผิด ควรทำอย่างไรเป็นอันดับแรก?", choices: ["รอให้มีคนร้องเรียนหลายคน", "โพสต์ซ้ำเพื่อดันข้อมูลใหม่", "ปิดคอมเมนต์โดยไม่แก้เนื้อหา", "แก้หรือลบข้อมูลผิดทันทีและขอโทษอย่างสุภาพ"], answer: 3, critical: false },
];

function rotateChoices(question: Question, order: number): Question {
  const shift = order % question.choices.length;
  if (shift === 0) return question;
  return {
    ...question,
    choices: [...question.choices.slice(shift), ...question.choices.slice(0, shift)],
    answer: (question.answer - shift + question.choices.length) % question.choices.length,
  };
}

/** One inspectable question for every SOP topic. */
export const sopQuestions: Question[] = [...curatedQuestions, ...supplementalQuestions]
  .sort((left, right) => left.topicCode.localeCompare(right.topicCode, undefined, { numeric: true }))
  .map(rotateChoices);

export function publicQuestions() {
  return sopQuestions.map((question) => ({
    id: question.id,
    categoryId: question.categoryId,
    topicCode: question.topicCode,
    prompt: question.prompt,
    choices: question.choices,
    critical: question.critical,
  }));
}

export function questionsForPlan(questionIds: string[]) {
  const byId = new Map(sopQuestions.map((question) => [question.id, question]));
  return questionIds.map((id) => byId.get(id)).filter((question): question is Question => Boolean(question));
}

export function gradeSopAnswers(answers: Record<string, number>, selectedQuestions = sopQuestions) {
  const correct = selectedQuestions.filter((q) => answers[q.id] === q.answer).length;
  const criticalPassed = selectedQuestions.filter((q) => q.critical).every(
    (q) => answers[q.id] === q.answer,
  );
  const score = Math.round((correct / selectedQuestions.length) * 100);
  const level = !criticalPassed || score < 80
    ? "ต้องพัฒนา"
    : score === 100
      ? "Diamond"
      : score >= 95
        ? "Gold"
        : score >= 90
          ? "Silver"
          : "Bronze";
  return { correct, total: selectedQuestions.length, score, level, criticalPassed };
}
