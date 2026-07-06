import { MessageCircle, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { services } from "../../services";
import { PageHead, Empty, useAsync } from "../../ui/ui";

type Hours = { period: string; plan_hours: number; used_hours: number; balance: number; status: string };
type Ticket = { id: string; subject: string; status: string };

export default function Suporte() {
  const { data } = useAsync(async () => {
    const [h, t] = await Promise.all([
      services.analytics.client.supportHours<Hours[]>(),
      services.support.tickets.listMine(),
    ]);
    const hours = (h ?? [])[0] ?? null;
    return { hours, tickets: (t as unknown as Ticket[]) ?? [] };
  }, []);
  const hours = data?.hours ?? null;
  const usedPct = hours ? Math.min(100, (Number(hours.used_hours) / Math.max(1, Number(hours.plan_hours))) * 100) : 0;

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Suporte & Ajuda" sub="Abra um chamado, acompanhe seu plano e aprenda a usar cada módulo." />

      <div className="grid2" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3>Abrir um chamado</h3>
          <div className="csub">Nosso time responde em até 1 dia útil.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="arow" style={{ textAlign: "left", cursor: "pointer" }}><span className="ico" style={{ background: "#1FA855" }}><MessageCircle size={16} /></span><span><span className="t">Falar no WhatsApp</span><br /><span className="s">Resposta mais rápida</span></span></button>
            <button className="arow" style={{ textAlign: "left", cursor: "pointer" }}><span className="ico" style={{ background: "var(--crasto-navy)" }}><Mail size={16} /></span><span><span className="t">Abrir ticket por e-mail</span><br /><span className="s">Para assuntos detalhados</span></span></button>
          </div>
        </div>
        <div className="card">
          <h3>Meu plano de suporte</h3>
          <div className="csub">{hours ? `${hours.used_hours}h de ${hours.plan_hours}h usadas neste mês` : "Sem plano de horas ativo"}</div>
          <div style={{ height: 10, borderRadius: 99, background: "var(--crasto-border)", overflow: "hidden", margin: "6px 0 12px" }}>
            <div style={{ height: "100%", width: `${usedPct}%`, borderRadius: 99, background: "linear-gradient(90deg,#1F8A5B,#3fae78)" }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--crasto-text-body)", lineHeight: 1.7 }}>
            Saldo: <b style={{ color: "var(--crasto-navy)" }}>{hours ? `${hours.balance}h` : "—"}</b>. Se acabar, você pode <b>contratar horas extras</b>, <b>aguardar o próximo mês</b> ou <b>antecipar</b> horas (nesse caso, o mês seguinte fica sem suporte).
          </div>
        </div>
      </div>

      <div className="assign" style={{ marginBottom: 18 }}>
        <div className="arow"><span className="ico" style={{ background: "#1F8A5B" }}><ShieldCheck size={16} /></span><span><span className="t">Suporte do Agente</span><br /><span className="s">Manter no ar, corrigir erros e estabilidade. Incluso no seu plano.</span></span></div>
        <div className="arow"><span className="ico" style={{ background: "#3E6FB8" }}><Sparkles size={16} /></span><span><span className="t">Suporte de Melhorias</span><br /><span className="s">Evoluir o agente, novos fluxos e recursos. Orçado à parte.</span></span></div>
      </div>

      <div className="card" style={{ background: "linear-gradient(155deg,var(--crasto-navy),var(--crasto-navy-deep))", color: "#fff", marginBottom: 18 }}>
        <div style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--crasto-blue)", fontWeight: 700 }}>Garantia de treinamento</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "8px 0 6px" }}>90 dias por agente</div>
        <div style={{ color: "rgba(255,255,255,.75)", fontSize: 12.5 }}>Todo agente que entregamos tem 3 meses de treinamento para <b style={{ color: "#fff" }}>falar o seu idioma</b>, ter a <b style={{ color: "#fff" }}>identidade da sua marca</b> e <b style={{ color: "#fff" }}>eliminar erros</b>.</div>
      </div>

      <div className="sec-h"><h2>Meus chamados</h2></div>
      {(data?.tickets ?? []).length === 0 ? <Empty>Você ainda não abriu chamados.</Empty> : (data?.tickets ?? []).map((t) => (
        <div className="lead" key={t.id}><div className="av">#</div><div><div className="nm">{t.subject}</div><div className="mt">{t.status}</div></div></div>
      ))}
    </div>
  );
}
