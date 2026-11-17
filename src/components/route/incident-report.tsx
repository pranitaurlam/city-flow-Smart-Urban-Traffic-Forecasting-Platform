import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Loader2, X } from "lucide-react";
import { ApiError, cityflowApi, type ApiIncident } from "@/lib/cityflow-api";
import { INCIDENT_LABEL, photoToJpegBase64, type IncidentType } from "@/lib/incidents";

const TYPE_OPTIONS = (Object.keys(INCIDENT_LABEL) as IncidentType[]).map((key) => ({
  key,
  label: INCIDENT_LABEL[key],
}));

export function IncidentReportButton({
  target,
  disabledReason,
  onReported,
}: {
  target: { lat: number; lon: number; roadHint: string } | null;
  /** Set when reporting can't work right now, e.g. the backend is unreachable. */
  disabledReason?: string;
  onReported: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IncidentType>("accident");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<ApiIncident | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const reset = () => {
    setNote("");
    setType("accident");
    setPhoto(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const submit = async () => {
    if (!target || !photo || checking) return;
    setChecking(true);
    setError(null);
    try {
      const report = await cityflowApi.reportIncident({
        lat: target.lat,
        lon: target.lon,
        road_hint: target.roadHint,
        type,
        note: note.trim() || null,
        image_base64: await photoToJpegBase64(photo),
      });
      setAccepted(report);
      onReported();
      reset();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof DOMException && e.name === "TimeoutError"
            ? "The photo check took too long. Please try again."
            : "The report could not be sent. Check that the CityFlow backend is running.",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setAccepted(null);
          setOpen((v) => !v);
        }}
        disabled={!target || !!disabledReason}
        title={disabledReason}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <AlertTriangle size={13} /> Report Incident
      </button>

      {open && (
        <div className="glass-panel absolute left-0 top-full z-[500] mt-2 max-h-[340px] w-72 overflow-y-auto rounded-xl p-3 text-xs">
          <div className="flex items-center justify-between">
            <p className="font-bold">Report a blockage</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>

          {accepted ? (
            <div className="mt-2 space-y-2">
              <p className="flex items-start gap-1.5 font-semibold text-success">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                Photo checked and report accepted.
              </p>
              <p className="text-muted-foreground">{accepted.photo_summary}</p>
              <p className="text-muted-foreground">
                Drivers on routes near {accepted.road_hint} are now warned. The report expires in 3
                hours.
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-md border border-border px-2.5 py-1.5 font-bold"
              >
                Done
              </button>
            </div>
          ) : (
            <>
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

              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                id="incident-photo"
                onChange={(e) => {
                  setPhoto(e.target.files?.[0] ?? null);
                  setError(null);
                }}
              />
              <label
                htmlFor="incident-photo"
                className="mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-surface px-2.5 py-2 font-semibold text-muted-foreground transition hover:border-brand-cyan hover:text-foreground"
              >
                <Camera size={14} />
                {photo ? "Change photo" : "Add a photo of the blockage (required)"}
              </label>
              {preview && (
                <img
                  src={preview}
                  alt="Selected photo of the blockage"
                  className="mt-2 max-h-36 w-full rounded-md object-cover"
                />
              )}

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional details…"
                rows={2}
                maxLength={300}
                className="mt-2 w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />

              {error && (
                <p role="alert" className="mt-1.5 font-semibold text-destructive">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={!photo || checking}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-brand px-2.5 py-1.5 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {checking ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Checking the photo…
                  </>
                ) : (
                  "Submit report"
                )}
              </button>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                The photo is checked automatically to confirm it shows a real blockage. It is not
                stored. Accepted reports warn other drivers for 3 hours.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
