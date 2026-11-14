import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Layers,
  MicVocal,
  Moon,
  Music2,
  Palette,
  SlidersHorizontal,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { useClock } from "../hooks/useClock";
import type { Connectivity } from "../hooks/useConnectivity";
import type { MediaController } from "../hooks/useMedia";
import type { SettingsController } from "../hooks/useSettings";
import type { Shelf } from "../hooks/useShelf";
import { SPRING } from "../lib/constants";
import type { Pomodoro, Tab } from "../types";
import { AppearanceTab } from "./AppearanceTab";
import { ConnectTab } from "./ConnectTab";
import { FileShelf } from "./FileShelf";
import { LyricsView } from "./LyricsView";
import { MediaPlayer } from "./MediaPlayer";
import { SystemTools } from "./SystemTools";

interface ExpandedViewProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  controller: MediaController;
  accent: string;
  shelf: Shelf;
  pomodoro: Pomodoro;
  connectivity: Connectivity;
  settings: SettingsController;
  dnd: boolean;
  onToggleDnd: () => void;
}

const TABS: ReadonlyArray<{ id: Tab; label: string; Icon: LucideIcon }> = [
  { id: "media", label: "Плеер", Icon: Music2 },
  { id: "lyrics", label: "Текст", Icon: MicVocal },
  { id: "shelf", label: "Полка", Icon: Layers },
  { id: "tools", label: "Инструменты", Icon: SlidersHorizontal },
  { id: "connect", label: "Связь", Icon: Wifi },
  { id: "look", label: "Вид", Icon: Palette },
];

/** Элемент каскада: родитель (DynamicIsland) раздаёт задержки через staggerChildren. */
const ITEM: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
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
  connectivity,
  settings,
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
              <motion.button
                key={id}
                type="button"
                layout
                aria-pressed={active}
                aria-label={label}
                title={label}
                onClick={() => onTabChange(id)}
                transition={SPRING.snappy}
                className={`relative flex h-6 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold ${
                  active ? "text-ink" : "text-ink/45 hover:text-ink/80"
                }`}
              >
                {active ? (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-full bg-ink/[0.14]"
                    transition={SPRING.snappy}
                  />
                ) : null}
                <motion.span layout="position" className="relative flex">
                  <Icon size={13} strokeWidth={2.3} />
                </motion.span>
                {/* Подпись только у активной вкладки — так шесть вкладок помещаются в строку. */}
                {active ? (
                  <motion.span
                    layout="position"
                    className="relative"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={SPRING.content}
                  >
                    {label}
                  </motion.span>
                ) : null}
                {badge !== null && !active ? (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-sky-400" />
                ) : null}
              </motion.button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink/50">
          {dnd ? <Moon size={11} className="text-indigo-300" strokeWidth={2.5} /> : null}
          {time}
        </div>
      </motion.div>

      <motion.div variants={ITEM} className="relative mt-2.5 min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            className="absolute inset-0"
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.985 }}
            transition={SPRING.snappy}
          >
            {tab === "media" ? <MediaPlayer controller={controller} accent={accent} /> : null}
            {tab === "lyrics" ? <LyricsView controller={controller} accent={accent} /> : null}
            {tab === "shelf" ? <FileShelf shelf={shelf} /> : null}
            {tab === "tools" ? (
              <SystemTools pomodoro={pomodoro} dnd={dnd} onToggleDnd={onToggleDnd} />
            ) : null}
            {tab === "connect" ? <ConnectTab connectivity={connectivity} /> : null}
            {tab === "look" ? <AppearanceTab controller={settings} /> : null}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
