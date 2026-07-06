// ============================================================================
// Bounded context: COMMERCE (schema commerce) — propostas e itens de proposta.
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrap } from "./core/result";
import type { Proposal } from "./core/types";

const com = () => supabase.schema("commerce");

export const proposals = {
  /** Cria a proposta e retorna o registro (com id) para inserir os itens. */
  create: async (payload: Record<string, any>) =>
    unwrap(await com().from("proposals").insert(payload).select("*").single()) as unknown as Proposal,
  addItems: async (rows: Record<string, any>[]) =>
    rows.length ? unwrap(await com().from("proposal_items").insert(rows)) : null,
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
    const { data, error } = await supabase.functions.invoke("proposal-ai", { body: { instruction, context } });
    if (error) return { ok: false, error: error.message };
    return data;
  },
};

export const commerce = { proposals };
