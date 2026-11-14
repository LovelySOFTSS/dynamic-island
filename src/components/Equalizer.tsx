import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { SPRING } from "../lib/constants";

const BAR_COUNT = 5;
/** Средние полоски чуть выше крайних — силуэт как у настоящего спектра. */
const WEIGHTS = [0.7, 0.95, 1, 0.85, 0.65] as const;
const REST: number[] = Array.from({ length: BAR_COUNT }, () => 0.22);
const BEAT_MS = 230;

interface EqualizerProps {
  playing: boolean;
  /** "r, g, b" */
  accent: string;
}

/**
 * Живой эквалайзер из 5 полосок. Пока трек играет, раз в такт задаются новые
 * целевые высоты, а пружина сама дорисовывает движение между ними.
 * На паузе интервал снимается и полоски оседают — никакой фоновой работы.
 */
export function Equalizer({ playing, accent }: EqualizerProps) {
  const [levels, setLevels] = useState<number[]>(REST);

  useEffect(() => {
    if (!playing) {
      setLevels(REST);
      return;
    }
    const beat = () => setLevels(WEIGHTS.map((w) => 0.25 + Math.random() * 0.75 * w));
    beat();
    const id = window.setInterval(beat, BEAT_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  return (
    <div className="flex h-4 items-end gap-[3px]" aria-hidden>
      {levels.map((level, i) => (
        <motion.span
          key={i}
          className="h-full w-[3px] origin-bottom rounded-full"
          style={{ backgroundColor: `rgb(${accent})` }}
          initial={false}
          animate={{ scaleY: level, opacity: playing ? 1 : 0.5 }}
          transition={SPRING.snappy}
        />
      ))}
    </div>
  );
}
