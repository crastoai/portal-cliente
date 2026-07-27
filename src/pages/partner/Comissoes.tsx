import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync, money, useSort, SortTh } from "../../ui/ui";
import { useT } from "../../lib/i18n";

type Comm = { org: string; sale_amount: number; commission_amount: number; nf_status: string };

export default function Comissoes() {
  const t = useT();
  const { data, loading } = useAsync(async () => await services.analytics.client.connectorCommissions<Comm[]>(), []);
  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.commission_amount), 0);
  const paid = rows.filter((r) => r.nf_status === "paid").reduce((s, r) => s + Number(r.commission_amount), 0);
  const pending = total - paid;
  const { sort, toggle, sorted } = useSort("commission_amount", -1);

  return (
    <div>
      <PageHead eyebrow="Viver de IA · Financeiro" title="Comissões (20%)" sub="20% sobre cada venda da Crasto.AI aos clientes que você indicou." />
      <div className="kpis">
        <div className="kpi navy"><div className="lab">{t("Comissão acumulada")}</div><div className="val tnum">{money(total)}</div><div className="delta">{t("total")}</div></div>
        <div className="kpi g"><div className="lab">{t("Já paga")}</div><div className="val tnum">{money(paid)}</div><div className="delta">{t("NF emitida")}</div></div>
        <div className="kpi"><div className="lab">{t("A receber")}</div><div className="val tnum">{money(pending)}</div><div className="delta">{t("aguardando NF")}</div></div>
        <div className="kpi"><div className="lab">{t("Vendas geradas")}</div><div className="val tnum">{money(rows.reduce((s, r) => s + Number(r.sale_amount), 0))}</div><div className="delta">{t("base da comissão")}</div></div>
      </div>
      <div className="note"><span>{t("Para receber, emita a Nota Fiscal contra a Crasto.AI no valor da comissão. Após emitida, a Crasto realiza o pagamento.")}</span></div>
      <div className="sec-h"><h2>{t("Vendas & comissões por cliente")}</h2></div>
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty>Nenhuma comissão ainda.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              <SortTh col="org" sort={sort} toggle={toggle}>{t("Cliente")}</SortTh>
              <SortTh col="sale_amount" sort={sort} toggle={toggle}>{t("Valor da venda")}</SortTh>
              <SortTh col="commission_amount" sort={sort} toggle={toggle}>{t("Comissão 20%")}</SortTh>
              <SortTh col="nf_status" sort={sort} toggle={toggle}>{t("Nota Fiscal")}</SortTh>
            </tr></thead>
            <tbody>
              {sorted(rows, (c, col) => {
                switch (col) {
                  case "org": return c.org;
                  case "sale_amount": return c.sale_amount;
                  case "commission_amount": return c.commission_amount;
                  case "nf_status": return c.nf_status;
                  default: return c.commission_amount;
                }
              }).map((c, i) => (
                <tr key={i}>
                  <td>{c.org}</td>
                  <td className="tnum">{money(c.sale_amount)}</td>
                  <td className="tnum" style={{ fontWeight: 700, color: "var(--crasto-text-primary)" }}>{money(c.commission_amount)}</td>
                  <td><Pill tone={c.nf_status === "paid" ? "ok" : "warn"}>{c.nf_status === "paid" ? t("NF emitida · paga") : t("Aguardando NF")}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
