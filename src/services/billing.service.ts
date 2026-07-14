// ============================================================================
// Bounded context: BILLING — faturas do cliente.
// SSOT: as faturas do cliente SÃO o Contas a Receber do admin (finance.accounts,
// schema não exposto). O cliente lê só as próprias via a Portal API → RPC my_faturas
// (SECURITY DEFINER, escopado à sua organização). O cliente NUNCA fala direto com o banco.
// ============================================================================
import { api } from "../lib/api";
import type { Invoice } from "./core/types";

export const invoices = {
  listMine: async (): Promise<Invoice[]> => api.get<Invoice[]>(`/api/billing/invoices/mine`),
};

export const billing = { invoices };
