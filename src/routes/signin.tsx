import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title: "Sign In | CityFlow" },
      { name: "description", content: "Sign in to your CityFlow account to access live traffic insights." },
    ],
  }),
  component: AuthPage,
});
