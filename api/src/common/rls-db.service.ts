import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { previewOrg } from './preview.store';

/**
 * Acesso ao Postgres do Portal SEMPRE no contexto RLS do usuário.
 * O cliente NUNCA fala direto com o banco — o SPA chama esta API, que abre a
 * conexão, declara a identidade do usuário (JWT claims) e o Postgres reforça o
 * isolamento por RLS. Os schemas de contexto (catalog/delivery/commerce/…) deixam
 * de ser expostos ao PostgREST; só este middle-end os acessa.
 *
 * Por requisição:
 *   begin; set local role authenticated;
 *   set local request.jwt.claims = '{"sub": <userId>, "role":"authenticated"}';
 *   -> auth.uid() / public.current_org_id() / public.is_crasto_admin() resolvem; policies filtram.
 */
@Injectable()
export class RlsDbService implements OnModuleDestroy {
  private pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // pooler do Supabase exige TLS
    max: 10,
  });

  /** Executa fn como o USUÁRIO (RLS ativa). */
  async asUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
      // "Ver como cliente": declara a org visualizada. Quem valida é o BANCO —
      // current_org_id() só honra isto para crasto_admin, e is_admin_viewing_all()
      // fica falso, tirando o bypass do admin. `set local` morre com a transação.
      const org = previewOrg();
      if (org) await c.query("select set_config('request.impersonate_org', $1, true)", [org]);
      const out = await fn(c);
      await c.query('commit');
      return out;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }

  /** Executa fn como service_role (bypassa RLS) — só ações de SISTEMA/admin controladas. */
  async asService<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      await c.query('set local role service_role');
      const out = await fn(c);
      await c.query('commit');
      return out;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }

  onModuleDestroy() {
    return this.pool.end();
  }
}
