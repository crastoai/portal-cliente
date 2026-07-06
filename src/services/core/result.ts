// ============================================================================
// Núcleo do middle-end — normalização de resultado e erro.
// Toda a UI passa a receber DADOS puros ou uma exceção ServiceError previsível.
// O padrão { data, error } do Supabase nunca mais vaza para as telas.
// ============================================================================

export class ServiceError extends Error {
  code?: string;
  details?: unknown;
  constructor(message: string, code?: string, details?: unknown) {
    super(message || "Erro inesperado no serviço.");
    this.name = "ServiceError";
    this.code = code;
    this.details = details;
  }
}

type PgResult<T> = { data: T; error: { message: string; code?: string; details?: unknown } | null };

/** Desembrulha uma resposta do Supabase: retorna `data` ou lança ServiceError. */
export function unwrap<T>(res: PgResult<T>): T {
  if (res.error) throw new ServiceError(res.error.message, res.error.code, res.error.details);
  return res.data;
}

/** Igual a unwrap, mas garante lista não-nula (para selects de coleção). */
export function unwrapList<T>(res: PgResult<T[] | null>): T[] {
  return unwrap(res) ?? [];
}

/** Executa uma operação de serviço capturando qualquer erro como ServiceError. */
export async function guard<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (e instanceof ServiceError) throw e;
    throw new ServiceError(e instanceof Error ? e.message : String(e));
  }
}

/** Mensagem amigável a partir de qualquer erro (para exibir na UI). */
export function errorMessage(e: unknown): string {
  if (e instanceof ServiceError || e instanceof Error) return e.message;
  return String(e ?? "Erro desconhecido.");
}
