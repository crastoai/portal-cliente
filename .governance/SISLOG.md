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
| 17:05 | CRASTO→CC | Modelo contrato+comprovante+multa (item 1/4): migr. 031 (contract_signed_date + campos da parcela) | `supabase/migrations/031_*` | `c73b213` |
| 17:25 | CRASTO→CC | Coleta contrato+comprovante (item 2/4): assinatura + parcela paid_date/comprovante/multa | `src/pages/admin/Financeiro.tsx` | `cb258ec` |
| 17:45 | CRASTO→CC | Cruzamento previsão×realizado (item 3/4): veredito por parcela + conciliação | `src/pages/admin/Financeiro.tsx` | `2e49946` |
| 18:05 | CRASTO→CC | Edição inline da parcela na lista (item 4/4) — clique na linha edita sem modal | `src/pages/admin/Financeiro.tsx` | `efe1193` |
| 18:20 | CRASTO→CC | Fix estilo DS dos inputs (cronograma + editor inline) | `src/styles/screens.css`, `src/pages/admin/Financeiro.tsx` | `f91fa7d` |
| 18:40 | CRASTO→CC | Fix UX: reload em segundo plano (nao pula pro topo) — base useAsync | `src/ui/ui.tsx` | `6f568ad` |
| 19:00 | CRASTO→CC | Anexar comprovante (upload) no lugar de nota+link — DocField | `src/ui/DocField.tsx`, `src/pages/admin/Financeiro.tsx` | `4db9e75` |
| 19:25 | CRASTO→CC | Popup de lançamento em tela cheia responsiva (Modal fullscreen) | `src/ui/Modal.tsx`, `screens.css`, `portal.css`, `Financeiro.tsx` | `064bc0f` |
| 21:40 | CRASTO→CC | Cockpit 1.1: endpoint /delivery/cockpit/mine (Meus Resultados, dado real) | `api/src/delivery/delivery.controller.ts` | `fb6f8f3` |
| 22:10 | CRASTO→CC | Cockpit 1.2: aba Meus Resultados na Início (dado real) | `src/pages/client/Inicio.tsx`, `delivery.service.ts` | `9326465` |
| 22:35 | CRASTO→CC | Fix cockpit/mine: escopo por org + .catch (corrige tela vazia c/ dado real) | `api/src/delivery/delivery.controller.ts` | `3eae15c` |
| 23:00 | CRASTO→CC | Baseline de Entrada DB (1.3a): migr. 032 delivery.client_baseline | `supabase/migrations/032_*` | `a9a9317` |
| 23:40 | CRASTO→CC | Psiquê extrator DeepSeek do Baseline (1.3b) | `api/src/psique/*`, `julie-llm.service.ts` | `ea345a5` |
| 00:15 | CRASTO→CC | Fix cockpit: métricas vivas direto do wacrm por org + baseline no antes×depois | `api/src/delivery/wacrm-metrics.service.ts`, `delivery.controller.ts` | `4a0ff86` |
| 00:45 | CRASTO→CC | Tela admin do Baseline (1.3c) — fecha o item 1.3 | `src/pages/admin/BaselineCard.tsx`, `psique.service.ts` | `70a1a6e` |
| 01:30 | CRASTO→CC | Psiquê narrativa (1.4, FIM Fase 1) — migr 033 + gerarNarrativa DeepSeek + job diário + hero | `api/src/psique/*`, `Inicio.tsx` | `460f5a4` |
| 02:00 | CRASTO→CC | Entregas DB (2.1): migr 034 rollout_start+delivered_at+trigger | `supabase/migrations/034_*`, `delivery.controller.ts` | `63a0b10` |
| 02:20 | CRASTO→CC | Admin Entregas (2.2): Início + Entrega real por solução | `src/pages/admin/ClienteDetalhe.tsx` | `a9ebd00` |
| 02:45 | CRASTO→CC | Aba Entregas & Implantação com Gantt (2.3, FIM Fase 2) | `src/pages/client/Inicio.tsx` | `1d0347d` |
| 03:05 | CRASTO→CC | my_faturas paid_date (3.1) | `supabase/migrations/035_*`, `src/lib/faturas.ts` | `382f329` |
| 03:30 | CRASTO→CC | Aba Contrato & Financeiro (3.2, FIM Fase 3) | `src/pages/client/Inicio.tsx` | `a47d21e` |
| 04:00 | CRASTO→CC | Menu reorganizado p/ prototipo (4.1) | `screens.ts`, `ClientShell.tsx` | `2c93f0b` |
| 04:30 | CRASTO→CC | Mini-cockpit BI no WhatsApp CRM (4.2) | `wacrm-metrics.service.ts`, `CrmEmbed.tsx` | `738e237` |
| 05:00 | CRASTO→CC | Catálogo recomendador de IA (4.3, FIM Fase 4) | `api/src/psique/*`, `Catalogo.tsx` | `7dcb108` |
| 21:31 | CRASTO→CC | Cockpit Item 1: etiquetas cargo+empresa no cabeçalho (asService escopado, dado real do cadastro de Pessoas; nunca inventa) | `delivery.controller.ts`, `Inicio.tsx`, `delivery.service.ts`, `portal.css` | `5a5db5b` + deploy api |
