import { useEffect, useState } from "react";

const format = (d: Date): string =>
  `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;

/**
 * Часы ЧЧ:ММ. Вместо setInterval — один setTimeout ровно до начала следующей
 * минуты: одно пробуждение в минуту, в покое это неотличимо от 0% CPU.
 */
export function useClock(): string {
  const [time, setTime] = useState(() => format(new Date()));

  useEffect(() => {
    let id: number;
    const schedule = () => {
      const now = new Date();
      setTime(format(now));
      const untilNextMinute = 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      id = window.setTimeout(schedule, untilNextMinute + 20);
    };
    schedule();
    return () => window.clearTimeout(id);
  }, []);

  return time;
}
