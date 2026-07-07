// ============================================================================
// Bounded context: BILLING (schema billing) — faturas do cliente.
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrapList } from "./core/result";
import { scopeMine } from "./core/scope";
import type { Invoice } from "./core/types";

export const invoices = {
  listMine: async () =>
    unwrapList<Invoice>(await scopeMine(supabase.schema("billing").from("invoices").select("id,description,amount,due_date,status").order("due_date", { ascending: false }))),
};

export const billing = { invoices };
