import { useCallback } from "react";
import type { ThemeId } from "../lib/themes";
import { usePersistentState } from "./usePersistentState";

export interface Settings {
  theme: ThemeId;
  /** Свечение вокруг капсулы в цвет трека, пока играет музыка. */
  glow: boolean;
  /** Блик, пробегающий по капсуле при смене состояния. */
  sheen: boolean;
  /** Живой цветной фон в раскрытом состоянии. */
  aurora: boolean;
}

export type EffectKey = "glow" | "sheen" | "aurora";

const DEFAULTS: Settings = { theme: "midnight", glow: true, sheen: true, aurora: true };

export interface SettingsController {
  settings: Settings;
  setTheme: (theme: ThemeId) => void;
  toggleEffect: (key: EffectKey) => void;
}

export function useSettings(): SettingsController {
  const [stored, setStored] = usePersistentState<Partial<Settings>>("island.settings", DEFAULTS);
  // Настройки могли быть сохранены старой версией без новых полей.
  const settings: Settings = { ...DEFAULTS, ...stored };

  const setTheme = useCallback(
    (theme: ThemeId) => setStored((prev) => ({ ...DEFAULTS, ...prev, theme })),
    [setStored],
  );
  const toggleEffect = useCallback(
    (key: EffectKey) =>
      setStored((prev) => {
        const current = { ...DEFAULTS, ...prev };
        return { ...current, [key]: !current[key] };
      }),
    [setStored],
  );

  return { settings, setTheme, toggleEffect };
}
