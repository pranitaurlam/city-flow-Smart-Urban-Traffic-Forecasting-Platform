import { useEffect, useState } from "react";

/**
 * Playful home-page touches: Flowy the mascot car with rotating tips, a
 * small city skyline with twinkling windows, clouds and birds, and sparkles.
 * Motion lives in styles.css ("Cute home-page touches") and is off for
 * reduced-motion users.
 */

const TIPS = [
  "Hi, I'm Flowy! I keep an eye on Bengaluru's roads for you.",
  "Evening peak is usually 5:30–7:30 PM. Leaving a bit early helps!",
  "Big concert tonight? I'll find you a way around the crowd.",
  "Need to arrive by 9? The Arrival Planner tells you when to leave.",
  "Route Forecast picks the fastest road and opens it in Google Maps.",
  "Add me to your iPhone home screen and I'll ride along with you.",
];

/** Flowy: a cute car with blinking eyes, spinning wheels and a speech bubble. */
export function Mascot({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTip((t) => (t + 1) % TIPS.length), 4500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={`flex items-end gap-3 ${className}`} style={style}>
      <div className="cf-car-bob relative w-28 shrink-0 sm:w-32">
        <svg viewBox="0 0 130 92" className="w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="flowy-body" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--brand-cyan)" />
              <stop offset="100%" stopColor="var(--brand-violet)" />
            </linearGradient>
          </defs>
          {/* exhaust puffs */}
          {[0, 0.55, 1.1].map((d) => (
            <circle
              key={d}
              className="cf-puff"
              cx="12"
              cy="66"
              r="6"
              fill="color-mix(in oklab, var(--foreground) 18%, transparent)"
              style={{ "--d": `${d}s` } as React.CSSProperties}
            />
          ))}
          <ellipse cx="66" cy="86" rx="46" ry="4" fill="rgb(0 0 0 / 0.12)" />
          {/* antenna */}
          <g className="cf-antenna">
            <line x1="74" y1="16" x2="80" y2="2" stroke="var(--brand-violet)" strokeWidth="2.5" />
            <circle cx="80" cy="3" r="4" fill="oklch(0.75 0.18 15)" />
          </g>
          {/* cabin + body */}
          <rect x="34" y="14" width="62" height="34" rx="16" fill="url(#flowy-body)" />
          <rect x="41" y="20" width="48" height="18" rx="9" fill="rgb(255 255 255 / 0.85)" />
          <rect x="14" y="38" width="104" height="36" rx="17" fill="url(#flowy-body)" />
          {/* headlight */}
          <circle cx="113" cy="50" r="4" fill="oklch(0.95 0.12 95)" />
          {/* face */}
          <g className="cf-eyes">
            <circle cx="56" cy="51" r="7.5" fill="#fff" />
            <circle cx="80" cy="51" r="7.5" fill="#fff" />
            <circle cx="58" cy="52" r="4" fill="oklch(0.2 0.05 265)" />
            <circle cx="82" cy="52" r="4" fill="oklch(0.2 0.05 265)" />
            <circle cx="59.5" cy="50.5" r="1.4" fill="#fff" />
            <circle cx="83.5" cy="50.5" r="1.4" fill="#fff" />
          </g>
          <ellipse cx="45" cy="61" rx="5" ry="3" fill="oklch(0.78 0.14 10 / 0.7)" />
          <ellipse cx="92" cy="61" rx="5" ry="3" fill="oklch(0.78 0.14 10 / 0.7)" />
          <path
            d="M62 61 Q68 67 74 61"
            stroke="oklch(0.2 0.05 265)"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
          {/* wheels */}
          {[36, 96].map((cx) => (
            <g key={cx} className="cf-wheel">
              <circle cx={cx} cy="75" r="11" fill="oklch(0.25 0.03 265)" />
              <circle cx={cx} cy="75" r="4.5" fill="oklch(0.85 0.02 265)" />
              <rect x={cx - 1} y="65" width="2" height="20" fill="oklch(0.85 0.02 265)" />
            </g>
          ))}
        </svg>
      </div>
      <div
        key={tip}
        className="cf-bubble glass-panel relative mb-10 max-w-[15rem] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs font-semibold leading-5"
        role="status"
        aria-live="polite"
      >
        {TIPS[tip]}
      </div>
    </div>
  );
}

