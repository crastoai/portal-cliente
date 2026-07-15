import { AsyncLocalStorage } from 'node:async_hooks';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';

/**
 * "Ver como cliente" (visualização do admin) — escopo por REQUISIÇÃO.
 *
 * O front manda `X-Preview-Org: <uuid>`; guardamos no ALS e o RlsDbService declara
 * `request.impersonate_org` na transação. Aí o BANCO decide:
 *   - `current_org_id()` só honra o GUC se quem pede for crasto_admin;
 *   - `is_admin_viewing_all()` fica FALSO enquanto visualiza → o bypass do admin some
 *     e ele passa a enxergar exatamente o que o cliente enxerga.
 *
 * Ou seja: se um cliente forjar o cabeçalho, não acontece nada — a autoridade é a RLS,
 * não este interceptor. (Provado: cliente com header de outra org continua vendo só a dele.)
 *
 * ALS em vez de parâmetro: são +100 chamadas de asUser; passar isso à mão em cada uma
 * seria esquecer em alguma — e esquecer, aqui, é vazar.
 */
const als = new AsyncLocalStorage<{ previewOrg: string | null }>();

export const previewOrg = (): string | null => als.getStore()?.previewOrg ?? null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PreviewInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    const raw = String(req?.headers?.['x-preview-org'] || '').trim();
    // Só aceitamos um uuid bem formado — o resto é ruído (o GUC vira SQL text).
    const previewOrg = UUID.test(raw) ? raw : null;
    return als.run({ previewOrg }, () => next.handle());
  }
}
