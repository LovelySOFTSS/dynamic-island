import { motion } from "framer-motion";
import { Coffee, Cpu, MemoryStick, Moon, Pause, Play, RotateCcw, Timer, type LucideIcon } from "lucide-react";
import { useSystemStats } from "../hooks/useSystemStats";
import { SPRING } from "../lib/constants";
import { formatTime } from "../lib/format";
import type { Pomodoro } from "../types";

interface SystemToolsProps {
  pomodoro: Pomodoro;
  dnd: boolean;
  onToggleDnd: () => void;
}

const GIB = 1024 ** 3;

export function SystemTools({ pomodoro, dnd, onToggleDnd }: SystemToolsProps) {
  // Компонент смонтирован только пока вкладка на экране — значит, и опрос идёт только тогда.
  const stats = useSystemStats(true);
  const cpu = stats?.cpu ?? 0;
  const memRatio = stats && stats.memTotal > 0 ? stats.memUsed / stats.memTotal : 0;

  return (
    <div className="grid h-full grid-cols-2 gap-2.5">
      <div className="flex min-w-0 flex-col justify-between">
        <Meter Icon={Cpu} label="CPU" value={`${Math.round(cpu)}%`} ratio={cpu / 100} />
        <Meter
          Icon={MemoryStick}
          label="RAM"
          value={stats ? `${(stats.memUsed / GIB).toFixed(1)} / ${(stats.memTotal / GIB).toFixed(0)} ГБ` : "—"}
          ratio={memRatio}
        />
        <button
          type="button"
          role="switch"
          aria-checked={dnd}
          onClick={onToggleDnd}
          className="flex h-7 items-center gap-2 rounded-xl bg-white/[0.07] px-2 hover:bg-white/[0.11]"
        >
          <Moon size={13} className={dnd ? "text-indigo-300" : "text-white/50"} strokeWidth={2.4} />
          <span className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-white/80">
            Не беспокоить
          </span>
          <span
            className={`flex h-4 w-7 items-center rounded-full px-0.5 ${
              dnd ? "justify-end bg-indigo-400" : "justify-start bg-white/20"
            }`}
          >
            <motion.span layout transition={SPRING.snappy} className="h-3 w-3 rounded-full bg-white" />
          </span>
        </button>
      </div>

      <PomodoroCard pomodoro={pomodoro} />
    </div>
  );
}

interface MeterProps {
  Icon: LucideIcon;
  label: string;
  value: string;
  /** 0..1 */
  ratio: number;
}

function Meter({ Icon, label, value, ratio }: MeterProps) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const color = clamped > 0.85 ? "bg-red-400" : clamped > 0.6 ? "bg-amber-300" : "bg-emerald-400";
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Icon size={12} className="text-white/50" strokeWidth={2.2} />
        <span className="text-[11px] font-medium text-white/55">{label}</span>
        <span className="ml-auto text-[11px] font-semibold text-white/90">{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/12">
        <motion.div
          className={`h-full w-full origin-left rounded-full ${color}`}
          initial={false}
          animate={{ scaleX: clamped }}
          transition={SPRING.gentle}
        />
      </div>
    </div>
  );
}

function PomodoroCard({ pomodoro }: { pomodoro: Pomodoro }) {
  const PhaseIcon = pomodoro.phase === "focus" ? Timer : Coffee;
  const progress = 1 - pomodoro.remainingMs / pomodoro.totalMs;

  return (
    <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl bg-white/[0.07] p-2.5">
      <div className="flex items-center gap-1.5">
        <PhaseIcon size={12} className="text-orange-400" strokeWidth={2.4} />
        <span className="text-[11px] font-medium text-white/60">
          {pomodoro.phase === "focus" ? "Фокус" : "Перерыв"}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <span className="text-[26px] font-semibold leading-none tracking-tight text-white">
          {formatTime(pomodoro.remainingMs)}
        </span>
        <div className="flex items-center gap-1">
          <motion.button
            type="button"
            aria-label="Сбросить таймер"
            title="Сбросить"
            onClick={pomodoro.reset}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20"
            whileTap={{ scale: 0.86 }}
            transition={SPRING.snappy}
          >
            <RotateCcw size={13} strokeWidth={2.4} />
          </motion.button>
          <motion.button
            type="button"
            aria-label={pomodoro.running ? "Пауза" : "Старт"}
            title={pomodoro.running ? "Пауза" : "Старт"}
            onClick={pomodoro.running ? pomodoro.pause : pomodoro.start}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-white hover:bg-orange-400"
            whileTap={{ scale: 0.86 }}
            transition={SPRING.snappy}
          >
            {pomodoro.running ? (
              <Pause size={13} fill="currentColor" />
            ) : (
              <Play size={13} fill="currentColor" />
            )}
          </motion.button>
        </div>
      </div>

      <motion.div
        className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-orange-400"
        initial={false}
        animate={{ scaleX: Math.max(0, Math.min(1, progress)) }}
        transition={SPRING.gentle}
      />
    </div>
  );
}
