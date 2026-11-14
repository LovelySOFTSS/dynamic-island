export type ThemeId =
  | "midnight"
  | "adaptive"
  | "graphite"
  | "aurora"
  | "sunset"
  | "ocean"
  | "forest"
  | "snow";

export interface Theme {
  id: ThemeId;
  name: string;
  /** CSS background капсулы. Для "adaptive" строится из цвета обложки. */
  background: string;
  /** Цвет текста и светлых подложек (CSS-переменная --color-ink). */
  ink: string;
  /** Цвет тонкой обводки. */
  border: string;
  /** Акцент "r, g, b". null — берётся из обложки текущего трека. */
  accent: string | null;
  /** Заливка кружка в выборе тем. */
  swatch: string;
}

export const THEMES: readonly Theme[] = [
  {
    id: "midnight",
    name: "Полночь",
    background: "rgba(10, 10, 12, 0.88)",
    ink: "#ffffff",
    border: "rgba(255, 255, 255, 0.12)",
    accent: null,
    swatch: "linear-gradient(135deg, #2a2a30, #0a0a0c)",
  },
  {
    id: "adaptive",
    name: "Под обложку",
    background: "rgba(10, 10, 12, 0.9)",
    ink: "#ffffff",
    border: "rgba(255, 255, 255, 0.14)",
    accent: null,
    swatch: "conic-gradient(from 210deg, #ff5f6d, #ffc371, #47e0a0, #4facfe, #b06ab3, #ff5f6d)",
  },
  {
    id: "graphite",
    name: "Графит",
    background: "linear-gradient(160deg, rgba(58, 60, 68, 0.9), rgba(24, 25, 30, 0.92))",
    ink: "#f4f4f6",
    border: "rgba(255, 255, 255, 0.16)",
    accent: "168, 176, 196",
    swatch: "linear-gradient(135deg, #6b7080, #24252b)",
  },
  {
    id: "aurora",
    name: "Аврора",
    background: "linear-gradient(135deg, rgba(76, 29, 149, 0.9), rgba(20, 16, 48, 0.94) 60%, rgba(8, 47, 73, 0.92))",
    ink: "#ffffff",
    border: "rgba(196, 181, 253, 0.28)",
    accent: "167, 139, 250",
    swatch: "linear-gradient(135deg, #8b5cf6, #22d3ee)",
  },
  {
    id: "sunset",
    name: "Закат",
    background: "linear-gradient(135deg, rgba(136, 19, 55, 0.92), rgba(67, 20, 7, 0.94) 65%, rgba(30, 10, 20, 0.94))",
    ink: "#fff7ed",
    border: "rgba(253, 186, 116, 0.28)",
    accent: "251, 146, 60",
    swatch: "linear-gradient(135deg, #f43f5e, #fb923c)",
  },
  {
    id: "ocean",
    name: "Океан",
    background: "linear-gradient(140deg, rgba(8, 51, 68, 0.92), rgba(7, 20, 46, 0.95))",
    ink: "#f0f9ff",
    border: "rgba(125, 211, 252, 0.26)",
    accent: "56, 189, 248",
    swatch: "linear-gradient(135deg, #0ea5e9, #1e3a8a)",
  },
  {
    id: "forest",
    name: "Лес",
    background: "linear-gradient(140deg, rgba(6, 60, 44, 0.92), rgba(8, 24, 20, 0.95))",
    ink: "#f0fdf4",
    border: "rgba(110, 231, 183, 0.24)",
    accent: "52, 211, 153",
    swatch: "linear-gradient(135deg, #10b981, #064e3b)",
  },
  {
    id: "snow",
    name: "Снег",
    background: "linear-gradient(160deg, rgba(255, 255, 255, 0.94), rgba(236, 238, 244, 0.94))",
    ink: "#15151a",
    border: "rgba(0, 0, 0, 0.1)",
    accent: "37, 99, 235",
    swatch: "linear-gradient(135deg, #ffffff, #d5d9e3)",
  },
];

export function getTheme(id: ThemeId): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** Фон темы «Под обложку»: цвет трека растекается по чёрной основе. */
export function adaptiveBackground(coverAccent: string): string {
  return `linear-gradient(135deg, rgba(${coverAccent}, 0.46) 0%, rgba(${coverAccent}, 0.14) 55%, rgba(10, 10, 12, 0) 100%), rgba(10, 10, 12, 0.92)`;
}
