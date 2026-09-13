import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {Miniflare} from 'miniflare';

test('production Worker renders the Thai workspace and serves the authenticated data route',async()=>{
 const mf=new Miniflare({
  modules:true,scriptPath:new URL('../dist/server/index.js',import.meta.url).pathname,
  modulesRoot:new URL('../dist/server/',import.meta.url).pathname,
  modulesRules:[{type:'ESModule',include:['**/*.js'],fallthrough:true}],
  compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],
 });
 try{
  const db=await mf.getD1Database('DB');
  const migrationDirectory=new URL('../drizzle/',import.meta.url);
  const migrations=(await readdir(migrationDirectory)).filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort();
  for(const migration of migrations){
   const sql=await readFile(new URL(migration,migrationDirectory),'utf8');
   for(const statement of sql.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.prepare(statement).run();
  }
  const response=await mf.dispatchFetch('http://localhost/',{headers:{accept:'text/html'}});
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
  const html=await response.text();assert.match(html,/OLE WORK/);assert.match(html,/lang="th"/);assert.match(html,/ole-profile\.png/);assert.match(html,/กำลังโหลดข้อมูล/);
  const unauth=await mf.dispatchFetch('http://localhost/api/workspace');assert.equal(unauth.status,401);
  const avatarUnauth=await mf.dispatchFetch('http://localhost/api/employees/avatar',{method:'PATCH'});assert.equal(avatarUnauth.status,401);
  const lab=await mf.dispatchFetch('http://localhost/avatar-lab',{headers:{accept:'text/html'}});assert.equal(lab.status,404);assert.doesNotMatch(await lab.text(),/พื้นที่ตรวจภาพเฉพาะโหมดพัฒนา/);
  const sopPreview=await mf.dispatchFetch('http://localhost/sop-preview',{headers:{accept:'text/html'}});assert.equal(sopPreview.status,404);
  const auth=await mf.dispatchFetch('http://localhost/api/workspace',{headers:{'oai-authenticated-user-id':'local-test-owner'}});assert.equal(auth.status,200);assert.equal((await auth.json()).revision,0);
  const ownerHeaders={'oai-authenticated-user-id':'local-test-owner'};
  const sop=await mf.dispatchFetch('http://localhost/api/sop',{headers:ownerHeaders});assert.equal(sop.status,200);const sopPayload=await sop.json();assert.equal(sopPayload.questions.length,38);assert.equal(new Set(sopPayload.questions.map(question=>question.topicCode)).size,38);assert.deepEqual(sopPayload.attempts,[]);
  const contentWrite=await mf.dispatchFetch('http://localhost/api/sop/content',{method:'POST',headers:{...ownerHeaders,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({topicCode:'3.1',categoryId:'finance',title:'งานผ่อนและสินเชื่อ',purpose:'ทดสอบการบันทึกเวอร์ชัน',steps:['ตรวจเอกสารจากต้นทาง'],audiences:['ฝ่ายเสมียน'],documentVersion:'1.2',changeNote:'เติมเนื้อหาทดสอบ',state:'published'})});assert.equal(contentWrite.status,201);
  const contentRead=await mf.dispatchFetch('http://localhost/api/sop/content',{headers:ownerHeaders});assert.equal(contentRead.status,200);const contentPayload=await contentRead.json();assert.equal(contentPayload.published[0].topicCode,'3.1');assert.deepEqual(contentPayload.published[0].steps,['ตรวจเอกสารจากต้นทาง']);
  const planWrite=await mf.dispatchFetch('http://localhost/api/sop/plans',{method:'POST',headers:{...ownerHeaders,origin:'http://localhost','content-type':'application/json'},body:JSON.stringify({title:'สอบทดลอง',questionIds:sopPayload.questions.slice(0,3).map(question=>question.id),audienceType:'all',audienceValues:[],startsAt:'2026-01-01T00:00:00.000Z',dueAt:'2027-01-01T00:00:00.000Z',passScore:80,retakeWaitDays:0,status:'draft'})});assert.equal(planWrite.status,201);const planPayload=await planWrite.json();assert.equal(planPayload.questionCount,3);
  const plans=await mf.dispatchFetch('http://localhost/api/sop/plans',{headers:ownerHeaders});assert.equal(plans.status,200);const plansPayload=await plans.json();assert.equal(plansPayload.plans.length,1);assert.equal(plansPayload.maxQuestions,38);assert.equal(plansPayload.questionBank.length,38);
 }finally{await mf.dispose()}
});
