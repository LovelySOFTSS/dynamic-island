import { motion } from "framer-motion";
import { Music2, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { MediaController } from "../hooks/useMedia";
import { SPRING } from "../lib/constants";
import { formatTime, livePosition } from "../lib/format";
import type { MediaState } from "../types";

interface MediaPlayerProps {
  controller: MediaController;
  /** "r, g, b" — доминирующий цвет обложки. */
  accent: string;
}

export function MediaPlayer({ controller, accent }: MediaPlayerProps) {
  const { media, cover } = controller;

  if (!media.active) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 text-ink/45">
        <Music2 size={22} strokeWidth={1.8} />
        <span className="text-[12px] font-medium">Сейчас ничего не играет</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center gap-3">
        <div className="relative h-14 w-14 shrink-0">
          {/* Ambient glow: статичное размытие, анимируются только opacity и scale. */}
          <motion.div
            className="absolute -inset-1.5 rounded-[18px] blur-xl"
            style={{ backgroundColor: `rgb(${accent})` }}
            initial={false}
            animate={{ opacity: media.playing ? 0.55 : 0.2, scale: media.playing ? 1 : 0.85 }}
            transition={SPRING.gentle}
          />
          <motion.div
            className="relative h-full w-full overflow-hidden rounded-[13px] bg-ink/10"
            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }}
            initial={false}
            animate={{ scale: media.playing ? 1 : 0.92 }}
            transition={SPRING.content}
          >
            {cover ? (
              <img src={cover} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music2 size={22} className="text-ink/60" />
              </div>
            )}
          </motion.div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold leading-tight text-ink">
            {media.title || "Без названия"}
          </div>
          <div className="mt-0.5 truncate text-[12px] font-medium leading-tight text-ink/55">
            {media.artist || "Неизвестный исполнитель"}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <ControlButton label="Предыдущий трек" onClick={controller.prev}>
            <SkipBack size={16} fill="currentColor" />
          </ControlButton>
          <ControlButton label={media.playing ? "Пауза" : "Играть"} onClick={controller.toggle} large>
            {media.playing ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </ControlButton>
          <ControlButton label="Следующий трек" onClick={controller.next}>
            <SkipForward size={16} fill="currentColor" />
          </ControlButton>
        </div>
      </div>

      <ProgressBar media={media} accent={accent} onSeek={controller.seek} />
    </div>
  );
}

interface ControlButtonProps {
  label: string;
  onClick: () => void;
  large?: boolean;
  children: ReactNode;
}

function ControlButton({ label, onClick, large = false, children }: ControlButtonProps) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex items-center justify-center rounded-full text-ink/90 hover:bg-ink/10 ${
        large ? "h-9 w-9" : "h-8 w-8"
      }`}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.86 }}
      transition={SPRING.snappy}
    >
      {children}
    </motion.button>
  );
}

interface ProgressBarProps {
  media: MediaState;
  accent: string;
  onSeek: (positionMs: number) => void;
}

/**
 * Интерактивный прогресс. Тик раз в 500 мс живёт только пока плеер на экране
 * и трек играет; между тиками полоску доводит пружина (scaleX, без reflow).
 */
function ProgressBar({ media, accent, onSeek }: ProgressBarProps) {
  const [now, setNow] = useState(() => Date.now());
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (!media.playing) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [media.playing, media.updatedAtMs, media.trackKey]);

  const seekable = media.durationMs > 0;
  const position = livePosition(media, now);
  const ratio = scrub ?? (seekable ? position / media.durationMs : 0);

  const ratioFromEvent = (e: ReactPointerEvent<HTMLDivElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  return (
    <div className="flex items-center gap-2.5">
      <span className="w-9 text-[10px] font-medium text-ink/50">
        {formatTime(scrub !== null ? scrub * media.durationMs : position)}
      </span>
      <div
        className="group relative flex h-4 min-w-0 flex-1 items-center"
        onPointerDown={(e) => {
          if (!seekable) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setScrub(ratioFromEvent(e));
        }}
        onPointerMove={(e) => {
          if (scrub !== null) setScrub(ratioFromEvent(e));
        }}
        onPointerUp={(e) => {
          if (scrub === null) return;
          const target = ratioFromEvent(e);
          setScrub(null);
          onSeek(target * media.durationMs);
        }}
        onPointerCancel={() => setScrub(null)}
      >
        <motion.div
          className="h-1 w-full overflow-hidden rounded-full bg-ink/15"
          initial={false}
          animate={{ scaleY: scrub !== null ? 1.8 : 1 }}
          whileHover={{ scaleY: 1.8 }}
          transition={SPRING.snappy}
        >
          <motion.div
            className="h-full w-full origin-left rounded-full"
            style={{ backgroundColor: `rgb(${accent})` }}
            initial={false}
            animate={{ scaleX: ratio }}
            transition={scrub !== null ? SPRING.snappy : SPRING.gentle}
          />
        </motion.div>
      </div>
      <span className="w-9 text-right text-[10px] font-medium text-ink/50">
        {seekable ? formatTime(media.durationMs) : "--:--"}
      </span>
    </div>
  );
}
