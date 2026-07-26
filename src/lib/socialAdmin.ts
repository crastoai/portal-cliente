/**
 * Cliente admin do social-api (Social Media) — chaves BYO de CADA cliente.
 *
 * O social-api é um serviço SEPARADO (banco próprio Social_media). O admin do Portal fala com
 * ele DIRETO (CORS já libera portal.crasto.ai/admin.crasto.ai), mandando o próprio JWT do
 * Portal; o social-api valida (mesmo JWKS) e exige crasto_admin (AdminGuard). As chaves ficam
 * CIFRADAS no cofre do social-api — o Portal nunca vê o valor, só a máscara.
 */
import { supabase } from "./supabase";

const BASE = (import.meta as any).env?.VITE_SOCIAL_API || "https://social-api.crasto.ai";

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const t = await token();
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Erro ${res.status}`;
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
  }
  return data as T;
}

export type IntegItem = {
  name: string;
  label: string;
  group: "texto" | "imagem" | "video" | "publicacao" | "pesquisa" | "stock";
  help: string | null;
  configured: boolean;
  masked: string | null;
  updatedAt: string | null;
};
export type IntegList = { orgId: string; orgName: string | null; items: IntegItem[] };

export const socialAdmin = {
  list: (orgId: string) => req<IntegList>("GET", `/admin/integrations/${orgId}`),
  set: (orgId: string, name: string, value: string) => req<{ ok: boolean; name: string }>("PUT", `/admin/integrations/${orgId}/${name}`, { value }),
  remove: (orgId: string, name: string) => req<{ ok: boolean; name: string }>("DELETE", `/admin/integrations/${orgId}/${name}`),
};

export const INTEG_GROUPS: Record<IntegItem["group"], string> = {
  texto: "Texto (geração de posts)",
  imagem: "Imagem",
  video: "Vídeo",
  publicacao: "Publicação nas redes",
  pesquisa: "Pesquisa de conteúdo",
  stock: "Imagens de banco (stock)",
};
