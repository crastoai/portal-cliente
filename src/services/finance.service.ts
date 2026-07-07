// ============================================================================
// Bounded context: FINANCE (schema finance — NÃO exposto) — Contas a Pagar/Receber
// da Crasto.AI. 🔒 Admin-only: todo acesso via RPC SECURITY DEFINER (is_crasto_admin).
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrap } from "./core/result";

export const accounts = {
  /** Lista contas por tipo ('payable' | 'receivable') e status opcional. */
  list: async (type?: "payable" | "receivable", status?: string): Promise<any[]> => {
    const { data, error } = await supabase.rpc("fin_accounts", { p_type: type ?? null, p_status: status ?? null });
    if (error) throw error;
    return (data as any[]) ?? [];
  },
  save: async (p: Record<string, any>) => unwrap(await supabase.rpc("fin_account_upsert", { p })),
  remove: async (id: string) => unwrap(await supabase.rpc("fin_account_delete", { p_id: id })),
};

export const costs = {
  list: async (active?: boolean): Promise<any[]> => {
    const { data, error } = await supabase.rpc("fin_costs", { p_active: active ?? null });
    if (error) throw error;
    return (data as any[]) ?? [];
  },
  save: async (p: Record<string, any>) => unwrap(await supabase.rpc("fin_cost_upsert", { p })),
  remove: async (id: string) => unwrap(await supabase.rpc("fin_cost_delete", { p_id: id })),
};

export const transactions = {
  /** Lista lançamentos de tesouraria por tipo ('income' | 'expense') e status opcional. */
  list: async (type?: "income" | "expense", status?: string): Promise<any[]> => {
    const { data, error } = await supabase.rpc("fin_transactions", { p_type: type ?? null, p_status: status ?? null });
    if (error) throw error;
    return (data as any[]) ?? [];
  },
  save: async (p: Record<string, any>) => unwrap(await supabase.rpc("fin_transaction_upsert", { p })),
  remove: async (id: string) => unwrap(await supabase.rpc("fin_transaction_delete", { p_id: id })),
};

export const finance = { accounts, costs, transactions };
