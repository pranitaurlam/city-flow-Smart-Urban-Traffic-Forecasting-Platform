export type HourlyPoint = {
  hour: string;
  historical: number | null;
  forecast: number | null;
};

export const HOUR_LABELS = [
  "12AM",
  "1AM",
  "2AM",
  "3AM",
  "4AM",
  "5AM",
  "6AM",
  "7AM",
  "8AM",
  "9AM",
  "10AM",
  "11AM",
  "12PM",
  "1PM",
  "2PM",
  "3PM",
  "4PM",
  "5PM",
  "6PM",
  "7PM",
  "8PM",
  "9PM",
  "10PM",
  "11PM",
];

/** Relative intensity of traffic by hour (0..1), 12AM..11PM. Same shape reused everywhere for consistency. */
export const DAY_SHAPE = [
  0.3, 0.24, 0.2, 0.18, 0.22, 0.34, 0.55, 0.78, 0.9, 0.8, 0.72, 0.74, 0.78, 0.74, 0.76, 0.7, 0.8,
  0.92, 1.0, 0.86, 0.66, 0.52, 0.42, 0.34,
];

/** Index of the current hour (0..23) in the viewer's local time. */
export function nowHourIndex() {
  return new Date().getHours();
}

/** Builds a 24-point intraday curve: an actual-so-far "historical" line up to the current hour, then a "forecast" line for the remaining hours — both scaled off a single evening-peak volume. */
export function buildHourly(peakVolume: number): HourlyPoint[] {
  const now = nowHourIndex();
  return DAY_SHAPE.map((factor, h) => {
    const historical = h <= now ? Math.round(factor * peakVolume * 0.85) : null;
    let forecast: number | null = null;
    if (h === now) forecast = historical;
    else if (h > now) forecast = Math.round(factor * peakVolume);
    return { hour: HOUR_LABELS[h] ?? "", historical, forecast };
  });
}
