# AGENTS.md — Portal do Cliente (regras de dev do repo)
Padrão cross-tool (Claude Code, Codex, etc.). Governança da empresa = SSOT no Drive `G:\Shared drives\Crasto.AI` (ver `CLAUDE.md` deste repo). Aqui: só o dev.

## Stack & estrutura
- **api/** NestJS (service_role, bypassa RLS; cliente nunca fala direto com o DB). Endpoints `/api/*`. Guards `JwtOrgGuard`+`AdminGuard`.
- **src/ (web)** React+TypeScript. Chama a Portal API.
- **DB** Supabase ref `vqulwouxwtfpboifhwcl`, host `aws-1-sa-east-1.pooler.supabase.com:5432`. Schemas: `identity/crm/delivery/catalog/commerce/billing/finance/support/whatsapp/automation`. Acesso do cliente por RPC `SECURITY DEFINER`; tabelas sensíveis RLS `is_crasto_admin()`. **Finance não é exposto** — só via RPC admin.
- **Migrações:** `supabase/migrations/*.sql`, aplicar com `pg` (creds do cofre `Portal_Cliente_SECRETS.md`).

## Build / deploy
- Type-check: `npx tsc --noEmit`. (Erros pré-existentes em `translations.ts`/`import.meta.env` são conhecidos.)
- Deploy: commit+push `main` → `POST http://187.77.50.147:3000/api/trpc/services.app.deployService` `{"json":{"projectName":"portal-cliente","serviceName":"web"|"api"}}` (Bearer `EASYPANEL_API_KEY` do cofre). **Não há auto-deploy por push.**

## Convenções
- Design System `designsystem.crasto.ai`; timestamps `dd/mm/aaaa hh:mm`; cabeçalho de tabela clicável p/ ordenar.
- Nunca hard-delete; sem lixeira na UI; exclusão só com aval humano. Dados reais e em tempo real; sem fonte = "—".
- **SISLOG obrigatório:** registrar cada mudança em `.governance/SISLOG.md`.
