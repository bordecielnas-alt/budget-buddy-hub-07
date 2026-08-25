import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { UserSettings } from "@/lib/budget-types";
import { applyTheme, DEFAULT_THEME } from "@/lib/themes";

const FALLBACK: UserSettings = {
  user_id: "",
  theme: DEFAULT_THEME,
  density: "comfortable",
  currency: "EUR",
  date_format: "dd/MM/yyyy",
  n8n_url: "",
  n8n_header_name: "x-api-key",
  n8n_last_sync: null,
};

export function useSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["user-settings"],
    queryFn: async (): Promise<UserSettings> => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return FALLBACK;
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as UserSettings | null) ?? { ...FALLBACK, user_id: userId };
    },
  });

  const settings = query.data ?? FALLBACK;

  useEffect(() => {
    applyTheme(settings.theme, settings.density);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "bt-appearance",
        JSON.stringify({ theme: settings.theme, density: settings.density }),
      );
    }
  }, [settings.theme, settings.density]);

  const update = useMutation({
    mutationFn: async (patch: Partial<UserSettings>) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Non connecté");
      const { error } = await supabase
        .from("user_settings")
        .update(patch)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      queryClient.setQueryData<UserSettings>(["user-settings"], (current) => ({
        ...(current ?? FALLBACK),
        ...patch,
      }));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  return { settings, isLoading: query.isLoading, update };
}
