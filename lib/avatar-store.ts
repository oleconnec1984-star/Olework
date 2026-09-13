import {validateAvatarV3,type AvatarV3} from './avatar';
import type {State} from './work-model';
export class AvatarSaveError extends Error{constructor(message:string,public status:number){super(message)}}
export type AvatarUpdate={employeeId:string;avatar:AvatarV3;revision:number};
export function validateAvatarUpdate(body:unknown):asserts body is AvatarUpdate{
 if(!body||typeof body!=='object')throw new AvatarSaveError('ข้อมูลไม่ถูกต้อง',400);
 const b=body as AvatarUpdate;
 if(typeof b.employeeId!=='string'||!b.employeeId||b.employeeId.length>100||!Number.isSafeInteger(b.revision)||b.revision<0)throw new AvatarSaveError('รหัสพนักงานหรือเวอร์ชันไม่ถูกต้อง',400);
 if(Object.keys(b).some(k=>!['employeeId','avatar','revision'].includes(k)))throw new AvatarSaveError('คำขอนี้แก้ไขได้เฉพาะ Avatar',400);
 try{validateAvatarV3(b.avatar)}catch(e){throw new AvatarSaveError((e as Error).message,400)}
}
// The existing workspace is isolated by dispatch identity. No employee login or
// new authority is introduced here. Only a record inside the caller's workspace
// can be changed; uploaded photo fields and every other record remain untouched.
export async function updateEmployeeAvatar(db:D1Database,owner:string,actor:string,body:AvatarUpdate){
 validateAvatarUpdate(body);
 const row=await db.prepare('SELECT state, revision FROM ole_workspaces WHERE owner_id = ?').bind(owner).first<{state:string;revision:number}>();
 if(!row)throw new AvatarSaveError('ไม่พบพนักงานในพื้นที่ที่คุณมีสิทธิ์',404);
 if(row.revision!==body.revision)throw new AvatarSaveError('ข้อมูลเปลี่ยนจากอีกหน้าจอแล้ว ตัวละครที่เลือกยังอยู่ กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก',409);
 const state=JSON.parse(row.state) as State;const employee=state.employees.find(e=>e.id===body.employeeId);
 if(!employee)throw new AvatarSaveError('ไม่พบพนักงานในพื้นที่ที่คุณมีสิทธิ์',404);
 employee.avatar={...body.avatar};const now=new Date().toISOString();
 state.activity=[{id:crypto.randomUUID(),text:'บันทึก Avatar: '+employee.name,at:now,actor},...state.activity].slice(0,200);
 const result=await db.prepare('UPDATE ole_workspaces SET state = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ?').bind(JSON.stringify(state),now,owner,body.revision).run();
 if(result.meta.changes!==1)throw new AvatarSaveError('มีการบันทึกพร้อมกัน กรุณาโหลดข้อมูลล่าสุดแล้วลองอีกครั้ง',409);
 return {state,revision:body.revision+1,updatedAt:now};
}
