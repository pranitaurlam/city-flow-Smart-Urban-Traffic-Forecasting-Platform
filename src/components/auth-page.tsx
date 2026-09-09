import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Lock, Mail, Moon, Route as RouteIcon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "@/hooks/use-theme";

export function AuthPage() {
  const { dark, toggleDark } = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please enter both email and password.");
      return;
    }
    setError("");
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-10 text-foreground transition-colors duration-500">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,color-mix(in_oklab,var(--brand-cyan)_16%,transparent),transparent_45%)]" />

      <Button
        variant="ghost"
        size="icon"
        onClick={() => toggleDark()}
        aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
        className="absolute right-5 top-5 z-10"
      >
        {dark ? <Sun /> : <Moon />}
      </Button>

      <div className="relative z-10 w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2" aria-label="CityFlow home">
          <span className="grid size-10 place-items-center rounded-full bg-gradient-brand text-primary-foreground">
            <RouteIcon size={24} />
          </span>
          <span className="text-2xl font-extrabold tracking-normal">CityFlow</span>
        </Link>

        <div className="glass-panel rounded-lg p-8 shadow-sm">
          <h1 className="text-2xl font-extrabold tracking-normal">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Log in to access live traffic insights.</p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a href="#" className="text-xs font-semibold text-brand-cyan hover:underline">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="px-9"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-xs font-semibold text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" variant="cityflow" className="w-full">
              Log In
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a href="#" className="font-semibold text-brand-cyan hover:underline">
              Sign up
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
