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

async function req<T>(path: string, opts: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const t = await token();
  // timeout do cliente: sem isto, uma chamada travada ficava girando p/ sempre.
  // padrão 60s; chamadas sabidamente longas (pesquisa/legenda/publicar) passam mais.
  const { timeoutMs = 60000, ...init } = opts;
  let res: Response;
  try {
    res = await fetch(`${MKT_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(t ? { Authorization: "Bearer " + t } : {}),
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e: any) {
    const err = new Error(e?.name === "TimeoutError" || e?.name === "AbortError" ? "A operação demorou demais e foi interrompida. Tente de novo." : "Sem conexão com o servidor. Tente de novo.") as Error & { status?: number; timeout?: boolean };
    err.status = 0; err.timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    throw err;
  }
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body && (body.message || body.error)) || `Erro ${res.status}`;
    const err = new Error(Array.isArray(msg) ? msg.join("; ") : String(msg)) as Error & { status?: number; body?: any };
    err.status = res.status; err.body = body; // deixa o chamador ler o payload (ex.: 422 do compliance-gate)
    throw err;
  }
  return body as T;
}

export const mktApi = {
  get: <T>(p: string, o?: { timeoutMs?: number }) => req<T>(p, { ...o }),
  post: <T>(p: string, b?: unknown, o?: { timeoutMs?: number }) => req<T>(p, { method: "POST", body: JSON.stringify(b ?? {}), ...o }),
  patch: <T>(p: string, b?: unknown, o?: { timeoutMs?: number }) => req<T>(p, { method: "PATCH", body: JSON.stringify(b ?? {}), ...o }),
  put: <T>(p: string, b?: unknown, o?: { timeoutMs?: number }) => req<T>(p, { method: "PUT", body: JSON.stringify(b ?? {}), ...o }),
  del: <T>(p: string, o?: { timeoutMs?: number }) => req<T>(p, { method: "DELETE", ...o }),
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
