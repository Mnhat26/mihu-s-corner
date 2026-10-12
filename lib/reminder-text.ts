import type { Occurrence } from './domain';

export const reminderOffsets = [0, 5, 15, 30, 60] as const;

/** Label used in forms and lists, e.g. "Đúng giờ", "Trước 15 phút", "Trước 1 giờ". */
export function reminderLabel(minutes: number) {
  if (minutes < 0) return 'Không nhắc';
  if (minutes === 0) return 'Đúng giờ';
  return minutes % 60 === 0 ? `Trước ${minutes / 60} giờ` : `Trước ${minutes} phút`;
}

function lead(minutes: number) {
  if (minutes === 0) return 'Đến giờ rồi Mihu ơi 🌻';
  if (minutes % 60 === 0) return `Còn ${minutes / 60} tiếng nữa nhé 🌻`;
  return `Còn ${minutes} phút nữa nhé 🌻`;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/**
 * Text shown on the lock screen. iOS shows the title in bold and about four lines of body,
 * so the most important words come first and everything stays on one short line.
 * With `detailed` off, the task title never leaves the server (lock screens are visible to others).
 */
export function reminderMessage(t: Pick<Occurrence, 'title' | 'time' | 'endTime' | 'reminder' | 'priority' | 'category'>, detailed: boolean) {
  const when = t.endTime ? `${t.time}–${t.endTime}` : t.time;
  const title = lead(t.reminder);
  if (!detailed) {
    const body = t.reminder === 0
      ? `Một việc trong lịch bắt đầu lúc ${t.time}. Chạm để xem nhé.`
      : `Mihu có một việc lúc ${t.time}. Chạm để xem nhé.`;
    return { title, body };
  }
  const extras = [when, t.priority === 'high' ? 'Quan trọng' : '', t.category && t.category !== 'Cá nhân' ? t.category : ''].filter(Boolean).join(' · ');
  return { title, body: clip(`${clip(t.title.trim(), 90)} · ${extras}`, 160) };
}

export const testMessage = { title: 'Mihu’s Corner 🌻', body: 'Thông báo thử đã đến. Lời nhắc của Mihu sẽ hiện như thế này.' };

/** Lock-screen text when a focus or break timer ends while the app is closed. */
export function focusEndMessage(a: { mode: 'focus' | 'short' | 'long'; minutes: number; label: string }, breakMinutes: number, detailed: boolean) {
  if (a.mode !== 'focus') return { title: 'Hết giờ nghỉ rồi ☕', body: 'Sẵn sàng cho phiên tập trung tiếp theo chưa Mihu? Chạm để bắt đầu nhé.' };
  const what = detailed && a.label ? ` cho “${clip(a.label.trim(), 60)}”` : '';
  return { title: 'Hết giờ tập trung rồi 🌻', body: `Mihu vừa tập trung ${a.minutes} phút${what}. Nghỉ ${breakMinutes} phút cho mắt và vai thư giãn nhé.` };
}
