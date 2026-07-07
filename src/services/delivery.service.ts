// ============================================================================
// Bounded context: DELIVERY (schema delivery) — módulos do cliente, implementação,
// saúde do sistema, tarefas do projeto e credenciais de módulo.
// Leituras "mine" dependem do RLS (organization do usuário logado).
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrap, unwrapList } from "./core/result";
import type { ClientModule, Implementation, SystemHealth, ProjectTask, ModuleCredential } from "./core/types";

const del = () => supabase.schema("delivery");

const ROLLOUT_COLS = "id,vdi_module_id,status,rollout_progress,rollout_due,rollout_status";
export const clientModules = {
  listByOrg: async (orgId: string) =>
    unwrapList<ClientModule>(await del().from("client_modules").select(ROLLOUT_COLS).eq("organization_id", orgId)),
  listAll: async () =>
    unwrapList<ClientModule>(await del().from("client_modules").select("organization_id")),
  /** Do cliente logado (RLS aplica o filtro). */
  listMine: async () =>
    unwrapList<ClientModule>(await del().from("client_modules").select(ROLLOUT_COLS)),
  attach: async (orgId: string, moduleId: string) =>
    unwrap(await del().from("client_modules").insert({ organization_id: orgId, vdi_module_id: moduleId, status: "active" })),
  detach: async (orgId: string, moduleId: string) =>
    unwrap(await del().from("client_modules").delete().eq("organization_id", orgId).eq("vdi_module_id", moduleId)),
  /** Admin: atualiza o andamento da implantação de UM módulo contratado. */
  updateRollout: async (id: string, patch: Record<string, any>) =>
    unwrap(await del().from("client_modules").update(patch).eq("id", id)),
};

export const implementations = {
  getByOrg: async (orgId: string) =>
    unwrap(await del().from("implementations").select("*").eq("organization_id", orgId).maybeSingle()) as unknown as Implementation | null,
  getMine: async () =>
    unwrap(await del().from("implementations").select("overall_progress,due_date,status,started_at").maybeSingle()) as unknown as Implementation | null,
  listBrief: async () =>
    unwrapList<Implementation & { organization_id: string }>(await del().from("implementations").select("organization_id,overall_progress,status")),
  /** Admin: cria ou atualiza a implantação do cliente (1 por org). */
  upsert: async (orgId: string, patch: Record<string, any>) => {
    const { data } = await del().from("implementations").select("id").eq("organization_id", orgId).maybeSingle();
    if ((data as any)?.id) return unwrap(await del().from("implementations").update(patch).eq("id", (data as any).id));
    return unwrap(await del().from("implementations").insert({ organization_id: orgId, ...patch }));
  },
};

export const systemHealth = {
  getByOrg: async (orgId: string) =>
    unwrap(await del().from("system_health").select("status,message").eq("organization_id", orgId).maybeSingle()) as unknown as SystemHealth | null,
  getMine: async () =>
    unwrap(await del().from("system_health").select("status,message").maybeSingle()) as unknown as SystemHealth | null,
  listBrief: async () =>
    unwrapList<SystemHealth>(await del().from("system_health").select("organization_id,status")),
  /** Admin: define o farol (status + mensagem) do cliente. */
  upsert: async (orgId: string, patch: Record<string, any>) => {
    const { data } = await del().from("system_health").select("id").eq("organization_id", orgId).maybeSingle();
    if ((data as any)?.id) return unwrap(await del().from("system_health").update(patch).eq("id", (data as any).id));
    return unwrap(await del().from("system_health").insert({ organization_id: orgId, ...patch }));
  },
};

export const projectTasks = {
  listMine: async () =>
    unwrapList<ProjectTask>(await del().from("project_tasks").select("*").order("sort_order")),
  listByOrg: async (orgId: string) =>
    unwrapList<ProjectTask>(await del().from("project_tasks").select("*").eq("organization_id", orgId).order("sort_order")),
  add: async (payload: Record<string, any>) => unwrap(await del().from("project_tasks").insert(payload)),
  update: async (id: string, patch: Record<string, any>) => unwrap(await del().from("project_tasks").update(patch).eq("id", id)),
  remove: async (id: string) => unwrap(await del().from("project_tasks").delete().eq("id", id)),
};

export const moduleCredentials = {
  listMine: async () =>
    unwrapList<ModuleCredential>(await del().from("module_credentials").select("id,label,login,sso_enabled,access_url,vdi_module_id")),
  listByOrg: async (orgId: string) =>
    unwrapList<ModuleCredential>(await del().from("module_credentials").select("id,label,login,sso_enabled,access_url,vdi_module_id").eq("organization_id", orgId)),
  /** Admin: define/atualiza (idempotente) a credencial de um módulo — URL de acesso do cliente + senha criptografada via RPC. */
  set: async (p: { orgId: string; moduleId: string; label: string; login: string; secret: string; sso: boolean; url?: string }) =>
    unwrap(await supabase.rpc("set_module_credential", { p_org: p.orgId, p_module: p.moduleId, p_label: p.label, p_login: p.login, p_secret: p.secret, p_sso: p.sso, p_url: p.url || null })),
  remove: async (id: string) => unwrap(await del().from("module_credentials").delete().eq("id", id)),
};

const SVC_COLS = "id,service_id,status,notes,service_name,service_description,service_category,service_unit";
export const clientServices = {
  listByOrg: async (orgId: string) =>
    unwrapList<any>(await del().from("client_services").select(SVC_COLS).eq("organization_id", orgId)),
  /** Do cliente logado (RLS aplica o filtro). Nome/descrição vêm desnormalizados (catalog.services é admin-only). */
  listMine: async () =>
    unwrapList<any>(await del().from("client_services").select(SVC_COLS)),
  /** Admin: anexa o serviço já com os campos de exibição (sem preço) copiados. */
  attach: async (orgId: string, svc: { id: string; name?: string; description?: string | null; category?: string | null; unit?: string | null }) =>
    unwrap(await del().from("client_services").insert({ organization_id: orgId, service_id: svc.id, status: "active", service_name: svc.name ?? null, service_description: svc.description ?? null, service_category: svc.category ?? null, service_unit: svc.unit ?? null })),
  detach: async (id: string) => unwrap(await del().from("client_services").delete().eq("id", id)),
  setStatus: async (id: string, status: string) => unwrap(await del().from("client_services").update({ status }).eq("id", id)),
};

export const delivery = { clientModules, implementations, systemHealth, projectTasks, moduleCredentials, clientServices };
