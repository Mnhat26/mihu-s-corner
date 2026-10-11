import { session } from '@/lib/auth';
import { config, db, failure, jsonBody, privateHeaders, sameOrigin, rateLimit } from '@/lib/server';
import { DomainError } from '@/lib/domain';
import { pushMissing, sendPush } from '@/lib/reminders';
import { testMessage } from '@/lib/reminder-text';
import { z } from 'zod';

export async function GET() {
  try {
    const s = await session();
    const firebase = { apiKey: config('FIREBASE_API_KEY'), projectId: config('FIREBASE_PROJECT_ID'), appId: config('FIREBASE_APP_ID'), messagingSenderId: config('FIREBASE_SENDER_ID'), authDomain: config('FIREBASE_AUTH_DOMAIN') };
    const missing = pushMissing();
    const device = await db().prepare('SELECT COUNT(*) AS n FROM devices WHERE uid=? AND session=?').bind(s.uid, s.device).first<{ n: number }>();
    return Response.json({ configured: missing.length === 0, missing, enabled: (device?.n || 0) > 0, firebase, vapid: config('FIREBASE_VAPID_KEY') }, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request); const s = await session(); await rateLimit('push:' + s.uid, 20);
    const body = await jsonBody(request); const action = z.enum(['enable', 'disable', 'test']).parse(body.action);
    if (action === 'disable') {
      await db().prepare('DELETE FROM devices WHERE uid=? AND session=?').bind(s.uid, s.device).run();
    } else if (action === 'enable') {
      const token = z.string().min(20).max(4096).parse(body.token);
      // One row per token; the same phone re-enabling replaces its older token for this session.
      await db().batch([
        db().prepare('DELETE FROM devices WHERE uid=? AND session=? AND token<>?').bind(s.uid, s.device, token),
        db().prepare('INSERT INTO devices(token,uid,session,updated) VALUES(?,?,?,?) ON CONFLICT(token) DO UPDATE SET uid=excluded.uid,session=excluded.session,updated=excluded.updated').bind(token, s.uid, s.device, Date.now()),
      ]);
    } else {
      if (pushMissing().length) throw new DomainError('Máy chủ chưa cấu hình xong phần gửi thông báo.', 503);
      const devices = await db().prepare('SELECT token FROM devices WHERE uid=? AND session=?').bind(s.uid, s.device).all<{ token: string }>();
      if (!devices.results.length) throw new DomainError('Thiết bị này chưa bật nhắc việc. Bấm “Bật nhắc việc” trước nhé.');
      let sent = 0;
      for (const d of devices.results) { try { if (await sendPush(d.token, { ...testMessage, url: '/', tag: 'mihu-test' }, 300) === 'sent') sent++; } catch { /* reported below */ } }
      if (!sent) throw new DomainError('Chưa gửi được thông báo thử. Hãy tắt rồi bật lại nhắc việc trên thiết bị này.', 502);
      return Response.json({ ok: true, sent }, { headers: privateHeaders });
    }
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (e) { return failure(e); }
}
