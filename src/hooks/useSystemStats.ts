import { useEffect, useState } from "react";
import { api } from "../lib/tauri";
import type { SystemStats } from "../types";

const POLL_MS = 1500;

/**
 * CPU/RAM. Опрос идёт только пока `active` (вкладка «Инструменты» на экране).
 * Свернули островок — интервал снят, бэкенд ничего не считает.
 */
export function useSystemStats(active: boolean): SystemStats | null {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const load = () => {
      api
        .systemStats()
        .then((s) => {
          if (!cancelled) setStats(s);
        })
        .catch(() => undefined);
    };
    load();
    // Первый замер CPU всегда 0 (нужна разница двух замеров) — быстро берём второй.
    const warmup = window.setTimeout(load, 300);
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(warmup);
      window.clearInterval(id);
    };
  }, [active]);

  return stats;
}
