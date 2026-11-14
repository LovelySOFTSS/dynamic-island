import { useCallback, useEffect, useRef, useState } from "react";
import type { Pomodoro, PomodoroPhase } from "../types";

const DURATION_MS: Record<PomodoroPhase, number> = {
  focus: 25 * 60_000,
  break: 5 * 60_000,
};

/**
 * Таймер Помодоро. Тик раз в секунду существует только пока таймер запущен;
 * остаток считается от абсолютного времени окончания, поэтому не «плывёт».
 */
export function usePomodoro(onFinish: (finished: PomodoroPhase) => void): Pomodoro {
  const [phase, setPhase] = useState<PomodoroPhase>("focus");
  const [running, setRunning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(DURATION_MS.focus);
  const endsAt = useRef(0);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const left = endsAt.current - Date.now();
      if (left > 0) {
        setRemainingMs(left);
        return;
      }
      const next: PomodoroPhase = phase === "focus" ? "break" : "focus";
      setRunning(false);
      setPhase(next);
      setRemainingMs(DURATION_MS[next]);
      onFinishRef.current(phase);
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [running, phase]);

  const start = useCallback(() => {
    setRemainingMs((left) => {
      endsAt.current = Date.now() + left;
      return left;
    });
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    setRemainingMs(Math.max(0, endsAt.current - Date.now()));
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setPhase("focus");
    setRemainingMs(DURATION_MS.focus);
  }, []);

  return { phase, running, remainingMs, totalMs: DURATION_MS[phase], start, pause, reset };
}
