import { z } from 'zod';

export const identities = [{ name: 'Mnhat', phone: '0966772337' }, { name: 'Mihu', phone: '0987842746' }] as const;
export const defaultCategories = ['Ăn uống', 'Di chuyển', 'Giải trí', 'Mua sắm', 'Khác'];
export const dateSchema = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s + 'T00:00:00Z'); return !isNaN(+d) && d.toISOString().slice(0,10) === s; }, 'Ngày không hợp lệ');
export const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const title = z.string().trim().min(1, 'Hãy nhập tên').max(200);
const note = z.string().max(4000).default('');
const money = z.number().int().min(0).max(1_000_000_000_000);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal('')).default('');
export const taskSchema = z.object({ id, title, date: dateSchema, time, endTime: time, note,
  category: z.string().max(60).default('Cá nhân'), priority: z.enum(['low','medium','high']).default('medium'),
  repeat: z.enum(['none','daily','weekly','monthly']).default('none'), weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  until: dateSchema.or(z.literal('')).default(''), reminder: z.union([z.literal(-1),z.literal(0),z.literal(5),z.literal(15),z.literal(30)]).default(-1),
}).refine(t => !t.until || t.until >= t.date, 'Ngày kết thúc phải sau ngày bắt đầu')
  .refine(t => !t.endTime || (!!t.time && t.endTime > t.time), 'Giờ kết thúc phải sau giờ bắt đầu')
  .refine(t => t.repeat !== 'weekly' || t.weekdays.length > 0, 'Chọn ít nhất một ngày lặp')
  .refine(t => t.reminder === -1 || !!t.time, 'Cần có giờ để nhắc việc');
export type Task = z.infer<typeof taskSchema>;
export type Occurrence = Task & { occurrenceDate: string; key: string; done: boolean };
export type Entry = { id: string; date: string; kind: 'expense'|'addition'; amount: number; category: string; note: string };
export type Goal = { id: string; title: string; note: string; period: 'week'|'month'; start: string; end: string; milestones: {id:string;title:string;done:boolean}[]; taskIds: string[]; done: boolean };
export type Settings = { quote: string; accent: 'pink'|'yellow'; theme: 'light'|'dark'|'system'; hidden: string[]; avatar: string; cover: string; photos: string[] };
export type State = { tasks: Task[]; overrides: Record<string, {done?:boolean;deleted?:boolean;patch?:Task}>; entries: Entry[];
  budgets: Record<string,number>; rollovers: Record<string,{accepted:boolean;amount:number}>; categories: string[];
  goals: Goal[]; journals: Record<string,{mood:string;text:string}>; settings: Settings };
export function emptyState(): State { return { tasks:[], overrides:{}, entries:[], budgets:{}, rollovers:{}, categories:[...defaultCategories], goals:[], journals:{},
  settings:{quote:'Chậm một chút, Mihu vẫn đang tiến lên.',accent:'pink',theme:'light',hidden:[],avatar:'',cover:'',photos:[]} }; }
export const day = (d:Date) => d.toISOString().slice(0,10);
export const addDays = (s:string,n:number) => day(new Date(Date.parse(s+'T00:00:00Z')+n*86400000));
export const weekday = (s:string) => new Date(s+'T00:00:00Z').getUTCDay();
export const weekStart = (s:string) => addDays(s,-((weekday(s)+6)%7));
export function todayVN() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function shiftMonth(month:string,n:number) { const [y,m]=month.split('-').map(Number);return day(new Date(Date.UTC(y,m-1+n,1))).slice(0,7); }
export function daysBetween(start:string,end:string) { const days:string[]=[]; for(let d=start;d<=end && days.length<370;d=addDays(d,1)) days.push(d);return days; }
export function occurs(t:Task,date:string) { if(date<t.date || (t.until && date>t.until))return false; if(t.repeat==='none')return date===t.date;
  if(t.repeat==='daily')return true; if(t.repeat==='weekly')return t.weekdays.includes(weekday(date));return date.slice(8)===t.date.slice(8); }
