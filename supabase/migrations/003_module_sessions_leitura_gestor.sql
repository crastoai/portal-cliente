-- ============================================================================
-- 003 · QUEM PODE LER O USO DOS OUTROS (aperta a 002)
--
-- A 002 liberou a leitura de `module_sessions` para QUALQUER pessoa da organização
-- (`organization_id = current_org_id()`). Ao construir a tela percebi o erro: "quanto tempo o
-- fulano ficou no módulo X" é informação de GESTOR, não de colega. Um membro conseguiria
-- auditar o expediente dos outros.
--
-- Regra correta, três faixas:
--   · a própria pessoa      → sempre vê o próprio uso;
--   · dono da empresa       → vê a equipe dele (é quem contrata e distribui os módulos);
--   · crasto_admin          → vê tudo (suporte/cobrança), como no resto da plataforma.
--
-- Aperta sem quebrar: a tela nova já nasce com este recorte, e ninguém perde acesso ao que
-- lhe diz respeito.
-- ============================================================================

drop policy if exists module_sessions_org_read on delivery.module_sessions;

-- A própria pessoa.
create policy module_sessions_self_read on delivery.module_sessions
  for select using (user_id = auth.uid());

-- Dono da empresa: só a própria org, e só se for mesmo o dono (papel lido no banco, nunca
-- vindo do cliente).
create policy module_sessions_owner_read on delivery.module_sessions
  for select using (
    organization_id = public.current_org_id()
    and exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.organization_id = delivery.module_sessions.organization_id
         and p.role::text = 'client_owner'
    )
  );
