import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { api } from './client';

export type PushStatus = { configured: boolean; missing: string[]; enabled: boolean; firebase: Record<string, string>; vapid: string };
const FLAG = 'mihu-push';
const remember = (on: boolean) => { try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG); } catch { /* private mode */ } };
const remembered = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };

/** What this browser can do, without asking anything. */
export function pushEnvironment() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const api = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  return { ios, standalone, supported: api, permission: api ? Notification.permission : 'unsupported' as NotificationPermission | 'unsupported', needsHomeScreen: ios && !standalone };
}

/**
 * Must be called synchronously from the tap handler: iOS only shows the permission prompt
 * while the tap is still "fresh", so it is requested before any network call.
 */
export function askPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return Promise.resolve('denied');
  return Notification.requestPermission();
}

async function deviceToken(status: PushStatus) {
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const app = getApps()[0] || initializeApp(status.firebase);
  return getToken(getMessaging(app), { vapidKey: status.vapid, serviceWorkerRegistration: registration });
}

export async function enablePush(permission: Promise<NotificationPermission>) {
  const env = pushEnvironment();
  if (env.needsHomeScreen) throw new Error('Trên iPhone, hãy thêm Mihu’s Corner vào Màn hình chính rồi mở từ biểu tượng đó để bật nhắc việc.');
  if (!env.supported || !await isSupported()) throw new Error('Trình duyệt này chưa hỗ trợ thông báo. Trên iPhone cần iOS 16.4 trở lên.');
  if (await permission !== 'granted') throw new Error('Thông báo đang bị tắt. Vào Cài đặt → Thông báo → Mihu’s Corner để cho phép, rồi bấm lại.');
  const status = await api<PushStatus>('/api/push');
  if (!status.configured) throw new Error('Máy chủ chưa cấu hình xong phần gửi thông báo.');
  const token = await deviceToken(status);
  if (!token) throw new Error('Chưa nhận được mã thiết bị. Mihu thử lại sau ít giây nhé.');
  await api('/api/push', { action: 'enable', token });
  remember(true);
}

export async function disablePush() {
  await api('/api/push', { action: 'disable' });
  remember(false);
  try { const app = getApps()[0]; if (app) await deleteToken(getMessaging(app)); } catch { /* token already gone */ }
}

/**
 * On app start: device tokens can change (iOS updates, storage cleanup). If this device had
 * reminders on and permission is still granted, register the current token again quietly.
 */
export async function refreshPush() {
  const env = pushEnvironment();
  if (!remembered() || env.needsHomeScreen || env.permission !== 'granted' || !await isSupported()) return;
  const status = await api<PushStatus>('/api/push');
  if (!status.configured) return;
  const token = await deviceToken(status);
  if (token) await api('/api/push', { action: 'enable', token });
}

export const sendTestPush = () => api<{ sent: number }>('/api/push', { action: 'test' });

/** On logout: this browser stops being registered, so the next person logging in here gets nothing unasked. */
export async function forgetDevice() {
  const was = remembered(); remember(false);
  try {
    if (!was || !('Notification' in window) || Notification.permission !== 'granted' || !await isSupported()) return;
    const status = await api<PushStatus>('/api/push'); if (!status.configured) return;
    await deleteToken(getMessaging(getApps()[0] || initializeApp(status.firebase)));
  } catch { /* nothing registered */ }
}
