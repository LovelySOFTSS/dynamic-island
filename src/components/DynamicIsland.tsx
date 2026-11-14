import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useConnectivity } from "../hooks/useConnectivity";
import { useDominantColor } from "../hooks/useDominantColor";
import { useMedia } from "../hooks/useMedia";
import { useNotifications } from "../hooks/useNotifications";
import { usePersistentState } from "../hooks/usePersistentState";
import { usePomodoro } from "../hooks/usePomodoro";
import { useSettings } from "../hooks/useSettings";
import { useShelf } from "../hooks/useShelf";
import { HIT_MARGIN, SIZES, SPRING, TOP_OFFSET, WINDOW_W } from "../lib/constants";
import { api, useTauriEvent } from "../lib/tauri";
import { adaptiveBackground, getTheme } from "../lib/themes";
import type { Mode, Notice, PomodoroPhase, Tab } from "../types";
import { CompactView } from "./CompactView";
import { ExpandedView } from "./ExpandedView";
import { IdleView } from "./IdleView";
import { NotificationPill } from "./NotificationPill";

/** Задержка перед раскрытием по наведению — чтобы островок не дёргался от пролёта курсора. */
const HOVER_OPEN_MS = 110;
/** Задержка перед сворачиванием после ухода курсора. */
const HOVER_CLOSE_MS = 420;

/**
 * Содержимое состояния: появляется с пружиной и каскадом для дочерних элементов,
 * исчезает быстрее, чем появляется, чтобы не мешать перетеканию формы.
 */
const VIEW: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { ...SPRING.content, staggerChildren: 0.07, delayChildren: 0.06 },
  },
  exit: { opacity: 0, scale: 0.96, transition: SPRING.snappy },
};

export function DynamicIsland() {
  const controller = useMedia();
  const { media, cover } = controller;
  const coverAccent = useDominantColor(cover);
  const shelf = useShelf();
  const connectivity = useConnectivity();
  const settingsController = useSettings();
  const { settings } = settingsController;
  const { notice, push } = useNotifications();

  const theme = getTheme(settings.theme);
  /** Акцент: у цветных тем свой, у «Полночи» и «Под обложку» — цвет текущего трека. */
  const accent = theme.accent ?? coverAccent;

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

  const musicOn = media.active && media.playing;
  const live = musicOn || pomodoro.running;
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

  // ── Оформление ──
  const glowOn = settings.glow && musicOn;
  const auroraOn = settings.aurora && mode === "expanded";
  // Структура тени всегда одинакова (4 слоя) — тогда пружина плавно переводит
  // одно значение в другое, а не переключает скачком.
  const boxShadow = [
    `inset 0px 0px 0px 1px ${glowOn ? `rgba(${accent}, 0.42)` : theme.border}`,
    "inset 0px 1px 0px 0px rgba(255, 255, 255, 0.13)",
    "0px 10px 30px 0px rgba(0, 0, 0, 0.36)",
    `0px 0px ${glowOn ? 30 : 0}px 0px rgba(${accent}, ${glowOn ? 0.55 : 0})`,
  ].join(", ");

  const islandStyle = {
    width: size.w,
    height: size.h,
    background: theme.id === "adaptive" ? adaptiveBackground(coverAccent) : theme.background,
    "--color-ink": theme.ink,
  } as CSSProperties;

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
        animate={{ borderRadius: size.r, boxShadow }}
        transition={{ layout: SPRING.morph, borderRadius: SPRING.morph, boxShadow: SPRING.gentle }}
        style={islandStyle}
        className="island pointer-events-auto relative overflow-hidden"
        onClick={() => {
          if (!open) setOpen(true);
        }}
      >
        {/* Аврора: живой фон только в раскрытом виде. */}
        <AnimatePresence>
          {auroraOn ? (
            <motion.div
              key="aurora"
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: musicOn ? 0.5 : 0.28 }}
              exit={{ opacity: 0 }}
              transition={SPRING.gentle}
            >
              <div className="aurora-blob" style={{ left: "-10%", top: "-30%", background: `rgb(${accent})` }} />
              <div
                className="aurora-blob second"
                style={{ right: "-20%", bottom: "-60%", background: `rgb(${coverAccent})` }}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

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
            {mode === "idle" ? (
              <IdleView dnd={dnd} offline={connectivity.known && !connectivity.network.connected} />
            ) : null}
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
                connectivity={connectivity}
                settings={settingsController}
                dnd={dnd}
                onToggleDnd={() => setDnd((v) => !v)}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>

        {/* Блик: один проход по стеклу при каждой смене состояния. */}
        {settings.sheen ? (
          <motion.div
            key={`sheen-${mode}`}
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-[200%]"
            style={{
              background:
                "linear-gradient(105deg, transparent 42%, rgba(255,255,255,0.16) 50%, transparent 58%)",
            }}
            initial={{ x: "-55%", opacity: 0 }}
            animate={{ x: "55%", opacity: 1 }}
            transition={{ type: "spring", stiffness: 38, damping: 16, mass: 1 }}
          />
        ) : null}
      </motion.div>
    </div>
  );
}
