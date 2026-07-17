// ============================================================================
// Bounded context: FINANCE (schema finance — NÃO exposto) — Contas a Pagar/Receber,
// custos, tesouraria e custo de IA da Crasto.AI. 🔒 Admin-only.
// DADO passa pela Portal API (middle-end, AdminGuard) — o cliente NUNCA fala direto
// com o banco. As RPCs SECURITY DEFINER revalidam is_crasto_admin no servidor.
// ============================================================================
import { api } from "../lib/api";

const qs = (o: Record<string, any>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join("&")}` : "";
};

export const accounts = {
  list: async (type?: "payable" | "receivable", status?: string): Promise<any[]> => api.get<any[]>(`/api/finance/accounts${qs({ type, status })}`),
  save: async (p: Record<string, any>) => api.post(`/api/finance/accounts`, p),
  remove: async (id: string) => api.del(`/api/finance/accounts/${id}`),
};

export const costs = {
  list: async (active?: boolean): Promise<any[]> => api.get<any[]>(`/api/finance/costs${qs({ active })}`),
  save: async (p: Record<string, any>) => api.post(`/api/finance/costs`, p),
  remove: async (id: string) => api.del(`/api/finance/costs/${id}`),
};

export const transactions = {
  list: async (type?: "income" | "expense", status?: string): Promise<any[]> => api.get<any[]>(`/api/finance/transactions${qs({ type, status })}`),
  save: async (p: Record<string, any>) => api.post(`/api/finance/transactions`, p),
  remove: async (id: string) => api.del(`/api/finance/transactions/${id}`),
};

export const aiCost = {
  /** Painel completo de custo de IA (resumo + por plataforma + por cliente + linhas) no período. 🔒 admin. */
  panel: async (from?: string, to?: string): Promise<any> => api.get<any>(`/api/finance/ai-cost${qs({ from, to })}`),
  save: async (p: Record<string, any>) => api.post(`/api/finance/ai-cost`, p),
  remove: async (id: string) => api.del(`/api/finance/ai-cost/${id}`),
  /** Puxa o custo REAL das APIs de billing (Anthropic + OpenAI). 🔒 admin. */
  sync: async (from?: string, to?: string) => api.post<{ periodo: { start: string; end: string }; resultados: { provider: string; ok: boolean; cost?: number; erro?: string }[] }>(`/api/finance/ai-cost/sync`, { from, to }),
  /** Salva a Admin key de billing no cofre (anthropic_admin | openai_admin). A chave nunca volta. */
  setBillingKey: async (provider: string, secret: string) => api.post<{ ok: boolean; error?: string }>(`/api/finance/ai-cost/billing-key`, { provider, secret }),
  billingStatus: async () => api.get<{ anthropic_admin: boolean; openai_admin: boolean }>(`/api/finance/ai-cost/billing-status`),
};

export const finance = { accounts, costs, transactions, aiCost };
