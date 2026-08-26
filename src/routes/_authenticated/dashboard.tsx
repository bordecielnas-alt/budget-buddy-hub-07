import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEntries } from "@/hooks/useEntries";
import { formatMoney, formatMonth, isIncome, monthKey, type BudgetEntry } from "@/lib/budget-types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard budget — Budget Tracker" },
      {
        name: "description",
        content:
          "Vue d'ensemble de vos recettes, dépenses et soldes mensuels avec filtrage croisé par catégorie, compte et mois.",
      },
      { property: "og:title", content: "Dashboard budget — Budget Tracker" },
      {
        property: "og:description",
        content: "Graphiques interactifs et filtrage croisé de votre budget.",
      },
    ],
  }),
  component: DashboardPage,
});

type FilterKey = "month" | "category" | "account" | "type";
type Filters = Partial<Record<FilterKey, string>>;

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function currentMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(first), to: iso(last) };
}

function spanDays(from: string, to: string) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function formatPeriod(key: string) {
  if (key.length === 7) return formatMonth(key);
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y?.slice(2)}`;
}

function matches(
  entry: BudgetEntry,
  filters: Filters,
  bucket: (date: string) => string,
  ignore?: FilterKey,
) {
  const checks: Array<[FilterKey, string]> = [
    ["month", bucket(entry.entry_date)],
    ["category", entry.category || "Sans catégorie"],
    ["account", entry.account || "Sans compte"],
    ["type", entry.entry_type],
  ];
  return checks.every(([key, value]) => {
    if (key === ignore) return true;
    const active = filters[key];
    return !active || active === value;
  });
}

function DashboardPage() {
  const { data: entries = [], isLoading } = useEntries();
  const [filters, setFilters] = useState<Filters>({});
  const initialRange = useMemo(currentMonthRange, []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);

  const daily = spanDays(from, to) <= 70;
  const bucket = useMemo(
    () => (date: string) => (daily ? date.slice(0, 10) : monthKey(date)),
    [daily],
  );

  const scoped = useMemo(
    () => entries.filter((e) => e.entry_date >= from && e.entry_date <= to),
    [entries, from, to],
  );

  const toggle = (key: FilterKey, value: string) =>
    setFilters((current) => ({ ...current, [key]: current[key] === value ? undefined : value }));

  const filtered = useMemo(
    () => scoped.filter((e) => matches(e, filters, bucket)),
    [scoped, filters, bucket],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const entry of filtered) {
      if (isIncome(entry)) income += Math.abs(entry.amount);
      else expense += Math.abs(entry.amount);
    }
    return { income, expense, balance: income - expense, count: filtered.length };
  }, [filtered]);

  const monthly = useMemo(() => {
    const map = new Map<string, { month: string; recettes: number; depenses: number }>();
    for (const entry of scoped.filter((e) => matches(e, filters, bucket, "month"))) {
      const key = bucket(entry.entry_date);
      const bucket = map.get(key) ?? { month: key, recettes: 0, depenses: 0 };
      if (isIncome(entry)) bucket.recettes += Math.abs(entry.amount);
      else bucket.depenses += Math.abs(entry.amount);
      map.set(key, bucket);
    }
    return [...map.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((row) => ({ ...row, solde: row.recettes - row.depenses, label: formatPeriod(row.month) }));
  }, [scoped, filters, bucket]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of scoped.filter((e) => matches(e, filters, bucket, "category"))) {
      if (isIncome(entry)) continue;
      const key = entry.category || "Sans catégorie";
      map.set(key, (map.get(key) ?? 0) + Math.abs(entry.amount));
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [scoped, filters, bucket]);

  const byAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of scoped.filter((e) => matches(e, filters, bucket, "account"))) {
      const key = entry.account || "Sans compte";
      map.set(key, (map.get(key) ?? 0) + (isIncome(entry) ? Math.abs(entry.amount) : -Math.abs(entry.amount)));
    }
    return [...map.entries()].map(([name, solde]) => ({ name, solde }));
  }, [scoped, filters, bucket]);

  const activeFilters = Object.entries(filters).filter(([, value]) => value) as Array<
    [FilterKey, string]
  >;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Cliquez sur une période, une catégorie ou un compte pour croiser les filtres.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label htmlFor="from" className="text-xs text-muted-foreground">
              Date de début
            </Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="w-40"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="to" className="text-xs text-muted-foreground">
              Date de fin
            </Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="w-40"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const range = currentMonthRange();
              setFrom(range.from);
              setTo(range.to);
            }}
          >
            Mois en cours
          </Button>
        </div>
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map(([key, value]) => (
              <Badge key={key} variant="secondary" className="gap-1">
                {key === "month" ? formatPeriod(value) : value}
                <button type="button" onClick={() => toggle(key, value)} aria-label="Retirer le filtre">
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
              Tout effacer
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Recettes", value: totals.income },
          { label: "Dépenses", value: totals.expense },
          { label: "Solde", value: totals.balance },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-2xl">{formatMoney(kpi.value)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Écritures</CardDescription>
            <CardTitle className="text-2xl">{totals.count}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Recettes / dépenses {daily ? "par jour" : "par mois"}
            </CardTitle>
            <CardDescription>Cliquez une barre pour filtrer sur la période</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => formatMoney(value)} />
                <Legend />
                <Bar
                  dataKey="recettes"
                  name="Recettes"
                  fill="var(--chart-2)"
                  radius={[4, 4, 0, 0]}
                  onClick={(payload: { month?: string }) => payload.month && toggle("month", payload.month)}
                >
                  {monthly.map((row) => (
                    <Cell
                      key={row.month}
                      opacity={!filters.month || filters.month === row.month ? 1 : 0.3}
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="depenses"
                  name="Dépenses"
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                  onClick={(payload: { month?: string }) => payload.month && toggle("month", payload.month)}
                >
                  {monthly.map((row) => (
                    <Cell
                      key={row.month}
                      opacity={!filters.month || filters.month === row.month ? 1 : 0.3}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Solde {daily ? "journalier" : "mensuel"}</CardTitle>
            <CardDescription>Évolution recettes moins dépenses</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => formatMoney(value)} />
                <Line type="monotone" dataKey="solde" name="Solde" stroke="var(--chart-3)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dépenses par catégorie</CardTitle>
            <CardDescription>Cliquez une part pour filtrer</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byCategory}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  onClick={(payload: { name?: string }) => payload.name && toggle("category", payload.name)}
                >
                  {byCategory.map((row, index) => (
                    <Cell
                      key={row.name}
                      fill={PALETTE[index % PALETTE.length]}
                      opacity={!filters.category || filters.category === row.name ? 1 : 0.3}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatMoney(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Solde par compte</CardTitle>
            <CardDescription>Cliquez une barre pour filtrer</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byAccount} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => formatMoney(value)} />
                <Bar
                  dataKey="solde"
                  name="Solde"
                  fill="var(--chart-4)"
                  radius={[0, 4, 4, 0]}
                  onClick={(payload: { name?: string }) => payload.name && toggle("account", payload.name)}
                >
                  {byAccount.map((row) => (
                    <Cell
                      key={row.name}
                      opacity={!filters.account || filters.account === row.name ? 1 : 0.3}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Chargement des données…</p>}
      {!isLoading && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucune donnée : lancez une mise à jour depuis Réglages → Mise à jour, ou importez un CSV
          depuis l'onglet Data.
        </p>
      )}
    </div>
  );
}
