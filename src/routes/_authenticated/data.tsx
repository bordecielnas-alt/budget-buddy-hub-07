import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { SyncButton } from "@/components/SyncButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useEntries, useEntryMutations } from "@/hooks/useEntries";
import { ENTRY_TYPES, formatMoney, type BudgetEntry } from "@/lib/budget-types";
import { deleteEntries } from "@/lib/data.functions";
import { toCsv } from "@/lib/n8n-parse";
import { importRows } from "@/lib/n8n.functions";

export const Route = createFileRoute("/_authenticated/data")({
  head: () => ({
    meta: [
      { title: "Table budget — Budget Tracker" },
      {
        name: "description",
        content:
          "Consultez et modifiez localement votre table budget : id, type, date, émetteur, montant, compte, description et catégorie.",
      },
      { property: "og:title", content: "Table budget — Budget Tracker" },
      {
        property: "og:description",
        content: "Édition locale, import et export CSV de votre table budget.",
      },
    ],
  }),
  component: DataPage,
});

type ColumnKey = "id" | "entry_type" | "entry_date" | "payee" | "account" | "description" | "category";

function DataPage() {
  const { data: entries = [], isLoading } = useEntries();
  const { updateEntry, createEntry, deleteEntry, invalidate } = useEntryMutations();
  const runImport = useServerFn(importRows);
  const runBulkDelete = useServerFn(deleteEntries);
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColumnKey, string>>>({});
  const [bulkCategory, setBulkCategory] = useState("");
  const lastIndex = useRef<number | null>(null);

  const setColumnFilter = (key: ColumnKey, value: string) =>
    setColumnFilters((current) => ({ ...current, [key]: value }));

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const fields: Record<ColumnKey, (entry: BudgetEntry) => string> = {
      id: (e) => e.source_key ?? e.id,
      entry_type: (e) => e.entry_type ?? "",
      entry_date: (e) => e.entry_date ?? "",
      payee: (e) => e.payee ?? "",
      account: (e) => e.account ?? "",
      description: (e) => e.description ?? "",
      category: (e) => e.category ?? "",
    };
    return entries.filter((entry) => {
      if (term) {
        const haystack = (Object.keys(fields) as ColumnKey[])
          .map((key) => fields[key](entry))
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return (Object.entries(columnFilters) as Array<[ColumnKey, string | undefined]>).every(
        ([key, value]) => {
          if (!value || value === "__all") return true;
          const cell = fields[key](entry).toLowerCase();
          if (key === "entry_type") return cell === value.toLowerCase();
          return cell.includes(value.toLowerCase());
        },
      );
    });
  }, [entries, search, columnFilters]);

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));

  function toggleRow(index: number, id: string, checked: boolean, extend: boolean) {
    if (extend && lastIndex.current !== null) {
      const start = Math.min(lastIndex.current, index);
      const end = Math.max(lastIndex.current, index);
      const ids = rows.slice(start, end + 1).map((row) => row.id);
      setSelected((current) =>
        checked
          ? [...new Set([...current, ...ids])]
          : current.filter((value) => !ids.includes(value)),
      );
    } else {
      setSelected((current) =>
        checked ? [...new Set([...current, id])] : current.filter((value) => value !== id),
      );
    }
    lastIndex.current = index;
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? rows.map((row) => row.id) : []);
    lastIndex.current = null;
  }

  async function applyBulkCategory() {
    const value = bulkCategory.trim();
    if (selected.length === 0) return;
    try {
      for (const id of selected) {
        await updateEntry.mutateAsync({ id, patch: { category: value } });
      }
      toast.success(`Catégorie appliquée à ${selected.length} ligne(s)`);
      setBulkCategory("");
      invalidate();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  function patch(entry: BudgetEntry, field: keyof BudgetEntry, value: string) {
    const next = field === "amount" ? Number(value.replace(",", ".")) || 0 : value;
    updateEntry.mutate({ id: entry.id, patch: { [field]: next } as Partial<BudgetEntry> });
  }


  async function removeSelected() {
    if (selected.length === 0) return;
    try {
      const result = await runBulkDelete({ data: { ids: selected } });
      toast.success(`${result.deleted} ligne(s) supprimée(s)`);
      setSelected([]);
      invalidate();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `budget-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const report = await runImport({ data: { text, contentType: file.type || "text/csv" } });
      toast.success(
        `${report.added} ajoutées, ${report.updated} mises à jour, ${report.protected} protégées, ${report.skipped} ignorées`,
      );
      invalidate();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Data</h1>
          <p className="text-sm text-muted-foreground">
            {entries.length} écritures. Une ligne modifiée localement est figée : les MAJ N8N ne
            l'écrasent plus.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44"
          />
          {selected.length > 0 && (
            <Button variant="destructive" size="sm" onClick={removeSelected}>
              <Trash2 className="mr-2 size-4" /> Supprimer ({selected.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload className="mr-2 size-4" /> Importer
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={onFile}
          />
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 size-4" /> Exporter
          </Button>
          <Button variant="outline" size="sm" onClick={() => createEntry.mutate()}>
            <Plus className="mr-2 size-4" /> Ligne
          </Button>
          <SyncButton />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Table budget</CardTitle>
          <CardDescription>Édition directe dans les cellules, enregistrée automatiquement.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                    aria-label="Tout sélectionner"
                  />
                </TableHead>
                <TableHead className="w-44">ID</TableHead>
                <TableHead className="w-32">Type</TableHead>
                <TableHead className="w-36">Date</TableHead>
                <TableHead>Émetteur</TableHead>
                <TableHead className="w-32 text-right">Montant</TableHead>
                <TableHead className="w-28">Compte</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-40">Catégorie</TableHead>
                <TableHead className="w-24">Source</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => (
                <TableRow key={entry.id} data-state={selected.includes(entry.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.includes(entry.id)}
                      onCheckedChange={(checked) => toggleRow(entry.id, checked === true)}
                      aria-label="Sélectionner la ligne"
                    />
                  </TableCell>
                  <TableCell
                    className="max-w-44 truncate font-mono text-xs text-muted-foreground"
                    title={entry.source_key ?? entry.id}
                  >
                    {entry.source_key ?? entry.id}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={entry.entry_type}
                      onValueChange={(value) => patch(entry, "entry_type", value)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ENTRY_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="h-8"
                      defaultValue={entry.entry_date}
                      onBlur={(e) => patch(entry, "entry_date", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      defaultValue={entry.payee ?? ""}
                      onBlur={(e) => patch(entry, "payee", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8 text-right"
                      defaultValue={String(entry.amount)}
                      onBlur={(e) => patch(entry, "amount", e.target.value)}
                      title={formatMoney(entry.amount)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      defaultValue={entry.account ?? ""}
                      onBlur={(e) => patch(entry, "account", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      defaultValue={entry.description ?? ""}
                      onBlur={(e) => patch(entry, "description", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="h-8"
                      defaultValue={entry.category ?? ""}
                      onBlur={(e) => patch(entry, "category", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.locally_modified ? "default" : "secondary"}>
                      {entry.locally_modified ? "local" : entry.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteEntry.mutate(entry.id)}
                      aria-label="Supprimer la ligne"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                    Aucune écriture. Importez un CSV ou lancez une mise à jour N8N.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
