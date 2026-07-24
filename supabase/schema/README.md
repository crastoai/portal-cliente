# Retrato do banco (baseline)

`portal_baseline.sql` é a **estrutura do banco de produção do Portal**, capturada com
`pg_dump --schema-only`: tabelas, funções, policies de RLS, índices e **grants**. **Sem dados** e
**sem segredos** — as chaves ficam no Vault do Supabase (`public.cred_key()` lê de
`vault.decrypted_secrets`), então o dump carrega só os *nomes*.

Schemas capturados: `public`, `catalog`, `delivery`, `finance`, `audit`, `automation`, `support`,
`commerce`, `billing`, `crm`, `agents`, `whatsapp`. Ficam de fora os gerenciados pelo Supabase
(`auth`, `storage`, `realtime`, `vault`, `net`).

## Por que existe

O Portal tinha 60+ tabelas em produção e só um punhado de migrations — ou seja, a estrutura só
existia no ar. Sem retrato versionado não há ambiente de teste reprodutível, nem revisão de
mudança de banco, nem como saber se produção desviou do que o código diz. Era o item em aberto da
**Fase 0 do Blueprint v1.1** (*"pronto quando: schema versionado + IdP confirmado"*).

Estado na captura: **62 tabelas, 62 com RLS**; as 4 com privilégio para `anon`
(`connectors`, `member_screens`, `organizations`, `profiles`) têm policy. Sem exposição aberta.
No banco irmão (wacrm) a mesma varredura encontrou uma tabela sem RLS — vale repetir sempre.

## O contrato

- **`schema/portal_baseline.sql`** = como o banco **está agora**. É gerado, não escrito à mão.
- **`migrations/NNN_*.sql`** = o que **mudou desde então**, em ordem, cada uma aplicada com
  asserts dentro de uma transação.
- Depois de aplicar migration que mexa em estrutura, **regere o retrato no mesmo commit**. O
  `git diff` do baseline é a revisão da mudança de banco — é ali que aparece policy afrouxada
  ou grant largo demais.

## Como regerar

```bash
docker run --rm -v /root/_schema:/out -e PGURL='<DATABASE_URL com porta 5432>' postgres:17 \
  sh -c 'pg_dump "$PGURL" --schema-only --no-owner --no-comments \
    --schema=public --schema=catalog --schema=delivery --schema=finance --schema=audit \
    --schema=automation --schema=support --schema=commerce --schema=billing --schema=crm \
    --schema=agents --schema=whatsapp > /out/portal_schema.sql'
```

Use a porta **5432** (session pooler); a 6543 é o pooler de transação e não serve para `pg_dump`.

## Antes de commitar, varra

```bash
for P in 'eyJ[A-Za-z0-9_-]\{20,\}' 'sk-[A-Za-z0-9]\{20,\}' 'secret[[:space:]]*:=' 'password[[:space:]]*:='; do grep -ci "$P" portal_baseline.sql; done
```

Tudo zero. Se aparecer valor, **não commite**: mova para o Vault e faça a função lê-lo de lá.
