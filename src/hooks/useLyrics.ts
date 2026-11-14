import { useEffect, useState } from "react";
import { parseLrc } from "../lib/lrc";
import { api } from "../lib/tauri";
import type { LyricLine, MediaState } from "../types";

export type LyricsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "synced"; lines: LyricLine[] }
  | { status: "plain"; text: string }
  | { status: "instrumental" }
  | { status: "missing" }
  | { status: "error" };

/** Кэш на время работы приложения: один запрос на трек. */
const cache = new Map<string, LyricsState>();
const MAX_CACHE = 60;
/** Пауза перед запросом — чтобы не дёргать сервер при быстром перелистывании треков. */
const DEBOUNCE_MS = 450;

/**
 * Текст текущего трека. Хук живёт только во вкладке «Текст», поэтому сеть
 * не трогается, пока пользователь сам её не открыл.
 */
export function useLyrics(media: MediaState): LyricsState {
  const { trackKey, title, artist, durationMs, active } = media;
  const [state, setState] = useState<LyricsState>({ status: "idle" });

  useEffect(() => {
    if (!active || !title) {
      setState({ status: "idle" });
      return;
    }
    const cached = cache.get(trackKey);
    if (cached) {
      setState(cached);
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });
    const id = window.setTimeout(() => {
      api
        .fetchLyrics(title, artist, durationMs)
        .then((payload) => {
          let next: LyricsState = { status: "missing" };
          if (payload?.synced) {
            const lines = parseLrc(payload.synced);
            if (lines.length > 0) next = { status: "synced", lines };
          }
          if (next.status === "missing" && payload?.plain) {
            next = { status: "plain", text: payload.plain };
          }
          if (next.status === "missing" && payload?.instrumental) {
            next = { status: "instrumental" };
          }
          if (cache.size >= MAX_CACHE) cache.clear();
          cache.set(trackKey, next);
          if (!cancelled) setState(next);
        })
        .catch(() => {
          // Ошибку сети не кэшируем — при следующем открытии попробуем снова.
          if (!cancelled) setState({ status: "error" });
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
    // durationMs в зависимостях не нужен: трек определяется ключом.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey, active, title, artist]);

  return state;
}
