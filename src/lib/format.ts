import type { MediaState } from "../types";

/** 83000 → "1:23" */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

/** Текущая позиция трека: бэкенд шлёт позицию с меткой времени, дальше считаем сами. */
export function livePosition(media: MediaState, now: number): number {
  const elapsed = media.playing ? now - media.updatedAtMs : 0;
  const pos = media.positionMs + Math.max(0, elapsed);
  return media.durationMs > 0 ? Math.min(pos, media.durationMs) : pos;
}
