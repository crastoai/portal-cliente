import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { PageHead, Pill, Empty, useAsync, money } from "../../ui/ui";

type Inv = { id: string; description: string | null; amount: number; due_date: string | null; status: string };
type Org = { name: string; plan: string | null };

export default function Financeiro() {
  const { profile } = useAuth();
  const { data, loading } = useAsync(async () => {
    const [inv, org] = await Promise.all([
      supabase.schema("billing").from("invoices").select("id,description,amount,due_date,status").order("due_date", { ascending: false }),
      profile?.organization_id ? supabase.from("organizations").select("name,plan").eq("id", profile.organization_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return { inv: (inv.data as Inv[]) ?? [], org: (org.data as Org) ?? null };
  }, [profile?.organization_id]);

  const inv = data?.inv ?? [];
  const org = data?.org ?? null;
  const next = inv.find((i) => i.status === "open");
  const tone = (s: string) => (s === "paid" ? "ok" : s === "overdue" ? "crit" : "warn");
  const label = (s: string) => (s === "paid" ? "Paga" : s === "overdue" ? "Vencida" : s === "canceled" ? "Cancelada" : "Em aberto");

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Financeiro" sub="Seu plano, valor e histórico de faturas." />
      {loading ? <Empty>Carregando…</Empty> : (
        <>
          <div className="grid2" style={{ marginBottom: 18 }}>
            <div className="herocard">
              <div className="lab">Plano atual</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "8px 0 2px" }}>{org?.plan || "—"}</div>
              <div style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>{org?.name}</div>
            </div>
            <div className="card">
              <h3>Próxima cobrança</h3>
              <div className="csub">{next?.due_date ? `Vence em ${new Date(next.due_date + "T00:00:00").toLocaleDateString("pt-BR")}` : "Sem cobranças em aberto"}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--crasto-navy)" }} className="tnum">{next ? money(next.amount) : money(0)}</div>
              {next && <div style={{ marginTop: 14 }}><button className="crasto-btn crasto-btn--primary crasto-btn--md" style={{ width: "100%" }}><span className="crasto-btn__label">Pagar agora (Pix / boleto)</span></button></div>}
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Fatura</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>2ª via</th></tr></thead>
              <tbody>
                {inv.map((i) => (
                  <tr key={i.id}>
                    <td>{i.description}</td>
                    <td>{i.due_date ? new Date(i.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="tnum">{money(i.amount)}</td>
                    <td><Pill tone={tone(i.status)}>{label(i.status)}</Pill></td>
                    <td><button className="sec-h link">Baixar PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
