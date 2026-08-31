export type BudgetEntry = {
  id: string;
  entry_type: string;
  entry_date: string;
  payee: string;
  amount: number;
  account: string;
  description: string;
  category: string;
  source: string;
  source_key: string | null;
  locally_modified: boolean;
  created_at: string;
  updated_at: string;
};

export type UserSettings = {
  theme: string;
  density: string;
  currency: string;
  date_format: string;
  n8n_url: string;
  n8n_header_name: string;
  n8n_last_sync: string | null;
  backup_enabled: boolean;
  backup_interval_hours: number;
  backup_keep: number;
  backup_last: string | null;
};

export type SyncRun = {
  id: string;
  started_at: string;
  status: string;
  rows_added: number;
  rows_updated: number;
  rows_unchanged: number;
  rows_skipped: number;
  message: string;
};

export type SyncReport = {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  protected: number;
  total: number;
  message: string;
};


export const ENTRY_TYPES = ["Dépenses", "Recettes", "Transfert", "Épargne"] as const;

export function isIncome(entry: Pick<BudgetEntry, "entry_type" | "amount">): boolean {
  if (entry.entry_type.toLowerCase().startsWith("recette")) return true;
  if (entry.entry_type.toLowerCase().startsWith("dépense")) return false;
  return entry.amount > 0;
}

export function formatMoney(value: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function formatMonth(key: string): string {
  const [year, month] = key.split("-");
  const labels = [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc.",
  ];
  const index = Number(month) - 1;
  return `${labels[index] ?? month} ${year?.slice(2) ?? ""}`;
}
