import { motion } from "framer-motion";
import { MicVocal, Music2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { MediaController } from "../hooks/useMedia";
import { useLyrics } from "../hooks/useLyrics";
import { SPRING } from "../lib/constants";
import { livePosition } from "../lib/format";
import { activeLineIndex } from "../lib/lrc";
import type { LyricLine, MediaState } from "../types";

interface LyricsViewProps {
  controller: MediaController;
  accent: string;
}

/** Высота строки и видимой области (px). */
const ROW = 30;
const VIEWPORT = 102;
const CENTER = (VIEWPORT - ROW) / 2;
/** Строка подсвечивается чуть раньше, чем начинает звучать — так читается естественнее. */
const LEAD_MS = 180;

export function LyricsView({ controller, accent }: LyricsViewProps) {
  const { media } = controller;
  const lyrics = useLyrics(media);

  switch (lyrics.status) {
    case "synced":
      return (
        <SyncedLyrics
          lines={lyrics.lines}
          media={media}
          accent={accent}
          onSeek={controller.seek}
        />
      );
    case "plain":
      return (
        <div className="no-scrollbar lyrics-mask h-full overflow-y-auto whitespace-pre-line py-3 text-center text-[13px] font-medium leading-relaxed text-ink/80">
          {lyrics.text}
        </div>
      );
    case "loading":
      return <Placeholder icon={<MicVocal size={22} strokeWidth={1.8} />}>Ищу текст…</Placeholder>;
    case "instrumental":
      return (
        <Placeholder icon={<Music2 size={22} strokeWidth={1.8} />}>
          Инструментальная композиция
        </Placeholder>
      );
    case "missing":
      return (
        <Placeholder icon={<MicVocal size={22} strokeWidth={1.8} />}>
          Текст для этого трека не найден
        </Placeholder>
      );
    case "error":
      return (
        <Placeholder icon={<MicVocal size={22} strokeWidth={1.8} />}>
          Не удалось загрузить текст — проверьте интернет
        </Placeholder>
      );
    case "idle":
      return (
        <Placeholder icon={<Music2 size={22} strokeWidth={1.8} />}>
          Включите музыку, и здесь появится текст
        </Placeholder>
      );
  }
}

function Placeholder({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-ink/45">
      {icon}
      <span className="text-[12px] font-medium">{children}</span>
    </div>
  );
}

/**
 * Индекс текущей строки. Вместо постоянного тика ставится один таймер ровно
 * до начала следующей строки; на паузе таймеров нет вовсе.
 */
function useActiveLine(lines: readonly LyricLine[], media: MediaState): number {
  const [tick, setTick] = useState(0);
  const index = activeLineIndex(lines, livePosition(media, Date.now()) + LEAD_MS);

  useEffect(() => {
    if (!media.playing) return;
    const next = lines[index + 1];
    if (!next) return;
    const wait = next.timeMs - LEAD_MS - livePosition(media, Date.now());
    const id = window.setTimeout(() => setTick((n) => n + 1), Math.max(40, wait + 15));
    return () => window.clearTimeout(id);
    // tick в зависимостях: если таймер сработал чуть раньше смены строки, ставим его заново.
  }, [index, tick, lines, media]);

  return index;
}

interface SyncedLyricsProps {
  lines: LyricLine[];
  media: MediaState;
  accent: string;
  onSeek: (positionMs: number) => void;
}

function SyncedLyrics({ lines, media, accent, onSeek }: SyncedLyricsProps) {
  const active = useActiveLine(lines, media);
  const anchor = Math.max(active, 0);
  // В DOM держим только окно вокруг текущей строки.
  const from = Math.max(0, anchor - 3);
  const to = Math.min(lines.length, anchor + 5);

  return (
    <div className="lyrics-mask relative h-full overflow-hidden">
      <motion.div
        className="absolute inset-x-0 top-0"
        initial={false}
        animate={{ y: CENTER - anchor * ROW }}
        transition={SPRING.gentle}
      >
        {lines.slice(from, to).map((line, offset) => {
          const i = from + offset;
          const isActive = i === active;
          const distance = Math.abs(i - anchor);
          return (
            <motion.button
              key={`${i}-${line.timeMs}`}
              type="button"
              title="Перейти к этой строке"
              onClick={() => onSeek(line.timeMs)}
              className={`absolute inset-x-0 flex items-center justify-center truncate px-2 font-semibold ${
                line.text.length > 42 ? "text-[12px]" : "text-[14px]"
              }`}
              style={{
                top: i * ROW,
                height: ROW,
                color: isActive ? `rgb(${accent})` : "var(--color-ink)",
              }}
              initial={false}
              animate={{
                opacity: isActive ? 1 : distance === 1 ? 0.5 : 0.25,
                scale: isActive ? 1.06 : 0.94,
              }}
              transition={SPRING.gentle}
            >
              <span className="truncate">{line.text}</span>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}
