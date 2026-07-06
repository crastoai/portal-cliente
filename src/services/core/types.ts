// ============================================================================
// Tipos de domínio compartilhados pelo middle-end (por bounded context).
// Permissivos onde a UI ainda evolui; nomeados onde agregam segurança.
// ============================================================================

// ---- identity (public) ----
export type Organization = {
  id: string; name: string; plan: string | null; status: string | null;
  stage: string | null; country: string | null; tax_id: string | null; tax_id_type: string | null;
  cnpj: string | null; founded_on: string | null; website: string | null; owner_name: string | null;
  notes: string | null; email: string | null;
};
export type Profile = {
  id: string; full_name: string | null; email: string | null; role: string; organization_id: string | null;
};
export type Connector = Record<string, any> & { id: string; name: string };

// ---- crm ----
export type Person = Record<string, any> & { id: string; organization_id: string; full_name: string };
export type Phone = Record<string, any> & { id: string; organization_id: string; number: string };
export type CrmDocument = Record<string, any> & { id: string; organization_id: string; file_name: string; storage_path: string };
export type Activity = Record<string, any> & { id: string; organization_id: string; title: string };

// ---- catalog ----
export type VdiModule = Record<string, any> & { id: string; name: string };
export type VdiCatalogEntry = { name: string; department: string | null; description: string | null };
export type CatalogService = Record<string, any> & { id: string; name: string };

// ---- delivery ----
export type ClientModule = { id: string; organization_id?: string; vdi_module_id: string; status: string };
export type Implementation = Record<string, any> & { overall_progress: number | null; status: string | null };
export type SystemHealth = { status: string | null; message?: string | null; organization_id?: string };
export type ProjectTask = Record<string, any> & { id: string };
export type ModuleCredential = { id: string; label: string; login: string | null; sso_enabled: boolean };

// ---- commerce ----
export type Proposal = Record<string, any> & { id: string };
export type ProposalItem = Record<string, any>;

// ---- support ----
export type Ticket = { id: string; subject: string; status: string };
export type PendingAction = { id: string; type: string; description: string; status: string };

// ---- billing ----
export type Invoice = { id: string; description: string; amount: number; due_date: string; status: string };

// ---- automation ----
export type Integration = { key: string; display_name: string; status: string };
