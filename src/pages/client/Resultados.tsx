import { PageHead, Empty } from "../../ui/ui";

export default function Resultados() {
  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Resultados" sub="Como sua IA está performando." />
      <div className="kpis">
        <div className="kpi g"><div className="lab">Leads (30d)</div><div className="val tnum">—</div><div className="delta">aguardando dados do agente</div></div>
        <div className="kpi"><div className="lab">Conversas</div><div className="val tnum">—</div><div className="delta">WhatsApp CRM</div></div>
        <div className="kpi"><div className="lab">Taxa de qualificação</div><div className="val tnum">—</div><div className="delta">—</div></div>
        <div className="kpi"><div className="lab">Custo por lead</div><div className="val tnum">—</div><div className="delta">—</div></div>
      </div>
      <Empty><p><strong>Os resultados aparecem aqui assim que os agentes começam a rodar.</strong><br />Métricas de leads, conversas e performance em tempo real.</p></Empty>
    </div>
  );
}
