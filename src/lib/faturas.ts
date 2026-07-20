// Resumo das faturas do cliente para o health-check (Início) e a tela Financeiro.
// Fonte: billing.invoices (RLS por organização). "Ver" é real hoje; "pagar" entra com o Inter.
export type Fatura = { id: string; description: string | null; amount: number; due_date: string | null; status: string };

export type FaturaSummary = {
  open: Fatura[];
  openTotal: number;
  overdue: Fatura[];
  overdueTotal: number;
  next: Fatura | null;
  daysToNext: number | null;
  status: "green" | "amber" | "red";
};

const isSettled = (s: string) => s === "paid" || s === "canceled";
// Hoje no fuso do Brasil (as faturas são datas de calendário BR). toISOString() (UTC) fazia
// o dia "virar" à noite e uma parcela do dia podia contar como vencida cedo demais.
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export function isOverdue(i: Fatura, today = todayISO()): boolean {
  return !isSettled(i.status) && !!i.due_date && i.due_date < today;
}

export function summarizeFaturas(inv: Fatura[], today = todayISO()): FaturaSummary {
  const open = inv.filter((i) => !isSettled(i.status)).sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  const overdue = open.filter((i) => isOverdue(i, today));
  const next = open[0] ?? null;
  const daysToNext = next?.due_date ? Math.ceil((new Date(next.due_date + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000) : null;
  const status: FaturaSummary["status"] = overdue.length ? "red" : daysToNext != null && daysToNext <= 7 ? "amber" : "green";
  return {
    open, openTotal: open.reduce((a, i) => a + Number(i.amount || 0), 0),
    overdue, overdueTotal: overdue.reduce((a, i) => a + Number(i.amount || 0), 0),
    next, daysToNext, status,
  };
}
