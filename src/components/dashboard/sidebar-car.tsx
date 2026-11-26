import { useEffect, useState } from "react";

/**
 * Flowy, the CityFlow car, parked at the foot of the sidebar.
 *
 * It cycles through a handful of expressions so the empty space below the nav
 * has something alive in it. Mood changes are paused for visitors who ask for
 * reduced motion, matching the rest of the app's animation policy.
 */

type Mood = {
  name: string;
  /** What Flowy is thinking, read out to screen readers. */
  caption: string;
  eyes: React.ReactNode;
  mouth: React.ReactNode;
};

const INK = "oklch(0.2 0.05 265)";

/** A plain round eye, with a highlight so it reads as cute rather than blank. */
function Eye({ cx, cy = 50, r = 6.5 }: { cx: number; cy?: number; r?: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill="#fff" />
      <circle cx={cx + 1} cy={cy + 1} r={r * 0.5} fill={INK} />
      <circle cx={cx + 1.8} cy={cy - 0.6} r={r * 0.17} fill="#fff" />
    </>
  );
}

const MOODS: Mood[] = [
  {
    name: "happy",
    caption: "Roads are flowing nicely.",
    eyes: (
      <>
        <Eye cx={48} />
        <Eye cx={72} />
      </>
    ),
    mouth: <path d="M53 60 Q60 68 67 60" />,
  },
  {
    name: "wink",
    caption: "Got a shortcut for you.",
    eyes: (
      <>
        <path d="M42 50 Q48 45 54 50" />
        <Eye cx={72} />
      </>
    ),
    mouth: <path d="M53 60 Q60 67 67 60" />,
  },
  {
    name: "surprised",
    caption: "Whoa, traffic is picking up.",
    eyes: (
      <>
        <Eye cx={48} r={7.6} />
        <Eye cx={72} r={7.6} />
      </>
    ),
    mouth: <ellipse cx="60" cy="62" rx="4.2" ry="4.8" />,
  },
  {
    name: "sleepy",
    caption: "Quiet out there right now.",
    eyes: (
      <>
        <path d="M42 51 Q48 55 54 51" />
        <path d="M66 51 Q72 55 78 51" />
      </>
    ),
    mouth: <path d="M54 62 L66 62" />,
  },
  {
    name: "determined",
    caption: "Checking the next seven days.",
    eyes: (
      <>
        <Eye cx={48} r={5.6} />
        <Eye cx={72} r={5.6} />
        <path d="M41 41 L54 44" />
        <path d="M79 41 L66 44" />
      </>
    ),
    mouth: <path d="M53 62 Q60 59 67 62" />,
  },
];

const CYCLE_MS = 4200;

export function SidebarCar() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % MOODS.length), CYCLE_MS);
    return () => window.clearInterval(id);
  }, []);

  const mood = MOODS[index]!;

  return (
    <div className="mt-auto px-5 pb-6 pt-4">
      <div className="cf-car-bob mx-auto w-40">
        <svg
          viewBox="0 0 130 92"
          className="w-full overflow-visible"
          role="img"
          aria-label={`Flowy the CityFlow car: ${mood.caption}`}
        >
          <defs>
            <linearGradient id="sidebar-car-body" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--brand-cyan)" />
              <stop offset="100%" stopColor="var(--brand-violet)" />
            </linearGradient>
          </defs>
          <ellipse cx="60" cy="86" rx="42" ry="4" fill="rgb(0 0 0 / 0.12)" />
          {/* cabin, then body */}
          <rect x="28" y="14" width="62" height="34" rx="16" fill="url(#sidebar-car-body)" />
          <rect x="35" y="20" width="48" height="18" rx="9" fill="rgb(255 255 255 / 0.85)" />
          <rect x="8" y="38" width="104" height="36" rx="17" fill="url(#sidebar-car-body)" />
          <circle cx="107" cy="50" r="4" fill="oklch(0.95 0.12 95)" />
          {/* cheeks sit behind the face so a wide mouth still reads */}
          <ellipse cx="34" cy="61" rx="5" ry="3" fill="oklch(0.78 0.14 10 / 0.6)" />
          <ellipse cx="86" cy="61" rx="5" ry="3" fill="oklch(0.78 0.14 10 / 0.6)" />
          {/* The whole face swaps at once; keying on the mood restarts its fade. */}
          <g
            key={mood.name}
            className="cf-face-swap"
            fill="none"
            stroke={INK}
            strokeWidth="2.6"
            strokeLinecap="round"
          >
            <g className="cf-eyes">{mood.eyes}</g>
            <g fill={mood.name === "surprised" ? INK : "none"}>{mood.mouth}</g>
          </g>
          {[30, 90].map((cx) => (
            <g key={cx} className="cf-wheel">
              <circle cx={cx} cy="75" r="11" fill="oklch(0.25 0.03 265)" />
              <circle cx={cx} cy="75" r="4.5" fill="oklch(0.85 0.02 265)" />
              <rect x={cx - 1} y="65" width="2" height="20" fill="oklch(0.85 0.02 265)" />
            </g>
          ))}
        </svg>
      </div>
      <p
        key={mood.caption}
        className="cf-face-swap mt-2 text-center text-[11px] font-semibold leading-4 text-sidebar-foreground/60"
        role="status"
        aria-live="polite"
      >
        {mood.caption}
      </p>
    </div>
  );
}
