import { Coffee, Music2, Timer } from "lucide-react";
import { formatTime } from "../lib/format";
import type { MediaState, Pomodoro } from "../types";
import { Equalizer } from "./Equalizer";

interface CompactViewProps {
  media: MediaState;
  cover: string | null;
  accent: string;
  pomodoro: Pomodoro;
}

/**
 * Live Activity: 240×36.
 * Музыка: слева мини-обложка, справа эквалайзер.
 * Таймер (если музыка не играет): слева иконка, справа обратный отсчёт.
 */
export function CompactView({ media, cover, accent, pomodoro }: CompactViewProps) {
  const showMedia = media.active && media.playing;

  if (showMedia) {
    return (
      <div className="flex h-full w-full items-center gap-2.5 pl-2 pr-3.5">
        <div className="h-6 w-6 shrink-0 overflow-hidden rounded-[7px] bg-white/10">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Music2 size={13} className="text-white/70" />
            </div>
          )}
        </div>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/85">
          {media.title || media.artist}
        </span>
        <Equalizer playing={media.playing} accent={accent} />
      </div>
    );
  }

  const PhaseIcon = pomodoro.phase === "focus" ? Timer : Coffee;
  return (
    <div className="flex h-full w-full items-center gap-2.5 pl-3 pr-3.5">
      <PhaseIcon size={15} className="shrink-0 text-orange-400" strokeWidth={2.4} />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/70">
        {pomodoro.phase === "focus" ? "Фокус" : "Перерыв"}
      </span>
      <span className="text-[13px] font-semibold text-orange-300">
        {formatTime(pomodoro.remainingMs)}
      </span>
    </div>
  );
}
