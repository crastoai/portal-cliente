import { services } from "../services";

export type HealthV2 = { score: number; label: string; tone: string; lifecycle: string; reasons: string[] };
export type Client = {
  id: string; name: string; plan: string | null; email: string | null;
  modules: string[]; last_access: string | null; progress: number; health: string | null; mrr: number;
  stage: string; country: string | null; tax_id: string | null; website: string | null;
  founded_on: string | null; owner_name: string | null; last_activity: string | null;
  health_v2?: HealthV2 | null;
  // origem/sinal do diagnóstico do site (/mapa) — migration 063
  source?: string | null; last_maturity?: number | null; intent_signal?: string | null; last_diagnostic_at?: string | null;
  // CRM v1 (migration 013): temperatura MANUAL do lead + campos da oportunidade
  lead_temperature?: string | null;
  deal_value?: number | null; deal_probability?: number | null; deal_expected_close?: string | null; deal_product?: string | null;
  // Módulo Empresas (migrations 015/016/017)
  created_at?: string | null; phone?: string | null;
  papeis?: string[] | null; tipo_empresa?: string | null; emite_nf?: boolean | null; cliente_oculto?: boolean | null;
  convertido_em?: string | null; churned_em?: string | null;
  trial_inicio?: string | null; trial_fim?: string | null; trial_resultado?: string | null;
  org_status?: string | null;
  // CRM Doação / pró-bono (migration 049) — Ganho com lucro R$0 + valor-equivalente doado
  is_donation?: boolean | null; donation_value?: number | null; donation_note?: string | null; donated_at?: string | null;
  // CRM contrato (migration 050) — assinado / pendente (aguardando) / isento
  contract_status?: string | null;
  // preenchido no front a partir de crmAccess.agentsOverview()
  agentes?: number; farol?: string | null;
};

export async function fetchClients(): Promise<Client[]> {
  return (await services.analytics.admin.clients<Client[]>()) ?? [];
}

export function healthScore(c: Client) {
  // v2: score multi-sinal calculado no banco (org_health). Fallback = heurístico antigo.
  if (c.health_v2 && typeof c.health_v2.score === "number") {
    const v = c.health_v2;
    return { score: v.score, tone: v.tone, label: v.label, reasons: v.reasons ?? [], lifecycle: v.lifecycle };
  }
  const base = Math.round(c.progress * 0.6 + (c.health === "green" ? 40 : c.health === "amber" ? 20 : c.health === "red" ? 0 : 10));
  const score = Math.max(0, Math.min(100, base));
  const tone = score >= 70 ? "ok" : score >= 45 ? "warn" : "crit";
  const label = score >= 70 ? "Saudável" : score >= 45 ? "Atenção" : "Em risco";
  return { score, tone, label, reasons: [] as string[], lifecycle: "" };
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `há ${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

// Regra global: TODO timestamp aparece como dd/mm/aaaa hh:mm.
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const MOD_SHORT: Record<string, string> = {
  "WhatsApp CRM (OpenClaw)": "WhatsApp CRM", "Agente de Busca de Leads": "Busca", "Módulo de Marketing": "Marketing",
};
export const modShort = (m: string) => MOD_SHORT[m] ?? m;
