// ============================================================================
// Bounded context: DELIVERY (schema delivery) — módulos do cliente, implementação,
// saúde do sistema, tarefas do projeto e credenciais de módulo.
// Leituras "mine" dependem do RLS (organization do usuário logado).
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrap, unwrapList } from "./core/result";
import type { ClientModule, Implementation, SystemHealth, ProjectTask, ModuleCredential } from "./core/types";

const del = () => supabase.schema("delivery");

export const clientModules = {
  listByOrg: async (orgId: string) =>
    unwrapList<ClientModule>(await del().from("client_modules").select("id,vdi_module_id,status").eq("organization_id", orgId)),
  listAll: async () =>
    unwrapList<ClientModule>(await del().from("client_modules").select("organization_id")),
  /** Do cliente logado (RLS aplica o filtro). */
  listMine: async () =>
    unwrapList<ClientModule>(await del().from("client_modules").select("id,status,vdi_module_id")),
  attach: async (orgId: string, moduleId: string) =>
    unwrap(await del().from("client_modules").insert({ organization_id: orgId, vdi_module_id: moduleId, status: "active" })),
  detach: async (orgId: string, moduleId: string) =>
    unwrap(await del().from("client_modules").delete().eq("organization_id", orgId).eq("vdi_module_id", moduleId)),
};

export const implementations = {
  getByOrg: async (orgId: string) =>
    unwrap(await del().from("implementations").select("overall_progress").eq("organization_id", orgId).maybeSingle()) as unknown as Implementation | null,
  getMine: async () =>
    unwrap(await del().from("implementations").select("overall_progress,due_date,status,started_at").maybeSingle()) as unknown as Implementation | null,
  listBrief: async () =>
    unwrapList<Implementation & { organization_id: string }>(await del().from("implementations").select("organization_id,overall_progress,status")),
};

export const systemHealth = {
  getByOrg: async (orgId: string) =>
    unwrap(await del().from("system_health").select("status").eq("organization_id", orgId).maybeSingle()) as unknown as SystemHealth | null,
  getMine: async () =>
    unwrap(await del().from("system_health").select("status,message").maybeSingle()) as unknown as SystemHealth | null,
  listBrief: async () =>
    unwrapList<SystemHealth>(await del().from("system_health").select("organization_id,status")),
};

export const projectTasks = {
  listMine: async () =>
    unwrapList<ProjectTask>(await del().from("project_tasks").select("*").order("sort_order")),
};

export const moduleCredentials = {
  listMine: async () =>
    unwrapList<ModuleCredential>(await del().from("module_credentials").select("id,label,login,sso_enabled")),
};

export const delivery = { clientModules, implementations, systemHealth, projectTasks, moduleCredentials };
