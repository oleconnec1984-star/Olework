import {env} from 'cloudflare:workers';
import {AvatarSaveError,updateEmployeeAvatar,validateAvatarUpdate} from '../../../../lib/avatar-store';
import {resolveActor} from '../../../../lib/employee-auth';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function PATCH(request:Request){
 const access=await resolveActor(request,env.DB);
 if(!access)return json({error:'กรุณาเข้าสู่ระบบก่อนบันทึก Avatar'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'คำขอไม่ถูกต้อง'},403);
 if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'รูปแบบคำขอไม่ถูกต้อง'},415);
 try{
  const raw=await request.text();if(raw.length>6000)return json({error:'ข้อมูล Avatar ใหญ่เกินกำหนด'},413);
  let body;try{body=JSON.parse(raw)}catch{return json({error:'ข้อมูลไม่ถูกต้อง'},400)}
  validateAvatarUpdate(body);if(access.kind==='employee'&&body.employeeId!==access.employeeId)return json({error:'พนักงานแก้ไขได้เฉพาะ Avatar ของตนเอง'},403);
  return json(await updateEmployeeAvatar(env.DB,access.ownerId,access.name,body));
 }catch(e){if(e instanceof AvatarSaveError)return json({error:e.message},e.status);console.error('Avatar save failed',e);return json({error:'บันทึก Avatar ไม่สำเร็จ ลุคที่ลองยังอยู่ กรุณาลองอีกครั้ง'},503)}
}
