import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CarFront,
  ChartNoAxesCombined,
  Clock3,
  CloudSun,
  Globe2,
  Leaf,
  Map,
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
import globeImage from "@/assets/cityflow-globe-transparent.png";
import cityStrip from "@/assets/cityflow-cities.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CityFlow | Live Global Traffic Insights" },
      { name: "description", content: "Explore live traffic, city forecasts and data insights for smarter journeys worldwide." },
      { property: "og:title", content: "CityFlow | Live Global Traffic Insights" },
      { property: "og:description", content: "Explore live traffic, city forecasts and data insights for smarter journeys worldwide." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CityFlow,
});

const cities = [
  { name: "Bengaluru", country: "India", traffic: "Moderate Traffic", tone: "bg-warning" },
  { name: "New York", country: "USA", traffic: "High Traffic", tone: "bg-destructive" },
  { name: "London", country: "UK", traffic: "Low Traffic", tone: "bg-success" },
  { name: "Tokyo", country: "Japan", traffic: "High Traffic", tone: "bg-destructive" },
];

const features = [
  { icon: Map, title: "Explore Locations", copy: "Search any city or road across the globe" },
  { icon: BarChart3, title: "Traffic Forecast", copy: "Know tomorrow's traffic before you travel" },
  { icon: ChartNoAxesCombined, title: "Data Analytics", copy: "Visualize patterns and trends" },
  { icon: Navigation, title: "Plan Better", copy: "Choose faster, smarter routes" },
  { icon: Leaf, title: "Sustainable Cities", copy: "Less congestion, cleaner tomorrow" },
];


