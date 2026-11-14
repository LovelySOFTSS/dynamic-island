import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDominantColor } from "../hooks/useDominantColor";
import { useMedia } from "../hooks/useMedia";
import { useNotifications } from "../hooks/useNotifications";
import { usePersistentState } from "../hooks/usePersistentState";
import { usePomodoro } from "../hooks/usePomodoro";
import { useShelf } from "../hooks/useShelf";
import { HIT_MARGIN, ISLAND_SHADOW, SIZES, SPRING, TOP_OFFSET, WINDOW_W } from "../lib/constants";
import { api, useTauriEvent } from "../lib/tauri";
import type { Mode, Notice, PomodoroPhase, Tab } from "../types";
import { CompactView } from "./CompactView";
import { ExpandedView } from "./ExpandedView";
import { IdleView } from "./IdleView";
import { NotificationPill } from "./NotificationPill";

/** Задержка перед раскрытием по наведению — чтобы островок не дёргался от пролёта курсора. */
const HOVER_OPEN_MS = 90;
/** Задержка перед сворачиванием после ухода курсора. */
const HOVER_CLOSE_MS = 380;

/**
 * Содержимое состояния: появляется с пружиной и каскадом для дочерних элементов,
 * исчезает быстрее, чем появляется, чтобы не мешать перетеканию формы.
 */
const VIEW: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { ...SPRING.content, staggerChildren: 0.055, delayChildren: 0.05 },
  },
  exit: { opacity: 0, scale: 0.94, transition: SPRING.snappy },
};

export function DynamicIsland() {
  const controller = useMedia();
  const { media, cover } = controller;
  const accent = useDominantColor(cover);
  const shelf = useShelf();
  const { notice, push } = useNotifications();

  const [dnd, setDnd] = usePersistentState<boolean>("island.dnd", false);
  const dndRef = useRef(dnd);
  dndRef.current = dnd;

  // Завершение таймера — событие, которое пользователь сам заказал: показываем и при DND.
  const pomodoro = usePomodoro(
    useCallback(
      (finished: PomodoroPhase) =>
        push({
          kind: "timer",
          title: finished === "focus" ? "Фокус завершён" : "Перерыв окончен",
          subtitle: finished === "focus" ? "Время отдохнуть" : "За работу",
        }),
      [push],
    ),
  );

  const [tab, setTab] = useState<Tab>("media");
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [open, setOpen] = useState(false);

  // ── События бэкенда ──
  useTauriEvent<boolean>("island-hover", setHovered);
  useTauriEvent<null>("island-toggle", () => setPinned((p) => !p));
  useTauriEvent<Notice>("island-notify", (incoming) => {
    if (!dndRef.current) push(incoming);
  });

  // Файл тащат на островок — сразу раскрываемся на полке.
  useEffect(() => {
    if (shelf.dragOver) setTab("shelf");
  }, [shelf.dragOver]);

  // Раскрытие/сворачивание с небольшими задержками.
  const wantsOpen = hovered || pinned || shelf.dragOver;
  useEffect(() => {
    const immediate = pinned || shelf.dragOver;
    const delay = wantsOpen ? (immediate ? 0 : HOVER_OPEN_MS) : HOVER_CLOSE_MS;
    const id = window.setTimeout(() => setOpen(wantsOpen), delay);
    return () => window.clearTimeout(id);
  }, [wantsOpen, pinned, shelf.dragOver]);

  const live = (media.active && media.playing) || pomodoro.running;
  const mode: Mode = open ? "expanded" : notice ? "notification" : live ? "compact" : "idle";
  const size = SIZES[mode];

  // Click-through: сообщаем бэкенду, где сейчас капсула. Всё остальное окно
  // прозрачно для мыши — клики уходят в приложения под ним.
  useEffect(() => {
    void api.setHitRegion({
      x: (WINDOW_W - size.w) / 2 - HIT_MARGIN,
      y: Math.max(0, TOP_OFFSET - HIT_MARGIN),
      w: size.w + HIT_MARGIN * 2,
      h: size.h + HIT_MARGIN * 2,
    });
  }, [size.w, size.h]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 flex justify-center"
      style={{ top: TOP_OFFSET }}
    >
      {/*
        Форма меняется через layout-анимацию Framer Motion: реальные width/height
        переключаются мгновенно, а переход рисуется transform'ом (FLIP) на GPU.
        Обводка сделана inset-тенью: её, в отличие от border, Framer
        корректирует при масштабировании, и она не «плывёт» во время перехода.
      */}
      <motion.div
        layout
        layoutDependency={mode}
        initial={false}
        animate={{ borderRadius: size.r }}
        transition={{ layout: SPRING.morph, borderRadius: SPRING.morph }}
        style={{ width: size.w, height: size.h, boxShadow: ISLAND_SHADOW }}
        className="island pointer-events-auto relative overflow-hidden"
        onClick={() => {
          if (!open) setOpen(true);
        }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={mode}
            layout
            layoutDependency={mode}
            variants={VIEW}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={{ layout: SPRING.morph }}
            className="absolute inset-0"
          >
            {mode === "idle" ? <IdleView dnd={dnd} /> : null}
            {mode === "compact" ? (
              <CompactView media={media} cover={cover} accent={accent} pomodoro={pomodoro} />
            ) : null}
            {mode === "notification" && notice ? <NotificationPill notice={notice} /> : null}
            {mode === "expanded" ? (
              <ExpandedView
                tab={tab}
                onTabChange={setTab}
                controller={controller}
                accent={accent}
                shelf={shelf}
                pomodoro={pomodoro}
                dnd={dnd}
                onToggleDnd={() => setDnd((v) => !v)}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
