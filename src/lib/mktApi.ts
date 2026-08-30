// ============================================================================
// Client da MARKETING API (marketing-api NestJS · banco `marketing` separado).
// Mesma arquitetura do lib/api.ts do Portal: o cliente NUNCA fala com o banco —
// passa por aqui com o JWT do Supabase Auth do Portal. Base = /mkt-api (mesma
// origem, resolvida pelo reverse-proxy do nginx → container marketing-api), então
// SEM iframe e SEM CORS. Em DEV (VITE_MKT_DEV=1) usa o dev-login local da API.
// ============================================================================
import { supabase } from "./supabase";

// Prod: mesma origem via proxy. Dev: aponta pra API local (VITE_MKT_API_URL).
const MKT_BASE = (import.meta.env.VITE_MKT_API_URL as string) || "/mkt-api/api";
const MKT_DEV = import.meta.env.VITE_MKT_DEV === "1";

let devTok: string | null = null;
let devUnit: string | null = null;
async function devLogin(): Promise<string | null> {
  if (devTok) return devTok;
  try {
    const r = await fetch(`${MKT_BASE}/dev/login`, { method: "POST" });
    const b = await r.json();
    devTok = b.token || null; devUnit = b.unit || null; return devTok;
  } catch { return null; }
}

async function token(): Promise<string | null> {
  if (MKT_DEV) return devLogin();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const t = await token();
  const res = await fetch(`${MKT_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: "Bearer " + t } : {}),
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || `Erro ${res.status}`;
    throw new Error(Array.isArray(msg) ? msg.join("; ") : String(msg));
  }
  return body as T;
}

export const mktApi = {
  get: <T>(p: string) => req<T>(p),
  post: <T>(p: string, b?: unknown) => req<T>(p, { method: "POST", body: JSON.stringify(b ?? {}) }),
  patch: <T>(p: string, b?: unknown) => req<T>(p, { method: "PATCH", body: JSON.stringify(b ?? {}) }),
  put: <T>(p: string, b?: unknown) => req<T>(p, { method: "PUT", body: JSON.stringify(b ?? {}) }),
  del: <T>(p: string) => req<T>(p, { method: "DELETE" }),
};

// Unidade de negócio "ativa" (multi-CNPJ). Em dev, vem do dev-login; em prod, do
// seletor de unidades (business-units). Cai na 1ª unidade da org por padrão.
export async function activeUnit(): Promise<string | null> {
  if (MKT_DEV) { if (!devTok) await devLogin(); if (devUnit) return devUnit; }
  try {
    const units = await mktApi.get<any[]>("/marketing/business-units");
    return units?.[0]?.id ?? null;
  } catch { return null; }
}
