import type { Transition } from "framer-motion";
import type { Mode } from "../types";

/** Размер окна Tauri. Должен совпадать с tauri.conf.json и lib.rs. */
export const WINDOW_W = 440;
export const WINDOW_H = 230;
/** Отступ капсулы от верхнего края экрана. */
export const TOP_OFFSET = 10;
/** Запас вокруг капсулы для зоны наведения — чтобы курсор не «срывался» на границе. */
export const HIT_MARGIN = 6;

export interface IslandSize {
  w: number;
  h: number;
  /** Радиус скругления. Для капсул равен половине высоты — визуально то же, что 9999px,
   *  но значение корректно интерполируется пружиной до 28px. */
  r: number;
}

export const SIZES: Record<Mode, IslandSize> = {
  idle: { w: 120, h: 32, r: 16 },
  compact: { w: 240, h: 36, r: 18 },
  notification: { w: 290, h: 44, r: 22 },
  expanded: { w: 380, h: 160, r: 28 },
};

/**
 * Пружины. Только type: "spring" — никаких tween/ease.
 * Настроены на плавность: жёсткость ниже, затухание близко к критическому —
 * форма «перетекает» без рывка в начале и без дребезга в конце.
 */
export const SPRING = {
  /** Главная: перетекание формы капсулы, едва заметный перелёт. */
  morph: { type: "spring", stiffness: 210, damping: 25, mass: 1 },
  /** Появление содержимого. */
  content: { type: "spring", stiffness: 230, damping: 28, mass: 0.9 },
  /** Отклики: кнопки, полоски эквалайзера, переключатели. */
  snappy: { type: "spring", stiffness: 380, damping: 30, mass: 0.7 },
  /** Плавные индикаторы: прогресс, шкалы, свечение. */
  gentle: { type: "spring", stiffness: 110, damping: 24, mass: 1 },
} as const satisfies Record<string, Transition>;

