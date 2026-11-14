export type Mode = "idle" | "compact" | "expanded" | "notification";
export type Tab = "media" | "lyrics" | "shelf" | "tools" | "connect" | "look";

/** Состояние системного плеера (событие `media-update`). */
export interface MediaState {
  active: boolean;
  title: string;
  artist: string;
  playing: boolean;
  /** Позиция на момент `updatedAtMs`. */
  positionMs: number;
  durationMs: number;
  /** Unix-время (мс), к которому относится `positionMs`. */
  updatedAtMs: number;
  /** Меняется при смене трека. */
  trackKey: string;
}

export type MediaAction = "toggle" | "next" | "prev" | "seek" | "sync";

export interface SystemStats {
  /** 0..100 */
  cpu: number;
  /** Байты. */
  memUsed: number;
  memTotal: number;
}

export interface ShelfFile {
  path: string;
  name: string;
  size: number;
  isDir: boolean;
  isImage: boolean;
}

export type NoticeKind = "volume" | "bluetooth" | "wifi" | "timer";

/** Содержимое всплывающей пилюли. */
export interface Notice {
  kind: NoticeKind;
  title: string;
  subtitle?: string | null;
  /** 0..100 — для громкости. */
  value?: number | null;
  muted?: boolean | null;
}

export type PomodoroPhase = "focus" | "break";

export interface Pomodoro {
  phase: PomodoroPhase;
  running: boolean;
  remainingMs: number;
  totalMs: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
}

/** Прямоугольник капсулы в логических px относительно окна. */
export interface HitRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Состояние сети (событие `network-update`). */
export interface NetworkState {
  connected: boolean;
  wifi: boolean;
  /** Имя сети; для Wi-Fi — SSID. */
  name: string;
  /** Уровень сигнала 0..5. */
  bars: number;
}

/** Состояние радиомодулей. null — модуля нет. */
export interface RadioStates {
  wifi: boolean | null;
  bluetooth: boolean | null;
}

export type RadioKind = "wifi" | "bluetooth";

export interface ConnectSnapshot {
  network: NetworkState;
  bluetoothDevices: string[];
}

/** Ответ команды `fetch_lyrics`. */
export interface LyricsPayload {
  /** Текст с таймкодами в формате LRC. */
  synced: string | null;
  plain: string | null;
  instrumental: boolean;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}
