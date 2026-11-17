import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ExternalLink, FileUp, KeyRound, Moon, Pencil, Sun, Ticket, Trash2 } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { NotificationCenter } from "@/components/route/notification-center";
import {
  cityflowApi,
  getAdminKey,
  setAdminKey,
  type ApiEvent,
  type ApiVenue,
  type EventCategory,
  type EventInput,
} from "@/lib/cityflow-api";

export const Route = createFileRoute("/events")({
  ssr: false,
  head: () => ({ meta: [{ title: "Events | CityFlow" }] }),
  component: EventsPage,
});

const CATEGORIES: { key: EventCategory; label: string }[] = [
  { key: "concert", label: "Concert" },
  { key: "sports", label: "Sports match" },
  { key: "comedy", label: "Comedy / show" },
  { key: "festival", label: "Festival" },
  { key: "expo", label: "Expo / conference" },
  { key: "other", label: "Other" },
];

const SAMPLE_CSV = `venue,title,category,starts_at,ends_at,expected_attendance,url
Palace Grounds,Example Concert,concert,2026-12-05 18:00,2026-12-05 22:30,40000,https://in.bookmyshow.com/...
chinnaswamy-stadium,Example T20 Match,sports,2026-12-07 19:30,2026-12-07 23:00,,`;

