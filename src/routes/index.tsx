import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Budget Tracker — suivi de budget auto-hébergé" },
      {
        name: "description",
        content:
          "Budget Tracker : dashboard, table éditable et synchronisation N8N pour piloter vos dépenses et recettes.",
      },
      { property: "og:title", content: "Budget Tracker — suivi de budget auto-hébergé" },
      {
        property: "og:description",
        content: "Dashboard interactif, table éditable et mise à jour depuis N8N.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
