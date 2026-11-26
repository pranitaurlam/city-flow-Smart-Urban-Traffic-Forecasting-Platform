import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Database,
  FileBarChart,
  MapPin,
  Menu,
  Moon,
  Navigation,
  Route as RouteIcon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { bengaluruLocations } from "@/lib/locations";
import { bangaloreTrafficHistory } from "@/data/bangalore-traffic-history";
import { GlobeOrbit, HeroBackdrop, HeroCards } from "@/components/landing/hero-orbit";
import { StreetScene } from "@/components/motion/street-scene";
import { Sparkles } from "@/components/landing/cute";
import { NammaBengaluru } from "@/components/landing/namma-bengaluru";
import globeImage from "@/assets/cityflow-globe-transparent.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CityFlow | Bengaluru Traffic Forecasts" },
      {
        name: "description",
        content: "Forecast Bengaluru road congestion ahead of time and plan journeys around it.",
      },
      { property: "og:title", content: "CityFlow | Bengaluru Traffic Forecasts" },
      {
        property: "og:description",
        content: "Forecast Bengaluru road congestion ahead of time and plan journeys around it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CityFlow,
});

const features = [
  {
    icon: BarChart3,
    title: "Dashboard",
    copy: "Today's traffic at a glance",
    to: "/dashboard/$city",
    params: { city: "bengaluru" },
  },
  {
    icon: CalendarDays,
    title: "Forecast",
    copy: "The next 7 days, per location",
    to: "/forecast",
    params: {},
  },
  {
    icon: Navigation,
    title: "Plan Journey",
    copy: "Find the best time to leave",
    to: "/route-forecast",
    params: {},
  },
  {
    icon: FileBarChart,
    title: "Reports",
    copy: "Export traffic trends as CSV",
    to: "/reports",
    params: {},
  },
] as const;

const POPULAR = ["koramangala", "indiranagar", "whitefield", "mg-road"]
  .map((slug) => bengaluruLocations.find((location) => location.slug === slug))
  .filter((location) => !!location);

const datasetAreas = bengaluruLocations.filter((location) => location.hasDataset).length;
const datasetRecords = bengaluruLocations.reduce(
  (sum, location) => sum + (bangaloreTrafficHistory[location.slug]?.records ?? 0),
  0,
);

