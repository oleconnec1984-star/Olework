export const employeeMenus=['dashboard','tasks','employees','calendar','reports','sop'] as const;
export type EmployeeMenu=typeof employeeMenus[number];
export const sopTabPermissions=['sop_library','sop_quiz','sop_results','sop_plans','sop_manage'] as const;
export type SopTabPermission=typeof sopTabPermissions[number];
export const employeePermissions=[...employeeMenus,...sopTabPermissions] as const;
export type EmployeePermission=typeof employeePermissions[number];
export type AccessActor={kind:'owner';ownerId:string;employeeId:null;name:string;permissions:'all';visibleDepartments:'all'}|{kind:'employee';ownerId:string;employeeId:string;name:string;permissions:EmployeePermission[];visibleDepartments:string[]};
const enc=new TextEncoder();
const bytes=(n:number)=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return a};
const b64=(a:Uint8Array)=>btoa(String.fromCharCode(...a));
const unb64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const digest=async(value:string)=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value))));
export const normalizeLogin=(value:string)=>value.trim().toLowerCase();
export function validLogin(value:string){return /^[a-z0-9][a-z0-9._-]{3,31}$/.test(value)}
export function normalizeEmployeePermissions(value:unknown):EmployeePermission[]{
 const raw=Array.isArray(value)?value:[];
 let permissions=[...new Set(raw.filter((item):item is EmployeePermission=>typeof item==='string'&&employeePermissions.includes(item as EmployeePermission)))];
 if(!permissions.includes('sop'))return permissions.filter(permission=>!sopTabPermissions.includes(permission as SopTabPermission));
 if(!permissions.some(permission=>sopTabPermissions.includes(permission as SopTabPermission)))permissions=[...permissions,'sop_library','sop_quiz','sop_results'];
 return permissions;
}
export function hasSopPermission(access:AccessActor,permission:SopTabPermission){return access.kind==='owner'||access.permissions.includes('sop')&&access.permissions.includes(permission)}
export const passwordHashIterations=100000;
export async function hashPassword(password:string,salt=b64(bytes(16))){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const raw=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unb64(salt),iterations:passwordHashIterations},key,256);return {salt,hash:b64(new Uint8Array(raw))}}
export async function verifyPassword(password:string,salt:string,expected:string){const actual=(await hashPassword(password,salt)).hash;if(actual.length!==expected.length)return false;let diff=0;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);return diff===0}
function cookie(request:Request,name:string){return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||''}
export async function resolveActor(request:Request,db:D1Database):Promise<AccessActor|null>{
 const owner=request.headers.get('oai-authenticated-user-id');if(owner)return {kind:'owner',ownerId:owner,employeeId:null,name:request.headers.get('oai-authenticated-user-email')||'ผู้ดูแล',permissions:'all',visibleDepartments:'all'};
 const token=cookie(request,'ole_employee_session');if(!token)return null;const tokenHash=await digest(token),now=new Date().toISOString();
 const row=await db.prepare(`SELECT s.owner_id ownerId,s.employee_id employeeId,a.permissions,a.visible_departments visibleDepartments,a.active,w.state FROM ole_employee_sessions s JOIN ole_employee_accounts a ON a.owner_id=s.owner_id AND a.employee_id=s.employee_id JOIN ole_workspaces w ON w.owner_id=s.owner_id WHERE s.token_hash=? AND s.expires_at>?`).bind(tokenHash,now).first<{ownerId:string;employeeId:string;permissions:string;visibleDepartments:string;active:number;state:string}>();
 if(!row||!row.active)return null;const state=JSON.parse(row.state) as {departments?:string[];employees:{id:string;name:string;active:boolean;department:string}[]},employee=state.employees.find(e=>e.id===row.employeeId&&e.active);if(!employee)return null;
 const heartbeatCutoff=new Date(Date.now()-30000).toISOString();
 await db.prepare('UPDATE ole_employee_sessions SET last_seen_at=? WHERE token_hash=? AND (last_seen_at IS NULL OR last_seen_at<?)').bind(now,tokenHash,heartbeatCutoff).run();
 let permissions:EmployeePermission[]=[];try{permissions=normalizeEmployeePermissions(JSON.parse(row.permissions))}catch{}
 let visibleDepartments:string[]=[];try{const raw=JSON.parse(row.visibleDepartments);if(Array.isArray(raw))visibleDepartments=[...new Set(raw.filter((x):x is string=>typeof x==='string'&&(state.departments||[]).includes(x)))]}catch{}
 return {kind:'employee',ownerId:row.ownerId,employeeId:row.employeeId,name:employee.name,permissions,visibleDepartments};
}
export function canViewTask(access:AccessActor,state:{employees:{id:string;department:string}[]},task:{assigneeId:string;reviewerId:string}){if(access.kind==='owner')return true;if(task.assigneeId===access.employeeId||task.reviewerId===access.employeeId)return true;const department=state.employees.find(employee=>employee.id===task.assigneeId)?.department;return !!department&&access.visibleDepartments.includes(department)}
export async function createSession(db:D1Database,ownerId:string,employeeId:string,request:Request){const token=b64(bytes(32)),tokenHash=await digest(token),now=new Date(),expires=new Date(now.getTime()+7*86400000);await db.prepare('DELETE FROM ole_employee_sessions WHERE expires_at <= ?').bind(now.toISOString()).run();await db.prepare('INSERT INTO ole_employee_sessions (token_hash,owner_id,employee_id,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)').bind(tokenHash,ownerId,employeeId,expires.toISOString(),now.toISOString(),now.toISOString()).run();const secure=new URL(request.url).protocol==='https:'?'; Secure':'';return `ole_employee_session=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=604800`}
export async function destroySession(db:D1Database,request:Request){const token=cookie(request,'ole_employee_session');if(token)await db.prepare('DELETE FROM ole_employee_sessions WHERE token_hash=?').bind(await digest(token)).run()}
export const clearSessionCookie=(request:Request)=>`ole_employee_session=; HttpOnly${new URL(request.url).protocol==='https:'?'; Secure':''}; SameSite=Lax; Path=/; Max-Age=0`;
export function sameOrigin(request:Request){
 const expected=new URL(request.url).origin,origin=request.headers.get('origin');
 if(origin)return origin===expected;
 // Some Android/LINE file pickers omit Origin on multipart requests. Fetch
 // Metadata still proves that the request came from this Site.
 return request.headers.get('sec-fetch-site')==='same-origin';
}
