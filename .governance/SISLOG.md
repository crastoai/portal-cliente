# SISLOG (local) — Portal do Cliente
Espelho da trilha de auditoria deste repo. **Append-only** (nunca editar/apagar linha). Master no Drive: `00_Governance/SISLOG_Auditoria_DEV_v1.md`. Prova = commit hash. Segredo nunca aqui.

`Quem`: `CC` = Claude Code (Opus 4.8, sob direção do Crasto) · `CRASTO` = decisão do Carlos Crasto.

## 2026-08-04
| Hora | Quem | O quê | Arquivo | Commit |
|------|------|-------|---------|--------|
| 14:57 | CRASTO→CC | DeepSeek por cliente em BRL + tela Custos de IA mais limpa | `src/pages/admin/CustoIA.tsx` | `16d8189` |
| 15:01 | CC | `finance.ai_usage` aceita `provider='deepseek'` | `supabase/migrations/030_*` | `c4da1e2` |
| 15:06 | CRASTO→CC | Visão de Dono (CEO) em Custos de IA | `api/src/finance/ai-cost-sync.service.ts` | `b7a1745` |
| 15:29 | CRASTO→CC | Auto-preenche cadastro do cliente no Novo Lançamento | `src/pages/admin/Financeiro.tsx` | `4a2bd20` |
| 15:42 | CRASTO→CC | Faróis de margem por cliente automáticos | Financeiro (api+web) | `2498350` |
| 15:49 | CRASTO→CC | Farol avaliado pela IA (DeepSeek), não regra fixa | `api/src/finance/ai-cost-sync.service.ts` | `f3953aa` |
| 16:10 | CRASTO→CC | Parcelas editáveis + log contrato-vs-manual | `src/pages/admin/Financeiro.tsx` | `02a32a7` |
| 16:30 | CRASTO→CC | Camada-ponteiro de governança do repo | `CLAUDE.md`,`AGENTS.md`,`.governance/` | (este commit) |
