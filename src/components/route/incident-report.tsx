import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { INCIDENT_LABEL, reportIncident, type IncidentType } from "@/lib/incidents";

const TYPE_OPTIONS: { key: IncidentType; label: string }[] = [
  { key: "accident", label: INCIDENT_LABEL.accident },
  { key: "closure", label: INCIDENT_LABEL.closure },
  { key: "construction", label: INCIDENT_LABEL.construction },
  { key: "other", label: INCIDENT_LABEL.other },
];

export function IncidentReportButton({
  target,
  onReported,
}: {
  target: { lat: number; lon: number; roadHint: string } | null;
  onReported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IncidentType>("accident");
  const [note, setNote] = useState("");
  const [justReported, setJustReported] = useState(false);

  const submit = () => {
    if (!target) return;
    reportIncident({ lat: target.lat, lon: target.lon, type, note, roadHint: target.roadHint });
    onReported();
    setNote("");
    setType("accident");
    setOpen(false);
    setJustReported(true);
    window.setTimeout(() => setJustReported(false), 3500);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!target}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <AlertTriangle size={13} /> Report Incident
      </button>

      {justReported && !open && (
        <div className="glass-panel absolute left-0 top-full z-[500] mt-2 w-56 rounded-lg px-3 py-2 text-[11px] font-semibold text-success">
          Reported. This route is now flagged on your map.
        </div>
      )}

      {open && (
        <div className="glass-panel absolute left-0 top-full z-[500] mt-2 w-64 rounded-xl p-3 text-xs">
          <div className="flex items-center justify-between">
            <p className="font-bold">Report an incident</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
          <p className="mt-1 text-muted-foreground">Near {target?.roadHint ?? "this route"}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setType(opt.key)}
                className={`rounded-full border px-2.5 py-1 transition ${
                  type === opt.key
                    ? "border-transparent bg-gradient-brand text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional details…"
            rows={2}
            className="mt-2 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={submit}
            className="mt-2 w-full rounded-md bg-gradient-brand px-2.5 py-1.5 text-xs font-bold text-primary-foreground"
          >
            Submit report
          </button>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Saved on this device only and expires in 3 hours — not yet shared across users.
          </p>
        </div>
      )}
    </div>
  );
}
