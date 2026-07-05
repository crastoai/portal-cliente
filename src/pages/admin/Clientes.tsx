import { UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHead, Empty, useAsync, money, initials } from "../../ui/ui";
import { fetchClients, healthScore, timeAgo, modShort } from "../../lib/adminData";

export default function Clientes() {
  const { data, loading } = useAsync(fetchClients, []);
  const clients = data ?? [];
  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Clientes" sub="Cadastre, edite e acompanhe cada cliente."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm"><span className="crasto-btn__icon"><UserPlus size={15} /></span><span className="crasto-btn__label">Cadastrar cliente</span></button>} />
      {loading ? <Empty>Carregando…</Empty> : clients.length === 0 ? <Empty>Nenhum cliente cadastrado.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>Módulos</th><th>Últ. acesso</th><th>Health score</th><th>MRR</th><th></th></tr></thead>
            <tbody>
              {clients.map((c) => {
                const h = healthScore(c);
                const color = h.tone === "ok" ? "#1F8A5B" : h.tone === "warn" ? "#B8863A" : "#B83A3A";
                return (
                  <tr key={c.id}>
                    <td><div className="cust"><div className="logo">{initials(c.name)}</div><div><div className="nm">{c.name}</div><div className="em">{c.email || "—"}</div></div></div></td>
                    <td><div className="modchips">{(c.modules ?? []).map((m, i) => <span className="chip" key={i}>{modShort(m)}</span>)}</div></td>
                    <td style={{ color: "var(--crasto-text-body)", fontWeight: 500 }}>{timeAgo(c.last_access)}</td>
                    <td><span className="health"><span className="d" style={{ background: color }} />{h.score} · {h.label}</span></td>
                    <td className="tnum" style={{ fontWeight: 600, color: "var(--crasto-navy)" }}>{money(c.mrr)}</td>
                    <td><Link className="sec-h link" to={`/admin/cliente/${c.id}`}>Ver detalhe</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
