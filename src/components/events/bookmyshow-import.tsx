import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Check, ClipboardPaste, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cityflowApi, type ParsedEvent } from "@/lib/cityflow-api";

/**
 * Imports concerts and matches from BookMyShow by pasting the listing.
 *
 * BookMyShow publishes no API and blocks automated requests to its listing
 * pages, so there is no feed to subscribe to. Copying the page and pasting it
 * here is the closest thing: the backend parses the text, matches venues, and
 * previews what it found before anything is saved.
 */

const BMS_URL = "https://in.bookmyshow.com/explore/events-bengaluru?cat=CT";

const CATEGORY_LABEL: Record<string, string> = {
  concert: "Concert",
  sports: "Sports",
  expo: "Expo",
  festival: "Festival",
  comedy: "Comedy",
  other: "Event",
};

function formatRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  const time = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time(start)} – ${time(end)}`;
}

function ParsedRow({ row }: { row: ParsedEvent }) {
  const matched = row.venue !== null;
  const alreadyAdded = row.issues.some((issue) => issue.startsWith("already in"));
  return (
    <li
      className={`rounded-lg border p-3 ${
        !matched
          ? "border-warning/40 bg-warning/5"
          : alreadyAdded
            ? "border-border bg-surface opacity-70"
            : "border-border bg-surface"
      }`}
    >
      <div className="flex items-start gap-2">
        {matched ? (
          <Check className="mt-0.5 size-4 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{row.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatRange(row.starts_at, row.ends_at)} · {CATEGORY_LABEL[row.category] ?? "Event"}
            {row.expected_attendance
              ? ` · ~${row.expected_attendance.toLocaleString()} expected`
              : ""}
          </p>
          <p className="mt-0.5 truncate text-xs">
            {matched ? (
              <span className="text-muted-foreground">{row.venue_name}</span>
            ) : (
              <span className="font-semibold text-warning">
                {row.venue_text || "no venue on the listing"}
              </span>
            )}
          </p>
          {row.issues.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {row.issues.map((issue) => (
                <li key={issue} className="text-[11px] leading-4 text-muted-foreground">
                  {issue}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

export function BookMyShowImport() {
  const [text, setText] = useState("");
  const queryClient = useQueryClient();

  const preview = useMutation({
    mutationFn: (value: string) => cityflowApi.importBookMyShow(value, true, BMS_URL),
  });
  const save = useMutation({
    mutationFn: (value: string) => cityflowApi.importBookMyShow(value, false, BMS_URL),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setText("");
      preview.reset();
    },
  });

  const rows = preview.data?.events ?? [];
  // Rows already stored are reported but not re-saved, so they are not offered.
  const matched = rows.filter(
    (row) => row.venue !== null && !row.issues.some((issue) => issue.startsWith("already in")),
  );

  return (
    <section className="glass-panel rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">Import from BookMyShow</h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
            BookMyShow has no public API and blocks automated requests, so open the Bengaluru
            listing, select all and copy, then paste it below. CityFlow reads the titles, times and
            venues, and shows you what it found before saving anything.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={BMS_URL} target="_blank" rel="noreferrer noopener">
            Open listing <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </div>

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (preview.data || preview.isError) preview.reset();
        }}
        rows={6}
        placeholder={
          "Paste the copied listing here, e.g.\n\nArijit Singh Live In Concert\nSat, 6 Dec, 7:00 PM\nPalace Grounds, Bengaluru\n₹1,500 onwards"
        }
        aria-label="Paste the BookMyShow listing"
        className="mt-3 w-full resize-y rounded-lg border border-input bg-background p-3 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="cityflow"
          disabled={text.trim().length < 10 || preview.isPending}
          onClick={() => preview.mutate(text)}
        >
          <ClipboardPaste className="size-4" />
          {preview.isPending ? "Reading…" : "Read the paste"}
        </Button>
        {matched.length > 0 && (
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(text)}>
            {save.isPending
              ? "Saving…"
              : `Add ${matched.length} event${matched.length === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>

      {preview.isError && (
        <p role="alert" className="mt-2 text-xs font-semibold text-destructive">
          {preview.error.message}
        </p>
      )}
      {save.isError && (
        <p role="alert" className="mt-2 text-xs font-semibold text-destructive">
          {save.error.message}
        </p>
      )}
      {save.isSuccess && (
        <p role="status" className="mt-2 text-xs font-semibold text-success">
          Added {save.data.created} event{save.data.created === 1 ? "" : "s"}. Journey pages will
          now warn about them.
        </p>
      )}

      {preview.isSuccess && (
        <div className="mt-3">
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No events found in that text. Copy the listing itself rather than a screenshot — each
              card needs a title, a date and a venue.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Found {rows.length} event{rows.length === 1 ? "" : "s"}
                {preview.data.duplicates > 0 && ` · ${preview.data.duplicates} already added`}
                {preview.data.skipped > 0 &&
                  ` · ${preview.data.skipped} need a tracked venue and won't be saved`}
              </p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {rows.map((row, index) => (
                  <ParsedRow key={`${row.title}-${row.starts_at}-${index}`} row={row} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
