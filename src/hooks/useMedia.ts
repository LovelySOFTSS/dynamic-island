import { useEffect, useState } from "react";
import { api, useTauriEvent } from "../lib/tauri";
import type { MediaState } from "../types";

const EMPTY: MediaState = {
  active: false,
  title: "",
  artist: "",
  playing: false,
  positionMs: 0,
  durationMs: 0,
  updatedAtMs: 0,
  trackKey: "",
};

export interface MediaController {
  media: MediaState;
  /** data-URL или https-ссылка на обложку. */
  cover: string | null;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (positionMs: number) => void;
}

/** Системный плеер. Полностью событийно: таймеров здесь нет. */
export function useMedia(): MediaController {
  const [media, setMedia] = useState<MediaState>(EMPTY);
  const [cover, setCover] = useState<string | null>(null);

  useTauriEvent<MediaState>("media-update", setMedia);
  useTauriEvent<string | null>("media-cover", setCover);

  // Страница могла загрузиться позже первого события — просим состояние заново.
  useEffect(() => {
    void api.media("sync");
  }, []);

  return {
    media,
    cover,
    toggle: () => void api.media("toggle"),
    next: () => void api.media("next"),
    prev: () => void api.media("prev"),
    seek: (positionMs) => {
      // Оптимистично двигаем позицию, не дожидаясь ответа плеера.
      setMedia((m) => ({ ...m, positionMs, updatedAtMs: Date.now() }));
      void api.media("seek", positionMs);
    },
  };
}
