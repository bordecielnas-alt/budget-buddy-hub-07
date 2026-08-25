import { createServerFn } from "@tanstack/react-start";

export const ADMIN_EMAIL = "admin@budget.local";

/**
 * Crée le compte administrateur initial (admin@budget.local / @Tracking@)
 * uniquement si aucun compte n'existe encore. Idempotent et sans effet
 * dès qu'un utilisateur est présent.
 */
export const ensureAdminAccount = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { count, error } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (error) return { created: false as const, email: ADMIN_EMAIL };
  if ((count ?? 0) > 0) return { created: false as const, email: ADMIN_EMAIL };

  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: "@Tracking@",
    email_confirm: true,
    user_metadata: { display_name: "admin" },
  });
  if (createError) return { created: false as const, email: ADMIN_EMAIL };

  return { created: true as const, email: ADMIN_EMAIL };
});
