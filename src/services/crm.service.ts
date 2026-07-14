// ============================================================================
// Bounded context: CRM — pessoas, telefones, documentos, atividades, tax_ids.
// DADO passa pela Portal API (middle-end) — o cliente NUNCA fala direto com o banco.
// RLS no servidor escopa por organization_id.
// ============================================================================
import { api } from "../lib/api";
import type { Person, Phone, CrmDocument, Activity } from "./core/types";

export const people = {
  listByOrg: async (orgId: string) => api.get<Person[]>(`/api/crm/people?org=${orgId}`),
  add: async (payload: Record<string, any>) => api.post(`/api/crm/people`, payload),
  update: async (id: string, patch: Record<string, any>) => api.patch(`/api/crm/people/${id}`, patch),
};

export const phones = {
  listByOrg: async (orgId: string) => api.get<Phone[]>(`/api/crm/phones?org=${orgId}`),
  listByOrgs: async (ids: string[]) =>
    ids.length ? api.get<Phone[]>(`/api/crm/phones/by-orgs?orgs=${ids.join(",")}`) : Promise.resolve([]),
  add: async (payload: Record<string, any>) => api.post(`/api/crm/phones`, payload),
  update: async (id: string, patch: Record<string, any>) => api.patch(`/api/crm/phones/${id}`, patch),
};

export const documents = {
  listByOrg: async (orgId: string) => api.get<CrmDocument[]>(`/api/crm/documents?org=${orgId}`),
  add: async (payload: Record<string, any>) => api.post(`/api/crm/documents`, payload),
  remove: async (id: string) => api.del(`/api/crm/documents/${id}`),
};

export const activities = {
  listByOrg: async (orgId: string) => api.get<Activity[]>(`/api/crm/activities?org=${orgId}`),
  add: async (payload: Record<string, any>) => api.post(`/api/crm/activities`, payload),
};

export const taxIds = {
  listByOrg: async (orgId: string) => api.get<Record<string, any>[]>(`/api/crm/tax-ids?org=${orgId}`),
  add: async (payload: Record<string, any>) => api.post(`/api/crm/tax-ids`, payload),
  update: async (id: string, patch: Record<string, any>) => api.patch(`/api/crm/tax-ids/${id}`, patch),
  remove: async (id: string) => api.del(`/api/crm/tax-ids/${id}`),
  setPrimary: async (orgId: string, id: string) => api.post(`/api/crm/tax-ids/${id}/primary?org=${orgId}`),
};

export const removeRow = async (table: "people" | "phones" | "activities" | "documents", id: string) =>
  api.del(`/api/crm/row/${table}/${id}`);

export const crm = { people, phones, documents, activities, taxIds, removeRow };
