// ============================================================================
// PSIQUÊ — a inteligência do Cockpit (Meus Resultados). 🔒 Admin.
// Captura o BASELINE ("antes") do cliente: cola-se uma transcrição/descrição e a IA (DeepSeek)
// extrai os indicadores; ou lança-se à mão. Grava em delivery.client_baseline (append-only).
// ============================================================================
import { api } from "../lib/api";

export type BaselineRow = {
  metric: string; label: string; valor_antes: number | null; unidade: string; status: string;
  fonte?: string | null; baseline_date?: string | null; created_by_name?: string | null; created_at?: string;
};
type SaveResp = { ok?: boolean; gravadas?: number; metrics?: BaselineRow[]; error?: string; uso?: any };

export const psique = {
  /** Extrai o baseline de um texto/transcrição via DeepSeek e grava. */
  extract: async (organization_id: string, texto: string, fonte?: string, baseline_date?: string) =>
    api.post<SaveResp>(`/api/psique/baseline/extract`, { organization_id, texto, fonte, baseline_date }),
  /** Salva o baseline lançado à mão (métricas digitadas pelo admin). */
  save: async (organization_id: string, metrics: BaselineRow[], fonte?: string, baseline_date?: string) =>
    api.post<SaveResp>(`/api/psique/baseline/save`, { organization_id, metrics, fonte, baseline_date }),
  /** Baseline vigente da org. */
  list: async (organization_id: string) => api.get<BaselineRow[]>(`/api/psique/baseline/${organization_id}`),
};
