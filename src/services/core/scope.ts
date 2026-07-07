import { previewOrgId } from "../../lib/preview";

/**
 * Escopa uma consulta "mine" à org em preview quando o admin está no modo
 * "Ver como cliente". Fora do preview, retorna a query inalterada (o RLS já
 * filtra pela org do usuário logado).
 */
export const scopeMine = <T>(qb: T): T => {
  const pid = previewOrgId();
  return pid ? ((qb as any).eq("organization_id", pid) as T) : qb;
};
