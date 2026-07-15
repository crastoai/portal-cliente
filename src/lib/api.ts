// ============================================================================
// Client da Portal API (middle-end NestJS). O cliente NUNCA fala direto com o
// banco: toda leitura/escrita de dado passa por aqui, com o JWT do Supabase Auth.
// Mesma arquitetura do WhatsApp CRM.
// ============================================================================
import { supabase } from "./supabase";
import { previewOrgId } from "./preview";
import { ServiceError } from "../services/core/result";

const API_URL = (import.meta.env.VITE_API_URL as string) || "https://portal-api.4hqjjr.easypanel.host";

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const t = await token();
  // "Ver como cliente": diz ao servidor qual org o admin está visualizando. Quem VALIDA
  // é o banco (só crasto_admin é atendido, e o bypass de admin cai) — isto aqui é só o
  // recado. Um cliente mandando o header não consegue nada.
  const org = previewOrgId();
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: "Bearer " + t } : {}),
      ...(org ? { "X-Preview-Org": org } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || `Erro ${res.status}`;
    throw new ServiceError(Array.isArray(msg) ? msg.join("; ") : String(msg), String(res.status));
  }
  return body as T;
}

export const api = {
  get: <T>(p: string) => req<T>(p),
  post: <T>(p: string, b?: unknown) => req<T>(p, { method: "POST", body: JSON.stringify(b ?? {}) }),
  patch: <T>(p: string, b?: unknown) => req<T>(p, { method: "PATCH", body: JSON.stringify(b ?? {}) }),
  put: <T>(p: string, b?: unknown) => req<T>(p, { method: "PUT", body: JSON.stringify(b ?? {}) }),
  del: <T>(p: string) => req<T>(p, { method: "DELETE" }),
};