// Deterministic skyline so server and client render the same markup.
const BUILDINGS = Array.from({ length: 26 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const floors = 3 + Math.floor(r(1) * 8);
  return {
    width: 34 + Math.round(r(2) * 46),
    floors,
    tint: r(3) > 0.5 ? "var(--brand-blue)" : "var(--brand-violet)",
    windows: Array.from({ length: floors * 2 }, (_, w) => ({
      t: `${(3 + r(10 + w) * 5).toFixed(1)}s`,
      d: `${(r(30 + w) * 6).toFixed(1)}s`,
    })),
  };
});

function Cloud({ scale = 1 }: { scale?: number }) {
  return (
    <svg width={90 * scale} height={36 * scale} viewBox="0 0 90 36" aria-hidden="true">
      <path
        d="M18 34h56a14 14 0 0 0 0-28 18 18 0 0 0-33-4A13 13 0 0 0 18 16a9 9 0 0 0 0 18z"
        fill="color-mix(in oklab, var(--background) 70%, white)"
        opacity="0.9"
      />
    </svg>
  );
}

function Bird() {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
      <g className="cf-wing">
        <path
          d="M1 7 Q6 1 11 7 Q16 1 21 7"
          fill="none"
          stroke="color-mix(in oklab, var(--foreground) 55%, transparent)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** A small city: buildings with twinkling windows, sun/moon, clouds, birds. */
export function CitySkyline() {
  return (
    <div className="relative h-36 overflow-hidden sm:h-44" aria-hidden="true">
      {/* sun by day, moon by night */}
      <div className="absolute left-[85%] top-[22%] size-10 -translate-x-1/2 rounded-full bg-[oklch(0.88_0.15_85)] shadow-[0_0_30px_oklch(0.88_0.15_85)] dark:hidden" />
      <div className="absolute left-[85%] top-[22%] hidden size-9 -translate-x-1/2 rounded-full bg-[oklch(0.92_0.03_250)] shadow-[0_0_24px_oklch(0.92_0.03_250/60%)] dark:block" />

      <div
        className="cf-cloud top-[8%]"
        style={{ "--x": "12%", "--dur": "70s", "--delay": "-20s" } as React.CSSProperties}
      >
        <Cloud />
      </div>
      <div
        className="cf-cloud top-[26%]"
        style={{ "--x": "55%", "--dur": "95s", "--delay": "-60s" } as React.CSSProperties}
      >
        <Cloud scale={0.7} />
      </div>
      <div
        className="cf-cloud top-[4%]"
        style={{ "--x": "70%", "--dur": "80s", "--delay": "-5s" } as React.CSSProperties}
      >
        <Cloud scale={0.55} />
      </div>
      <div
        className="cf-bird top-[18%]"
        style={{ "--x": "30%", "--dur": "24s", "--delay": "-6s" } as React.CSSProperties}
      >
        <Bird />
      </div>
      <div
        className="cf-bird top-[30%]"
        style={{ "--x": "38%", "--dur": "30s", "--delay": "-18s" } as React.CSSProperties}
      >
        <Bird />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-1.5 px-2">
        {BUILDINGS.map((b, i) => (
          <div
            key={i}
            className="grid shrink-0 grid-cols-2 content-start gap-1.5 rounded-t-md px-2 pt-2"
            style={{
              width: b.width,
              height: 14 + b.floors * 11,
              background: `color-mix(in oklab, ${b.tint} 16%, color-mix(in oklab, var(--foreground) 10%, var(--background)))`,
            }}
          >
            {b.windows.map((w, j) => (
              <span
                key={j}
                className="cf-window h-1.5 rounded-[2px] bg-[oklch(0.88_0.14_90)]"
                style={{ "--t": w.t, "--d": w.d } as React.CSSProperties}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const SPARKLES = [
  { top: "-6%", left: "-4%", size: 18, d: "0s" },
  { top: "18%", left: "92%", size: 14, d: "0.9s" },
  { top: "78%", left: "64%", size: 12, d: "1.6s" },
];

/** Little four-point sparkles that twinkle around a word. */
export function Sparkles() {
  return (
    <>
      {SPARKLES.map((s, i) => (
        <svg
          key={i}
          className="cf-sparkle"
          width={s.size}
          height={s.size}
          viewBox="0 0 24 24"
          style={{ top: s.top, left: s.left, "--d": s.d } as React.CSSProperties}
          aria-hidden="true"
        >
          <path
            d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z"
            fill="var(--brand-violet)"
          />
        </svg>
      ))}
    </>
  );
}
