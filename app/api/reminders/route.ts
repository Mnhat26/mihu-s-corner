import { config,failure,privateHeaders } from '@/lib/server';
import { sendDueReminders } from '@/lib/reminders';
export async function POST(request:Request){const secret=config('CRON_SECRET');if(secret.length<32||request.headers.get('authorization')!=='Bearer '+secret)return Response.json({error:'Không có quyền'},{status:401,headers:privateHeaders});try{return Response.json(await sendDueReminders(),{headers:privateHeaders});}catch(e){return failure(e);}}
