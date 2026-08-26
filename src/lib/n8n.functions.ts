import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeRows, parsePayload, type NormalizedRow } from "@/lib/n8n-parse";

export const getN8nConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await context.supabase
      .from("user_settings")
      .select("n8n_url, n8n_header_name, n8n_last_sync")
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: secret } = await supabaseAdmin
      .from("user_secrets")
      .select("n8n_token")
      .eq("user_id", context.userId)
      .maybeSingle();

    return {
      url: settings?.n8n_url ?? "",
      headerName: settings?.n8n_header_name ?? "x-api-key",
      lastSync: settings?.n8n_last_sync ?? null,
      hasToken: Boolean(secret?.n8n_token),
    };
  });

export const saveN8nConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        url: z.string().trim().max(2000),
        headerName: z.string().trim().max(120),
        token: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.url && !/^https?:\/\//i.test(data.url)) {
      throw new Error("L'URL doit commencer par http:// ou https://");
    }

    const { error } = await context.supabase
      .from("user_settings")
      .update({
        n8n_url: data.url,
        n8n_header_name: data.headerName || "x-api-key",
      })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    if (typeof data.token === "string") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: secretError } = await supabaseAdmin
        .from("user_secrets")
        .upsert(
          { user_id: context.userId, n8n_token: data.token, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (secretError) throw new Error(secretError.message);
    }

    return { ok: true as const };
  });

export const testN8nConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchN8nRows } = await import("@/lib/n8n.server");
    const result = await fetchN8nRows(context.supabase, context.userId);
    return { rows: result.rows.length, skipped: result.skipped };
  });

export const syncFromN8n = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ preview: z.boolean().default(false) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { fetchN8nRows } = await import("@/lib/n8n.server");
    const { rows, skipped } = await fetchN8nRows(context.supabase, context.userId);

    const { data: existing, error: readError } = await context.supabase
      .from("budget_entries")
      .select("id, source_key, entry_type, entry_date, payee, amount, account, description, category")
      .eq("user_id", context.userId)
      .not("source_key", "is", null);
    if (readError) throw new Error(readError.message);

    const byKey = new Map((existing ?? []).map((row) => [row.source_key as string, row]));

    type EntryInsert = NormalizedRow & {
      user_id: string;
      source: string;
      locally_modified: boolean;
    };
    const toInsert: EntryInsert[] = [];
    const toUpdate: Array<{ id: string; patch: Omit<EntryInsert, "user_id"> }> = [];
    let unchanged = 0;

    for (const row of rows) {
      const current = byKey.get(row.source_key);
      if (!current) {
        toInsert.push({ ...row, user_id: context.userId, source: "n8n", locally_modified: false });
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
      if (differs) {
        toUpdate.push({
          id: current.id as string,
          patch: { ...row, source: "n8n", locally_modified: false },
        });
      } else {
        unchanged += 1;
      }
    }

    const report = {
      added: toInsert.length,
      updated: toUpdate.length,
      unchanged,
      skipped,
      total: rows.length,
      message: "",
    };

    if (data.preview) {
      report.message = "Aperçu : aucune écriture appliquée.";
      return report;
    }

    if (toInsert.length > 0) {
      const { error } = await context.supabase.from("budget_entries").insert(toInsert);
      if (error) throw new Error(error.message);
    }
    for (const item of toUpdate) {
      const { error } = await context.supabase
        .from("budget_entries")
        .update(item.patch)
        .eq("id", item.id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    }

    report.message = `${report.added} ajout(s), ${report.updated} mise(s) à jour, ${report.unchanged} inchangée(s), ${report.skipped} ignorée(s).`;

    await context.supabase.from("user_settings").update({ n8n_last_sync: new Date().toISOString() }).eq("user_id", context.userId);
    await context.supabase.from("sync_runs").insert({
      user_id: context.userId,
      status: "success",
      rows_added: report.added,
      rows_updated: report.updated,
      rows_unchanged: report.unchanged,
      rows_skipped: report.skipped,
      message: report.message,
    });

    return report;
  });

export const importRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ text: z.string().min(1).max(5_000_000), contentType: z.string().default("text/csv") }).parse(input),
  )
  .handler(async ({ data, context }) => {
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

    const { data: existing, error: readError } = await context.supabase
      .from("budget_entries")
      .select("id, source_key")
      .eq("user_id", context.userId)
      .not("source_key", "is", null);
    if (readError) throw new Error(readError.message);
    const byKey = new Map((existing ?? []).map((row) => [row.source_key as string, row.id as string]));

    let added = 0;
    let updated = 0;
    const toInsert: Array<Record<string, unknown>> = [];

    for (const row of rows) {
      const currentId = byKey.get(row.source_key);
      if (currentId) {
        const { error } = await context.supabase
          .from("budget_entries")
          .update({ ...row, source: "import", locally_modified: false })
          .eq("id", currentId)
          .eq("user_id", context.userId);
        if (error) throw new Error(error.message);
        updated += 1;
      } else {
        toInsert.push({ ...row, user_id: context.userId, source: "import", locally_modified: false });
        added += 1;
      }
    }

    if (toInsert.length > 0) {
      const { error } = await context.supabase.from("budget_entries").insert(toInsert);
      if (error) throw new Error(error.message);
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
