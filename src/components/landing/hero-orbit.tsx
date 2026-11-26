import { CalendarClock, Route as RouteIcon, TrendingUp } from "lucide-react";
import { HERO_PARTICLES } from "@/components/landing/hero-particles";

/**
 * Animated hero visual: the globe sits in a softly pulsing halo, with
 * floating cards that walk through what CityFlow does.
 */

/**
 * The hero's opening: particles fly in, spell "Bengaluru", hold, then
 * rearrange into the globe's disc and fade out as the globe materialises and
 * takes over the rotation.
 *
 * Positions come from the pre-sampled table in hero-particles.ts, so the
 * markup is identical on server and client. Coordinates are in cqw (percent of
 * the globe's width), which keeps the lettering in proportion at any size.
 */
/**
 * How wide the word sits relative to the globe. The sampled points span the
 * full 100 units; at 1.0 the lettering is as wide as the globe and runs off the
 * column, and past ~0.6 the last letters disappear behind the Events card.
 */
const WORD_SCALE = 0.56;

function GlobeParticles() {
  return (
    <div className="cf-particle-field" aria-hidden="true">
      {HERO_PARTICLES.map(([tx, ty, gx, gy, fx, fy, size, delay], i) => (
        <span
          key={i}
          className="cf-particle"
          style={
            {
              width: size,
              height: size,
              "--tx": `${(tx * WORD_SCALE).toFixed(2)}cqw`,
              "--ty": `${(ty * WORD_SCALE).toFixed(2)}cqw`,
              "--gx": `${gx}cqw`,
              "--gy": `${gy}cqw`,
              "--fx": `${fx}px`,
              "--fy": `${fy}px`,
              "--d": `${delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Wraps the globe image with its glow, assembled out of incoming particles. */
export function GlobeOrbit({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="cf-halo size-[72%]" aria-hidden="true" />
      <div className="relative">
        <GlobeParticles />
        {/* The fade-in lives on this wrapper so the image keeps its own spin. */}
        <div className="cf-globe-form">{children}</div>
      </div>
    </>
  );
}

const CARDS = [
  {
    icon: TrendingUp,
    step: "Forecast · 01",
    title: "Predicts congestion",
    line: "Koramangala · tomorrow 6 PM",
    sub: "very high · 7-day model",
    position: "left-[0%] top-[2%]",
    delay: 500,
  },
  {
    icon: CalendarClock,
    step: "Events · 02",
    title: "Spots big events",
    line: "Concert at Palace Grounds",
    sub: "~40k people · +22 min nearby",
    position: "right-[-2%] top-[36%]",
    delay: 800,
  },
  {
    icon: RouteIcon,
    step: "Route · 03",
    title: "Finds a way around",
    line: "Detour saves ~17 min",
    sub: "opens in Google Maps",
    position: "bottom-[4%] left-[8%]",
    delay: 1100,
  },
];

/** Floating step cards around the globe (large screens only). */
export function HeroCards() {
  return (
    <>
      {CARDS.map(({ icon: Icon, step, title, line, sub, position, delay }) => (
        <div
          key={step}
          className={`cf-card glass-panel absolute z-20 hidden w-56 rounded-2xl p-4 lg:block ${position}`}
          style={{ "--d": `${delay}ms` } as React.CSSProperties}
        >
          <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-brand-violet">
            <span className="relative flex size-2">
              <span className="cf-ping absolute inset-0 rounded-full bg-brand-cyan" />
              <span className="relative size-2 rounded-full bg-brand-cyan" />
            </span>
            {step}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm font-extrabold">
            <Icon className="size-4 text-brand-cyan" />
            {title}
          </p>
          <p className="mt-1.5 text-xs font-semibold">{line}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
          <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="cf-progress h-full rounded-full bg-gradient-brand"
              style={{ "--d": `${delay}ms` } as React.CSSProperties}
            />
          </div>
        </div>
      ))}
      <p className="absolute bottom-0 right-0 z-20 hidden font-mono text-[10px] tracking-wide text-muted-foreground lg:block">
        Illustrative example · sample trip, not live traffic
      </p>
    </>
  );
}

// Deterministic star positions so server and client render the same markup.
const STARS = Array.from({ length: 46 }, (_, i) => {
  const rand = (n: number) => {
    const x = Math.sin(i * 9301 + n * 49297) * 233280;
    return x - Math.floor(x);
  };
  return {
    left: `${(rand(1) * 100).toFixed(2)}%`,
    top: `${(rand(2) * 100).toFixed(2)}%`,
    size: 1 + Math.round(rand(3) * 2),
    t: `${(3 + rand(4) * 4).toFixed(1)}s`,
    d: `${(rand(5) * 5).toFixed(1)}s`,
  };
});

/** Drifting aurora glow and twinkling stars behind the hero. */
export function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="cf-aurora cf-aurora-a left-[45%] top-[-10%] size-[520px]"
        style={{ background: "color-mix(in oklab, var(--brand-violet) 55%, transparent)" }}
      />
      <div
        className="cf-aurora cf-aurora-b right-[-8%] top-[30%] size-[460px]"
        style={{ background: "color-mix(in oklab, var(--brand-cyan) 50%, transparent)" }}
      />
      <div
        className="cf-aurora cf-aurora-a bottom-[-20%] left-[-10%] size-[420px]"
        style={{ background: "color-mix(in oklab, var(--brand-blue) 35%, transparent)" }}
      />
      {STARS.map((s, i) => (
        <span
          key={i}
          className="cf-star"
          style={
            {
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              "--t": s.t,
              "--d": s.d,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
