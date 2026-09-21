import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, Droplets, Gauge, MapPin, Thermometer, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trafficTierColor, type BengaluruLocation, type TrafficTier } from "@/lib/locations";
import type { TrafficReading } from "@/lib/traffic-server";
import type { WeatherReading } from "@/lib/weather-server";
import { tomorrowPeakForecast, weeklyTrend } from "@/lib/location-forecast";

function TierBadge({ tier }: { tier: TrafficTier }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
      style={{
        background: `color-mix(in oklab, ${trafficTierColor[tier]} 18%, transparent)`,
        color: trafficTierColor[tier],
      }}
    >
      <i className="size-1.5 rounded-full" style={{ background: trafficTierColor[tier] }} />
      {tier.toUpperCase()}
    </span>
  );
}

export function LocationInfoCard({
  location,
  traffic,
  weather,
  onViewDetails,
}: {
  location: BengaluruLocation;
  traffic: TrafficReading | undefined;
  weather: WeatherReading | undefined;
  onViewDetails: () => void;
}) {
  return (
    <div className="glass-panel w-full max-w-xs rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <MapPin size={15} className="text-brand-cyan" /> {location.name}, Bengaluru
        </p>
        {traffic && <TierBadge tier={traffic.tier} />}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Current Speed</p>
          <p className="font-bold">{traffic ? `${traffic.speedKph} km/h` : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Congestion</p>
          <p className="font-bold">{traffic ? `${traffic.congestionPct}%` : "—"}</p>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-muted-foreground">Traffic Volume</p>
          <p className="font-bold">
            {traffic ? `${traffic.volume.toLocaleString()} vehicles/hour` : "—"}
          </p>
        </div>
        <div className="col-span-2 flex items-center justify-between border-t border-border pt-2">
          <span className="text-xs text-muted-foreground">Weather</span>
          <span className="font-semibold">
            {weather ? `${weather.condition}, ${weather.tempC}°C` : "—"}
          </span>
        </div>
      </div>

      <Button variant="cityflow" size="sm" className="mt-4 w-full" onClick={onViewDetails}>
        View Location Details <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

export function LiveTrafficPanel({ traffic }: { traffic: TrafficReading | undefined }) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Live Traffic</h3>
        <span className="flex items-center gap-1.5 text-xs font-bold text-success">
          <i className="size-2 animate-pulse rounded-full bg-success" />{" "}
          {traffic?.live ? "LIVE" : traffic?.fromDataset ? "DATASET-BASED" : "SIMULATED"}
        </span>
      </div>

      {traffic ? (
        <div className="mt-4 space-y-3 text-sm">
          <Row icon={Gauge} label="Traffic Level" value={traffic.tier} />
          <Row icon={Gauge} label="Speed" value={`${traffic.speedKph} km/h`} />
          <Row icon={Gauge} label="Congestion" value={`${traffic.congestionPct}%`} />
          <Row
            icon={Gauge}
            label="Volume"
            value={`${traffic.volume.toLocaleString()} vehicles/hour`}
          />
          <p className="pt-2 text-xs text-muted-foreground">
            Updated:{" "}
            {new Date(traffic.updatedAt).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Loading live traffic…</p>
      )}
    </div>
  );
}

export function WeatherPanel({ weather }: { weather: WeatherReading | undefined }) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Weather</h3>
        <span className="text-[11px] font-bold text-muted-foreground">
          {weather?.live ? "LIVE" : "SIMULATED"}
        </span>
      </div>

      {weather ? (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-extrabold tracking-normal">{weather.tempC}°C</p>
            <p className="text-sm font-semibold text-muted-foreground">{weather.condition}</p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            <Stat icon={Droplets} label="Rain" value={`${weather.chanceOfRain}%`} />
            <Stat icon={Thermometer} label="Humidity" value={`${weather.humidity}%`} />
            <Stat icon={Wind} label="Wind" value={`${weather.windKph} km/h`} />
          </div>
          <div className="mt-4 rounded-lg border border-border bg-surface p-3">
            <p className="text-xs font-bold text-brand-cyan">Tomorrow&apos;s Weather</p>
            <p className="mt-1 text-sm font-semibold">
              {weather.tomorrow.condition}, {weather.tomorrow.tempC}°C ·{" "}
              {weather.tomorrow.chanceOfRain}% rain
            </p>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Loading weather…</p>
      )}
    </div>
  );
}

export function ForecastPreviewCard({ location }: { location: BengaluruLocation }) {
  const forecast = tomorrowPeakForecast(location);
  return (
    <div className="glass-panel rounded-2xl p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-violet">
        Forecast Preview
      </p>
      <p className="mt-1 text-sm font-bold">{forecast.window}</p>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Expected Traffic</p>
          <TierBadge tier={forecast.tier} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Forecast Volume</p>
          <p className="font-bold">{forecast.volume.toLocaleString()} vehicles/hour</p>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-muted-foreground">Confidence Range</p>
          <p className="font-semibold">
            {forecast.rangeLow.toLocaleString()}–{forecast.rangeHigh.toLocaleString()} vehicles/hour
          </p>
        </div>
      </div>

      <Button variant="outline" size="sm" className="mt-4 w-full">
        View Full Forecast <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

export function HistoricalPreviewChart({ location }: { location: BengaluruLocation }) {
  const trend = weeklyTrend(location);
  return (
    <div className="glass-panel rounded-2xl p-5">
      <h3 className="text-sm font-bold">Recent Traffic Pattern</h3>
      <p className="text-xs text-muted-foreground">
        Monday → Sunday{location.hasDataset ? " · Source: Kaggle traffic dataset" : ""}
      </p>
      <div className="mt-3 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ left: -24 }}>
            <defs>
              <linearGradient id="weeklyFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--brand-blue)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--brand-blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Area
              type="monotone"
              dataKey="volume"
              stroke="var(--brand-blue)"
              fill="url(#weeklyFill)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function NearbyLocationsSection({
  locations,
  onSelect,
}: {
  locations: BengaluruLocation[];
  onSelect: (slug: string) => void;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Nearby Locations</h3>
        <Button variant="ghost" size="sm" className="text-brand-cyan">
          Compare Locations <ArrowRight className="size-4" />
        </Button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {locations.map((location) => (
          <button
            key={location.slug}
            type="button"
            onClick={() => onSelect(location.slug)}
            className="glass-panel rounded-xl p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-cyan"
          >
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <MapPin size={14} className="text-brand-cyan" /> {location.name}
            </p>
            <div className="mt-2">
              <TierBadge tier={location.baseTier} />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon size={14} /> {label}
      </span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Droplets;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-2 py-2 text-center">
      <Icon size={14} className="mx-auto text-brand-cyan" />
      <p className="mt-1 font-bold">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
