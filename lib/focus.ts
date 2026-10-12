import { addDays, daysBetween, type FocusEntry, type FocusMode } from './domain';

export const modeLabel: Record<FocusMode, string> = { focus: 'Tập trung', short: 'Nghỉ ngắn', long: 'Nghỉ dài' };
export const clock = (ms: number) => { const s = Math.ceil(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
export const minutesLabel = (m: number) => m >= 60 ? `${Math.floor(m / 60)} giờ${m % 60 ? ' ' + (m % 60) + ' phút' : ''}` : `${m} phút`;

const sumOn = (log: FocusEntry[], date: string) => log.filter(e => e.date === date).reduce((a, e) => a + e.minutes, 0);

export function focusToday(log: FocusEntry[], today: string) {
  const rows = log.filter(e => e.date === today);
  return { minutes: rows.reduce((a, e) => a + e.minutes, 0), sessions: rows.filter(e => e.full).length };
}

/** Minutes per day for the 7 days ending today (oldest first). */
export const weekBars = (log: FocusEntry[], today: string) => daysBetween(addDays(today, -6), today).map(date => ({ date, minutes: sumOn(log, date) }));

/** Days in a row with some focus, counting back from today (or yesterday if today is still empty). */
export function focusStreak(log: FocusEntry[], today: string) {
  const days = new Set(log.filter(e => e.minutes > 0).map(e => e.date));
  let d = days.has(today) ? today : addDays(today, -1); let n = 0;
  while (days.has(d) && n < 3660) { n++; d = addDays(d, -1); }
  return n;
}

/** Where the focus time went since `from` (inclusive), largest first. */
export function focusByTask(log: FocusEntry[], from: string) {
  const map = new Map<string, number>();
  for (const e of log) if (e.date >= from) { const k = e.label || 'Không gắn việc'; map.set(k, (map.get(k) || 0) + e.minutes); }
  return [...map].map(([label, minutes]) => ({ label, minutes })).sort((a, b) => b.minutes - a.minutes).slice(0, 5);
}
