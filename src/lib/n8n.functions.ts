import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { normalizeRows, parsePayload } from "@/lib/n8n-parse";

export const getN8nConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { getState } = await import("@/lib/store.server");
  await requireAdmin();
  const state = await getState();
  return {
    url: state.settings.n8n_url,
    headerName: state.settings.n8n_header_name || "x-api-key",
    lastSync: state.settings.n8n_last_sync,
    hasToken: Boolean(state.secrets.n8n_token),
  };
});

export const saveN8nConfig = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        url: z.string().trim().max(2000),
        headerName: z.string().trim().max(120),
        token: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();

    if (data.url && !/^https?:\/\//i.test(data.url)) {
      throw new Error("L'URL doit commencer par http:// ou https://");
    }

    await mutate((state) => {
      state.settings.n8n_url = data.url;
      state.settings.n8n_header_name = data.headerName || "x-api-key";
      if (typeof data.token === "string" && data.token.length > 0) {
        state.secrets.n8n_token = data.token;
      }
    });

    return { ok: true as const };
  });

export const testN8nConnection = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { fetchN8nRows } = await import("@/lib/n8n.server");
  await requireAdmin();
  const result = await fetchN8nRows();
  return { rows: result.rows.length, skipped: result.skipped };
});

export const syncFromN8n = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ preview: z.boolean().default(false) }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { fetchN8nRows } = await import("@/lib/n8n.server");
    const { mutate, newId } = await import("@/lib/store.server");
    await requireAdmin();

    const { rows, skipped } = await fetchN8nRows();

    return mutate((state) => {
      const byKey = new Map(
        state.entries.filter((row) => row.source_key).map((row) => [row.source_key as string, row]),
      );

      let added = 0;
      let updated = 0;
      let unchanged = 0;
      const now = new Date().toISOString();

      for (const row of rows) {
        const current = byKey.get(row.source_key);
        if (!current) {
          added += 1;
          if (!data.preview) {
            state.entries.unshift({
              ...row,
              id: newId(),
              source: "n8n",
              locally_modified: false,
              created_at: now,
              updated_at: now,
            });
          }
          continue;
        }
        const differs =
          current.entry_type !== row.entry_type ||
          current.entry_date !== row.entry_date ||
          current.payee !== row.payee ||
          Number(current.amount) !== row.amount ||
          current.account !== row.account ||
          current.description !== row.description ||
          current.category !== row.category;
        if (!differs) {
          unchanged += 1;
          continue;
        }
        updated += 1;
        if (!data.preview) {
          Object.assign(current, row, {
            source: "n8n",
            locally_modified: false,
            updated_at: now,
          });
        }
      }

      const report = {
        added,
        updated,
        unchanged,
        skipped,
        total: rows.length,
        message: data.preview
          ? "Aperçu : aucune écriture appliquée."
          : `${added} ajout(s), ${updated} mise(s) à jour par id, ${unchanged} inchangée(s), ${skipped} ignorée(s).`,
      };

      if (!data.preview) {
        state.settings.n8n_last_sync = now;
        state.syncRuns.unshift({
          id: newId(),
          ran_at: now,
          status: "success",
          rows_added: added,
          rows_updated: updated,
          rows_unchanged: unchanged,
          rows_skipped: skipped,
          message: report.message,
        });
        state.syncRuns = state.syncRuns.slice(0, 50);
      }

      return report;
    });
  });

export const importRows = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        text: z.string().min(1).max(5_000_000),
        contentType: z.string().default("text/csv"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate, newId } = await import("@/lib/store.server");
    await requireAdmin();

    const parsed = parsePayload(data.text, data.contentType);
    const { rows, skipped } = normalizeRows(parsed);

    if (rows.length === 0) {
      return {
        added: 0,
        updated: 0,
        unchanged: 0,
        skipped,
        total: 0,
        message: "Aucune ligne exploitable (la colonne id est obligatoire).",
      };
    }

    return mutate((state) => {
      const byKey = new Map(
        state.entries.filter((row) => row.source_key).map((row) => [row.source_key as string, row]),
      );
      const now = new Date().toISOString();
      let added = 0;
      let updated = 0;

      for (const row of rows) {
        const current = byKey.get(row.source_key);
        if (current) {
          Object.assign(current, row, {
            source: "import",
            locally_modified: false,
            updated_at: now,
          });
          updated += 1;
        } else {
          state.entries.unshift({
            ...row,
            id: newId(),
            source: "import",
            locally_modified: false,
            created_at: now,
            updated_at: now,
          });
          added += 1;
        }
      }

      return {
        added,
        updated,
        unchanged: 0,
        skipped,
        total: rows.length,
        message: `${added} ajout(s), ${updated} mise(s) à jour par id, ${skipped} ignorée(s).`,
      };
    });
  });