type FormState = {
  venue: string;
  title: string;
  category: EventCategory;
  date: string;
  startTime: string;
  endTime: string;
  attendance: string;
  url: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const EMPTY: FormState = {
  venue: "",
  title: "",
  category: "concert",
  date: localDate(new Date()),
  startTime: "18:00",
  endTime: "22:00",
  attendance: "",
  url: "",
};

function toInput(f: FormState): EventInput {
  const start = new Date(`${f.date}T${f.startTime}`);
  const end = new Date(`${f.date}T${f.endTime}`);
  // An end time at or before the start means the event runs past midnight.
  if (end <= start) end.setDate(end.getDate() + 1);
  return {
    venue: f.venue,
    title: f.title.trim(),
    category: f.category,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    expected_attendance: f.attendance ? Number(f.attendance) : null,
    url: f.url.trim() || null,
  };
}

function fromEvent(e: ApiEvent): FormState {
  const start = new Date(e.starts_at);
  const end = new Date(e.ends_at);
  return {
    venue: e.venue.slug,
    title: e.title,
    category: e.category,
    date: localDate(start),
    startTime: localTime(start),
    endTime: localTime(end),
    attendance: String(e.expected_attendance),
    url: e.url ?? "",
  };
}

const field =
  "h-10 w-full rounded-xl border border-border bg-surface-strong px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring";

function EventsPage() {
  const { dark, toggleDark } = useTheme();
  const venuesQuery = useQuery({
    queryKey: ["venues"],
    queryFn: cityflowApi.venues,
    retry: false,
    staleTime: 60 * 60_000,
  });
  const eventsQuery = useQuery({
    queryKey: ["events"],
    queryFn: () =>
      cityflowApi.events({ end: new Date(Date.now() + 90 * 86_400_000).toISOString() }),
    retry: false,
  });

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="cf-flowline sticky top-0 z-20 border-b border-border bg-surface-strong px-5 py-4 backdrop-blur-xl sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-normal">Events</h1>
              <p className="text-sm text-muted-foreground">
                Concerts, matches and big events that slow down nearby roads.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <AdminKeyField />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleDark()}
                aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
              >
                {dark ? <Sun /> : <Moon />}
              </Button>
              <NotificationCenter />
            </div>
          </div>
        </header>

        <main className="cf-stagger mx-auto w-full max-w-[1400px] flex-1 space-y-6 px-5 py-6 sm:px-8">
          {venuesQuery.isError ? (
            <section className="glass-panel rounded-2xl p-6 text-sm text-muted-foreground">
              Events are stored in the CityFlow backend, which isn&apos;t reachable. Start it with{" "}
              <code className="rounded bg-secondary px-1">uvicorn app.main:app --port 8001</code> in{" "}
              <code className="rounded bg-secondary px-1">backend/</code>.
            </section>
          ) : (
            <>
              <EventEditor venues={venuesQuery.data ?? []} />
              <EventList
                events={eventsQuery.data}
                loading={eventsQuery.isPending}
                venues={venuesQuery.data ?? []}
              />
              <CsvImport />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/** Changing events needs the server's admin key; it's remembered in this browser only. */
function AdminKeyField() {
  const [key, setKey] = useState("");
  useEffect(() => setKey(getAdminKey()), []);
  return (
    <label className="flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-3 py-1.5 text-sm">
      <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">Admin key</span>
      <input
        type="password"
        value={key}
        onChange={(e) => {
          setKey(e.target.value);
          setAdminKey(e.target.value.trim());
        }}
        placeholder="Admin key"
        autoComplete="off"
        className="w-28 bg-transparent outline-none placeholder:text-muted-foreground sm:w-36"
      />
    </label>
  );
}

function EventEditor({
  venues,
  editing,
  onDone,
}: {
  venues: ApiVenue[];
  editing?: ApiEvent;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(editing ? fromEvent(editing) : EMPTY);
  const [saved, setSaved] = useState<string | null>(null);
  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const venue = venues.find((v) => v.slug === form.venue);

  const save = useMutation({
    mutationFn: (input: EventInput) =>
      editing ? cityflowApi.updateEvent(editing.id, input) : cityflowApi.createEvent(input),
    onSuccess: (event) => {
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["event-impact"] });
      void queryClient.invalidateQueries({ queryKey: ["arrival-events"] });
      setSaved(`Saved “${event.title}”.`);
      if (editing) onDone?.();
      else setForm((f) => ({ ...EMPTY, venue: f.venue, date: f.date }));
    },
  });

  const valid =
    form.venue && form.title.trim().length >= 2 && form.date && form.startTime && form.endTime;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaved(null);
    if (valid) save.mutate(toInput(form));
  };

  return (
    <section className={editing ? "" : "glass-panel rounded-2xl p-5 sm:p-6"}>
      {!editing && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-cyan">
            Add an event
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            BookMyShow doesn&apos;t offer a public API, so add events from its listings here (or
            import a CSV below). Route pages then warn about them and suggest a way around.
          </p>
        </>
      )}
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Event name</span>
          <input
            className={field}
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="e.g. Arijit Singh Live"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Venue</span>
          <select
            className={field}
            value={form.venue}
            onChange={(e) => update({ venue: e.target.value })}
            required
          >
            <option value="">Choose a venue…</option>
            {venues.map((v) => (
              <option key={v.slug} value={v.slug}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Type</span>
          <select
            className={field}
            value={form.category}
            onChange={(e) => update({ category: e.target.value as EventCategory })}
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Date</span>
          <input
            type="date"
            className={field}
            value={form.date}
            onChange={(e) => update({ date: e.target.value })}
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Starts</span>
            <input
              type="time"
              className={field}
              value={form.startTime}
              onChange={(e) => update({ startTime: e.target.value })}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Ends</span>
            <input
              type="time"
              className={field}
              value={form.endTime}
              onChange={(e) => update({ endTime: e.target.value })}
              required
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">
            Expected crowd
          </span>
          <input
            type="number"
            min={1}
            max={500000}
            className={field}
            value={form.attendance}
            onChange={(e) => update({ attendance: e.target.value })}
            placeholder={
              venue ? `Venue holds ~${venue.capacity.toLocaleString("en-IN")}` : "People"
            }
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">
            Listing link (optional)
          </span>
          <input
            type="url"
            className={field}
            value={form.url}
            onChange={(e) => update({ url: e.target.value })}
            placeholder="https://in.bookmyshow.com/…"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
          <Button
            type="submit"
            className="bg-gradient-brand text-white"
            disabled={!valid || save.isPending}
          >
            {save.isPending ? "Saving…" : editing ? "Save changes" : "Add event"}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
          {save.isError && (
            <p className="whitespace-pre-line text-xs font-semibold text-destructive">
              {save.error.message}
            </p>
          )}
          {saved && <p className="text-xs font-semibold text-success">{saved}</p>}
        </div>
      </form>
    </section>
  );
}

function EventList({
  events,
  loading,
  venues,
}: {
  events: ApiEvent[] | undefined;
  loading: boolean;
  venues: ApiVenue[];
}) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const remove = useMutation({
    mutationFn: cityflowApi.deleteEvent,
    onSuccess: () => {
      setConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["event-impact"] });
      void queryClient.invalidateQueries({ queryKey: ["arrival-events"] });
    },
  });

  const when = (e: ApiEvent) => {
    const start = new Date(e.starts_at);
    const end = new Date(e.ends_at);
    const day = start.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const t = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    return `${day} · ${t(start)} – ${t(end)}`;
  };

  return (
    <section className="glass-panel rounded-2xl p-5 sm:p-6">
      <h2 className="text-sm font-bold">Upcoming events (next 90 days)</h2>
      {loading ? (
        <div className="mt-4 h-16 animate-pulse rounded-xl bg-secondary" />
      ) : !events?.length ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No upcoming events yet. Add one above and route pages will start checking for it.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {events.map((e) =>
            editingId === e.id ? (
              <li
                key={e.id}
                className="rounded-xl border border-brand-cyan/50 bg-surface-strong p-4"
              >
                <EventEditor venues={venues} editing={e} onDone={() => setEditingId(null)} />
              </li>
            ) : (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-strong p-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-bold">
                    <Ticket className="size-4 shrink-0 text-brand-violet" />
                    {e.title}
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Event listing"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.venue.name} · {when(e)} · ~{e.expected_attendance.toLocaleString("en-IN")}{" "}
                    people · up to +{e.peak_delay_min} min on roads beside the venue
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {confirmId === e.id ? (
                    <>
                      <span className="text-xs font-semibold">Delete this event?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(e.id)}
                      >
                        Delete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit event"
                        onClick={() => setEditingId(e.id)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete event"
                        onClick={() => setConfirmId(e.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      {remove.isError && (
        <p className="mt-2 text-xs font-semibold text-destructive">{remove.error.message}</p>
      )}
    </section>
  );
}

function CsvImport() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const importCsv = useMutation({
    mutationFn: cityflowApi.importEvents,
    onSuccess: () => {
      if (fileRef.current) fileRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["event-impact"] });
      void queryClient.invalidateQueries({ queryKey: ["arrival-events"] });
    },
  });

  return (
    <section className="glass-panel rounded-2xl p-5 sm:p-6">
      <h2 className="text-sm font-bold">Import many events from a CSV</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Venue can be its name or id. Times are Bengaluru time. If any row has a problem, nothing is
        imported and the rows to fix are listed.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-secondary p-3 text-[11px] leading-5">
        {SAMPLE_CSV}
      </pre>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface-strong px-4 py-2 text-sm font-semibold hover:bg-accent">
        <FileUp className="size-4" />
        {importCsv.isPending ? "Importing…" : "Choose CSV file"}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) importCsv.mutate(await file.text());
          }}
        />
      </label>
      {importCsv.isSuccess && (
        <p className="mt-2 text-xs font-semibold text-success">
          Imported {importCsv.data.created} event{importCsv.data.created === 1 ? "" : "s"}.
        </p>
      )}
      {importCsv.isError && (
        <p className="mt-2 whitespace-pre-line text-xs font-semibold text-destructive">
          {importCsv.error.message}
        </p>
      )}
    </section>
  );
}
