// ============================================================================
// Bounded context: AUTOMATION (schema automation) — integrações (n8n, etc.).
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrap, unwrapList } from "./core/result";
import type { Integration } from "./core/types";

export const integrations = {
  list: async () =>
    unwrapList<Integration>(await supabase.schema("automation").from("integrations").select("key,display_name,status").order("display_name")),
  /** Status + se há chave salva (sem revelar o segredo). */
  status: async () => unwrap(await supabase.rpc("admin_integrations_status")) as unknown as Record<string, { status: string; has_secret: boolean; from_addr: string | null }>,
  /** Salva a chave/segredo de um provedor no cofre (só admin). */
  configure: async (key: string, secret: string, from: string, status: string) =>
    unwrap(await supabase.rpc("admin_set_integration", { p_key: key, p_secret: secret, p_from: from, p_status: status })),
  /** Config atual (multi-campo): meta não-secreta + quais segredos estão salvos (sem valores). */
  config: async (key: string): Promise<any> => { const { data, error } = await supabase.rpc("admin_integration_config", { p_key: key }); if (error) throw error; return data; },
  /** Grava config multi-campo (segredos vazios não sobrescrevem). */
  saveConfig: async (p: Record<string, any>) => unwrap(await supabase.rpc("admin_save_integration", { p })),
};

export const automation = { integrations };
