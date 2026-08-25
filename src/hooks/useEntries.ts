import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { BudgetEntry } from "@/lib/budget-types";

export function useEntries() {
  return useQuery({
    queryKey: ["budget-entries"],
    queryFn: async (): Promise<BudgetEntry[]> => {
      const { data, error } = await supabase
        .from("budget_entries")
        .select("*")
        .order("entry_date", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) })) as BudgetEntry[];
    },
  });
}

export function useEntryMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["budget-entries"] });
  };

  const updateEntry = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<BudgetEntry> }) => {
      const { error } = await supabase
        .from("budget_entries")
        .update({ ...patch, locally_modified: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const createEntry = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Non connecté");
      const { error } = await supabase.from("budget_entries").insert({
        user_id: userId,
        entry_type: "Dépenses",
        entry_date: new Date().toISOString().slice(0, 10),
        payee: "",
        amount: 0,
        account: "",
        description: "",
        category: "",
        source: "manual",
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budget_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { updateEntry, createEntry, deleteEntry, invalidate };
}
