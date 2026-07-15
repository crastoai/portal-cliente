// ============================================================================
// Bounded context: IDENTITY — organizações, perfis, conectores.
// DADO passa pela Portal API (middle-end) — o cliente NUNCA fala direto com o banco.
// Ficam no cliente só o que é do Supabase por natureza: Auth (login/senha),
// Storage (upload de avatar) e Edge Functions (criação/convite de usuário).
// ============================================================================
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import { ServiceError } from "./core/result";
import type { Organization, Profile, Connector } from "./core/types";

// Invoca uma Edge Function com 1 retry em falha de REDE (função reiniciando após deploy).
async function invokeRetry(name: string, body: unknown) {
  let res = await supabase.functions.invoke(name, { body });
  if (res.error) {
    await new Promise((r) => setTimeout(r, 1800));
    res = await supabase.functions.invoke(name, { body });
  }
  return res;
}

// Fluxo nativo de senha do Supabase (recovery seguro) — fica no cliente (Auth).
export const auth = {
  requestReset: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/nova-senha` });
    if (error) throw new ServiceError(error.message);
  },
  updatePassword: async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
    if (error) throw new ServiceError(error.message);
  },
};

export const organizations = {
  getById: async (id: string) => api.get<Organization | null>(`/api/identity/org/${id}`),
  listBrief: async () => api.get<{ id: string; name: string }[]>(`/api/identity/organizations/brief`),
  listForProposals: async () => api.get<{ id: string; name: string; cnpj: string | null }[]>(`/api/identity/organizations/proposals`),
  update: async (id: string, patch: Partial<Organization> | Record<string, any>) => api.patch(`/api/identity/org/${id}`, patch),
  /** Cliente (dono) edita os próprios dados cadastrais — RPC whitelisted no servidor. */
  updateMine: async (p: Record<string, any>) => api.post(`/api/identity/org/mine`, p),
  /** Contato principal (ddi + número) da própria org. */
  myContact: async (): Promise<{ ddi: string | null; number: string | null } | null> =>
    api.get<{ ddi: string | null; number: string | null } | null>(`/api/identity/org/mine/contact`).catch(() => null),
  setStage: async (id: string, stage: string) => api.patch(`/api/identity/org/${id}/stage`, { stage }),
  create: async (payload: Record<string, any>) => api.post<{ id: string; name: string }>(`/api/identity/organizations`, payload),
};

/** CNPJs da empresa (matriz + filiais). */
export const cnpjs = {
  mine: async (): Promise<any[]> => api.get<any[]>(`/api/identity/cnpjs/mine`),
  save: async (p: Record<string, any>) => api.post(`/api/identity/cnpjs`, p),
  remove: async (id: string) => api.del(`/api/identity/cnpjs/${id}`),
  listByOrg: async (orgId: string) => api.get<any[]>(`/api/identity/cnpjs/org/${orgId}`),
  adminSave: async (p: Record<string, any>) => api.post(`/api/identity/cnpjs/admin`, p),
  adminRemove: async (id: string) => api.del(`/api/identity/cnpjs/admin/${id}`),
};

/** Sócios da empresa. */
export const partners = {
  mine: async (): Promise<any[]> => api.get<any[]>(`/api/identity/partners/mine`),
  save: async (p: Record<string, any>) => api.post(`/api/identity/partners`, p),
  remove: async (id: string) => api.del(`/api/identity/partners/${id}`),
  listByOrg: async (orgId: string) => api.get<any[]>(`/api/identity/partners/org/${orgId}`),
};

/** Documentos do cliente. Registro via API; arquivo via storage (abaixo). */
export const clientDocs = {
  mine: async (): Promise<any[]> => api.get<any[]>(`/api/identity/docs/mine`),
  add: async (p: { kind?: string; file_name: string; storage_path: string }) => api.post(`/api/identity/docs`, p),
  remove: async (id: string): Promise<string | null> => api.del<string | null>(`/api/identity/docs/${id}`),
};

export const profiles = {
  getById: async (uid: string) => api.get<Profile>(`/api/identity/profiles/${uid}`),
  listByOrg: async (orgId: string) => api.get<Profile[]>(`/api/identity/profiles?org=${orgId}`),
  update: async (uid: string, patch: Record<string, any>) => api.patch(`/api/identity/profiles/${uid}`, patch),
  /** Sobe a foto (Storage do Supabase) e grava a URL no profile via API. */
  uploadAvatar: async (uid: string, file: File): Promise<string> => {
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${uid}/avatar.${ext}`;
    const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type || "image/png" });
    if (up.error) throw up.error;
    const pub = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    const url = `${pub}?v=${Date.now()}`;
    await api.patch(`/api/identity/profiles/${uid}`, { avatar_url: url });
    return url;
  },
};

// Acesso de pessoas ao Portal — Portal API (as Edge Functions foram aposentadas em 14/07).
// NÃO existe mais `password` em nenhum retorno: ninguém gera, transporta ou vê senha
// alheia. A pessoa recebe um link de uso único e define a senha dela no navegador.
const failed = (e: unknown) => ({ ok: false as const, error: errorMessage(e) });

export const users = {
  /** Admin cria o login do responsável de um cliente (+ e-mail com link de senha). */
  create: async (body: { email: string; full_name: string; organization_id: string; role: string }): Promise<{ ok: boolean; email?: string; error?: string; email_sent?: boolean; email_error?: string }> => {
    try { return await api.post(`/api/identity/users`, body); } catch (e) { return failed(e); }
  },
  /** Cliente-dono convida alguém da própria empresa (o servidor confere o papel). */
  invite: async (body: { email: string; full_name?: string; role?: string }): Promise<{ ok: boolean; email_sent?: boolean; email_error?: string; error?: string }> => {
    try { return await api.post(`/api/identity/users/invite`, body); } catch (e) { return failed(e); }
  },
  /** Reenvia o acesso: link novo para a pessoa definir a senha. NÃO redefine a atual. */
  resendAccess: async (body: { user_id: string; email?: string; full_name?: string }): Promise<{ ok: boolean; email?: string; email_sent?: boolean; email_error?: string; error?: string }> => {
    try { return await api.post(`/api/identity/users/${body.user_id}/resend`); } catch (e) { return failed(e); }
  },
};

export const clients = {
  remove: async (orgId: string): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await invokeRetry("admin-delete-client", { organization_id: orgId });
    if (error) return { ok: false, error: error.message };
    return (data as any) ?? { ok: false, error: "sem resposta do servidor" };
  },
};

export const connectors = {
  list: async () => api.get<Connector[]>(`/api/identity/connectors`),
  create: async (payload: Record<string, any>) => api.post(`/api/identity/connectors`, payload),
  update: async (id: string, payload: Record<string, any>) => api.patch(`/api/identity/connectors/${id}`, payload),
  remove: async (id: string) => api.del(`/api/identity/connectors/${id}`),
};

/** Telas que o usuário logado pode ver (['*'] = todas). Base do menu por permissão. */
export const access = {
  myScreens: async (): Promise<string[] | null> => api.get<string[] | null>(`/api/identity/screens`).catch(() => null),
};

export const identity = { organizations, profiles, users, clients, connectors, auth, cnpjs, partners, clientDocs, access };
