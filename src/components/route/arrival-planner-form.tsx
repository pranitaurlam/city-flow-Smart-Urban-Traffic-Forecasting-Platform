import { CalendarClock, Gauge, LoaderCircle, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODE_OPTIONS } from "@/components/route/route-alert-ui";
import { LocationAutocomplete, type ResolvedPlace } from "@/components/route/location-autocomplete";
import {
  BUFFER_OPTIONS,
  RELIABILITY_TARGETS,
  type ReliabilityTarget,
  type SafetyBufferMin,
} from "@/lib/arrival-planner";
import type { PlannerMode } from "@/lib/route-intelligence";

export type ArrivalFormState = {
  originText: string;
  origin: ResolvedPlace | null;
  destinationText: string;
  destination: ResolvedPlace | null;
  date: string; // yyyy-mm-dd
  arrivalHour: number;
  arrivalMinute: number;
  mode: PlannerMode;
  reliabilityTarget: ReliabilityTarget;
  bufferMin: SafetyBufferMin;
};

export function ArrivalPlannerForm({
  form,
  onChange,
  onSubmit,
  loading,
  error,
}: {
  form: ArrivalFormState;
  onChange: (patch: Partial<ArrivalFormState>) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
}) {
  const valid = !!form.origin && !!form.destination && !!form.date;

  return (
    <section className="glass-panel rounded-3xl p-5 sm:p-7">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-cyan">
        Arrival Time Reliability Window
      </p>
      <h2 className="mt-1 text-2xl font-extrabold sm:text-[28px]">Arrival Planner</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Tell CityFlow when you need to arrive — it works backward through route, traffic, forecast,
        and weather data to recommend when to leave.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit();
        }}
        className="mt-6 space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <LocationAutocomplete
            label="Starting point"
            placeholder="Enter starting location"
            value={form.originText}
            onChangeText={(text) => onChange({ originText: text })}
            onResolved={(place) => onChange({ origin: place })}
            icon={<MapPin size={12} className="text-brand-cyan" />}
          />
          <LocationAutocomplete
            label="Destination"
            placeholder="Enter destination"
            value={form.destinationText}
            onChangeText={(text) => onChange({ destinationText: text })}
            onResolved={(place) => onChange({ destination: place })}
            icon={<MapPin size={12} className="text-brand-violet" />}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <CalendarClock size={12} className="text-brand-cyan" /> Travel date
            </span>
            <input
              type="date"
              value={form.date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => onChange({ date: e.target.value })}
              className="h-11 w-full rounded-xl border border-border bg-surface-strong px-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              Required arrival time
            </span>
            <input
              type="time"
              value={`${String(form.arrivalHour).padStart(2, "0")}:${String(form.arrivalMinute).padStart(2, "0")}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                onChange({ arrivalHour: h ?? 9, arrivalMinute: m ?? 0 });
              }}
              className="h-11 w-full rounded-xl border border-border bg-surface-strong px-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            />
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-xs font-bold text-muted-foreground">Transport mode</legend>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-secondary/60 p-1 sm:grid-cols-4">
            {MODE_OPTIONS.map((m) => {
              const active = form.mode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ mode: m.key })}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-surface-strong shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <m.icon size={15} className={active ? "text-brand-blue" : undefined} /> {m.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
              <ShieldCheck size={13} className="text-brand-cyan" /> Target on-time reliability
            </legend>
            <div className="flex gap-1.5">
              {RELIABILITY_TARGETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={form.reliabilityTarget === r}
                  onClick={() => onChange({ reliabilityTarget: r })}
                  className={`h-10 flex-1 rounded-lg border text-sm font-semibold transition ${
                    form.reliabilityTarget === r
                      ? "border-transparent bg-[color-mix(in_oklab,var(--brand-blue)_14%,transparent)] text-brand-blue"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r}%
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
              <Gauge size={13} className="text-brand-cyan" /> Safety buffer (optional)
            </legend>
            <div className="flex gap-1.5">
              {BUFFER_OPTIONS.map((b) => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={form.bufferMin === b}
                  onClick={() => onChange({ bufferMin: b })}
                  className={`h-10 flex-1 rounded-lg border text-sm font-semibold transition ${
                    form.bufferMin === b
                      ? "border-transparent bg-[color-mix(in_oklab,var(--brand-blue)_14%,transparent)] text-brand-blue"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {b === 0 ? "None" : `+${b} min`}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {error && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="cityflow"
          size="lg"
          disabled={!valid || loading}
          className="h-12 w-full rounded-xl text-base font-bold sm:w-auto sm:px-8"
        >
          {loading && <LoaderCircle className="size-4 animate-spin" />}
          {loading ? "Calculating…" : "Calculate Departure Window"}
        </Button>
      </form>
    </section>
  );
}
