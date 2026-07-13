// ============================================================================
// Serviço de ANALYTICS / RPC — leituras agregadas e operações sensíveis expostas
// via funções SECURITY DEFINER no Postgres (search_path travado + checagem de admin).
// A UI chama nomes de negócio, nunca o nome cru do RPC.
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrap } from "./core/result";

async function rpc<T>(name: string, params?: Record<string, any>): Promise<T> {
  return unwrap(await supabase.rpc(name, params)) as unknown as T;
}

// ---- Admin (Crasto) ----
export const adminAnalytics = {
  clients: <T = any[]>() => rpc<T>("admin_clients"),
  overview: <T = any>() => rpc<T>("admin_overview"),
  clientPnl: <T = any>() => rpc<T>("admin_client_pnl"),
  costsByProvider: <T = any>() => rpc<T>("admin_costs_by_provider"),
  supportHours: <T = any>() => rpc<T>("admin_support_hours"),
  commissions: <T = any>() => rpc<T>("admin_commissions"),
  moduleClients: <T = any>(moduleId: string) => rpc<T>("admin_module_clients", { p_module: moduleId }),
  // Régua de saúde (pesos/limiares do health score) — configurável sem código
  healthConfig: <T = any>() => rpc<T>("admin_health_config"),
  setHealthConfig: (cfg: unknown) => rpc<{ ok: boolean }>("admin_set_health_config", { p: cfg }),
  // Console · IA (admin-only): camada operacional do Dashboard + trilha de auditoria
  consoleOverview: <T = any>() => rpc<T>("admin_console_overview"),
  llmModels: <T = any[]>() => rpc<T>("admin_llm_models"),
  auditLog: <T = any[]>(from?: string, to?: string, org?: string) => rpc<T>("admin_audit_log", { p_from: from ?? null, p_to: to ?? null, p_org: org ?? null }),
  auditRecord: (p: Record<string, any>) => rpc<string>("admin_audit_record", { p }),
};

// ---- Cliente / Parceiro ----
export const clientAnalytics = {
  supportHours: <T = any>() => rpc<T>("client_support_hours"),
  connectorCommissions: <T = any>() => rpc<T>("connector_commissions"),
  revealModuleSecret: <T = any>(credId: string) => rpc<T>("reveal_module_secret", { p_cred_id: credId }),
};

// ---- Parâmetros de negócio (imposto, comissões) — SSOT em finance.settings ----
export const settingsAnalytics = {
  business: <T = any>() => rpc<T>("business_settings"),
};

export const analytics = { admin: adminAnalytics, client: clientAnalytics, settings: settingsAnalytics };
