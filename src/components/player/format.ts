/** m:ss, or h:mm:ss for anything over an hour. Safe for NaN / negative / Infinity. */
export function formatSeconds(time: number): string {
  if (!isFinite(time) || time < 0) return '0:00';
  const h = Math.floor(time / 3600);
  const m = Math.floor((time % 3600) / 60);
  const s = Math.floor(time % 60);
  const ss = s < 10 ? `0${s}` : `${s}`;
  if (h > 0) return `${h}:${m < 10 ? '0' : ''}${m}:${ss}`;
  return `${m}:${ss}`;
}

/** Firestore Timestamp | Date | ISO string | number -> epoch ms (0 when missing). */
export function timestampToMs(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  const n = new Date(ts).getTime();
  return isFinite(n) ? n : 0;
}

/** Natural sort ("Episode 2" before "Episode 10"). The old code compared a file to itself, so it never sorted. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}
