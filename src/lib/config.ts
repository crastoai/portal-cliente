// Helper de imposto. A alíquota REAL vem do banco (finance.settings) via useSettings().
// Nada de valor fixo aqui — quem chama passa a alíquota real.
export const taxOf = (v: number | string | null | undefined, rate: number) =>
  Math.round((Number(v ?? 0) * Number(rate)) / 100 * 100) / 100;

/** Formata a alíquota para exibição pt-BR (8.68 → "8,68"). */
export const fmtRate = (rate: number) => String(rate).replace(".", ",");
