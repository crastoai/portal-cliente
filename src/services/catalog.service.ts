// ============================================================================
// Bounded context: CATALOG (schema catalog) — módulos VdI, catálogo mestre, serviços.
// ============================================================================
import { supabase } from "../lib/supabase";
import { unwrap, unwrapList } from "./core/result";
import type { VdiModule, VdiCatalogEntry, CatalogService } from "./core/types";

const cat = () => supabase.schema("catalog");

export const vdiModules = {
  /** Módulos ativos com campos enxutos (catálogo do cliente). */
  listActive: async (fields = "id,name,description,category") =>
    unwrapList<VdiModule>(await cat().from("vdi_modules").select(fields).eq("active", true).order("category")),
  listActiveByName: async () =>
    unwrapList<VdiModule>(await cat().from("vdi_modules").select("id,name,category").eq("active", true).order("name")),
  listAll: async () =>
    unwrapList<VdiModule>(await cat().from("vdi_modules").select("*").order("department").order("name")),
  listByIds: async (ids: string[], fields = "id,name,description,category") =>
    ids.length ? unwrapList<VdiModule>(await cat().from("vdi_modules").select(fields).in("id", ids)) : [],
  create: async (payload: Record<string, any>) => unwrap(await cat().from("vdi_modules").insert(payload)),
  update: async (id: string, payload: Record<string, any>) =>
    unwrap(await cat().from("vdi_modules").update(payload).eq("id", id)),
  remove: async (id: string) => unwrap(await cat().from("vdi_modules").delete().eq("id", id)),
};

export const vdiCatalog = {
  listNames: async () =>
    unwrapList<VdiCatalogEntry>(await cat().from("vdi_catalog").select("name,department,description").order("name")),
};

export const services = {
  list: async () => unwrapList<CatalogService>(await cat().from("services").select("*").order("category")),
  listForProposals: async () =>
    unwrapList<CatalogService>(await cat().from("services").select("id,name,unit,price_table,category").order("price_table", { ascending: false })),
  create: async (payload: Record<string, any>) => unwrap(await cat().from("services").insert(payload)),
  update: async (id: string, payload: Record<string, any>) =>
    unwrap(await cat().from("services").update(payload).eq("id", id)),
  remove: async (id: string) => unwrap(await cat().from("services").delete().eq("id", id)),
};

export const catalog = { vdiModules, vdiCatalog, services };
