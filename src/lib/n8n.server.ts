import { normalizeRows, parsePayload, type NormalizedRow } from "@/lib/n8n-parse";

import { getState } from "./store.server";

export async function fetchN8nRows(): Promise<{
  rows: NormalizedRow[];
  skipped: number;
}> {
  const state = await getState();
  const url = state.settings.n8n_url.trim();
  if (!url) throw new Error("Aucune URL N8N configurée dans Réglages > Mise à jour.");

  const headerName = (state.settings.n8n_header_name || "x-api-key").trim();
  const headers: Record<string, string> = { Accept: "application/json, text/csv, */*" };
  if (state.secrets.n8n_token) headers[headerName] = state.secrets.n8n_token;

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