function CityFlow() {
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(preferred);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const filteredCities = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return clean ? cities.filter((city) => `${city.name} ${city.country}`.toLowerCase().includes(clean)) : cities;
  }, [query]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(query.trim() ? `Showing traffic insights for ${query.trim()}` : "Enter a city or road to explore");
    document.querySelector("#cities")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground transition-colors duration-500">
      <section className="relative mx-auto min-h-[660px] max-w-[1536px] px-5 pb-8 pt-4 sm:px-8 lg:px-14">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_62%_34%,color-mix(in_oklab,var(--brand-cyan)_16%,transparent),transparent_40%)]" />
        <header className="relative z-30 flex h-14 items-center justify-between">
          <a href="#top" className="flex items-center gap-2" aria-label="CityFlow home">
            <span className="grid size-10 place-items-center rounded-full bg-gradient-brand text-primary-foreground"><RouteIcon size={24} /></span>
            <span className="text-2xl font-extrabold tracking-normal">CityFlow</span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-medium lg:flex" aria-label="Main navigation">
            {["Home", "Explore", "Forecast", "Analytics", "Cities", "About"].map((item) => (
              <a key={item} href={item === "Home" ? "#top" : `#${item.toLowerCase()}`} className="border-b-2 border-transparent py-3 transition hover:border-brand-violet hover:text-brand-cyan">{item}</a>
            ))}
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <Button variant="ghost" size="icon" onClick={() => setDark((value) => !value)} aria-label={`Switch to ${dark ? "light" : "dark"} mode`}>
              {dark ? <Sun /> : <Moon />}
            </Button>
            <Button variant="outline">Sign In</Button>
            <Button variant="cityflow">Get Started</Button>
          </div>
          <Button className="sm:hidden" variant="ghost" size="icon" onClick={() => setMenuOpen((value) => !value)} aria-label="Toggle menu">{menuOpen ? <X /> : <Menu />}</Button>
        </header>

        {menuOpen && (
          <div className="glass-panel absolute left-5 right-5 top-20 z-40 grid gap-2 rounded-lg p-4 sm:hidden">
            {["Home", "Explore", "Forecast", "Analytics", "Cities", "About"].map((item) => <a key={item} href={`#${item.toLowerCase()}`} onClick={() => setMenuOpen(false)} className="rounded-md px-3 py-2 font-semibold hover:bg-accent">{item}</a>)}
            <Button variant="outline" onClick={() => setDark((value) => !value)}>{dark ? <Sun /> : <Moon />} {dark ? "Light mode" : "Dark mode"}</Button>
          </div>
        )}

        <div id="top" className="relative z-10 grid items-center gap-8 pt-10 lg:grid-cols-[0.82fr_1.18fr] lg:pt-12">
          <div className="relative z-20 max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <span className="size-2 rounded-full bg-success" /> Live global traffic insights
            </div>
            <h1 className="text-5xl font-extrabold leading-[0.98] tracking-normal sm:text-6xl lg:text-7xl">Smarter Roads<br />for a Brighter<br /><span className="text-gradient-brand">Tomorrow</span></h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">Explore, forecast and understand traffic conditions across cities worldwide. Real data. Real insights. Smoother journeys for a smarter world.</p>
            <form onSubmit={submitSearch} className="glass-panel mt-5 flex h-14 max-w-xl items-center gap-3 rounded-lg px-4 focus-within:ring-2 focus-within:ring-ring">
              <Search className="text-brand-cyan" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Search for a city, road or location..." aria-label="Search a city or road" />
              <Button variant="cityflow" size="icon" type="submit" aria-label="Search"><ArrowRight /></Button>
            </form>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Popular cities:</span>{cities.map((city) => <button key={city.name} onClick={() => setQuery(city.name)} className="rounded-full border border-border bg-surface px-3 py-1 transition hover:border-brand-cyan hover:text-foreground">{city.name}</button>)}</div>
            {notice && <p role="status" className="mt-2 text-xs font-semibold text-brand-cyan">{notice}</p>}
          </div>

          <div className="relative min-h-[390px] lg:min-h-[485px]">
            <div className="globe-float absolute left-1/2 top-1/2 w-[min(820px,120vw)] max-w-none -translate-x-1/2 -translate-y-1/2">
              <img src={globeImage} alt="Glowing Earth showing global city connections" width={1536} height={1024} className="globe-rotate w-full object-contain dark:opacity-95" />
            </div>
            <aside className="glass-panel absolute right-0 top-2 z-20 hidden w-48 rounded-lg p-4 xl:block">

              <div className="flex items-center justify-between border-b border-border pb-3 text-sm font-bold">Live Global Traffic <span className="flex items-center gap-1 text-xs text-success"><i className="size-2 rounded-full bg-success" /> Live</span></div>
              <div className="mt-4 space-y-4 text-xs">
                <Metric icon={CarFront} value="500+" label="Cities covered" /><Metric icon={MapPin} value="10M+" label="Road segments" /><Metric icon={BarChart3} value="Real-time" label="Forecast insights" /><Metric icon={CloudSun} value="Weather-aware" label="Analysis" />
              </div>
              <Button variant="default" className="mt-5 w-full">Explore Map <ArrowRight /></Button>
            </aside>
          </div>
        </div>
      </section>

      <section id="explore" className="relative z-20 border-y border-border bg-surface-strong py-4 backdrop-blur-xl">
        <div className="mx-auto grid max-w-[1450px] gap-3 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-5 lg:px-14">
          {features.map(({ icon: Icon, title, copy }) => <button key={title} className="group flex min-h-20 items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition hover:-translate-y-1 hover:border-brand-cyan"><span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-brand-cyan"><Icon /></span><span className="min-w-0"><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs leading-4 text-muted-foreground">{copy}</span></span><ArrowRight className="ml-auto size-4 text-brand-cyan transition group-hover:translate-x-1" /></button>)}
        </div>
      </section>

      <section id="cities" className="mx-auto max-w-[1450px] px-5 py-10 sm:px-8 lg:px-14">
        <div className="grid gap-8 lg:grid-cols-[0.38fr_1fr] lg:items-center">
          <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-cyan">Explore the world</p><h2 className="mt-3 text-4xl font-extrabold leading-tight tracking-normal">Traffic Insights<br />for <span className="text-gradient-brand">Every City</span></h2><p className="mt-3 text-sm leading-6 text-muted-foreground">From daily commuters to city planners, CityFlow provides data-driven insights to reduce congestion, save time and create more livable, sustainable cities.</p><Button variant="default" className="mt-5" onClick={() => setQuery("")}>Explore Cities <ArrowRight /></Button></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {filteredCities.length ? filteredCities.map((city) => {
              const imageIndex = cities.findIndex((item) => item.name === city.name);
              const positions = ["left-0", "left-[-100%]", "left-[-200%]", "left-[-300%]"];
              return <article key={city.name} className="group relative min-h-52 overflow-hidden rounded-lg border border-border bg-card shadow-sm"><img src={cityStrip} alt={`${city.name} skyline`} loading="lazy" width={1920} height={640} className={`absolute top-0 h-full w-[400%] max-w-none object-cover transition duration-500 group-hover:scale-105 ${positions[imageIndex] ?? "left-0"}`} /><div className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/20 to-transparent" /><div className="absolute inset-x-0 bottom-0 p-4 text-background"><div className="flex items-end justify-between"><div><h3 className="font-bold">{city.name}</h3><p className="text-xs opacity-80">{city.country}</p></div><Button size="icon" variant="outline" className="border-background/60 bg-transparent text-background" onClick={() => setNotice(`Opening live view for ${city.name}`)} aria-label={`Open ${city.name}`}><ArrowRight /></Button></div><p className="mt-2 flex items-center gap-2 text-xs"><i className={`size-2.5 rounded-full ${city.tone}`} />{city.traffic}</p></div></article>;
            }) : <div className="col-span-full grid min-h-52 place-items-center rounded-lg border border-dashed border-border text-center text-muted-foreground"><div><Search className="mx-auto mb-2" /><p>No matching city yet.</p><button className="mt-2 text-sm font-semibold text-brand-cyan" onClick={() => setQuery("")}>View all cities</button></div></div>}
          </div>
        </div>
        <div className="mt-9 grid gap-5 border-t border-border pt-7 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={Globe2} value="500+" label="Cities Worldwide" /><Metric icon={RouteIcon} value="10M+" label="Road Segments" /><Metric icon={Clock3} value="Real-time & Forecast" label="Traffic Insights" /><Metric icon={Leaf} value="Greener, Smarter" label="More Sustainable Cities" /></div>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, value, label }: { icon: typeof Globe2; value: string; label: string }) {
  return <div className="flex items-center gap-3"><Icon className="size-7 text-brand-cyan" /><div><strong className="block text-sm">{value}</strong><span className="text-xs text-muted-foreground">{label}</span></div></div>;
}