// ============================================================================
// Bounded context: IDENTITY (schema public) — organizações, perfis, conectores.
// Toda leitura/escrita de tenancy e RBAC do lado do cliente passa por aqui.
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrap, unwrapList, ServiceError } from "./core/result";
import type { Organization, Profile, Connector } from "./core/types";

// Invoca uma Edge Function com 1 retry em falha de REDE (ex.: função reiniciando após
// deploy → "Failed to send a request"). Não trata erro de negócio (que volta em data.ok=false).
async function invokeRetry(name: string, body: unknown) {
  let res = await supabase.functions.invoke(name, { body });
  if (res.error) {
    await new Promise((r) => setTimeout(r, 1800));
    res = await supabase.functions.invoke(name, { body });
  }
  return res;
}

// Fluxo nativo de senha do Supabase (recovery seguro) — usado nas telas de login/reset.
export const auth = {
  /** Envia o e-mail de redefinição (branded, via Resend/SMTP configurado no Auth). */
  requestReset: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/nova-senha` });
    if (error) throw new ServiceError(error.message);
  },
  /** Define a nova senha e limpa a flag de troca obrigatória. */
  updatePassword: async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
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
  /** Cliente (dono) edita os próprios dados cadastrais — via RPC whitelisted (não toca em plano/status). */
  updateMine: async (p: { name: string; tax_id: string; founded_on: string | null; website: string; owner_name: string; wa_ddi?: string; wa_number?: string }) =>
    unwrap(await supabase.rpc("update_my_org", { p_name: p.name, p_tax_id: p.tax_id || null, p_founded_on: p.founded_on || null, p_website: p.website || null, p_owner_name: p.owner_name || null, p_wa_ddi: p.wa_ddi || null, p_wa_number: p.wa_number || null })),
  setStage: async (id: string, stage: string) =>
    unwrap(await supabase.from("organizations").update({ stage }).eq("id", id)),
  create: async (payload: Record<string, any>) =>
    unwrap(await supabase.from("organizations").insert(payload).select("id,name").single()) as unknown as { id: string; name: string },
};

export const profiles = {
  getById: async (uid: string) =>
    unwrap(await supabase.from("profiles").select("*").eq("id", uid).single()) as unknown as Profile,
  listByOrg: async (orgId: string) =>
    unwrapList<Profile>(await supabase.from("profiles").select("id,full_name,email,role,avatar_url").eq("organization_id", orgId)),
  update: async (uid: string, patch: Record<string, any>) => unwrap(await supabase.from("profiles").update(patch).eq("id", uid)),
  /** Sobe a foto de perfil (bucket público `avatars/<uid>/…`), grava a URL no profile e devolve a URL. */
  uploadAvatar: async (uid: string, file: File): Promise<string> => {
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${uid}/avatar.${ext}`;
    const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type || "image/png" });
    if (up.error) throw up.error;
    const pub = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    const url = `${pub}?v=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", uid);
    return url;
  },
};

export const users = {
  /** Cria o login do responsável via Edge Function `admin-create-user` (+ envia e-mail de boas-vindas). */
  create: async (body: { email: string; full_name: string; organization_id: string; role: string; password?: string }): Promise<{ ok: boolean; email?: string; password?: string; error?: string; email_sent?: boolean; email_error?: string }> => {
    const { data, error } = await invokeRetry("admin-create-user", body);
    if (error) return { ok: false, error: error.message };
    return (data as any) ?? { ok: false, error: "sem resposta do servidor" };
  },
  /** Cliente (dono) convida um membro da própria organização + e-mail de acesso. */
  invite: async (body: { email: string; full_name?: string; role?: string }): Promise<{ ok: boolean; email_sent?: boolean; email_error?: string; error?: string }> => {
    const { data, error } = await invokeRetry("client-invite-user", body);
    if (error) return { ok: false, error: error.message };
    return (data as any) ?? { ok: false, error: "sem resposta do servidor" };
  },
  /** Redefine a senha de um usuário existente e REENVIA o e-mail de acesso branded. */
  resendAccess: async (body: { user_id: string; email: string; full_name?: string; password?: string }): Promise<{ ok: boolean; email?: string; password?: string; email_sent?: boolean; email_error?: string; error?: string }> => {
    const { data, error } = await invokeRetry("admin-resend-access", body);
    if (error) return { ok: false, error: error.message };
    return (data as any) ?? { ok: false, error: "sem resposta do servidor" };
  },
};

export const clients = {
  /** Exclui organização + logins + dados via Edge Function `admin-delete-client` (atômico). */
  remove: async (orgId: string): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await invokeRetry("admin-delete-client", { organization_id: orgId });
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
