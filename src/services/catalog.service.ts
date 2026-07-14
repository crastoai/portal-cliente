// ============================================================================
// Bounded context: CATALOG — módulos VdI, catálogo mestre, serviços.
// DADO passa pela Portal API (middle-end) — o cliente NUNCA fala direto com o banco.
// RLS no servidor: cliente vê módulos ativos + serviços client-facing; admin vê tudo.
// ============================================================================
import { api } from "../lib/api";
import type { VdiModule, VdiCatalogEntry, CatalogService } from "./core/types";

export const vdiModules = {
  listActive: async (fields = "id,name,description,category") =>
    api.get<VdiModule[]>(`/api/catalog/vdi-modules/active?fields=${encodeURIComponent(fields)}`),
  listActiveByName: async () => api.get<VdiModule[]>(`/api/catalog/vdi-modules/active-by-name`),
  listAll: async () => api.get<VdiModule[]>(`/api/catalog/vdi-modules`),
  listByIds: async (ids: string[], fields = "id,name,description,category") =>
    ids.length ? api.get<VdiModule[]>(`/api/catalog/vdi-modules/by-ids?ids=${ids.join(",")}&fields=${encodeURIComponent(fields)}`) : Promise.resolve([]),
  create: async (payload: Record<string, any>) => api.post(`/api/catalog/vdi-modules`, payload),
  update: async (id: string, payload: Record<string, any>) => api.patch(`/api/catalog/vdi-modules/${id}`, payload),
  remove: async (id: string) => api.del(`/api/catalog/vdi-modules/${id}`),
};

export const vdiCatalog = {
  listNames: async () => api.get<VdiCatalogEntry[]>(`/api/catalog/vdi-catalog/names`),
};

export const services = {
  list: async () => api.get<CatalogService[]>(`/api/catalog/services`),
  listClientFacing: async () => api.get<CatalogService[]>(`/api/catalog/services/client-facing`),
  listByIds: async (ids: string[]) =>
    ids.length ? api.get<CatalogService[]>(`/api/catalog/services/by-ids?ids=${ids.join(",")}`) : Promise.resolve([]),
  listForProposals: async () => api.get<CatalogService[]>(`/api/catalog/services/proposals`),
  create: async (payload: Record<string, any>) => api.post(`/api/catalog/services`, payload),
  update: async (id: string, payload: Record<string, any>) => api.patch(`/api/catalog/services/${id}`, payload),
  remove: async (id: string) => api.del(`/api/catalog/services/${id}`),
};

export const catalog = { vdiModules, vdiCatalog, services };
