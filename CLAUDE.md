# CLAUDE.md — Repo: Portal do Cliente (portal.crasto.ai)
**Ignição do repo.** Governança da EMPRESA é SSOT no Drive — **leia lá primeiro**, este arquivo só acrescenta regras de dev do repo.

## Antes de qualquer tarefa
1. Drive `G:\Shared drives\Crasto.AI` → `CLAUDE.md` (gatilho) → `CONTEXTO_GERAL_CRASTOAI.md` → `00_Governance/00_INDICE_MESTRE_CONTEXTO.md`.
2. Mapa de governança do dev: `00_Governance/GOVERNANCA_SISTEMA_DEV_v1.md`.
3. Este repo: `AGENTS.md` (regras de dev) + `.governance/README.md`.

## O que é este repo
Portal do Cliente: **api/** (NestJS, service_role) + **web/ / src/** (React+TS). Deploy EasyPanel `portal-cliente/web` e `portal-cliente/api`. DB Supabase ref `vqulwouxwtfpboifhwcl` (schema `finance`, `crm`, `identity`, `delivery`, `catalog`…). Migrações via `pg` (creds no cofre; nunca no código).

## Regras não-negociáveis (herdadas do Drive)
- **SSOT:** não duplicar contexto aqui — apontar pro Drive. **Segredo só no cofre.**
- **Design System único** `designsystem.crasto.ai`; bolha do cliente = azul gradiente, nunca navy.
- **Nunca hard-delete**; exclusão só com aval humano. Dados reais, nada fictício.
- **SISLOG:** toda ação de código/DB/deploy → 1 linha em `.governance/SISLOG.md` (+ master no Drive).
- Reler antes de editar (Drive multi-máquina). Push no `main` → depois deploy pela API do EasyPanel.
