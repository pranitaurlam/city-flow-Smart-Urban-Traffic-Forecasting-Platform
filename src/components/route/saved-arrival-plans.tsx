import { useState } from "react";
import { Bell, BellOff, BookmarkPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TierBadge } from "@/components/locations/panels";
import { MODE_OPTIONS, modeOption, routeIcon } from "@/components/route/route-alert-ui";
import {
  arrivalPlanActions,
  useArrivalPlansStore,
  type ArrivalPlan,
} from "@/lib/arrival-plans-store";
import type { useArrivalPlanMonitor } from "@/hooks/use-arrival-plan-monitor";
import { DAY_SHORT, formatDays, parseTime } from "@/lib/personal-routes";
import {
  minutesToClock,
  riskLevelForProbability,
  type ArrivalPlanResult,
} from "@/lib/arrival-planner";

export type ArrivalPlanDraft = Pick<
  ArrivalPlan,
  "origin" | "destination" | "mode" | "reliabilityTarget" | "bufferMin" | "primary" | "alternative"
> & { arrivalTime: string };

const RISK_TONE: Record<string, string> = {
  "On Track": "var(--success)",
  "Tight Schedule": "oklch(0.7 0.19 45)",
  "High Risk": "var(--destructive)",
};

export function SavedArrivalPlans({
  draft,
  monitor,
  onSelect,
}: {
  draft: ArrivalPlanDraft | null;
  monitor: ReturnType<typeof useArrivalPlanMonitor>;
  onSelect: (plan: ArrivalPlan) => void;
}) {
  const store = useArrivalPlansStore();
  const [editing, setEditing] = useState<ArrivalPlan | "new" | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Saved Plans</h3>
          <p className="text-xs text-muted-foreground">
            Recurring journeys like Home → College, with deadline alerts and departure reminders.
          </p>
        </div>
        <Button
          size="sm"
          variant="cityflow"
          className="rounded-lg"
          disabled={!draft}
          onClick={() => setEditing("new")}
        >
          <BookmarkPlus className="size-4" /> Save this plan
        </Button>
      </div>

      {store.plans.length === 0 ? (
        <p className="glass-panel rounded-2xl p-6 text-center text-sm text-muted-foreground">
          No saved plans yet. Calculate a departure window above, then save it as a recurring plan.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {store.plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              result={monitor.results[plan.id]?.plan}
              onSelect={() => onSelect(plan)}
              onEdit={() => setEditing(plan)}
            />
          ))}
        </div>
      )}

      <PlanFormDialog
        open={editing !== null}
        plan={editing && editing !== "new" ? editing : null}
        draft={draft}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}

