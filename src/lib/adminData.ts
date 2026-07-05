import { supabase } from "./supabase";

export type Client = {
  id: string; name: string; plan: string | null; email: string | null;
  modules: string[]; last_access: string | null; progress: number; health: string | null; mrr: number;
};

export async function fetchClients(): Promise<Client[]> {
  const { data } = await supabase.rpc("admin_clients");
  return (data as Client[]) ?? [];
}

export function healthScore(c: Client) {
  const base = Math.round(c.progress * 0.6 + (c.health === "green" ? 40 : c.health === "amber" ? 20 : c.health === "red" ? 0 : 10));
  const score = Math.max(0, Math.min(100, base));
  const tone = score >= 70 ? "ok" : score >= 45 ? "warn" : "crit";
  const label = score >= 70 ? "Saudável" : score >= 45 ? "Atenção" : "Em risco";
  return { score, tone, label };
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

const MOD_SHORT: Record<string, string> = {
  "WhatsApp CRM (OpenClaw)": "WhatsApp CRM", "Agente de Busca de Leads": "Busca", "Módulo de Marketing": "Marketing",
};
export const modShort = (m: string) => MOD_SHORT[m] ?? m;
