// Parâmetros de negócio para exibição no front.
// Fonte autoritativa do imposto = finance.settings.tax_rate (server-side, não exposto por segurança).
// Este valor é só para a coluna informativa "Imposto" nas telas; manter em sincronia com o banco.
export const TAX_RATE = 8.68; // %

export const taxOf = (v: number | string | null | undefined) =>
  Math.round((Number(v ?? 0) * TAX_RATE) / 100 * 100) / 100;

// Comissão padrão por tipo de agente indicador.
export const COMMISSION_BY_AGENT_TYPE: Record<string, number> = {
  indicador: 20, // participa/ajuda de fato
  conector: 5,   // só apresentou (válido no contrato de 1 ano)
};