export function tasksOn(state:State,date:string):Occurrence[] { return state.tasks.filter(t=>occurs(t,date)).flatMap(t=>{const key=t.id+'_'+date;const o=state.overrides[key];return o?.deleted?[]:[{...t,...o?.patch,id:t.id,occurrenceDate:date,key,done:!!o?.done}];}).sort((a,b)=>(a.time||'99').localeCompare(b.time||'99')); }
export function completion(tasks:Occurrence[],date:string,today=todayVN()) { const done=tasks.filter(t=>t.done).length;const percent=tasks.length?Math.floor(done/tasks.length*100):null;
  const color=date>today||percent===null?'neutral':percent===100?'green':percent>=80?'yellow':percent>=50?'orange':'pink';
  const message=percent===null?'Một ngày còn trống, Mihu cứ thong thả nhé.':percent===100?'Mihu giỏi lắm! Tất cả việc hôm nay đã hoàn thành.':percent>=80?'Mihu đã làm rất tốt! Lần sau cố gắng thêm một chút nhé.':percent>=50?'Mihu đang tiến lên từng chút. Cứ tiếp tục nhé!':'Một chút tiến bộ cũng đáng quý. Ngày mai Mihu thử lại nhé.';
  return {done,total:tasks.length,percent,color,message}; }
export function finances(s:State,month:string) { const rows=s.entries.filter(e=>e.date.startsWith(month));const initial=s.budgets[month]??null;const added=rows.filter(e=>e.kind==='addition').reduce((a,e)=>a+e.amount,0);const spent=rows.filter(e=>e.kind==='expense').reduce((a,e)=>a+e.amount,0);const rollover=s.rollovers[month]?.accepted?s.rollovers[month].amount:0;const total=(initial??0)+added+rollover;
  return {initial,added,spent,rollover,total,remaining:total-spent,configured:initial!==null||added>0||rollover>0,percent:total>0?Math.round(spent/total*100):spent>0?100:0}; }
