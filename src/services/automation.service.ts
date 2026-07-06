// ============================================================================
// Bounded context: AUTOMATION (schema automation) — integrações (n8n, etc.).
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrapList } from "./core/result";
import type { Integration } from "./core/types";

export const integrations = {
  list: async () =>
    unwrapList<Integration>(await supabase.schema("automation").from("integrations").select("key,display_name,status").order("display_name")),
};

export const automation = { integrations };
