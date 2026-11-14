import { motion } from "framer-motion";
import { Bluetooth, Timer, Volume1, Volume2, VolumeX, Wifi, type LucideIcon } from "lucide-react";
import { SPRING } from "../lib/constants";
import type { Notice } from "../types";

interface NotificationPillProps {
  notice: Notice;
}

function iconFor(notice: Notice): { Icon: LucideIcon; color: string } {
  switch (notice.kind) {
    case "bluetooth":
      return { Icon: Bluetooth, color: "text-sky-400" };
    case "wifi":
      return { Icon: Wifi, color: "text-sky-400" };
    case "timer":
      return { Icon: Timer, color: "text-orange-400" };
    case "volume": {
      const value = notice.value ?? 0;
      if (notice.muted || value === 0) return { Icon: VolumeX, color: "text-ink/60" };
      return { Icon: value < 50 ? Volume1 : Volume2, color: "text-ink" };
    }
  }
}

/** Всплывающее событие: 290×44. */
export function NotificationPill({ notice }: NotificationPillProps) {
  const { Icon, color } = iconFor(notice);
  const isVolume = notice.kind === "volume";
  const level = notice.muted ? 0 : Math.max(0, Math.min(100, notice.value ?? 0));

  return (
    <div className="flex h-full w-full items-center gap-3 pl-3.5 pr-4">
      <Icon size={18} className={`shrink-0 ${color}`} strokeWidth={2.2} />
      {isVolume ? (
        <>
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/15">
            <motion.div
              className="h-full w-full origin-left rounded-full bg-ink"
              initial={false}
              animate={{ scaleX: level / 100 }}
              transition={SPRING.snappy}
            />
          </div>
          <span className="w-7 text-right text-[12px] font-semibold text-ink/80">
            {Math.round(level)}
          </span>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink/95">
            {notice.title}
          </span>
          {notice.subtitle ? (
            <span className="shrink-0 text-[12px] font-medium text-ink/55">{notice.subtitle}</span>
          ) : null}
        </>
      )}
    </div>
  );
}
