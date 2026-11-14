import { useEffect, useState } from "react";

/** Цвет по умолчанию (системный зелёный), пока обложки нет. Формат: "r, g, b". */
export const DEFAULT_ACCENT = "52, 199, 89";

const SAMPLE = 24;

/**
 * Доминирующий цвет обложки для ambient glow.
 * Картинка уменьшается до 24×24, пиксели усредняются с весом по насыщенности —
 * так яркий акцент не тонет в сером/чёрном фоне. Считается один раз на трек.
 */
export function useDominantColor(src: string | null): string {
  const [accent, setAccent] = useState(DEFAULT_ACCENT);

  useEffect(() => {
    if (!src) {
      setAccent(DEFAULT_ACCENT);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE;
        canvas.height = SAMPLE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
        const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);

        let r = 0;
        let g = 0;
        let b = 0;
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i];
          const pg = data[i + 1];
          const pb = data[i + 2];
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          const saturation = max === 0 ? 0 : (max - min) / max;
          const weight = 0.05 + saturation * saturation * (max / 255);
          r += pr * weight;
          g += pg * weight;
          b += pb * weight;
          total += weight;
        }
        if (total === 0) return;
        r /= total;
        g /= total;
        b /= total;

        // Тёмные обложки осветляем, иначе свечение не видно на чёрном.
        const peak = Math.max(r, g, b, 1);
        const boost = peak < 170 ? 170 / peak : 1;
        const clamp = (v: number) => Math.round(Math.min(255, v * boost));
        setAccent(`${clamp(r)}, ${clamp(g)}, ${clamp(b)}`);
      } catch {
        // Canvas «испачкан» картинкой без CORS — остаёмся на цвете по умолчанию.
        setAccent(DEFAULT_ACCENT);
      }
    };
    img.onerror = () => {
      if (!cancelled) setAccent(DEFAULT_ACCENT);
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return accent;
}