export function goalProgress(s:State,g:Goal) { if(g.taskIds.length){const ts=daysBetween(g.start,g.end).flatMap(d=>tasksOn(s,d)).filter(t=>g.taskIds.includes(t.id));return ts.length?Math.floor(ts.filter(t=>t.done).length/ts.length*100):0;}return g.milestones.length?Math.floor(g.milestones.filter(m=>m.done).length/g.milestones.length*100):g.done?100:0; }
const goalSchema=z.object({id,title,note,period:z.enum(['week','month']),start:dateSchema,end:dateSchema,milestones:z.array(z.object({id,title,done:z.boolean()})).max(50),taskIds:z.array(id).max(500),done:z.boolean()}).refine(g=>g.end>=g.start && daysBetween(g.start,g.end).length<370,'Khoảng thời gian không hợp lệ');
const entrySchema=z.object({id,date:dateSchema,kind:z.enum(['expense','addition']),amount:money.refine(n=>n>0,'Số tiền phải lớn hơn 0'),category:z.string().trim().max(60),note});
const settingsSchema=z.object({quote:z.string().max(300),accent:z.enum(['pink','yellow']),theme:z.enum(['light','dark','system']),hidden:z.array(z.string().refine(s=>['tasks','finance','goals','journal','photos','week'].includes(s))).max(6),avatar:z.string().max(100),cover:z.string().max(100),photos:z.array(z.string().max(100)).max(6)});
export const commandSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('task.save'),task:taskSchema,scope:z.enum(['one','future','all']).default('all'),on:dateSchema.optional()}),
 z.object({type:z.literal('task.delete'),id,on:dateSchema,scope:z.enum(['one','future'])}),
 z.object({type:z.literal('task.toggle'),id,on:dateSchema,done:z.boolean()}),
 z.object({type:z.literal('entry.save'),entry:entrySchema,confirmRollover:z.boolean().optional()}),
 z.object({type:z.literal('entry.delete'),id,confirmRollover:z.boolean().optional()}),
 z.object({type:z.literal('budget.set'),month:monthSchema,amount:money,confirmRollover:z.boolean().optional()}),
 z.object({type:z.literal('rollover.set'),month:monthSchema,accepted:z.boolean(),confirmRollover:z.boolean().optional()}),
 z.object({type:z.literal('categories.set'),categories:z.array(z.string().trim().min(1).max(60)).min(1).max(30)}),
 z.object({type:z.literal('goal.save'),goal:goalSchema}),z.object({type:z.literal('goal.delete'),id}),
 z.object({type:z.literal('journal.save'),date:dateSchema,mood:z.enum(['Vui','Ổn','Bình thường','Mệt','Buồn']),text:z.string().max(10000)}),
 z.object({type:z.literal('journal.delete'),date:dateSchema}),z.object({type:z.literal('settings.save'),settings:settingsSchema}),
]);
export type Command=z.infer<typeof commandSchema>;
export class DomainError extends Error { constructor(message:string,public status=400,public details?:unknown){super(message);} }
function requireTask(s:State,id:string,on:string) {const t=s.tasks.find(t=>t.id===id);if(!t||!occurs(t,on))throw new DomainError('Việc này đã thay đổi. Hãy tải lại.',409);return t;}
export function applyCommand(current:State,raw:unknown,today=todayVN()):State { const c=commandSchema.parse(raw);const s=structuredClone(current);
 switch(c.type){
 case 'task.save': { const old=s.tasks.find(t=>t.id===c.task.id); if(old && c.scope==='one'){if(!c.on)throw new DomainError('Thiếu ngày');requireTask(s,old.id,c.on);s.overrides[old.id+'_'+c.on]={...s.overrides[old.id+'_'+c.on],patch:{...c.task,date:old.date,repeat:old.repeat,until:old.until}};}
 else if(old && c.scope==='future'){if(!c.on)throw new DomainError('Thiếu ngày');requireTask(s,old.id,c.on);const newId=crypto.randomUUID();old.until=addDays(c.on,-1);s.tasks.push({...c.task,id:newId,date:c.on});for(const [k,v]of Object.entries(s.overrides)){if(k.startsWith(old.id+'_')&&k.slice(old.id.length+1)>=c.on){s.overrides[newId+k.slice(old.id.length)]=v;delete s.overrides[k];}}for(const g of s.goals)if(g.taskIds.includes(old.id))g.taskIds.push(newId);}
 else {if(old)throw new DomainError('Hãy chọn sửa một lần hoặc từ ngày này trở đi');s.tasks.push(c.task);}break;}
 case 'task.delete': {const t=requireTask(s,c.id,c.on);if(c.scope==='one')s.overrides[c.id+'_'+c.on]={deleted:true};else t.until=addDays(c.on,-1);break;}
 case 'task.toggle': {requireTask(s,c.id,c.on);if(c.on>today)throw new DomainError('Mihu chỉ đánh dấu các ngày đã đến nhé.');const key=c.id+'_'+c.on;if(s.overrides[key]?.deleted)throw new DomainError('Việc này đã được xóa');s.overrides[key]={...s.overrides[key],done:c.done};break;}
 case 'entry.save': {if(c.entry.kind==='expense'&&!s.categories.includes(c.entry.category))throw new DomainError('Hãy chọn danh mục');s.entries=s.entries.filter(e=>e.id!==c.entry.id);s.entries.push(c.entry);break;}
 case 'entry.delete': s.entries=s.entries.filter(e=>e.id!==c.id);break;
 case 'budget.set': s.budgets[c.month]=c.amount;break;
 case 'rollover.set': {if(c.month>today.slice(0,7))throw new DomainError('Hãy chờ đến tháng tiếp theo để kết chuyển.');s.rollovers[c.month]={accepted:c.accepted,amount:c.accepted?Math.max(0,finances(s,shiftMonth(c.month,-1)).remaining):0};break;}
 case 'categories.set': {s.categories=[...new Set(c.categories)];for(const e of s.entries)if(e.kind==='expense'&&!s.categories.includes(e.category))throw new DomainError('Danh mục đã có khoản chi cần được giữ lại hoặc đổi khoản chi trước.');break;}
 case 'goal.save': {if(c.goal.taskIds.some(id=>!s.tasks.some(t=>t.id===id)))throw new DomainError('Một việc được liên kết không còn tồn tại');s.goals=s.goals.filter(g=>g.id!==c.goal.id);s.goals.push(c.goal);break;}
 case 'goal.delete': s.goals=s.goals.filter(g=>g.id!==c.id);break;
 case 'journal.save': if(c.date>today)throw new DomainError('Chưa thể viết nhật ký cho ngày tương lai');s.journals[c.date]={mood:c.mood,text:c.text};break;
 case 'journal.delete': delete s.journals[c.date];break;
 case 'settings.save': s.settings=c.settings;break;
 }
 for(const month of new Set([...s.entries.map(e=>e.date.slice(0,7)),...Object.keys(s.budgets)])){const f=finances(s,month);if(![f.total,f.added,f.spent,f.remaining].every(Number.isSafeInteger))throw new DomainError('Tổng tiền vượt giới hạn tính toán chính xác.');}
 const changed:{month:string;before:number;after:number}[]=[];
 for(const month of Object.keys(s.rollovers).sort()){const r=s.rollovers[month];if(!r.accepted)continue;const amount=Math.max(0,finances(s,shiftMonth(month,-1)).remaining);if(amount!==r.amount){changed.push({month,before:r.amount,after:amount});r.amount=amount;}}
 if(changed.length&&(!('confirmRollover'in c)||!c.confirmRollover))throw new DomainError('Thay đổi này sẽ cập nhật số dư đã chuyển sang tháng sau. Mihu có muốn tiếp tục?',409,{rollovers:changed});
 if(JSON.stringify(s).length>1_500_000)throw new DomainError('Dữ liệu đã đạt giới hạn lưu trữ cho tài khoản.');
 return s;
}
