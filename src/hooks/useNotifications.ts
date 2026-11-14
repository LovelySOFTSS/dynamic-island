import { useCallback, useEffect, useRef, useState } from "react";
import type { Notice } from "../types";

const VISIBLE_MS = 2600;

export interface Notifications {
  notice: Notice | null;
  /** Показать пилюлю. Новое событие заменяет текущее и перезапускает таймер. */
  push: (notice: Notice) => void;
  dismiss: () => void;
}

export function useNotifications(): Notifications {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setNotice(null);
  }, []);

  const push = useCallback((next: Notice) => {
    window.clearTimeout(timer.current);
    setNotice(next);
    timer.current = window.setTimeout(() => setNotice(null), VISIBLE_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { notice, push, dismiss };
}
