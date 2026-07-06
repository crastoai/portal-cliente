// ============================================================================
// Bounded context: CRM (schema crm) — pessoas, telefones, documentos, atividades.
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrap, unwrapList } from "./core/result";
import type { Person, Phone, CrmDocument, Activity } from "./core/types";

const crmSchema = () => supabase.schema("crm");

export const people = {
  listByOrg: async (orgId: string) =>
    unwrapList<Person>(await crmSchema().from("people").select("*").eq("organization_id", orgId).order("is_primary", { ascending: false })),
  add: async (payload: Record<string, any>) => unwrap(await crmSchema().from("people").insert(payload)),
};

export const phones = {
  listByOrg: async (orgId: string) =>
    unwrapList<Phone>(await crmSchema().from("phones").select("*").eq("organization_id", orgId)),
  add: async (payload: Record<string, any>) => unwrap(await crmSchema().from("phones").insert(payload)),
};

export const documents = {
  listByOrg: async (orgId: string) =>
    unwrapList<CrmDocument>(await crmSchema().from("documents").select("*").eq("organization_id", orgId).order("uploaded_at", { ascending: false })),
  add: async (payload: Record<string, any>) => unwrap(await crmSchema().from("documents").insert(payload).select("id")),
  remove: async (id: string) => unwrap(await crmSchema().from("documents").delete().eq("id", id)),
};

export const activities = {
  listByOrg: async (orgId: string) =>
    unwrapList<Activity>(await crmSchema().from("activities").select("*").eq("organization_id", orgId).order("occurred_at", { ascending: false })),
  add: async (payload: Record<string, any>) => unwrap(await crmSchema().from("activities").insert(payload)),
};

export const taxIds = {
  /** CNPJs/identidades fiscais de uma organização (com endereço), primário primeiro. */
  listByOrg: async (orgId: string) =>
    unwrapList<Record<string, any>>(await crmSchema().from("tax_ids").select("id,kind,value,address,is_primary").eq("organization_id", orgId).order("is_primary", { ascending: false }).order("created_at", { ascending: true })),
  add: async (payload: Record<string, any>) => unwrap(await crmSchema().from("tax_ids").insert(payload)),
  update: async (id: string, patch: Record<string, any>) => unwrap(await crmSchema().from("tax_ids").update(patch).eq("id", id)),
  remove: async (id: string) => unwrap(await crmSchema().from("tax_ids").delete().eq("id", id)),
  /** Marca um CNPJ como principal e desmarca os demais da organização. */
  setPrimary: async (orgId: string, id: string) => {
    await crmSchema().from("tax_ids").update({ is_primary: false }).eq("organization_id", orgId);
    return unwrap(await crmSchema().from("tax_ids").update({ is_primary: true }).eq("id", id));
  },
};

/** Remoção genérica dentro do schema crm (people/phones/activities). */
export const removeRow = async (table: "people" | "phones" | "activities" | "documents", id: string) =>
  unwrap(await crmSchema().from(table).delete().eq("id", id));

export const crm = { people, phones, documents, activities, taxIds, removeRow };
