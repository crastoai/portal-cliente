import { UserPlus, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHead, useAsync, money, initials } from "../../ui/ui";
import { fetchClients, healthScore, timeAgo, modShort } from "../../lib/adminData";

export default function VisaoGeral() {
  const { data, loading } = useAsync(fetchClients, []);
  const clients = data ?? [];
  const mrr = clients.reduce((s, c) => s + Number(c.mrr), 0);
  const modules = clients.reduce((s, c) => s + (c.modules?.length ?? 0), 0);
  const risk = clients.filter((c) => healthScore(c).score < 45).length;

  return (
    <div className="bizdash">
      <PageHead eyebrow="Painel Admin · Crasto.AI" title="Visão geral do negócio" sub="A saúde da operação num relance."
        right={<Link to="/admin/clientes" className="crasto-btn crasto-btn--primary crasto-btn--sm"><span className="crasto-btn__icon"><UserPlus size={15} /></span><span className="crasto-btn__label">Cadastrar cliente</span></Link>} />

      <div className="kpis">
        <div className="kpi navy"><div className="lab">MRR (receita recorrente)</div><div className="val tnum">{money(mrr)}</div><div className="delta">soma dos contratos</div></div>
        <div className="kpi"><div className="lab">Clientes ativos</div><div className="val tnum">{clients.length}</div><div className="delta">no portal</div></div>
        <div className="kpi g"><div className="lab">Módulos entregues</div><div className="val tnum">{modules}</div><div className="delta">{clients.length ? (modules / clients.length).toFixed(1) : 0} por cliente</div></div>
        <div className="kpi"><div className="lab">Em risco (churn)</div><div className="val tnum" style={{ color: risk ? "var(--crasto-danger)" : undefined }}>{risk}</div><div className="delta">requer atenção</div></div>
      </div>

      <div className="sec-h"><h2>Clientes · saúde &amp; uso</h2></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Cliente</th><th>Módulos</th><th>Últ. acesso</th><th>Uso (30d)</th><th>Health score</th><th>MRR</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ color: "var(--crasto-text-muted)" }}>Carregando…</td></tr> :
              clients.map((c) => {
                const h = healthScore(c);
                const stale = c.last_access && (Date.now() - new Date(c.last_access).getTime()) > 20 * 86400000;
                const color = h.tone === "ok" ? "#1F8A5B" : h.tone === "warn" ? "#B8863A" : "#B83A3A";
                return (
                  <tr key={c.id}>
                    <td><div className="cust"><div className="logo">{initials(c.name)}</div><div><div className="nm">{c.name}</div><div className="em">{c.email || "—"}</div></div></div></td>
                    <td><div className="modchips">{(c.modules ?? []).map((m, i) => <span className="chip" key={i}>{modShort(m)}</span>)}</div></td>
                    <td style={{ color: stale ? "var(--crasto-danger)" : "var(--crasto-text-body)", fontWeight: 500 }}><Clock size={12} style={{ verticalAlign: -1, marginRight: 4, opacity: .6 }} />{timeAgo(c.last_access)}</td>
                    <td><div className="barmini"><span style={{ width: `${c.progress}%`, background: color }} /></div></td>
                    <td><span className="health"><span className="d" style={{ background: color }} />{h.score} · {h.label}</span></td>
                    <td className="tnum" style={{ fontWeight: 600, color: "var(--crasto-navy)" }}>{money(c.mrr)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
