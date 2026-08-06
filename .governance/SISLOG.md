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
| 21:44 | CRASTO→CC | Deploy FRONT Item 1 (etiquetas no ar · bundle `index-CIZPBh14.css`) + diagnóstico cross-DB: dado vivo do SR Brasil EXISTE (91 conv · 4% IA · 88 leads · ~8min); "tela vazia" era **build velho da API** (resolvido no deploy); org_id é o MESMO nos 2 bancos; `client_baseline`/`cockpit_narrative` vazios; cargo precisa e-mail nas Pessoas | deploy web + diag read-only | verificado no bundle |
| 22:13 | CRASTO→CC | **RAIZ do cockpit vazio**: GRANT faltando em client_baseline/cockpit_narrative/company_partners (RLS existia, grant não) → bloco asUser estourava → .catch zerava orgId → vazio p/ TODO cliente. Migr 036 concede. PROVADO via token real: cockpit/mine vazio→cheio (8min·4% IA·91·88, conquistas 5, empresa SR BRASIL SEGUROS) | `migr 036`, `health.controller` | `6670aea` + deploy |
| 22:18 | CRASTO→CC | Grant 037 (client_services→service_role) destrava o snapshot da Psiquê + narrativa do hero GERADA pela IA (DeepSeek, dado real: "91 conversas · 88 leads · 4% IA", zero invenção). Hero deixa de ser texto fixo | `migr 037`, delivery.cockpit_narrative | narrativa gravada (is_current) |
| 22:36 | CRASTO→CC | Antes×Depois com **6 cards** (+ Horas economizadas ESTIMATIVA real: conversas-IA 21 × dur média 27min = 9h · + Cobertura 24/7) + indicador em **pill** contextual (mais rápido/automação/tempo liberado/sempre no ar) + abas estilo protótipo (pills+ícone, removida "Minhas soluções"). Deploy web emperrou 1x, re-disparado | `wacrm-metrics`, `delivery.controller`, `Inicio.tsx`, `portal.css` | `2fe0e91` + deploy api+web |
| 14:57 | CRASTO→CC | **Amplie sua operação** enriquecido (subtítulo c/ empresa, exemplo, **3 soluções reais do catálogo** sem preço, CTAs, rodapé) = componente reutilizável nas 3 abas · **hero**: 3 destaques em azul da identidade #6E9CE8 (amarelo é PROIBIDO no DS) | `AmpliarOperacao.tsx`, `Inicio.tsx` | `85efcec` + deploy web |
| 14:57 | CRASTO→CC | Jornada: marco **âncora real** do SR Brasil (07/07 org criada). Mecânica já existia: detalhe do cliente → "Histórico de implantação" → `implementation_events` | seed `delivery.implementation_events` | dado real |
| 14:57 | CRASTO→CC | **Entregas**: removido banner "Ajuste em andamento" (não-real) + **4 cards** do protótipo (Implantação geral·Soluções contratadas·Total do contrato·Próximo vencimento; financeiro real gated `podeFin`) + **datas REAIS de rollout** (Bia/Giovanna início 07/07→entrega 27/07 = 1ª msg wacrm, 100%; Mega 07/07 em andamento) | `Inicio.tsx`, seed `delivery.client_modules` | `50725a6` + deploy |
| 14:57 | CRASTO→CC | **Entregas**: removida seção "Seu atendimento" (a pedido) + Amplie no rodapé | `Inicio.tsx` | `801e8d8` + deploy |
| 14:57 | CRASTO→CC | **Contrato&Financeiro**: **4º card STATUS** tempo real (em dia/atraso + contagem vencidas `fin.overdue`) + Restante "N a vencer" + Amplie no rodapé | `Inicio.tsx` | `67f8200` + deploy |
| 15:00 | CRASTO→CC | Cockpit: descrição do protótipo abaixo da saudação (texto de marca — o que é o painel de relacionamento) | `Inicio.tsx` | `8bc3a51` + deploy web |
| 15:39 | CRASTO→CC | Cockpit **DRILL-DOWN interativo Fase 1**: card "1ª resposta" clicável → modal por colaborador (tempo real por humano/IA, ao vivo 30s). `responseByCollaborator` + endpoint. Dado real (Rita 6min, Giovanna 13s) | `wacrm-metrics`, `delivery.controller`, `Inicio.tsx`, `portal.css` | `a11ccf8` + deploy |
| 15:39 | CRASTO→CC | Cockpit **DRILL-DOWN Fase 2**: colaborador → conversas (`collabConversations`) → clique abre `/chat/<id>` no CRM (CrmEmbed lê `?conversation=`; o CRM já tinha a rota). Verificado: 32 conversas reais da Rita | `wacrm-metrics`, `CrmEmbed.tsx`, `Inicio.tsx` | `8c13ccb` + deploy |
| 15:39 | CRASTO→CC | Cockpit **DRILL-DOWN Fase 3**: estende o drill p/ "Conversas atendidas" e "Atendido pela IA" (mesmo modal) | `Inicio.tsx` | `ee23a3e` + deploy |
| 16:25 | CRASTO→CC | Cockpit item 1 (afordância): troca o ícone ⤢ apagado por um **CTA "Ver detalhes →"** (pill azul da marca, tingido→sólido no hover) no rodapé dos cards clicáveis do Antes×Depois (1ª Resposta / Conversas / Atendido pela IA). `.kpi-foot` (delta+CTA) não colide e quebra no mobile. | `Inicio.tsx`, `portal.css` | `0f13ac7` + deploy portal-cliente/web |
