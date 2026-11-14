import type { LyricLine } from "../types";

const TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** Разбор LRC: "[01:23.45] строка" → { timeMs, text }. Строка может иметь несколько меток. */
export function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const times: number[] = [];
    for (const match of raw.matchAll(TAG)) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(match[3].padEnd(3, "0")) : 0;
      times.push(minutes * 60_000 + seconds * 1000 + fraction);
    }
    if (times.length === 0) continue;
    const text = raw.replace(TAG, "").trim();
    for (const timeMs of times) lines.push({ timeMs, text: text || "♪" });
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/** Индекс строки, которая звучит в момент positionMs (-1 — до первой строки). */
export function activeLineIndex(lines: readonly LyricLine[], positionMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= positionMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
