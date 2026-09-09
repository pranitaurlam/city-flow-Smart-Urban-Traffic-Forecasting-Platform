import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/components/auth-page";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log In | CityFlow" },
      { name: "description", content: "Log in to your CityFlow account to access live traffic insights." },
    ],
  }),
  component: AuthPage,
});
