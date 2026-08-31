import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const entryPatch = z.object({
  entry_type: z.string().max(60).optional(),
  entry_date: z.string().max(30).optional(),
  payee: z.string().max(300).optional(),
  amount: z.number().optional(),
  account: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().max(120).optional(),
});

export const listEntries = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { getState } = await import("@/lib/store.server");
  const { maybeRunBackup } = await import("@/lib/backup.server");
  await requireAdmin();
  await maybeRunBackup();
  const state = await getState();
  return [...state.entries].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
});

export const createEntry = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { mutate, newId } = await import("@/lib/store.server");
  await requireAdmin();
  const now = new Date().toISOString();
  return mutate((state) => {
    const entry = {
      id: newId(),
      entry_type: "Dépenses",
      entry_date: now.slice(0, 10),
      payee: "",
      amount: 0,
      account: "",
      description: "",
      category: "",
      source: "manual",
      source_key: null,
      locally_modified: true,
      created_at: now,
      updated_at: now,
    };
    state.entries.unshift(entry);
    return entry;
  });
});

export const updateEntry = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().min(1), patch: entryPatch }).parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    return mutate((state) => {
      const entry = state.entries.find((row) => row.id === data.id);
      if (!entry) throw new Error("Écriture introuvable");
      Object.assign(entry, data.patch, {
        locally_modified: true,
        updated_at: new Date().toISOString(),
      });
      return { ok: true as const };
    });
  });

export const deleteEntry = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    return mutate((state) => {
      state.entries = state.entries.filter((row) => row.id !== data.id);
      return { ok: true as const };
    });
  });

export const deleteEntries = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ ids: z.array(z.string().min(1)).min(1).max(10000) }).parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    return mutate((state) => {
      const ids = new Set(data.ids);
      const before = state.entries.length;
      state.entries = state.entries.filter((row) => !ids.has(row.id));
      return { deleted: before - state.entries.length };
    });
  });

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { getState } = await import("@/lib/store.server");
  await requireAdmin();
  const state = await getState();
  return state.settings;
});

export const saveSettings = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        theme: z.string().max(40).optional(),
        density: z.string().max(40).optional(),
        currency: z.string().max(10).optional(),
        date_format: z.string().max(40).optional(),
        backup_enabled: z.boolean().optional(),
        backup_interval_hours: z.number().min(1).max(720).optional(),
        backup_keep: z.number().min(1).max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/lib/auth.server");
    const { mutate } = await import("@/lib/store.server");
    await requireAdmin();
    return mutate((state) => {
      Object.assign(state.settings, data);
      return state.settings;
    });
  });

export const backupNow = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { runBackup } = await import("@/lib/backup.server");
  await requireAdmin();
  return runBackup();
});

export const getBackups = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/lib/auth.server");
  const { listBackups } = await import("@/lib/backup.server");
  const { getState } = await import("@/lib/store.server");
  await requireAdmin();
  const state = await getState();
  return { files: await listBackups(), last: state.settings.backup_last };
});
