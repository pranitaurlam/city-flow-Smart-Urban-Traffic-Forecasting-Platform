import type { TrafficTier } from "@/lib/locations";

const LEVELS: { level: TrafficTier; color: string }[] = [
  { level: "Low", color: "var(--success)" },
  { level: "Moderate", color: "var(--warning)" },
  { level: "High", color: "oklch(0.7 0.19 45)" },
  { level: "Very High", color: "var(--destructive)" },
];

const CX = 110;
const CY = 105;
const R = 82;
const STROKE = 16;

function polarToCartesian(angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

function arcPath(startAngle: number, endAngle: number) {
  const start = polarToCartesian(startAngle);
  const end = polarToCartesian(endAngle);
  return `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`;
}

export function TrafficGauge({ level }: { level: TrafficTier }) {
  const levelIndex = LEVELS.findIndex((item) => item.level === level);
  const segmentAngle = 180 / LEVELS.length;
  const needleAngle = -90 + segmentAngle * (levelIndex + 0.5);
  const needleTip = polarToCartesian(needleAngle);

  return (
    <svg
      viewBox="0 0 220 130"
      className="w-full max-w-[260px]"
      role="img"
      aria-label={`Traffic status: ${level}`}
    >
      {LEVELS.map(({ level: segLevel, color }, index) => {
        const start = -90 + segmentAngle * index;
        const end = start + segmentAngle;
        return (
          <path
            key={segLevel}
            d={arcPath(start, end)}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            opacity={segLevel === level ? 1 : 0.35}
          />
        );
      })}
      <circle cx={CX} cy={CY} r={5} fill="var(--foreground)" />
      <line
        x1={CX}
        y1={CY}
        x2={needleTip.x}
        y2={needleTip.y}
        stroke="var(--foreground)"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <text x={CX - R} y={CY + 18} fontSize="10" fill="var(--muted-foreground)" textAnchor="start">
        Low
      </text>
      <text x={CX + R} y={CY + 18} fontSize="10" fill="var(--muted-foreground)" textAnchor="end">
        Very High
      </text>
    </svg>
  );
}
