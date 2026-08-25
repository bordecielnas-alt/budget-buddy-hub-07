import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeRows, parsePayload, type NormalizedRow } from "@/lib/n8n-parse";

export async function fetchN8nRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ rows: NormalizedRow[]; skipped: number }> {
  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("n8n_url, n8n_header_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const url = (settings?.n8n_url as string | undefined)?.trim() ?? "";
  if (!url) throw new Error("Aucune URL N8N configurée dans Réglages > Mise à jour.");

  const headerName = ((settings?.n8n_header_name as string | undefined) || "x-api-key").trim();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: secret } = await supabaseAdmin
    .from("user_secrets")
    .select("n8n_token")
    .eq("user_id", userId)
    .maybeSingle();

  const headers: Record<string, string> = { Accept: "application/json, text/csv, */*" };
  const token = (secret?.n8n_token as string | undefined) ?? "";
  if (token) headers[headerName] = token;

  let response: Response;
  try {
    response = await fetch(url, { method: "GET", headers });
  } catch (cause) {
    throw new Error(`Impossible de joindre N8N : ${(cause as Error).message}`);
  }

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`N8N a répondu ${response.status} : ${body.slice(0, 300)}`);
  }

  let parsed;
  try {
    parsed = parsePayload(body, response.headers.get("content-type") ?? "");
  } catch (cause) {
    throw new Error(`Réponse N8N illisible : ${(cause as Error).message}`);
  }

  return normalizeRows(parsed);
}
