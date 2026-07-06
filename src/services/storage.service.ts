// ============================================================================
// Serviço de STORAGE — Cloudflare R2 via Edge Function `r2` (SigV4 no servidor).
// Centraliza upload/download/delete de documentos. A UI nunca monta os headers.
// ============================================================================
import { supabase } from "../lib/supabase";
import { ServiceError } from "./core/result";

type R2Resp = { ok?: boolean; url?: string; error?: string };

async function r2op(op: "upload" | "get" | "delete", key: string, body?: BodyInit, contentType?: string): Promise<R2Resp> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session?.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    "x-op": op,
    "x-key": key,
  };
  if (contentType) headers["x-content-type"] = contentType;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2`, {
    method: "POST", headers, body: body ?? "",
  });
  return res.json() as Promise<R2Resp>;
}

export const storage = {
  /** Faz upload de um arquivo; devolve a chave (storage_path) em caso de sucesso. */
  upload: async (orgId: string, file: File): Promise<string> => {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${orgId}/${Date.now()}-${safe}`;
    const r = await r2op("upload", key, file, file.type || "application/octet-stream");
    if (!r?.ok) throw new ServiceError("Falha no upload para o R2: " + (r?.error || "erro desconhecido"));
    return key;
  },
  /** URL assinada temporária para download. */
  getUrl: async (key: string): Promise<string | null> => {
    const r = await r2op("get", key);
    return r?.url ?? null;
  },
  remove: async (key: string): Promise<void> => {
    await r2op("delete", key);
  },
};
