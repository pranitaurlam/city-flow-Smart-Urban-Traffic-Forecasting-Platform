import { useState, type FormEvent } from "react";
import {
  ArrowDown,
  Bell,
  BellOff,
  BellRing,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { geocodePlace } from "@/lib/geocode-server";
import { getRoute } from "@/lib/route-server";
import {
  corridorsAlongRoute,
  openInGoogleMaps,
  plannerMode,
  rangeLabel,
  type PlannerMode,
} from "@/lib/route-intelligence";
import {
  ALERT_RULES,
  clock,
  DAY_SHORT,
  detectAlerts,
  evaluateRoute,
  formatDays,
  FREQUENCIES,
  parseTime,
  THRESHOLDS,
  type AlertRule,
  type PersonalRoute,
  type RouteStatus,
  type RouteSummary,
  TEST_SCENARIO,
} from "@/lib/personal-routes";
import { routeAlertActions, useRouteAlertStore } from "@/lib/personal-routes-store";
import { notifyDesktop } from "@/hooks/use-route-monitor";
import {
  MODE_OPTIONS,
  modeOption,
  routeIcon,
  TONE_COLOR,
  type RouteMonitor,
} from "./route-alert-ui";
import { trafficTierColor } from "@/lib/locations";

const TEMPLATES = ["College → PG", "Home → College", "Home → Office", "PG → College"];

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function PersonalRouteAlerts({ monitor }: { monitor: RouteMonitor }) {
  const store = useRouteAlertStore();
  const [editing, setEditing] = useState<PersonalRoute | "new" | null>(null);
  const [prefill, setPrefill] = useState<Partial<FormState> | undefined>();

  const latest =
    store.alerts.find((a) => !a.read && a.severity !== "positive" && !a.test) ??
    store.alerts.find((a) => !a.read && a.test);
  const latestRoute = latest && store.routes.find((r) => r.id === latest.routeId);
  const latestStatus =
    latestRoute &&
    (latest.test
      ? evaluateRoute(latestRoute, { ...monitor.ctx, scenario: TEST_SCENARIO })
      : monitor.statuses[latestRoute.id]);

  const openNew = (p?: Partial<FormState>) => {
    setPrefill(p);
    setEditing("new");
  };

  return (
    <section id="personal-route-alerts" aria-labelledby="pra-title" className="space-y-5">
      <div className="glass-panel relative overflow-hidden rounded-3xl p-5 sm:p-7">
        <Waves />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-cyan">
              CityFlow Alerts
            </p>
            <h2 id="pra-title" className="mt-1 text-2xl font-extrabold sm:text-[28px]">
              Personal Route Alerts
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Stay ahead of traffic on the routes you travel every day.
            </p>
          </div>
          <Button
            onClick={() => openNew()}
            size="lg"
            className="h-11 rounded-xl bg-gradient-brand px-5 font-bold text-white shadow-brand hover:opacity-95"
          >
            <Plus className="size-4" /> Add Personal Route
          </Button>
        </div>

        <ol className="relative mt-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-[11px] font-semibold text-muted-foreground">
          {[
            "Save route",
            "CityFlow monitors forecast",
            "Change detected",
            "Intelligent alert",
            "Route analysis",
            "Best departure",
            "Open in Google Maps",
          ].map((step, i, arr) => (
            <li key={step} className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-surface-strong px-2.5 py-1">
                <span className="grid size-4 place-items-center rounded-full bg-[color-mix(in_oklab,var(--brand-blue)_15%,transparent)] text-[9px] font-extrabold text-brand-blue">
                  {i + 1}
                </span>
                {step}
              </span>
              {i < arr.length - 1 && <span className="text-border">—</span>}
            </li>
          ))}
        </ol>
      </div>

      {latest && latestRoute && latestStatus && (
        <LatestAlertBanner
          route={latestRoute}
          status={latestStatus}
          title={latest.title}
          message={latest.message}
          test={!!latest.test}
          severity={latest.severity}
          onView={() => {
            routeAlertActions.markRead(latest.id);
            routeAlertActions.openAnalysis(latestRoute.id, false, !!latest.test);
          }}
          onDismiss={() => routeAlertActions.markRead(latest.id)}
        />
      )}

      {store.routes.length === 0 ? (
        <EmptyState onTemplate={(name) => openNew({ name })} onExample={() => openNew(EXAMPLE)} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {store.routes.map((r) => (
            <RouteCard
              key={r.id}
              route={r}
              status={monitor.statuses[r.id]}
              onEdit={() => setEditing(r)}
            />
          ))}
          <button
            type="button"
            onClick={() => openNew()}
            className="grid min-h-[220px] place-items-center rounded-2xl border border-dashed border-border text-sm font-semibold text-muted-foreground transition hover:border-brand-cyan hover:text-foreground"
          >
            <span className="flex flex-col items-center gap-2">
              <Plus className="size-5" /> Add another route
            </span>
          </button>
        </div>
      )}

      <PreferencesBar monitor={monitor} />

      <RouteFormDialog
        open={editing !== null}
        route={editing && editing !== "new" ? editing : null}
        prefill={prefill}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Latest alert
// ---------------------------------------------------------------------------

function LatestAlertBanner({
  route,
  status,
  title,
  message,
  test,
  severity,
  onView,
  onDismiss,
}: {
  route: PersonalRoute;
  status: RouteStatus;
  title: string;
  message: string;
  test: boolean;
  severity: "critical" | "warning" | "positive";
  onView: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="relative overflow-hidden rounded-2xl bg-[oklch(0.19_0.05_262)] p-5 text-white ring-1 ring-white/10 sm:p-6"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: TONE_COLOR[severity] }}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/60">
            <BellRing size={14} style={{ color: TONE_COLOR[severity] }} /> Route Alert
            {test && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] tracking-normal">
                Test
              </span>
            )}
          </p>
          <p className="mt-1.5 text-lg font-extrabold">{title}</p>
          <p className="mt-0.5 max-w-2xl text-sm text-white/70">{message}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={onView}
            className="rounded-lg bg-white text-[oklch(0.19_0.05_262)] hover:bg-white/90"
          >
            View analysis
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            className="rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
          >
            Dismiss
          </Button>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="Normal" value={`${status.normalMin} min`} />
        <Fact label="Forecast" value={rangeLabel(status.rangeLow, status.rangeHigh)} />
        <Fact
          label="Expected delay"
          value={
            status.delayHigh > 0
              ? `+${Math.max(0, status.delayLow)}–${status.delayHigh} min`
              : "None"
          }
        />
        <Fact
          label="Traffic"
          value={
            <span className="flex items-center gap-1.5">
              <i
                className="size-2 rounded-full"
                style={{ background: trafficTierColor[status.tier] }}
              />
              {status.tier}
            </span>
          }
        />
        <Fact label="Reliability" value={`${status.reliability}%`} />
        <Fact
          label="Recommended departure"
          value={
            status.recommendation.changed
              ? status.recommendation.windowStart
              : clock(parseTime(route.departure))
          }
        />
      </dl>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-white/45">{label}</dt>
      <dd className="mt-0.5 font-bold tabular-nums">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route card
// ---------------------------------------------------------------------------

function RouteCard({
  route,
  status,
  onEdit,
}: {
  route: PersonalRoute;
  status: RouteStatus | undefined;
  onEdit: () => void;
}) {
  const Icon = routeIcon(route.name);
  const mode = modeOption(route.mode);
  const ModeIcon = mode.icon;
  const tone = status?.headline.tone ?? "ok";

  return (
    <article className="glass-panel flex flex-col rounded-2xl p-5">
      <header className="flex items-start justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2.5 text-base font-extrabold">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--brand-blue)_12%,transparent)] text-brand-blue">
            <Icon size={17} />
          </span>
          <span className="truncate">{route.name}</span>
        </h3>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            route.alertsOn
              ? "bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-success"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          <i
            className={`size-1.5 rounded-full ${route.alertsOn ? "bg-success" : "bg-muted-foreground"}`}
          />
          {route.alertsOn ? "Active" : "Paused"}
        </span>
      </header>

      <div className="mt-4 space-y-1 text-sm">
        <p className="truncate font-semibold" title={route.origin.text}>
          {route.origin.text}
        </p>
        <ArrowDown size={14} className="text-muted-foreground" />
        <p className="truncate font-semibold" title={route.destination.text}>
          {route.destination.text}
        </p>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1">
          <ModeIcon size={13} /> {mode.label}
        </span>
        <span aria-hidden>•</span>
        <span>{clock(parseTime(route.departure))}</span>
        <span aria-hidden>•</span>
        <span>{formatDays(route.days)}</span>
      </p>

      {status ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-border bg-surface-strong p-3 text-sm">
            <CardStat label="Normal" value={`${status.normalMin} min`} />
            <CardStat label="Forecast" value={rangeLabel(status.rangeLow, status.rangeHigh)} />
            <CardStat
              label="Expected delay"
              value={
                status.delayHigh > 0
                  ? `+${Math.max(0, status.delayLow)}–${status.delayHigh} min`
                  : "None"
              }
              warn={status.delayMin >= route.thresholdMin}
            />
            <CardStat label="Reliability" value={`${status.reliability}%`} />
          </dl>
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
            <i
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: TONE_COLOR[tone] }}
            />
            {status.headline.text}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {status.next ? `Next trip: ${status.next.label}` : "No upcoming trip scheduled"}
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Calculating forecast…</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <Button
          size="sm"
          variant="cityflow"
          className="rounded-lg"
          onClick={() => routeAlertActions.openAnalysis(route.id)}
        >
          View Analysis
        </Button>
        <Button size="sm" variant="outline" className="rounded-lg" onClick={onEdit}>
          <Pencil className="size-3.5" /> Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          aria-pressed={route.alertsOn}
          onClick={() => routeAlertActions.setRouteAlerts(route.id, !route.alertsOn)}
        >
          {route.alertsOn ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
          {route.alertsOn ? "On" : "Off"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto size-8 rounded-lg"
          aria-label={`Open ${route.name} in Google Maps`}
          title="Open in Google Maps"
          onClick={() => openInGoogleMaps(route.origin.text, route.destination.text, route.mode)}
        >
          <ExternalLink className="size-4" />
        </Button>
      </div>
    </article>
  );
}

function CardStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={`font-extrabold tabular-nums ${warn ? "text-[oklch(0.66_0.19_45)]" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state + preferences
// ---------------------------------------------------------------------------

const EXAMPLE: Partial<FormState> = {
  name: "College → PG",
  origin: "Polaris School of Technology",
  destination: "Marathahalli, Bengaluru",
  mode: "two-wheeler",
  departure: "18:00",
};

function EmptyState({
  onTemplate,
  onExample,
}: {
  onTemplate: (name: string) => void;
  onExample: () => void;
}) {
  return (
    <div className="glass-panel rounded-2xl p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--brand-blue)_12%,transparent)] text-brand-blue">
        <BellRing size={22} />
      </span>
      <h3 className="mt-4 text-lg font-extrabold">No personal routes yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Save a trip you make regularly. CityFlow compares each day&apos;s forecast with your
        route&apos;s normal and only alerts you when something meaningfully changes.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTemplate(t)}
            className="rounded-full border border-border bg-surface-strong px-3.5 py-1.5 text-sm font-semibold transition hover:border-brand-cyan"
          >
            {t}
          </button>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="mt-3 text-brand-blue" onClick={onExample}>
        <Sparkles className="size-3.5" /> Try the example: Polaris → Marathahalli
      </Button>
    </div>
  );
}

function PreferencesBar({ monitor }: { monitor: RouteMonitor }) {
  const store = useRouteAlertStore();
  const [notice, setNotice] = useState<string | null>(null);
  const canNotify = typeof Notification !== "undefined";

  const toggleDesktop = async () => {
    if (store.prefs.desktop) return routeAlertActions.setPrefs({ desktop: false });
    if (!canNotify) return setNotice("This browser doesn't support desktop notifications.");
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission === "granted") {
      routeAlertActions.setPrefs({ desktop: true });
      setNotice(null);
    } else {
      setNotice("Notifications are blocked for this site in your browser settings.");
    }
  };

  const sendTest = () => {
    const route = store.routes[0];
    if (!route) return setNotice("Add a personal route first, then send a test alert.");
    const status = evaluateRoute(route, { ...monitor.ctx, scenario: TEST_SCENARIO });
    const drafts = detectAlerts(route, status, {
      frequency: "always",
      previous: store.alerts,
      now: new Date(),
      test: true,
    });
    const added = routeAlertActions.pushAlerts(drafts);
    notifyDesktop(
      added.map((a) => ({ title: `[Test] ${a.title}`, body: a.message })),
      store.prefs.desktop,
    );
    setNotice(
      added.length
        ? `Sent ${added.length} test alert${added.length > 1 ? "s" : ""} for “${route.name}” (simulated heavy congestion + rain).`
        : `No alert rules on “${route.name}” would fire even in the test scenario — check its alert settings.`,
    );
  };

  return (
    <div id="alert-preferences" className="glass-panel scroll-mt-24 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="text-sm font-bold">Notification preferences</p>
        <div
          role="radiogroup"
          aria-label="Notification frequency"
          className="flex rounded-lg border border-border bg-secondary/60 p-0.5"
        >
          {FREQUENCIES.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={store.prefs.frequency === f.key}
              title={f.description}
              onClick={() => routeAlertActions.setPrefs({ frequency: f.key })}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                store.prefs.frequency === f.key
                  ? "bg-surface-strong shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={store.prefs.desktop}
            onChange={toggleDesktop}
            className="size-4 accent-[var(--brand-blue)]"
          />
          Desktop notifications
        </label>
        <Button size="sm" variant="outline" className="ml-auto rounded-lg" onClick={sendTest}>
          <BellRing className="size-3.5" /> Send test alert
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {FREQUENCIES.find((f) => f.key === store.prefs.frequency)?.description}. Alerts are checked
        every minute while CityFlow is open
        {monitor.trafficLive
          ? " using live traffic."
          : "; live congestion feed not connected, so forecasts use historical patterns and weather."}
      </p>
      {notice && <p className="mt-2 text-xs font-semibold text-brand-blue">{notice}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / edit dialog
// ---------------------------------------------------------------------------

type FormState = {
  name: string;
  origin: string;
  destination: string;
  mode: PlannerMode;
  departure: string;
  days: number[];
  rules: AlertRule[];
  thresholdMin: number;
};

const DEFAULT_FORM: FormState = {
  name: "",
  origin: "",
  destination: "",
  mode: "driving",
  departure: "18:00",
  days: [0, 1, 2, 3, 4],
  rules: ["worseThanNormal", "delay", "lowReliability", "event", "roadCondition"],
  thresholdMin: 10,
};

function toForm(route: PersonalRoute | null, prefill?: Partial<FormState>): FormState {
  if (!route) return { ...DEFAULT_FORM, ...prefill };
  return {
    name: route.name,
    origin: route.origin.text,
    destination: route.destination.text,
    mode: route.mode,
    departure: route.departure,
    days: route.days,
    rules: route.rules,
    thresholdMin: route.thresholdMin,
  };
}

function RouteFormDialog({
  open,
  route,
  prefill,
  onClose,
}: {
  open: boolean;
  route: PersonalRoute | null;
  prefill?: Partial<FormState> | undefined;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-2xl p-0 sm:rounded-2xl">
        {open && (
          <RouteForm
            key={route?.id ?? "new"}
            route={route}
            initial={toForm(route, prefill)}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RouteForm({
  route,
  initial,
  onDone,
}: {
  route: PersonalRoute | null;
  initial: FormState;
  onDone: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const valid =
    form.name.trim() &&
    form.origin.trim().length > 1 &&
    form.destination.trim().length > 1 &&
    form.days.length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const sameTrip =
        route &&
        route.origin.text === form.origin.trim() &&
        route.destination.text === form.destination.trim() &&
        plannerMode(route.mode).routing === plannerMode(form.mode).routing;

      let geo = sameTrip
        ? {
            origin: route.origin,
            destination: route.destination,
            primary: route.primary,
            alternative: route.alternative,
          }
        : null;

      if (!geo) {
        const [from, to] = await Promise.all([
          geocodePlace({ data: { query: form.origin } }),
          geocodePlace({ data: { query: form.destination } }),
        ]);
        if (!from || !to) {
          const missing = [!from && form.origin, !to && form.destination]
            .filter(Boolean)
            .join("” and “");
          setError(
            `Couldn't locate “${missing}”. Try adding an area or city, e.g. “${form.origin.split(",")[0]}, Bengaluru”.`,
          );
          setSaving(false);
          return;
        }
        const result = await getRoute({
          data: {
            fromLat: from.lat,
            fromLon: from.lon,
            toLat: to.lat,
            toLon: to.lon,
            mode: plannerMode(form.mode).routing,
          },
        });
        const summarize = (r: {
          distanceKm: number;
          durationMin: number;
          geometry: [number, number][];
        }): RouteSummary => ({
          distanceKm: r.distanceKm,
          durationMin: r.durationMin,
          corridorSlugs: corridorsAlongRoute(r.geometry).map((c) => c.slug),
          live: result.live,
        });
        const place = (text: string, g: typeof from) => ({
          text: text.trim(),
          label: g.label,
          lat: g.lat,
          lon: g.lon,
          approximate: g.approximate,
        });
        geo = {
          origin: place(form.origin, from),
          destination: place(form.destination, to),
          primary: summarize(result.primary),
          alternative: result.alternatives[0] ? summarize(result.alternatives[0]) : null,
        };
      }

      routeAlertActions.saveRoute({
        id: route?.id ?? routeAlertActions.newId(),
        name: form.name.trim(),
        mode: form.mode,
        departure: form.departure,
        days: [...form.days].sort((a, b) => a - b),
        rules: form.rules,
        thresholdMin: form.thresholdMin,
        alertsOn: route?.alertsOn ?? true,
        createdAt: route?.createdAt ?? new Date().toISOString(),
        ...geo,
      });
      onDone();
    } catch {
      setError("Couldn't reach the routing service. Please try again in a moment.");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 p-6 sm:p-7" noValidate>
      <DialogHeader>
        <DialogTitle className="text-xl font-extrabold">
          {route ? "Edit personal route" : "Add personal route"}
        </DialogTitle>
        <DialogDescription>
          CityFlow learns this route&apos;s normal travel time and alerts you only when the forecast
          meaningfully differs.
        </DialogDescription>
      </DialogHeader>

      <Field label="Route name">
        <input
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="e.g. College → PG"
          className={inputClass}
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starting point">
          <input
            value={form.origin}
            onChange={(e) => update({ origin: e.target.value })}
            placeholder="Enter starting location"
            className={inputClass}
            required
          />
        </Field>
        <Field label="Destination">
          <input
            value={form.destination}
            onChange={(e) => update({ destination: e.target.value })}
            placeholder="Enter destination"
            className={inputClass}
            required
          />
        </Field>
      </div>

      <fieldset>
        <legend className={legendClass}>Travel mode</legend>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-secondary/60 p-1 sm:grid-cols-4">
          {MODE_OPTIONS.map((m) => {
            const active = form.mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                aria-pressed={active}
                onClick={() => update({ mode: m.key })}
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

      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <Field label="Preferred departure time">
          <input
            type="time"
            value={form.departure}
            onChange={(e) => update({ departure: e.target.value || "18:00" })}
            className={inputClass}
          />
        </Field>
        <fieldset>
          <legend className={legendClass}>Days</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAY_SHORT.map((d, i) => {
              const active = form.days.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    update({ days: active ? form.days.filter((x) => x !== i) : [...form.days, i] })
                  }
                  className={`h-10 min-w-12 rounded-lg border px-2.5 text-sm font-semibold transition ${
                    active
                      ? "border-transparent bg-[color-mix(in_oklab,var(--brand-blue)_14%,transparent)] text-brand-blue"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <fieldset>
        <legend className={legendClass}>Alert me when</legend>
        <div className="space-y-2 rounded-xl border border-border p-3">
          {ALERT_RULES.map((r) => (
            <label key={r.key} className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={form.rules.includes(r.key)}
                onChange={(e) =>
                  update({
                    rules: e.target.checked
                      ? [...form.rules, r.key]
                      : form.rules.filter((x) => x !== r.key),
                  })
                }
                className="mt-0.5 size-4 accent-[var(--brand-blue)]"
              />
              <span>
                <span className="font-semibold">{r.label}</span>
                {r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={legendClass}>Alert threshold</legend>
        <div className="flex flex-wrap gap-1.5">
          {THRESHOLDS.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={form.thresholdMin === t}
              onClick={() => update({ thresholdMin: t })}
              className={`h-10 rounded-lg border px-4 text-sm font-semibold transition ${
                form.thresholdMin === t
                  ? "border-transparent bg-[color-mix(in_oklab,var(--brand-blue)_14%,transparent)] text-brand-blue"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              +{t} min
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          You&apos;ll be alerted when the expected delay over this route&apos;s normal reaches this.
        </p>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        {route && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              routeAlertActions.deleteRoute(route.id);
              onDone();
            }}
          >
            <Trash2 className="size-4" /> Delete route
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="cityflow" disabled={!valid || saving}>
            {saving && <LoaderCircle className="size-4 animate-spin" />}
            {saving ? "Saving…" : "Save Route"}
          </Button>
        </div>
      </div>
    </form>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-surface-strong px-3.5 text-sm font-semibold outline-none placeholder:font-medium placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring";
const legendClass = "mb-2 text-xs font-bold text-muted-foreground";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`block ${legendClass}`}>{label}</span>
      {children}
    </label>
  );
}

function Waves() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-40 w-full opacity-[0.12]"
      viewBox="0 0 1200 160"
      preserveAspectRatio="none"
    >
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M0 ${60 + i * 16} C 250 ${10 + i * 16}, 450 ${110 + i * 16}, 700 ${55 + i * 16} S 1050 ${15 + i * 16}, 1200 ${60 + i * 16}`}
          fill="none"
          stroke="var(--brand-blue)"
          strokeWidth={1.2}
        />
      ))}
    </svg>
  );
}
