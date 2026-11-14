import { AnimatePresence, motion, type Variants } from "framer-motion";
import { Layers, Moon, Music2, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useClock } from "../hooks/useClock";
import type { MediaController } from "../hooks/useMedia";
import type { Shelf } from "../hooks/useShelf";
import { SPRING } from "../lib/constants";
import type { Pomodoro, Tab } from "../types";
import { FileShelf } from "./FileShelf";
import { MediaPlayer } from "./MediaPlayer";
import { SystemTools } from "./SystemTools";

interface ExpandedViewProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  controller: MediaController;
  accent: string;
  shelf: Shelf;
  pomodoro: Pomodoro;
  dnd: boolean;
  onToggleDnd: () => void;
}

const TABS: ReadonlyArray<{ id: Tab; label: string; Icon: LucideIcon }> = [
  { id: "media", label: "Плеер", Icon: Music2 },
  { id: "shelf", label: "Полка", Icon: Layers },
  { id: "tools", label: "Инструменты", Icon: SlidersHorizontal },
];

/** Элемент каскада: родитель (DynamicIsland) раздаёт задержки через staggerChildren. */
const ITEM: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING.content },
  exit: { opacity: 0, transition: SPRING.snappy },
};

/** Раскрытое состояние: 380×160. */
export function ExpandedView({
  tab,
  onTabChange,
  controller,
  accent,
  shelf,
  pomodoro,
  dnd,
  onToggleDnd,
}: ExpandedViewProps) {
  const time = useClock();

  return (
    <div className="flex h-full w-full flex-col px-4 pb-3.5 pt-3">
      <motion.div variants={ITEM} className="flex h-6 shrink-0 items-center justify-between">
        <div className="flex items-center gap-0.5">
          {TABS.map(({ id, label, Icon }) => {
            const active = id === tab;
            const badge = id === "shelf" && shelf.files.length > 0 ? shelf.files.length : null;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => onTabChange(id)}
                className={`relative flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ${
                  active ? "text-white" : "text-white/45 hover:text-white/75"
                }`}
              >
                {active ? (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-full bg-white/[0.13]"
                    transition={SPRING.snappy}
                  />
                ) : null}
                <Icon size={12} strokeWidth={2.4} className="relative" />
                <span className="relative">{label}</span>
                {badge !== null ? (
                  <span className="relative rounded-full bg-sky-400/90 px-1 text-[9px] leading-[14px] text-black">
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/50">
          {dnd ? <Moon size={11} className="text-indigo-300" strokeWidth={2.5} /> : null}
          {time}
        </div>
      </motion.div>

      <motion.div variants={ITEM} className="relative mt-2.5 min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            className="absolute inset-0"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING.snappy}
          >
            {tab === "media" ? <MediaPlayer controller={controller} accent={accent} /> : null}
            {tab === "shelf" ? <FileShelf shelf={shelf} /> : null}
            {tab === "tools" ? (
              <SystemTools pomodoro={pomodoro} dnd={dnd} onToggleDnd={onToggleDnd} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
