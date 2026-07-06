import { services } from "../../services";
import { PageHead, useAsync, money } from "../../ui/ui";
import { useSettings } from "../../lib/settings";
import { fmtRate } from "../../lib/config";
import { useT } from "../../lib/i18n";

type Over = { mrr: number; profit: number; clients: number; commissions_pending: number };

export default function Receita() {
  const { taxRate } = useSettings();
  const t = useT();
  const { data } = useAsync(async () => await services.analytics.admin.overview<Over>(), []);
  const o = data;
  return (
    <div className="receitapage">
      <PageHead eyebrow="Painel Admin" title="Receita & churn" sub="Evolução do MRR e rentabilidade." />
      <div className="kpis">
        <div className="kpi navy"><div className="lab">{t("MRR total")}</div><div className="val tnum">{money(o?.mrr ?? 0)}</div><div className="delta">{t("recorrente")}</div></div>
        <div className="kpi g"><div className="lab">{t("Lucro estimado")}</div><div className="val tnum">{money(o?.profit ?? 0)}</div><div className="delta">{t("após impostos")} {fmtRate(taxRate)}%</div></div>
        <div className="kpi"><div className="lab">{t("Ticket médio")}</div><div className="val tnum">{money((o?.clients ?? 0) ? (o!.mrr / o!.clients) : 0)}</div><div className="delta">{t("por cliente")}</div></div>
        <div className="kpi"><div className="lab">{t("Comissões a pagar")}</div><div className="val tnum">{money(o?.commissions_pending ?? 0)}</div><div className="delta">{t("conectores")}</div></div>
      </div>
      <div className="card"><h3>{t("Evolução do MRR")}</h3><div className="csub">{t("O gráfico de evolução aparece conforme os meses acumulam dados reais.")}</div>
        <div className="empty" style={{ border: "none", padding: "30px 0" }}>{t("Histórico em construção — os dados começam a acumular agora.")}</div>
      </div>
    </div>
  );
}
