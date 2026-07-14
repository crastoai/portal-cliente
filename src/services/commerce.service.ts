// ============================================================================
// Bounded context: COMMERCE — propostas, itens de proposta, contratos.
// DADO passa pela Portal API (middle-end) — o cliente NUNCA fala direto com o banco.
// Geração de contrato (.docx), envio Autentique e IA da proposta ficam em Edge Functions.
// ============================================================================
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import type { Proposal } from "./core/types";

export const proposals = {
  /** Cria a proposta e retorna o registro (com id) para inserir os itens. */
  create: async (payload: Record<string, any>) => api.post<Proposal>(`/api/commerce/proposals`, payload),
  /** Propostas de um cliente (para o admin marcar como ganha). */
  listByOrg: async (orgId: string) => api.get<Record<string, any>[]>(`/api/commerce/proposals?org=${orgId}`),
  /** Marca a proposta como GANHA (liga MRR + plano + comissão) — RPC no servidor. */
  accept: async (proposal_id: string) => api.post(`/api/commerce/proposals/${proposal_id}/accept`),
  /** Reabre (desfaz o ganho). */
  reopen: async (proposal_id: string) => api.post(`/api/commerce/proposals/${proposal_id}/reopen`),
  addItems: async (rows: Record<string, any>[]) => (rows.length ? api.post(`/api/commerce/proposal-items`, rows) : Promise.resolve(null)),

  /** Gera o contrato .docx (molde do jurídico) e devolve link de download. */
  generateContract: async (proposal_id: string): Promise<{ ok: boolean; download_url?: string; filename?: string; error?: string }> => {
    const { data, error } = await supabase.functions.invoke("contract-generate", { body: { proposal_id } });
    if (error) return { ok: false, error: error.message };
    return data;
  },
  /** Envia o contrato para assinatura via Autentique (sandbox=teste). */
  sendAutentique: async (payload: { proposal_id: string; signers: { email: string; name?: string; action?: string }[]; sandbox?: boolean; doc_name?: string }): Promise<{ ok: boolean; link?: string | null; autentique_id?: string; sandbox?: boolean; error?: string }> => {
    const { data, error } = await supabase.functions.invoke("contract-send-autentique", { body: payload });
    if (error) return { ok: false, error: error.message };
    return data;
  },
  /** Chat/voz: interpreta uma instrução via ponte de IA (Claude Max). */
  ai: async (instruction: string, context: unknown): Promise<{ ok: boolean; offline?: boolean; reply?: string; actions?: any[]; error?: string }> => {
    const invoke = supabase.functions.invoke("proposal-ai", { body: { instruction, context } });
    const timeout = new Promise<{ __timeout: true }>((r) => setTimeout(() => r({ __timeout: true }), 75000));
    const res: any = await Promise.race([invoke, timeout]);
    if (res?.__timeout) return { ok: false, offline: true, error: "A IA demorou demais para responder. Tente novamente." };
    if (res?.error) return { ok: false, error: res.error.message };
    return res?.data;
  },
};

export const commerce = { proposals };
