// ============================================================================
// Bounded context: BILLING — faturas do cliente.
// SSOT: as faturas do cliente SÃO o Contas a Receber do admin (finance.accounts,
// schema não exposto). O cliente lê só as próprias via RPC my_faturas (SECURITY
// DEFINER, escopado à sua organização); parcelas do contrato viram faturas.
// ============================================================================
import { supabase } from "../lib/supabase";
import type { Invoice } from "./core/types";

export const invoices = {
  listMine: async (): Promise<Invoice[]> => {
    const { data, error } = await supabase.rpc("my_faturas");
    if (error) throw error;
    return (data as Invoice[]) ?? [];
  },
};

export const billing = { invoices };
