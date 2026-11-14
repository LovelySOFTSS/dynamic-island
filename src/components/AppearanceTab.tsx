import { motion } from "framer-motion";
import { Check, Sparkles, Sun, Waves, type LucideIcon } from "lucide-react";
import type { EffectKey, SettingsController } from "../hooks/useSettings";
import { SPRING } from "../lib/constants";
import { getTheme, THEMES } from "../lib/themes";

interface AppearanceTabProps {
  controller: SettingsController;
}

const EFFECTS: ReadonlyArray<{ key: EffectKey; label: string; hint: string; Icon: LucideIcon }> = [
  { key: "glow", label: "Свечение", hint: "Ореол в цвет трека, пока играет музыка", Icon: Sun },
  { key: "sheen", label: "Блик", hint: "Блик по стеклу при смене состояния", Icon: Sparkles },
  { key: "aurora", label: "Аврора", hint: "Живой цветной фон в раскрытом виде", Icon: Waves },
];

export function AppearanceTab({ controller }: AppearanceTabProps) {
  const { settings, setTheme, toggleEffect } = controller;
  const current = getTheme(settings.theme);

  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-medium text-ink/50">Тема</span>
          <span className="text-[12px] font-semibold text-ink">{current.name}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          {THEMES.map((theme) => {
            const selected = theme.id === settings.theme;
            return (
              <motion.button
                key={theme.id}
                type="button"
                aria-label={`Тема «${theme.name}»`}
                aria-pressed={selected}
                title={theme.name}
                onClick={() => setTheme(theme.id)}
                className="relative flex h-8 w-8 items-center justify-center rounded-full"
                style={{
                  background: theme.swatch,
                  boxShadow: selected
                    ? "0 0 0 2px var(--color-ink), inset 0 0 0 1px rgba(0,0,0,0.25)"
                    : "inset 0 0 0 1px rgba(128,128,128,0.45)",
                }}
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.9 }}
                animate={{ scale: selected ? 1.06 : 1 }}
                transition={SPRING.snappy}
              >
                {selected ? (
                  <Check
                    size={14}
                    strokeWidth={3.2}
                    className={theme.id === "snow" ? "text-black" : "text-white"}
                  />
                ) : null}
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {EFFECTS.map(({ key, label, hint, Icon }) => {
          const on = settings[key];
          return (
            <motion.button
              key={key}
              type="button"
              role="switch"
              aria-checked={on}
              title={hint}
              onClick={() => toggleEffect(key)}
              className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full text-[11px] font-semibold transition-colors duration-300 ${
                on ? "bg-ink/[0.16] text-ink" : "bg-ink/[0.05] text-ink/40"
              }`}
              whileTap={{ scale: 0.94 }}
              transition={SPRING.snappy}
            >
              <Icon size={12} strokeWidth={2.4} />
              {label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
