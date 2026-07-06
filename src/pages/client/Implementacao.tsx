import { FileText, KeyRound, Check } from "lucide-react";
import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";

type Task = { id: string; name: string; planned_start: string; planned_end: string; actual_start: string | null; actual_end: string | null; status: string; sort_order: number };
type Impl = { overall_progress: number; due_date: string | null; status: string; started_at: string | null };
type Pend = { id: string; type: string; description: string; status: string };

const d = (s: string | null) => (s ? new Date(s + "T00:00:00").getTime() : 0);

export default function Implementacao() {
  const tr = useT();
  const { data, loading } = useAsync(async () => {
    const [i, t, p] = await Promise.all([
      services.delivery.implementations.getMine(),
      services.delivery.projectTasks.listMine(),
      services.support.pendingActions.listMine(),
    ]);
    return { impl: i as unknown as Impl | null, tasks: (t as unknown as Task[]) ?? [], pend: (p as unknown as Pend[]) ?? [] };
  }, []);

  if (loading) return <><PageHead eyebrow="Portal do Cliente" title="Minha implementação" /><Empty>Carregando…</Empty></>;
  const impl = data?.impl ?? null;
  const tasks = data?.tasks ?? [];
  const pend = data?.pend ?? [];
  const daysLeft = impl?.due_date ? Math.max(0, Math.ceil((d(impl.due_date) - Date.now()) / 86400000)) : null;

  const starts = tasks.map((t) => d(t.planned_start)).filter(Boolean);
  const ends = tasks.map((t) => d(t.planned_end)).filter(Boolean);
  const t0 = Math.min(...starts, d(impl?.started_at ?? null) || Infinity);
  const t1 = Math.max(...ends, d(impl?.due_date ?? null));
  const span = t1 - t0 || 1;
  const pc = (ts: number) => Math.max(0, Math.min(100, ((ts - t0) / span) * 100));
  const todayPc = pc(Date.now());
  const realColor = (t: Task) => (t.status === "done" ? "#1F8A5B" : t.status === "doing" ? "var(--crasto-text-primary)" : "#B8863A");
  const dot = (s: string) => (s === "done" ? "#1F8A5B" : s === "doing" ? "#3E6FB8" : "#98A2B3");
  const pico = (t: string) => (t === "document" ? <FileText size={18} /> : t === "credential" ? <KeyRound size={18} /> : <Check size={18} />);

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Minha implementação" sub="Acompanhe em tempo real o que a Crasto.AI está montando pra você."
        right={<Pill tone="ok">{tr("Atualiza automaticamente")}</Pill>} />

      <div className="herocard" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div className="lab">{tr("Progresso geral do contrato")}</div>
            <div className="big tnum">{impl?.overall_progress ?? 0}%</div>
            <div style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>{tr("{n} etapas", { n: tasks.length })} · {impl?.status === "delivered" ? tr("entregue") : tr("dentro do prazo")}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>{tr("Prazo de entrega")}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{daysLeft != null ? tr("{n} dias restantes", { n: daysLeft }) : "—"}</div>
            <div style={{ fontSize: 12, color: "var(--crasto-blue)" }}>{tr("SLA de 30 dias")}</div>
          </div>
        </div>
        <div className="track"><span style={{ width: `${impl?.overall_progress ?? 0}%` }} /></div>
      </div>

      <div className="sec-h"><h2>{tr("Cronograma · previsto × realizado")}</h2>
        <span style={{ display: "flex", gap: 16, fontSize: 11.5, fontWeight: 600, color: "var(--crasto-text-body)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 20, height: 7, borderRadius: 4, background: "#B9CDEF" }} />{tr("Previsto")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 20, height: 7, borderRadius: 4, background: "var(--crasto-text-primary)" }} />{tr("Realizado")}</span>
        </span>
      </div>
      {tasks.length > 0 && (
        <div className="gantt" style={{ marginBottom: 26 }}>
          <div className="gaxis"><div>{tr("Etapa")}</div><div className="marks"><span>Início</span><span>Meio</span><span>Entrega</span></div></div>
          {tasks.map((t) => {
            const realEnd = t.actual_end ? d(t.actual_end) : t.actual_start ? Date.now() : 0;
            return (
              <div className="grow" key={t.id}>
                <div className="gname"><span className="gdot" style={{ background: dot(t.status) }} />{t.name}</div>
                <div className="gtrack">
                  <div className="gbar prev" style={{ left: `${pc(d(t.planned_start))}%`, width: `${pc(d(t.planned_end)) - pc(d(t.planned_start))}%` }} />
                  {t.actual_start && realEnd > d(t.actual_start) && (
                    <div className="gbar real" style={{ left: `${pc(d(t.actual_start))}%`, width: `${pc(realEnd) - pc(d(t.actual_start))}%`, background: realColor(t) }} />
                  )}
                </div>
              </div>
            );
          })}
          <div style={{ position: "absolute", top: 34, bottom: 14, width: 2, background: "#EA5455", left: `calc(170px + 18px + (100% - 170px - 36px) * ${todayPc / 100})` }} />
        </div>
      )}

      <div className="sec-h"><h2>{tr("Pendências com você")}</h2>{pend.filter((p) => p.status === "pending").length > 0 && <Pill tone="warn">{tr("{n} aguardando", { n: pend.filter((p) => p.status === "pending").length })}</Pill>}</div>
      {pend.length === 0 ? <Empty>Nenhuma pendência. 🎉</Empty> : pend.map((p) => (
        <div className={"pend" + (p.status === "done" ? " done" : "")} key={p.id}>
          <span className="pico">{pico(p.type)}</span>
          <div><div className="pt">{p.description}</div><div className="ps">{p.status === "done" ? tr("Resolvido · obrigado!") : tr("Solicitado pela equipe Crasto.AI")}</div></div>
          {p.status === "done" ? <Pill tone="ok">{tr("Resolvido")}</Pill> : <button className="crasto-btn crasto-btn--primary crasto-btn--sm pact"><span className="crasto-btn__label">{tr("Resolver agora")}</span></button>}
        </div>
      ))}
    </div>
  );
}
