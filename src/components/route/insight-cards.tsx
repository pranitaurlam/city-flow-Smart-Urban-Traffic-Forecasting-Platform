import { AlertTriangle, TrendingUp } from "lucide-react";
import { TierBadge } from "@/components/locations/panels";
import { backtestWeekdayModel, type RouteFactor } from "@/lib/route-forecast";
import type { TrafficTier } from "@/lib/locations";

function formatMin(min: number) {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h} hr ${m} min`;
}

export function HistoricalComparisonCard({
  dateLabel,
  forecastMin,
  typicalMin,
}: {
  dateLabel: string;
  forecastMin: number;
  typicalMin: number;
}) {
  const diff = forecastMin - typicalMin;
  const pct = typicalMin ? Math.round((diff / typicalMin) * 100) : 0;
  return (
    <div className="glass-panel rounded-2xl p-5">
      <h3 className="text-sm font-bold">Historical Comparison</h3>
      <p className="text-xs text-muted-foreground">{dateLabel}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Forecast</p>
          <p className="font-extrabold">{formatMin(forecastMin)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Typical Day</p>
          <p className="font-extrabold">{formatMin(typicalMin)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Difference</p>
          <p className={`font-extrabold ${diff >= 0 ? "text-destructive" : "text-success"}`}>
            {diff >= 0 ? "+" : ""}
            {diff} min
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">vs Historical</p>
          <p className={`font-extrabold ${pct >= 0 ? "text-destructive" : "text-success"}`}>
            {pct >= 0 ? "+" : ""}
            {pct}%
          </p>
        </div>
      </div>
    </div>
  );
}

export function DelayBreakdownCard({
  normalMin,
  trafficDelayMin,
  weatherDelayMin,
}: {
  normalMin: number;
  trafficDelayMin: number;
  weatherDelayMin: number;
}) {
  const total = normalMin + trafficDelayMin + weatherDelayMin;
  return (
    <div className="glass-panel rounded-2xl p-5">
      <h3 className="text-sm font-bold">Expected Journey Time</h3>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Normal travel</span>
          <span className="font-bold">{formatMin(normalMin)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Expected traffic delay</span>
          <span className="font-bold text-warning">+{Math.max(0, trafficDelayMin)} min</span>
        </div>
        {weatherDelayMin > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Weather-associated effect</span>
            <span className="font-bold text-brand-cyan">+{weatherDelayMin} min</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="font-semibold">Forecast</span>
          <span className="text-lg font-extrabold">{formatMin(total)}</span>
        </div>
      </div>
    </div>
  );
}

type Alert = {
  icon: typeof AlertTriangle;
  title: string;
  time: string;
  location: string;
  effect: string;
};

export function RouteAlertsCard({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="glass-panel rounded-2xl p-5">
      <h3 className="text-sm font-bold">Route Alerts</h3>
      <div className="mt-3 space-y-3">
        {alerts.map((a) => (
          <div
            key={a.title}
            className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3"
          >
            <a.icon size={16} className="mt-0.5 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-sm font-bold">{a.title}</p>
              <p className="text-xs text-muted-foreground">
                {a.time} · {a.location}
              </p>
              <p className="text-xs text-muted-foreground">{a.effect}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
export type { Alert as RouteAlert };

export function ForecastAccuracyCard() {
  const { mae, rmse, mape, samples } = backtestWeekdayModel();
  const example = samples[Math.floor(samples.length / 2)];
  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6">
      <h3 className="text-sm font-bold">Forecast Performance</h3>
      <p className="text-xs text-muted-foreground">
        Backtest of CityFlow&apos;s day-of-week traffic model against real observed volumes across
        the Kaggle-covered areas.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">MAE</p>
          <p className="text-lg font-extrabold">{mae.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">RMSE</p>
          <p className="text-lg font-extrabold">{rmse.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-muted-foreground">MAPE</p>
          <p className="text-lg font-extrabold">{mape}%</p>
        </div>
      </div>
      {example && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm">
          <span className="text-xs text-muted-foreground">
            {example.area} · {example.day}
          </span>
          <span>
            Predicted <b>{example.predicted.toLocaleString()}</b> · Actual{" "}
            <b>{example.actual.toLocaleString()}</b> · Error{" "}
            <b>{Math.abs(example.predicted - example.actual).toLocaleString()}</b>
          </span>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Volumes (vehicles/day), not minutes — this validates the day-of-week shape our travel-time
        model applies, not the route-specific time estimate itself.
      </p>
    </div>
  );
}

export function JourneyIntelligenceCard({
  routeLabel,
  whenLabel,
  travelTime,
  rangeLow,
  rangeHigh,
  tier,
  delay,
  weatherSummary,
  historicalPct,
  confidence,
  factors,
}: {
  routeLabel: string;
  whenLabel: string;
  travelTime: number;
  rangeLow: number;
  rangeHigh: number;
  tier: TrafficTier;
  delay: number;
  weatherSummary: string;
  historicalPct: number;
  confidence: number;
  factors: RouteFactor[];
}) {
  return (
    <div className="glass-panel rounded-2xl border-2 border-brand-cyan/30 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <TrendingUp size={16} className="text-brand-cyan" />
        <p className="text-xs font-bold uppercase tracking-wide text-brand-cyan">
          Journey Intelligence
        </p>
      </div>
      <h3 className="mt-1 text-lg font-extrabold tracking-normal">{routeLabel}</h3>
      <p className="text-xs text-muted-foreground">{whenLabel}</p>

      <div className="mt-4 flex flex-wrap items-end gap-6">
        <div>
          <p className="text-3xl font-extrabold">{formatMin(travelTime)}</p>
          <p className="text-xs text-muted-foreground">estimated</p>
        </div>
        <TierBadge tier={tier} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Likely Range</p>
          <p className="font-bold">
            {formatMin(rangeLow)}–{formatMin(rangeHigh)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Expected Delay</p>
          <p className="font-bold">
            {delay >= 0 ? "+" : ""}
            {delay} min
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Weather</p>
          <p className="font-bold">{weatherSummary}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Historical Comparison</p>
          <p className="font-bold">
            {historicalPct >= 0 ? "+" : ""}
            {historicalPct}%
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">Forecast confidence: {confidence}%</p>

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-xs font-bold">Why this forecast?</p>
        <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
          {factors.map((f) => (
            <li key={f.label}>
              • {f.label} ({f.pct}%)
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
