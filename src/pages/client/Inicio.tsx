import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Search, Send, Wallet, ArrowRight, AlertTriangle, Clock, FileSignature, Headphones, Bot, Activity } from "lucide-react";
import { services } from "../../services";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { money } from "../../ui/ui";
import Modal from "../../ui/Modal";
import { summarizeFaturas, type Fatura, type FaturaSummary } from "../../lib/faturas";

type Health = { status: "green" | "amber" | "red"; message: string | null };
type Impl = { overall_progress: number; due_date: string | null; status: string };
type Mod = { id: string; status: string; url: string | null; rollout_progress: number; label: string | null; vdi: { name: string; description: string | null; category: string | null } | null };

const ICONS: Record<string, JSX.Element> = {
  default: <Search />, whatsapp: <MessageCircle />, marketing: <Send />,
};

export default function Inicio() {
  const { profile } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [health, setHealth] = useState<Health | null>(null);
  const [impl, setImpl] = useState<Impl | null>(null);
  const [mods, setMods] = useState<Mod[]>([]);
  const [fin, setFin] = useState<FaturaSummary | null>(null);
  const [self, setSelf] = useState<any>(null);
  const [team, setTeam] = useState<{ scope: string; rows: { id: string; email: string; full_name: string | null; online: boolean; sessoes: number; minutos: number; ultimo: string | null }[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [h, i, cm, creds, inv, ss] = await Promise.all([
        services.delivery.systemHealth.getMine(),
        services.delivery.implementations.getMine(),
        services.delivery.clientModules.listMine(),
        services.delivery.moduleCredentials.listMine().catch(() => [] as any[]),
        services.billing.invoices.listMine().catch(() => [] as any[]),
        services.delivery.selfService.getMine().catch(() => null),
      ]);
      setSelf(ss);
      // Tempo conectado da equipe (RH) — só faz sentido para o dono; membro recebe scope 'self'.
      services.delivery.teamUsage.getMine().then(setTeam).catch(() => setTeam(null));
      setFin(summarizeFaturas((inv as unknown as Fatura[]) ?? []));
      const rows = cm ?? [];
      const ids = rows.map((r) => r.vdi_module_id);
      let vmap: Record<string, any> = {};
      if (ids.length) {
        const vm = await services.catalog.vdiModules.listByIds(ids, "id,name,description,category,external_url,crm_solution");
        vmap = Object.fromEntries((vm as { id: string }[]).map((v) => [v.id, v]));
      }
      const cmap = Object.fromEntries((creds as any[]).map((c) => [c.client_module_id, c]));
      setHealth((h as unknown as Health) ?? null);
      setImpl((i as unknown as Impl) ?? null);
      setMods(rows.map((r) => {
        const cred = cmap[r.id]; // acesso por instância
        const url = cred?.access_url || vmap[r.vdi_module_id]?.external_url || null;
        return { id: r.id, status: r.status, url, rollout_progress: (r as any).rollout_progress ?? 0, label: (r as any).label ?? null, vdi: (vmap[r.vdi_module_id] as Mod["vdi"]) ?? null };
      }));
      setLoading(false);
    })();
  }, []);

  const firstName = (profile?.full_name || "").split(" ")[0] || "";
  const daysLeft = impl?.due_date
    ? Math.max(0, Math.ceil((new Date(impl.due_date).getTime() - Date.now()) / 86400000))
    : null;
  const overall = mods.length ? Math.round(mods.reduce((s, m) => s + (m.rollout_progress || 0), 0) / mods.length) : (impl?.overall_progress ?? 0);

  // FAROL GRANDE = agregado REAL dos faróis das soluções (o pior vence). Antes era
  // `health?.status ?? "green"` → verde fixo quando não havia dado (fictício). Regra do Crasto:
  // nada inventado. Se o admin registrou um system_health pior, ele também puxa o farol.
  const itensEscopo = [...(self?.modules || []), ...(self?.services || [])];
  const tomDoItem = (item: any): "green" | "amber" | "red" => {
    const raw = String(item.rollout_status || item.status || "").toLowerCase();
    return raw === "active" || raw === "done" || raw === "green" ? "green" : raw === "paused" || raw === "red" ? "red" : "amber";
  };
  const piorDe = (tons: string[]) => tons.includes("red") ? "red" : tons.includes("amber") ? "amber" : "green";
  const farolSolucoes = itensEscopo.length ? piorDe(itensEscopo.map(tomDoItem)) : null;
  // Combina com o health que o admin tiver registrado (se houver); sem nada, cai no farol das
  // soluções; sem soluções, "—" honesto em vez de verde inventado.
  const lit: "green" | "amber" | "red" | null = health?.status
    ? piorDe([health.status, farolSolucoes || "green"]) as any
    : farolSolucoes;

  // Subcategoria REAL da solução: agente (crm_solution), SaaS (app com URL), ou serviço/
  // consultoria (client_services). Deriva da natureza do item — não é rótulo inventado.
  const tipoConta = { agente: 0, saas: 0, servico: 0 };
  for (const m of mods) { if (m.status !== "active") continue; if ((m.vdi as any)?.crm_solution) tipoConta.agente++; else if ((m.vdi as any)?.external_url) tipoConta.saas++; else tipoConta.saas++; }
  for (const s of (self?.services || [])) { if ((s as any).status === "active" || (s as any).status === "delivered") tipoConta.servico++; }
  const tiposAtivos = [
    tipoConta.agente ? t("{n} agente", { n: tipoConta.agente }) : null,
    tipoConta.saas ? t("{n} SaaS", { n: tipoConta.saas }) : null,
    tipoConta.servico ? t("{n} consultoria", { n: tipoConta.servico }) : null,
  ].filter(Boolean).join(" · ");

  const [slaOpen, setSlaOpen] = useState(false);

  return (
    <div>
      <div className="phead">
        <div className="ey">{t("Portal do Cliente")}</div>
        <h1>{firstName ? t("Olá, {n} 👋", { n: firstName }) : t("Olá 👋")}</h1>
        <div className="sub">{t("Aqui está o resumo do que a sua IA fez por você.")}</div>
      </div>

      {/* Farol — a luz é a MÉDIA real dos faróis das soluções (o pior vence), não mais verde fixo. */}
      <div className="farol">
        <div className="lights">
          <span className={"fl red" + (lit === "red" ? " on" : "")} />
          <span className={"fl amber" + (lit === "amber" ? " on" : "")} />
          <span className={"fl green" + (lit === "green" ? " on" : "")} />
        </div>
        <div className="txt">
          <div className="h">
            {lit === "green" ? t("Sistema no ar") : lit === "amber" ? t("Ajuste em andamento") : lit === "red" ? t("Atenção necessária") : t("Aguardando ativação")}
            <span className={"pill " + (lit === "green" ? "ok" : lit === "amber" ? "warn" : lit === "red" ? "info" : "mute")}>
              <span className="d" />{lit === "green" ? t("Operando") : lit === "amber" ? t("Corrigindo") : lit === "red" ? t("Suporte atuando") : t("Sem solução ativa")}
            </span>
          </div>
          <div className="s">{health?.message || (lit === "green" ? t("Tudo funcionando normalmente.") : lit ? t("A média das suas soluções indica um ponto de atenção — veja abaixo.") : t("Assim que uma solução for ativada, o farol reflete a operação dela."))}</div>
        </div>
      </div>

      {/* KPIs (3): implantação real, soluções ativas com SUBCATEGORIA, contrato de suporte/SLA.
          O antigo card "Suporte · Ativo" saiu — era texto fixo (o farol já diz que está no ar). */}
      <div className="kpis kpis--3">
        <div className="kpi g"><div className="lab">{t("Implantação")}</div><div className="val">{overall}<small>%</small></div><div className="delta">{overall >= 100 ? t("Entregue") : t("Em andamento")}</div></div>
        <div className="kpi"><div className="lab">{t("Soluções ativas")}</div><div className="val">{mods.filter(m => m.status === "active").length}<small> / {mods.length}</small></div><div className="delta">{tiposAtivos || t("no seu plano")}</div></div>
        <button className="kpi ckpi" onClick={() => setSlaOpen(true)}><div className="lab">{t("Contrato de suporte")}</div><div className="val" style={{ fontSize: 20 }}>{overall >= 100 ? t("SLA 48h") : daysLeft != null ? t("{n} dias", { n: daysLeft }) : t("SLA 48h")}</div><div className="delta">{overall >= 100 ? t("saber mais") : t("prazo de implantação")} <ArrowRight size={11} /></div></button>
      </div>

      {/* Seu contrato — health-check financeiro */}
      {fin && (
        <>
          <div className="sec-h"><h2>{t("Seu contrato")}</h2></div>
          <div className={"finhealth fh-" + fin.status}>
            <div className="fh-lead">
              <span className="fh-ico">{fin.status === "red" ? <AlertTriangle size={18} /> : <Wallet size={18} />}</span>
              <div className="fh-txt">
                <div className="fh-title">{fin.status === "red" ? t("Você tem fatura em atraso") : fin.status === "amber" ? t("Fatura vencendo em breve") : t("Faturas em dia")}</div>
                <div className="fh-sub">
                  {fin.status === "red" ? t("{n} fatura(s) em atraso — {v}", { n: fin.overdue.length, v: money(fin.overdueTotal) })
                    : fin.next ? t("Próxima: {v} · vence em {d}", { v: money(fin.next.amount), d: fin.next.due_date ? new Date(fin.next.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—" })
                    : t("Nenhuma fatura em aberto no momento.")}
                </div>
              </div>
              <button className="crasto-btn crasto-btn--primary crasto-btn--sm fh-cta" onClick={() => navigate("/app/financeiro")}>
                <span className="crasto-btn__label">{t("Ver faturas e pagar")}</span>
                <span className="crasto-btn__icon"><ArrowRight size={14} /></span>
              </button>
            </div>
            <div className="fh-tiles">
              <div className="fh-tile"><span className="l">{t("Em aberto")}</span><b className="tnum">{money(fin.openTotal)}</b><small>{t("{n} fatura(s)", { n: fin.open.length })}</small></div>
              <div className="fh-tile"><span className="l">{t("Próximo vencimento")}</span><b className="tnum">{fin.next?.due_date ? new Date(fin.next.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</b><small>{fin.daysToNext == null ? "—" : fin.daysToNext < 0 ? t("vencida") : fin.daysToNext === 0 ? t("hoje") : t("em {n} dia(s)", { n: fin.daysToNext })}</small></div>
              <div className={"fh-tile" + (fin.overdue.length ? " is-red" : "")}><span className="l">{t("Em atraso")}</span><b className="tnum">{money(fin.overdueTotal)}</b><small>{t("{n} fatura(s)", { n: fin.overdue.length })}</small></div>
              <div className="fh-tile fh-soon"><span className="l">{t("Pagamento")}</span><b>{t("Boleto · Pix")}</b><small><Clock size={11} style={{ verticalAlign: -1 }} /> {t("Em breve")}</small></div>
            </div>
          </div>
        </>
      )}

      {/* Fase 4 — autoatendimento: uma leitura única do contrato e da operação. */}
      <div className="sec-h"><h2>{t("Seu atendimento")}</h2></div>
      <div className="selfgrid">
        <article className="selfcard">
          <div className="selfico"><FileSignature size={18} /></div>
          <div className="selfbody">
            <span className="selflabel">{t("Contrato")}</span>
            <strong>{self?.contract?.title || t("Contrato da Crasto.AI")}</strong>
            <small>{self?.contract?.status === "signed" ? t("Assinado") : self?.contract ? t("Em andamento") : t("Ainda não disponível")}</small>
          </div>
          {self?.contract?.url && <a className="selflink" href={self.contract.url} target="_blank" rel="noreferrer">{t("Abrir")} <ArrowRight size={13} /></a>}
        </article>
        <article className="selfcard">
          <div className="selfico"><Headphones size={18} /></div>
          <div className="selfbody">
            <span className="selflabel">{t("Horas de suporte")}</span>
            <strong className="tnum">{self?.support ? `${self.support.used_hours}h / ${self.support.plan_hours}h` : "—"}</strong>
            <small>{self?.support ? t("{n}h disponíveis", { n: self.support.balance }) : t("Sem plano de horas registrado")}</small>
          </div>
          <button className="selflink" onClick={() => navigate("/app/suporte")}>{t("Detalhes")} <ArrowRight size={13} /></button>
        </article>
        <article className="selfcard">
          <div className="selfico"><Bot size={18} /></div>
          <div className="selfbody">
            <span className="selflabel">{t("Uso dos agentes de IA")}</span>
            <strong className="tnum">{Number(self?.ai?.records || 0) > 0 ? Number(self.ai.tokens_in || 0).toLocaleString("pt-BR") : "—"}</strong>
            <small>{Number(self?.ai?.records || 0) > 0 ? t("tokens de entrada medidos neste mês") : t("A duração em horas ainda não é medida")}</small>
          </div>
        </article>
      </div>

      <div className="scopebox">
        <div className="scopehead"><div><Activity size={17} /><span>{t("Escopo e situação das soluções")}</span></div><small>{t("Dados reais do seu contrato e da implantação")}</small></div>
        <div className="scopelist">
          {[...(self?.modules || []), ...(self?.services || [])].length === 0 ? (
            <div className="scopeempty">{t("Nenhuma solução vinculada ao contrato ainda.")}</div>
          ) : [...(self?.modules || []), ...(self?.services || [])].map((item: any, idx: number) => {
            const raw = String(item.rollout_status || item.status || "").toLowerCase();
            const tone = raw === "active" || raw === "done" || raw === "green" ? "green" : raw === "paused" || raw === "red" ? "red" : "amber";
            const label = tone === "green" ? t("Operando") : tone === "red" ? t("Atenção") : t("Em implantação");
            return <div className="scoperow" key={`${item.id || idx}-${idx}`}><span className={`scopedot ${tone}`} /><div><strong>{item.name || t("Solução contratada")}</strong>{item.description && <small>{item.description}</small>}</div><span className={`scopepill ${tone}`}>{label}</span></div>;
          })}
        </div>
      </div>

      {/* Módulos */}
      {/* Sua equipe — tempo conectado REAL (user_sessions do wacrm). Só o dono vê a equipe. */}
      {team?.scope === "team" && team.rows.length > 0 && (
        <div className="scopebox">
          <div className="scopehead"><div><Headphones size={17} /><span>{t("Sua equipe · tempo conectado")}</span></div><small>{t("Últimos 30 dias · dado real de acesso à plataforma")}</small></div>
          <div className="scopelist">
            {team.rows.map((u) => {
              const h = Math.floor(u.minutos / 60), m = u.minutos % 60;
              const tempo = u.minutos === 0 ? t("nunca acessou") : h > 0 ? `${h}h ${m}min` : `${m}min`;
              const quando = !u.ultimo ? t("nunca") : (() => { const d = Math.floor((Date.now() - new Date(u.ultimo).getTime()) / 3600000); return d < 1 ? t("agora há pouco") : d < 24 ? t("há {n}h", { n: d }) : new Date(u.ultimo).toLocaleDateString("pt-BR"); })();
              return (
                <div className="scoperow" key={u.id}>
                  <span className={"scopedot " + (u.online ? "green" : u.minutos > 0 ? "amber" : "red")} />
                  <div><strong>{u.full_name || u.email}{u.online && <span className="dot-online" title={t("online agora")} />}</strong><small>{u.email} · {t("último acesso")} {quando}</small></div>
                  <span className="scopepill mute">{u.online ? t("online") : tempo}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="sec-h"><h2>{t("Minhas soluções")}</h2></div>
      {loading ? (
        <div className="empty">{t("Carregando…")}</div>
      ) : mods.length === 0 ? (
        <div className="empty"><p><strong>{t("Nenhuma solução ativa ainda.")}</strong> {t("Assim que a Crasto.AI liberar suas soluções, elas aparecem aqui.")}</p></div>
      ) : (
        <div className="mods">
          {mods.map((m) => {
            const cat = (m.vdi?.category || "").toLowerCase();
            const icon = cat.includes("atend") ? ICONS.whatsapp : cat.includes("market") ? ICONS.marketing : ICONS.default;
            const st = m.status === "active" ? "ok" : m.status === "implementing" ? "warn" : "info";
            const stl = m.status === "active" ? t("Ativo") : m.status === "implementing" ? t("Em implementação") : m.status;
            return (
              <div className="mod" key={m.id}>
                <div className="cover"><div className="glow" />{icon}</div>
                <div className="body">
                  <h3>{m.label || m.vdi?.name || t("Módulo")}</h3>
                  <p>{m.vdi?.description || t("Solução de IA da Crasto.AI.")}</p>
                  <div className="foot">
                    <span className={"pill " + st}><span className="d" />{stl}</span>
                    <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={!m.url} title={m.url ? t("Abrir a solução") : t("Link em configuração")} onClick={() => m.url && window.open(m.url, "_blank", "noopener")}><span className="crasto-btn__label">{t("Acessar")}</span></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Contrato de suporte — a política de SLA vigente (48h úteis / fora do horário à parte). */}
      <Modal title={t("Contrato de suporte")} open={slaOpen} onClose={() => setSlaOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 14, lineHeight: 1.6 }}>
          <div><strong>{t("Tempo de resposta (SLA)")}</strong><br />{t("Demandas abertas em horário comercial são atendidas em até 48 horas (2 dias úteis).")}</div>
          <div><strong>{t("Horário de atendimento")}</strong><br />{t("Segunda a sexta, em horário comercial. Demandas fora desse horário não entram no SLA.")}</div>
          <div><strong>{t("Atendimento fora do horário")}</strong><br />{t("Sob demanda e cobrado à parte: R$ 380 por hora.")}</div>
          <div style={{ paddingTop: 8, borderTop: "1px solid var(--crasto-border-soft)", color: "var(--crasto-text-muted)", fontSize: 12.5 }}>
            {t("Política de suporte da Crasto.AI vigente. Para abrir uma demanda, use a tela de Suporte & Ajuda.")}
          </div>
        </div>
      </Modal>
    </div>
  );
}
