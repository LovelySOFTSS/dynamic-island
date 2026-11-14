import { Moon } from "lucide-react";
import { useClock } from "../hooks/useClock";

interface IdleViewProps {
  dnd: boolean;
}

/** Покой: 120×32, время и минималистичный индикатор. */
export function IdleView({ dnd }: IdleViewProps) {
  const time = useClock();
  return (
    <div className="flex h-full w-full items-center justify-center gap-2">
      {dnd ? (
        <Moon size={11} className="text-indigo-300" strokeWidth={2.5} />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/90" />
      )}
      <span className="text-[12px] font-semibold tracking-wide text-white/90">{time}</span>
    </div>
  );
}
