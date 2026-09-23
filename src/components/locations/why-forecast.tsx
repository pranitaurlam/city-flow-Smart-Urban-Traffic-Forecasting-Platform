import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { explainabilityFactors } from "@/lib/location-forecast";
import type { BengaluruLocation } from "@/lib/locations";

export function WhyForecastCard({
  location,
  weatherCondition,
}: {
  location: BengaluruLocation;
  weatherCondition: string | undefined;
}) {
  const factors = explainabilityFactors(location, weatherCondition);

  return (
    <div className="glass-panel rounded-2xl p-5">
      <h3 className="text-sm font-bold">Why this forecast?</h3>
      <div className="mt-4 space-y-3">
        {factors.map((factor) => (
          <div key={factor.label}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">{factor.label}</span>
              <span className="font-bold text-brand-cyan">{factor.pct}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-brand"
                style={{ width: `${factor.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Forecast is influenced by historical traffic patterns and contextual conditions.
      </p>
      <Button variant="outline" size="sm" className="mt-4 w-full">
        View Analysis <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
