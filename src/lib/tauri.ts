import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import type {
  ConnectSnapshot,
  HitRect,
  LyricsPayload,
  MediaAction,
  RadioKind,
  RadioStates,
  ShelfFile,
  SystemStats,
} from "../types";

/** Типизированные обёртки над командами Rust. */
export const api = {
  setHitRegion: (region: HitRect) => invoke<void>("set_hit_region", { region }),
  cycleMonitor: () => invoke<void>("cycle_monitor"),
  media: (action: MediaAction, positionMs?: number) =>
    invoke<void>("media_command", { action, positionMs: positionMs ?? null }),
  systemStats: () => invoke<SystemStats>("get_system_stats"),
  fileInfo: (paths: string[]) => invoke<ShelfFile[]>("file_info", { paths }),
  dragIconPath: () => invoke<string>("drag_icon_path"),
  connectivity: () => invoke<ConnectSnapshot>("connectivity_snapshot"),
  radioStates: () => invoke<RadioStates>("radio_states"),
  setRadio: (kind: RadioKind, on: boolean) => invoke<RadioStates>("set_radio", { kind, on }),
  fetchLyrics: (title: string, artist: string, durationMs: number) =>
    invoke<LyricsPayload | null>("fetch_lyrics", { title, artist, durationMs }),
};

/**
 * Подписка на событие бэкенда. Обработчик можно менять между рендерами —
 * подписка при этом не пересоздаётся.
 */
export function useTauriEvent<T>(event: string, handler: (payload: T) => void): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const callback: EventCallback<T> = (e) => ref.current(e.payload);

    void listen<T>(event, callback).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [event]);
}
