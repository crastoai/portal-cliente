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
};

export const commerce = { proposals };
