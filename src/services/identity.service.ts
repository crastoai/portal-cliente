// ============================================================================
// Bounded context: IDENTITY (schema public) — organizações, perfis, conectores.
// Toda leitura/escrita de tenancy e RBAC do lado do cliente passa por aqui.
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrap, unwrapList, ServiceError } from "./core/result";
import type { Organization, Profile, Connector } from "./core/types";

// Fluxo nativo de senha do Supabase (recovery seguro) — usado nas telas de login/reset.
export const auth = {
  /** Envia o e-mail de redefinição (branded, via Resend/SMTP configurado no Auth). */
  requestReset: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/nova-senha` });
    if (error) throw new ServiceError(error.message);
  },
  /** Define a nova senha (sessão de recuperação ativa a partir do link do e-mail). */
  updatePassword: async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new ServiceError(error.message);
  },
};

export const organizations = {
  getById: async (id: string) =>
    unwrap(await supabase.from("organizations").select("*").eq("id", id).maybeSingle()) as unknown as Organization | null,
  listBrief: async () =>
    unwrapList<{ id: string; name: string }>(await supabase.from("organizations").select("id,name").order("name")),
  listForProposals: async () =>
    unwrapList<{ id: string; name: string; cnpj: string | null }>(
      await supabase.from("organizations").select("id,name,cnpj").order("name")),
  update: async (id: string, patch: Partial<Organization> | Record<string, any>) =>
    unwrap(await supabase.from("organizations").update(patch).eq("id", id)),
  setStage: async (id: string, stage: string) =>
    unwrap(await supabase.from("organizations").update({ stage }).eq("id", id)),
  create: async (payload: Record<string, any>) =>
    unwrap(await supabase.from("organizations").insert(payload).select("id,name").single()) as unknown as { id: string; name: string },
};

export const profiles = {
  getById: async (uid: string) =>
    unwrap(await supabase.from("profiles").select("*").eq("id", uid).single()) as unknown as Profile,
  listByOrg: async (orgId: string) =>
    unwrapList<Profile>(await supabase.from("profiles").select("id,full_name,email,role").eq("organization_id", orgId)),
};

export const users = {
  /** Cria o login do responsável via Edge Function `admin-create-user` (+ envia e-mail de boas-vindas). */
  create: async (body: { email: string; full_name: string; organization_id: string; role: string; password?: string }): Promise<{ ok: boolean; email?: string; password?: string; error?: string; email_sent?: boolean; email_error?: string }> => {
    const { data, error } = await supabase.functions.invoke("admin-create-user", { body });
    if (error) return { ok: false, error: error.message };
    return (data as any) ?? { ok: false, error: "sem resposta do servidor" };
  },
  /** Redefine a senha de um usuário existente e REENVIA o e-mail de acesso branded. */
  resendAccess: async (body: { user_id: string; email: string; full_name?: string; password?: string }): Promise<{ ok: boolean; email?: string; password?: string; email_sent?: boolean; email_error?: string; error?: string }> => {
    const { data, error } = await supabase.functions.invoke("admin-resend-access", { body });
    if (error) return { ok: false, error: error.message };
    return (data as any) ?? { ok: false, error: "sem resposta do servidor" };
  },
};

export const clients = {
  /** Exclui organização + logins + dados via Edge Function `admin-delete-client` (atômico). */
  remove: async (orgId: string): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await supabase.functions.invoke("admin-delete-client", { body: { organization_id: orgId } });
    if (error) return { ok: false, error: error.message };
    return (data as any) ?? { ok: false, error: "sem resposta do servidor" };
  },
};

export const connectors = {
  list: async () => unwrapList<Connector>(await supabase.from("connectors").select("*").order("name")),
  create: async (payload: Record<string, any>) => unwrap(await supabase.from("connectors").insert(payload)),
  update: async (id: string, payload: Record<string, any>) =>
    unwrap(await supabase.from("connectors").update(payload).eq("id", id)),
  remove: async (id: string) => unwrap(await supabase.from("connectors").delete().eq("id", id)),
};

export const identity = { organizations, profiles, users, clients, connectors, auth };
