export type RawRow = Record<string, unknown>;

export type NormalizedRow = {
  entry_type: string;
  entry_date: string;
  payee: string;
  amount: number;
  account: string;
  description: string;
  category: string;
  source_key: string;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map((value) => value.trim());
}

export function parseCsv(text: string): RawRow[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: RawRow = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function pick(row: RawRow, keys: string[]): string {
  const lowered = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    lowered.set(key.trim().toLowerCase(), value);
  }
  for (const key of keys) {
    const value = lowered.get(key.toLowerCase());
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function normalizeDate(input: string): string {
  if (!input) return "";
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = input.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (fr) return `${fr[3]}-${fr[2]!.padStart(2, "0")}-${fr[1]!.padStart(2, "0")}`;
  const parsed = new Date(input);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

function normalizeAmount(input: string): number {
  if (!input) return 0;
  const cleaned = input
    .replace(/\s/g, "")
    .replace(/[€$]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function normalizeType(input: string, amount: number): string {
  const value = input.trim();
  if (value) return value;
  return amount >= 0 ? "Recettes" : "Dépenses";
}

/** Deterministic key so the same N8N row is recognised across imports. */
function fallbackKey(row: NormalizedRow): string {
  return [row.entry_date, row.payee, row.amount.toFixed(2), row.account, row.category]
    .join("|")
    .toLowerCase();
}

export function normalizeRows(rows: RawRow[]): { rows: NormalizedRow[]; skipped: number } {
  const normalized: NormalizedRow[] = [];
  let skipped = 0;

  for (const raw of rows) {
    const source =
      raw && typeof raw === "object" && "json" in raw && raw["json"] && typeof raw["json"] === "object"
        ? (raw["json"] as RawRow)
        : raw;

    const entry_date = normalizeDate(pick(source, ["Date", "date", "entry_date", "Jour"]));
    const amount = normalizeAmount(pick(source, ["Amount", "amount", "Montant", "montant"]));
    if (!entry_date) {
      skipped += 1;
      continue;
    }

    const row: NormalizedRow = {
      entry_type: normalizeType(pick(source, ["Type", "type", "entry_type", "Nature"]), amount),
      entry_date,
      payee: pick(source, ["Payee", "payee", "Bénéficiaire", "Beneficiaire", "Emetteur"]),
      amount,
      account: pick(source, ["Account", "account", "Compte"]),
      description: pick(source, ["Description", "description", "Libellé", "Libelle", "Note"]),
      category: pick(source, ["Category", "category", "Catégorie", "Categorie"]),
      source_key: pick(source, ["id", "ID", "Id", "row_id", "uuid", "source_key"]),
    };

    if (!row.source_key) row.source_key = fallbackKey(row);
    normalized.push(row);
  }

  return { rows: normalized, skipped };
}

export function parsePayload(text: string, contentType: string): RawRow[] {
  const trimmed = text.trim();
  const looksJson = trimmed.startsWith("[") || trimmed.startsWith("{");
  if (contentType.includes("json") || looksJson) {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed as RawRow[];
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      for (const key of ["data", "rows", "items", "results", "budget"]) {
        const value = record[key];
        if (Array.isArray(value)) return value as RawRow[];
      }
      return [record as RawRow];
    }
    return [];
  }
  return parseCsv(trimmed);
}

export function toCsv(
  rows: Array<{
    entry_type: string;
    entry_date: string;
    payee: string;
    amount: number;
    account: string;
    description: string;
    category: string;
  }>,
): string {
  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const header = "Type,Date,Payee,Amount,Account,Description,Category";
  const lines = rows.map((row) =>
    [
      escape(row.entry_type),
      row.entry_date,
      escape(row.payee),
      row.amount.toFixed(2),
      escape(row.account),
      escape(row.description),
      escape(row.category),
    ].join(","),
  );
  return [header, ...lines].join("\n");
}