function PlanCard({
  plan,
  result,
  onSelect,
  onEdit,
}: {
  plan: ArrivalPlan;
  result: ArrivalPlanResult | undefined;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const Icon = routeIcon(plan.name);
  const mode = modeOption(plan.mode);
  const ModeIcon = mode.icon;
  const risk = result ? riskLevelForProbability(result.recommended.onTimeProbability) : null;

  return (
    <article className="glass-panel flex flex-col rounded-2xl p-5">
      <header className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 items-center gap-2.5 text-left text-base font-extrabold hover:text-brand-cyan"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--brand-blue)_12%,transparent)] text-brand-blue">
            <Icon size={17} />
          </span>
          <span className="truncate">{plan.name}</span>
        </button>
        <span
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            plan.active
              ? "bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-success"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          <i
            className={`size-1.5 rounded-full ${plan.active ? "bg-success" : "bg-muted-foreground"}`}
          />
          {plan.active ? "Active" : "Paused"}
        </span>
      </header>

      <p className="mt-3 truncate text-sm font-semibold" title={plan.origin.text}>
        {plan.origin.text} <span className="text-muted-foreground">→</span> {plan.destination.text}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1">
          <ModeIcon size={13} /> {mode.label}
        </span>
        <span aria-hidden>•</span>
        <span>Arrive by {minutesToClock(parseTime(plan.arrivalTime))}</span>
        <span aria-hidden>•</span>
        <span>{formatDays(plan.days)}</span>
      </p>

      {result ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-border bg-surface-strong p-3 text-sm">
          <div>
            <dt className="text-[11px] text-muted-foreground">Recommended departure</dt>
            <dd className="font-extrabold">{result.recommended.departureLabel}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">On-time probability</dt>
            <dd className="font-extrabold" style={{ color: risk ? RISK_TONE[risk] : undefined }}>
              {result.recommended.onTimeProbability}%
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[11px] text-muted-foreground">Traffic</dt>
            <dd className="mt-0.5">
              <TierBadge tier={result.recommended.tier} />
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No upcoming occurrence scheduled.</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <Button size="sm" variant="outline" className="rounded-lg" onClick={onEdit}>
          <Pencil className="size-3.5" /> Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          aria-pressed={plan.active}
          onClick={() => arrivalPlanActions.setActive(plan.id, !plan.active)}
        >
          {plan.active ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
          {plan.active ? "On" : "Off"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto size-8 rounded-lg text-destructive hover:text-destructive"
          aria-label={`Delete ${plan.name}`}
          onClick={() => arrivalPlanActions.deletePlan(plan.id)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </article>
  );
}

type FormState = {
  name: string;
  days: number[];
  arrivalTime: string;
  departureReminder: boolean;
  reminderMinutesBefore: number;
  notifyOnWorsening: boolean;
};

function PlanFormDialog({
  open,
  plan,
  draft,
  onClose,
}: {
  open: boolean;
  plan: ArrivalPlan | null;
  draft: ArrivalPlanDraft | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto rounded-2xl p-0 sm:rounded-2xl">
        {open && <PlanForm key={plan?.id ?? "new"} plan={plan} draft={draft} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PlanForm({
  plan,
  draft,
  onDone,
}: {
  plan: ArrivalPlan | null;
  draft: ArrivalPlanDraft | null;
  onDone: () => void;
}) {
  const base = plan ?? draft;
  const [form, setForm] = useState<FormState>({
    name: plan?.name ?? "",
    days: plan?.days ?? [0, 1, 2, 3, 4],
    arrivalTime: plan?.arrivalTime ?? draft?.arrivalTime ?? "09:00",
    departureReminder: plan?.departureReminder ?? true,
    reminderMinutesBefore: plan?.reminderMinutesBefore ?? 15,
    notifyOnWorsening: plan?.notifyOnWorsening ?? true,
  });
  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  if (!base) return null;
  const valid = form.name.trim().length > 0 && form.days.length > 0;

  const submit = () => {
    if (!valid) return;
    arrivalPlanActions.savePlan({
      id: plan?.id ?? arrivalPlanActions.newId(),
      name: form.name.trim(),
      origin: base.origin,
      destination: base.destination,
      mode: base.mode,
      days: [...form.days].sort((a, b) => a - b),
      arrivalTime: form.arrivalTime,
      reliabilityTarget: base.reliabilityTarget,
      bufferMin: base.bufferMin,
      departureReminder: form.departureReminder,
      reminderMinutesBefore: form.reminderMinutesBefore,
      notifyOnWorsening: form.notifyOnWorsening,
      active: plan?.active ?? true,
      primary: base.primary,
      alternative: base.alternative,
      createdAt: plan?.createdAt ?? new Date().toISOString(),
      ...(plan?.lastKnownProbability !== undefined
        ? { lastKnownProbability: plan.lastKnownProbability }
        : {}),
      ...(plan?.lastRemindedKey !== undefined ? { lastRemindedKey: plan.lastRemindedKey } : {}),
    });
    onDone();
  };

  return (
    <div className="space-y-6 p-6 sm:p-7">
      <DialogHeader>
        <DialogTitle className="text-xl font-extrabold">
          {plan ? "Edit saved plan" : "Save arrival plan"}
        </DialogTitle>
        <DialogDescription>
          {base.origin.text} → {base.destination.text}. CityFlow will recompute this plan's
          departure window on its scheduled days and notify you if the forecast changes.
        </DialogDescription>
      </DialogHeader>

      <label className="block">
        <span className="mb-1 block text-xs font-bold text-muted-foreground">Plan name</span>
        <input
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="e.g. Home → College"
          className="h-11 w-full rounded-xl border border-border bg-surface-strong px-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <fieldset>
          <legend className="mb-2 text-xs font-bold text-muted-foreground">Recurring days</legend>
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
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-muted-foreground">Arrive by</span>
          <input
            type="time"
            value={form.arrivalTime}
            onChange={(e) => update({ arrivalTime: e.target.value || "09:00" })}
            className="h-11 w-full rounded-xl border border-border bg-surface-strong px-3.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-border p-4">
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.departureReminder}
            onChange={(e) => update({ departureReminder: e.target.checked })}
            className="mt-0.5 size-4 accent-[var(--brand-blue)]"
          />
          <span>
            <span className="font-semibold">Remind me before departure</span>
            <span className="block text-xs text-muted-foreground">
              Sends a notification as the recommended departure time approaches.
            </span>
          </span>
        </label>
        {form.departureReminder && (
          <div className="flex items-center gap-2 pl-6 text-xs">
            <span className="text-muted-foreground">Remind</span>
            {[5, 10, 15, 30].map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={form.reminderMinutesBefore === m}
                onClick={() => update({ reminderMinutesBefore: m })}
                className={`h-8 rounded-md border px-2.5 font-semibold transition ${
                  form.reminderMinutesBefore === m
                    ? "border-transparent bg-[color-mix(in_oklab,var(--brand-blue)_14%,transparent)] text-brand-blue"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {m} min before
              </button>
            ))}
          </div>
        )}
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.notifyOnWorsening}
            onChange={(e) => update({ notifyOnWorsening: e.target.checked })}
            className="mt-0.5 size-4 accent-[var(--brand-blue)]"
          />
          <span>
            <span className="font-semibold">Alert me if the forecast worsens significantly</span>
            <span className="block text-xs text-muted-foreground">
              Notifies you once per day if the predicted on-time probability drops meaningfully.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-5">
        {plan && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              arrivalPlanActions.deletePlan(plan.id);
              onDone();
            }}
          >
            <Trash2 className="size-4" /> Delete plan
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="button" variant="cityflow" disabled={!valid} onClick={submit}>
            <Plus className="size-4" /> {plan ? "Save changes" : "Save plan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
