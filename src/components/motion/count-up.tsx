import { useEffect, useLayoutEffect, useRef, useState } from "react";

// A leading number, but not the hour of a time like "5:00 PM".
const NUMBER_PREFIX = /^(\d[\d,]*(?:\.\d+)?)(?![\d:])([\s\S]*)$/;

// Layout effect in the browser (runs before paint, so the final value never
// flashes before counting starts); plain effect during server rendering.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Renders `text`, counting its leading number up from the previous value
 * (or zero on first render), e.g. "12,480 vehicles/hour". Text without a
 * leading number is rendered as-is. Respects reduced-motion preferences.
 */
export function CountUp({ text, duration = 900 }: { text: string; duration?: number }) {
  const match = NUMBER_PREFIX.exec(text);
  const target = match ? Number(match[1]!.replace(/,/g, "")) : null;
  const decimals = match?.[1]?.split(".")[1]?.length ?? 0;
  const [shown, setShown] = useState(target);
  const from = useRef(0);

  useIsoLayoutEffect(() => {
    if (target === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (target - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    setShown(origin);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = target;
    };
  }, [target, duration]);

  if (!match || shown === null) return <>{text}</>;
  const formatted = shown.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <>
      <span className="tabular-nums">{formatted}</span>
      {match[2]}
    </>
  );
}