function CityFlow() {
  const { dark, toggleDark } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();

  const filteredLocations = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return clean
      ? bengaluruLocations.filter((location) => location.name.toLowerCase().includes(clean))
      : bengaluruLocations;
  }, [query]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const match = query.trim() ? filteredLocations[0] : undefined;
    if (match) {
      navigate({ to: "/forecast", search: { loc: match.slug } });
      return;
    }
    setNotice(
      query.trim()
        ? `No Bengaluru location matches "${query.trim()}" yet`
        : "Enter a Bengaluru location to explore",
    );
    document.querySelector("#locations")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="cf-onepage bg-background text-foreground transition-colors duration-500">
      <section className="cf-hero relative mx-auto flex w-full min-h-0 max-w-[1536px] flex-1 flex-col overflow-hidden px-5 pb-4 pt-3 sm:px-8 lg:px-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_62%_34%,color-mix(in_oklab,var(--brand-cyan)_16%,transparent),transparent_40%)]" />
        <HeroBackdrop />
        <header className="relative z-30 flex h-14 shrink-0 items-center justify-between">
          <a href="#top" className="flex items-center gap-2" aria-label="CityFlow home">
            <span className="grid size-10 place-items-center rounded-full bg-gradient-brand text-primary-foreground">
              <RouteIcon size={24} />
            </span>
            <span className="text-2xl font-extrabold tracking-normal">CityFlow</span>
          </a>
          <NammaBengaluru className="hidden md:inline-flex" />
          <div className="hidden items-center gap-3 sm:flex">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleDark()}
              aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
            >
              {dark ? <Sun /> : <Moon />}
            </Button>
            <Button variant="cityflow" className="cf-glow" asChild>
              <Link to="/dashboard/$city" params={{ city: "bengaluru" }}>
                Get Started
              </Link>
            </Button>
          </div>
          <Button
            className="sm:hidden"
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X /> : <Menu />}
          </Button>
        </header>

        {menuOpen && (
          <div className="glass-panel absolute left-5 right-5 top-20 z-40 grid gap-2 rounded-lg p-4 sm:hidden">
            <Button variant="cityflow" asChild>
              <Link to="/dashboard/$city" params={{ city: "bengaluru" }}>
                Get Started
              </Link>
            </Button>
            <Button variant="outline" onClick={() => toggleDark()}>
              {dark ? <Sun /> : <Moon />} {dark ? "Light mode" : "Dark mode"}
            </Button>
          </div>
        )}

        <div
          id="top"
          className="relative z-10 grid min-h-0 flex-1 items-center gap-6 pt-6 lg:grid-cols-[0.82fr_1.18fr] lg:pt-2"
        >
          <div className="relative z-20 max-w-xl">
            <div className="cf-rise mb-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <span className="size-2 rounded-full bg-brand-cyan" /> Bengaluru traffic forecasts
            </div>
            <h1 className="text-[clamp(1.75rem,min(4.4vw,6.4vh),3.75rem)] font-extrabold leading-[0.98] tracking-normal">
              <span className="cf-rise block" style={{ "--d": "120ms" } as React.CSSProperties}>
                Smarter Roads
              </span>
              <span className="cf-rise block" style={{ "--d": "240ms" } as React.CSSProperties}>
                for a Brighter
              </span>
              <span
                className="cf-rise relative inline-block"
                style={{ "--d": "360ms" } as React.CSSProperties}
              >
                <span className="cf-text-shimmer">Tomorrow</span>
                <Sparkles />
              </span>
            </h1>
            <p
              className="cf-rise mt-4 max-w-lg text-sm leading-6 text-muted-foreground"
              style={{ "--d": "500ms" } as React.CSSProperties}
            >
              See how congested Bengaluru&apos;s roads are likely to be over the next 7 days, and
              why. Forecasts come from historical traffic, weather and calendar data. They are not
              live traffic.
            </p>
            <form
              onSubmit={submitSearch}
              className="cf-rise glass-panel mt-4 flex h-12 max-w-xl items-center gap-3 rounded-lg px-4 focus-within:ring-2 focus-within:ring-ring"
              style={{ "--d": "620ms" } as React.CSSProperties}
            >
              <Search className="text-brand-cyan" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search a Bengaluru location, e.g. Koramangala"
                aria-label="Search a Bengaluru location"
              />
              <Button variant="cityflow" size="icon" type="submit" aria-label="Search">
                <ArrowRight />
              </Button>
            </form>
            <div
              className="cf-rise cf-hero-chips mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
              style={{ "--d": "740ms" } as React.CSSProperties}
            >
              <span>Popular:</span>
              {POPULAR.map((location) => (
                <Link
                  key={location.slug}
                  to="/forecast"
                  search={{ loc: location.slug }}
                  className="rounded-full border border-border bg-surface px-3 py-1 transition hover:border-brand-cyan hover:text-foreground"
                >
                  {location.name}
                </Link>
              ))}
            </div>
            {notice && (
              <p role="status" className="mt-2 text-xs font-semibold text-brand-cyan">
                {notice}
              </p>
            )}
          </div>

          <div className="relative min-h-[300px] lg:h-full lg:min-h-0">
            <div className="globe-float absolute left-1/2 top-1/2 w-[min(820px,120vw,88vh)] max-w-none -translate-x-1/2 -translate-y-1/2">
              <GlobeOrbit>
                <img
                  src={globeImage}
                  alt=""
                  width={1536}
                  height={1024}
                  className="globe-rotate w-full object-contain dark:opacity-95"
                />
              </GlobeOrbit>
            </div>
            <HeroCards />
          </div>
        </div>
      </section>

      <section
        id="locations"
        className="relative z-20 shrink-0 border-t border-border bg-gradient-to-b from-transparent via-[color-mix(in_oklab,var(--brand-cyan)_8%,transparent)] to-transparent"
      >
        <div className="mx-auto grid max-w-[1450px] items-center gap-6 px-5 py-4 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:px-14">
          <div className="cf-rise">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-cyan">
              Explore Bengaluru
            </p>
            <h2 className="mt-1 text-2xl font-extrabold leading-tight tracking-normal sm:text-3xl">
              Traffic Insights for <span className="text-gradient-brand">Every Area</span>
            </h2>
            <p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">
              Search a location above to open its own forecast. The citywide dashboard lists every
              area with its current traffic level.
            </p>
            <Button variant="default" size="sm" className="mt-3" asChild>
              <Link to="/dashboard/$city" params={{ city: "bengaluru" }}>
                Citywide Dashboard <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="cf-rise" style={{ "--d": "140ms" } as React.CSSProperties}>
            <StreetScene />
            <div className="mt-1 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-border pt-3 sm:grid-cols-4">
              <Metric
                icon={MapPin}
                value={`${bengaluruLocations.length}`}
                label="Bengaluru locations"
              />
              <Metric
                icon={Database}
                value={datasetRecords.toLocaleString()}
                label={`Records across ${datasetAreas} areas`}
              />
              <Metric icon={CalendarDays} value="7 days" label="Forecast horizon" />
              <Metric icon={RouteIcon} value="Forecast, not live" label="Every figure labelled" />
            </div>
          </div>
        </div>
      </section>

      <section
        id="explore"
        className="relative z-20 shrink-0 border-t border-border bg-surface-strong py-3 backdrop-blur-xl"
      >
        <div className="cf-stagger mx-auto grid max-w-[1450px] gap-3 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:px-14">
          {features.map(({ icon: Icon, title, copy, to, params }) => (
            <Link
              key={title}
              to={to}
              params={params}
              className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5 text-left transition hover:-translate-y-1 hover:border-brand-cyan hover:shadow-brand"
            >
              <span className="cf-wiggle grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-brand-cyan">
                <Icon />
              </span>
              <span className="min-w-0">
                <strong className="block text-sm">{title}</strong>
                <span className="mt-1 block text-xs leading-4 text-muted-foreground">{copy}</span>
              </span>
              <ArrowRight className="ml-auto size-4 text-brand-cyan transition group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof MapPin;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-5 shrink-0 text-brand-cyan" />
      <div className="min-w-0">
        <strong className="block text-xs leading-tight">{value}</strong>
        <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
