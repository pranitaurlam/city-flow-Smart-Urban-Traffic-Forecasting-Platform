/**
 * An animated junction: cars queue at a red light, pull away on green, and
 * cross traffic goes through on its own green. All timing lives in
 * styles.css (the "Street scene" section) on one shared 12-second cycle.
 */

const CAR_COLORS = {
  cyan: "var(--brand-cyan)",
  violet: "var(--brand-violet)",
  blue: "var(--brand-blue)",
  amber: "oklch(0.8 0.15 80)",
  coral: "oklch(0.7 0.18 30)",
  slate: "oklch(0.55 0.03 260)",
};

/** Top-down car facing right: body, windows, headlights and tail lights. */
function Car({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 30 15" className="block size-full overflow-visible" aria-hidden="true">
      <rect x="0.5" y="0.5" width="29" height="14" rx="4" fill={color} />
      <rect x="17" y="2.5" width="6" height="10" rx="1.5" fill="rgb(255 255 255 / 0.55)" />
      <rect x="5" y="3" width="4" height="9" rx="1.2" fill="rgb(255 255 255 / 0.35)" />
      <rect x="10" y="2.5" width="6.5" height="10" rx="1" fill="rgb(0 0 0 / 0.12)" />
      <circle cx="28.6" cy="3.4" r="1.3" fill="oklch(0.97 0.08 95)" />
      <circle cx="28.6" cy="11.6" r="1.3" fill="oklch(0.97 0.08 95)" />
      <rect x="0.6" y="2.2" width="1.4" height="2.6" rx="0.6" fill="oklch(0.6 0.24 25)" />
      <rect x="0.6" y="10.2" width="1.4" height="2.6" rx="0.6" fill="oklch(0.6 0.24 25)" />
    </svg>
  );
}

function Signal({ road }: { road: "main" | "cross" }) {
  return (
    <div className="cf-signal" data-for={road} aria-hidden="true">
      <span className="cf-lamp" data-color="red" />
      <span className="cf-lamp" data-color="amber" />
      <span className="cf-lamp" data-color="green" />
    </div>
  );
}

type CarSpec = {
  anim: string;
  lane: "east" | "west" | "cross";
  color: string;
  /** Queue position for eastbound cars. */
  i?: number;
  /** Where a westbound car sits in the still frame (reduced motion). */
  park?: string;
};

const CARS: CarSpec[] = [
  { anim: "east-0", lane: "east", color: CAR_COLORS.cyan, i: 0 },
  { anim: "east-1", lane: "east", color: CAR_COLORS.violet, i: 1 },
  { anim: "east-2", lane: "east", color: CAR_COLORS.amber, i: 2 },
  { anim: "west-0", lane: "west", color: CAR_COLORS.blue, park: "18%" },
  { anim: "west-1", lane: "west", color: CAR_COLORS.coral, park: "84%" },
  { anim: "cross-0", lane: "cross", color: CAR_COLORS.slate },
  { anim: "cross-1", lane: "cross", color: CAR_COLORS.violet },
];

export function StreetScene({
  size = "full",
  className = "",
}: {
  size?: "full" | "compact";
  className?: string;
}) {
  return (
    <div className={`cf-street ${className}`} data-size={size} aria-hidden="true">
      <div className="cf-street-road" />
      <div className="cf-street-cross" />
      <div
        className="cf-street-zebra"
        style={{ left: "calc(var(--cross-x) - var(--cross-w) / 2 - 12px)" }}
      />
      <div
        className="cf-street-zebra"
        style={{ left: "calc(var(--cross-x) + var(--cross-w) / 2 + 2px)" }}
      />
      <div className="cf-street-stop" />
      {CARS.map((car) => (
        <div
          key={car.anim}
          className="cf-car"
          data-lane={car.lane}
          data-anim={car.anim}
          style={
            {
              ...(car.i !== undefined ? { "--i": car.i } : {}),
              ...(car.park ? { "--park": car.park } : {}),
            } as React.CSSProperties
          }
        >
          <Car color={car.color} />
        </div>
      ))}
      <Signal road="main" />
      <Signal road="cross" />
    </div>
  );
}
