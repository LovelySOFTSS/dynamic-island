import { motion } from "framer-motion";
import { SPRING } from "../lib/constants";

interface ToggleProps {
  on: boolean;
  /** Tailwind-класс фона во включённом состоянии. */
  activeClass?: string;
}

/** Переключатель в стиле iOS. Чисто визуальный — нажатие обрабатывает родительская кнопка. */
export function Toggle({ on, activeClass = "bg-emerald-400" }: ToggleProps) {
  return (
    <span
      className={`flex h-4 w-7 shrink-0 items-center rounded-full px-0.5 transition-colors duration-300 ${
        on ? `justify-end ${activeClass}` : "justify-start bg-ink/20"
      }`}
    >
      <motion.span
        layout
        transition={SPRING.snappy}
        className="h-3 w-3 rounded-full bg-white shadow-sm"
      />
    </span>
  );
}
