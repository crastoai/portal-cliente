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
type Mod = { id: string; status: string; url: string | null; rollout_progress: number; label: string | null; monthly_cost: number | null; setup_cost: number | null; contract_date: string | null; vdi: { name: string; description: string | null; category: string | null } | null };

const ICONS: Record<string, JSX.Element> = {
  default: <Search />, whatsapp: <MessageCircle />, marketing: <Send />,
};

type Tom = "green" | "amber" | "red" | "mute" | null;
// Cabeçalho de seção unificado — título + FAROL da seção (dado real) + legenda opcional à direita.
// mute = seção informativa (sem afirmação de saúde); green/amber/red = health check real.
function SecHead({ title, tom = null, caption, icon }: { title: string; tom?: Tom; caption?: string; icon?: JSX.Element }) {
  return (
    <div className="sec-h">
      <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {tom && <span className={"scopedot " + tom} title={tom === "green" ? "OK" : tom === "amber" ? "Atenção" : tom === "red" ? "Crítico" : ""} />}
        {icon}{title}
      </h2>
      {caption && <small style={{ color: "var(--crasto-text-muted)", fontSize: 12 }}>{caption}</small>}
    </div>
  );
}

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
  const [reunioes, setReunioes] = useState<import("../../services/delivery.service").Meeting[]>([]);
  const [reuAberta, setReuAberta] = useState<import("../../services/delivery.service").Meeting | null>(null);
  const [implEvents, setImplEvents] = useState<import("../../services/delivery.service").ImplEvent[]>([]);
  const [implOpen, setImplOpen] = useState(false);
  const [detMod, setDetMod] = useState<Mod | null>(null);
  const [agent, setAgent] = useState<import("../../services/delivery.service").AgentUsage | null>(null);
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
      // Reuniões & minutas (base de conhecimento) — o que a Crasto.AI registrou deste cliente.
      services.delivery.meetings.listMine().then((r) => setReunioes(Array.isArray(r) ? r : [])).catch(() => setReunioes([]));
      // Histórico de implantação (o quê/quando/quem) — abre no card "Implantação".
      services.delivery.implEvents.listMine().then((r) => setImplEvents(Array.isArray(r) ? r : [])).catch(() => setImplEvents([]));
      // Uso REAL do agente de IA (federado do wacrm) — taxa de automação das respostas.
      services.delivery.agentUsage.getMine().then(setAgent).catch(() => setAgent(null));
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
        const numOrNull = (v: any) => (v == null || v === "" ? null : Number(v));
        return { id: r.id, status: r.status, url, rollout_progress: (r as any).rollout_progress ?? 0, label: (r as any).label ?? null, monthly_cost: numOrNull((r as any).monthly_cost), setup_cost: numOrNull((r as any).setup_cost), contract_date: (r as any).contract_date ?? null, vdi: (vmap[r.vdi_module_id] as Mod["vdi"]) ?? null };
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
  // Conta REAL de soluções operando / total no escopo (módulos + serviços) — o KPI "Soluções
  // ativas" passa a bater com a lista de escopo logo abaixo (antes contava só client_modules).
  const escopoAtivos = itensEscopo.filter((it) => tomDoItem(it) === "green").length;
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
  // Abas do dashboard: "Soluções & Serviços" (fase atual) × "Negócios" (CRM+financeiro do cliente,
  // próxima fase). Separar em abas facilita a navegação do dono — pedido do Crasto.
  const [tab, setTab] = useState<"solucoes" | "minhas" | "negocios">("solucoes");
  // Abrir o contrato de prestação de serviço (documento subido pelo admin) — URL assinada do R2.
  const [abrindoContrato, setAbrindoContrato] = useState(false);
  const abrirContrato = async () => {
    const path = self?.contract_doc?.storage_path; if (!path) return;
    setAbrindoContrato(true);
    try { const u = await services.storage.getUrl(path); if (u) window.open(u, "_blank", "noopener"); }
    finally { setAbrindoContrato(false); }
  };

  // Farol da EQUIPE (RH) — real: ninguém acessou = vermelho; alguém nunca acessou = âmbar;
  // todos já acessaram = verde. Nada inventado (deriva de user_sessions).
  const acessos = team?.rows?.filter((u) => u.minutos > 0).length ?? 0;
  const equipeTom: Tom = !team?.rows?.length ? null : acessos === 0 ? "red" : acessos < team.rows.length ? "amber" : "green";
  // Farol do CONTRATO = situação financeira real (faturas). Separado do farol das SOLUÇÕES.
  const contratoTom: Tom = fin ? (fin.status as Tom) : null;

  return (
    <div>
      <div className="phead">
        <div className="ey">{t("Portal do Cliente")}</div>
        <h1>{firstName ? t("Olá, {n} 👋", { n: firstName }) : t("Olá 👋")}</h1>
        <div className="sub">{t("Aqui está o resumo do que a sua IA fez por você.")}</div>
      </div>

      {/* Abas do dashboard — separam o acompanhamento das SOLUÇÕES do painel de NEGÓCIOS do cliente. */}
      <div className="dashtabs" role="tablist">
        <button role="tab" aria-selected={tab === "solucoes"} className={"dashtab" + (tab === "solucoes" ? " on" : "")} onClick={() => setTab("solucoes")}>{t("Soluções & Serviços")}</button>
        <button role="tab" aria-selected={tab === "minhas"} className={"dashtab" + (tab === "minhas" ? " on" : "")} onClick={() => setTab("minhas")}>{t("Minhas soluções")}{mods.length ? <span className="dashtab-cnt">{mods.length}</span> : null}</button>
        <button role="tab" aria-selected={tab === "negocios"} className={"dashtab" + (tab === "negocios" ? " on" : "")} onClick={() => setTab("negocios")}>{t("Negócios")}</button>
      </div>

      {tab === "solucoes" && (<>
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

      {/* KPIs (3): implantação (abre o histórico), soluções ativas (bate com o escopo abaixo),
          contrato de suporte/SLA. */}
      <div className="kpis kpis--3">
        <button className="kpi g ckpi" onClick={() => setImplOpen(true)}><div className="lab">{t("Implantação")}</div><div className="val">{overall}<small>%</small></div><div className="delta">{implEvents.length ? <>{t("ver histórico")} <ArrowRight size={11} /></> : overall >= 100 ? t("Entregue") : t("Em andamento")}</div></button>
        <div className="kpi"><div className="lab">{t("Soluções ativas")}</div><div className="val">{escopoAtivos}<small> / {itensEscopo.length}</small></div><div className="delta">{tiposAtivos || t("no seu plano")}</div></div>
        <button className="kpi ckpi" onClick={() => setSlaOpen(true)}><div className="lab">{t("Contrato de suporte")}</div><div className="val" style={{ fontSize: 20 }}>{overall >= 100 ? t("SLA 48h") : daysLeft != null ? t("{n} dias", { n: daysLeft }) : t("SLA 48h")}</div><div className="delta">{overall >= 100 ? t("saber mais") : t("prazo de implantação")} <ArrowRight size={11} /></div></button>
      </div>

      {/* ═══ SUAS SOLUÇÕES ═══ health check das soluções implementadas (farol próprio). */}
      <div className="scopebox">
        <div className="scopehead"><div>{farolSolucoes && <span className={"scopedot " + farolSolucoes} />}<Activity size={17} /><span>{t("Escopo e situação das soluções")}</span></div><small>{t("Health check das soluções — dado real do contrato e da implantação")}</small></div>
        <div className="scopelist">
          {itensEscopo.length === 0 ? (
            <div className="scopeempty">{t("Nenhuma solução vinculada ao contrato ainda.")}</div>
          ) : itensEscopo.map((item: any, idx: number) => {
            const raw = String(item.rollout_status || item.status || "").toLowerCase();
            const tone = raw === "active" || raw === "done" || raw === "green" ? "green" : raw === "paused" || raw === "red" ? "red" : "amber";
            const label = tone === "green" ? t("Operando") : tone === "red" ? t("Atenção") : t("Em implantação");
            return <div className="scoperow" key={`${item.id || idx}-${idx}`}><span className={`scopedot ${tone}`} /><div><strong>{item.name || t("Solução contratada")}</strong>{item.description && <small>{item.description}</small>}</div><span className={`scopepill ${tone}`}>{label}</span></div>;
          })}
        </div>
      </div>

      {/* ═══ SEU CONTRATO ═══ health check do contrato (situação financeira) — farol próprio,
          separado do farol das soluções. Verde/âmbar/vermelho pela situação real das faturas. */}
      {fin && (
        <>
          <SecHead title={t("Seu contrato")} tom={contratoTom} caption={t("Health check do contrato — situação financeira")} />
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

      {/* Seu atendimento — contrato assinado, horas de suporte e uso de IA (informativo, sem farol de saúde). */}
      <SecHead title={t("Seu atendimento")} tom="mute" caption={t("Suporte, SLA e uso — informativo")} />
      <div className="selfgrid">
        <article className="selfcard">
          <div className="selfico"><FileSignature size={18} /></div>
          <div className="selfbody">
            <span className="selflabel">{t("Contrato")}</span>
            <strong>{self?.contract_doc?.file_name || self?.contract?.title || t("Contrato da Crasto.AI")}</strong>
            <small>{self?.contract_doc ? t("Disponível para download") : self?.contract?.status === "signed" ? t("Assinado") : self?.contract ? t("Em andamento") : t("Ainda não disponível")}</small>
          </div>
          {self?.contract_doc
            ? <button className="selflink" onClick={abrirContrato} disabled={abrindoContrato}>{abrindoContrato ? t("Abrindo…") : t("Abrir")} <ArrowRight size={13} /></button>
            : self?.contract?.url && <a className="selflink" href={self.contract.url} target="_blank" rel="noreferrer">{t("Abrir")} <ArrowRight size={13} /></a>}
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
            <strong className="tnum">{agent?.automationPct != null ? `${agent.automationPct}%` : "—"}</strong>
            <small>{agent?.automationPct != null
              ? t("das respostas foram pela IA · {a} de {tot} · 30 dias", { a: agent.aiMessages ?? 0, tot: (agent.aiMessages ?? 0) + (agent.humanMessages ?? 0) })
              : agent?.hasData
                ? t("sem respostas registradas nos últimos 30 dias")
                : t("Sem atividade do agente nos últimos 30 dias")}</small>
          </div>
          {agent?.automationPct != null && (agent.aiConversations ?? 0) + (agent.humanConversations ?? 0) > 0 && (
            <span className="selflink" style={{ pointerEvents: "none" }} title={t("Conversas conduzidas pela IA vs humano")}>{t("{n} no piloto IA", { n: agent.aiConversations ?? 0 })}</span>
          )}
        </article>
      </div>

      {/* ═══ SUA EQUIPE ═══ tempo conectado REAL (user_sessions do wacrm). Só o dono vê. Farol: ninguém acessou = vermelho; alguém nunca acessou = âmbar; todos acessaram = verde. */}
      {team?.scope === "team" && team.rows.length > 0 && (
        <div className="scopebox">
          <div className="scopehead"><div>{equipeTom && <span className={"scopedot " + equipeTom} />}<Headphones size={17} /><span>{t("Sua equipe · tempo conectado")}</span></div><small>{t("Últimos 30 dias · dado real de acesso à plataforma")}</small></div>
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

      {/* Reuniões & base de conhecimento — histórico registrado pela Crasto.AI (informativo). */}
      {reunioes.length > 0 && (
        <div className="scopebox">
          <div className="scopehead"><div><span className="scopedot mute" /><FileSignature size={17} /><span>{t("Reuniões & base de conhecimento")}</span></div><small>{t("Histórico das nossas reuniões e do que foi combinado")}</small></div>
          <div className="scopelist">
            {reunioes.map((r) => (
              <button className="scoperow scoperow--btn" key={r.id} onClick={() => setReuAberta(r)}>
                <span className="scopedot green" />
                <div><strong>{r.title}</strong><small>{new Date(r.meeting_at).toLocaleDateString("pt-BR")} · {new Date(r.meeting_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}{r.attendees ? ` · ${r.attendees}` : ""}</small></div>
                <span className="scopepill mute">{r.transcript ? t("ver minuta") : t("ver")} <ArrowRight size={12} style={{ verticalAlign: -2 }} /></span>
              </button>
            ))}
          </div>
        </div>
      )}

      </>)}

      {/* Aba MINHAS SOLUÇÕES — só os cards de acesso do cliente. Separado do acompanhamento para
          não virar bagunça quando o cliente tem várias soluções (pedido do Crasto). */}
      {tab === "minhas" && (
        loading ? (
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
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setDetMod(m)}><span className="crasto-btn__label">{t("Detalhes")}</span></button>
                        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={!m.url} title={m.url ? t("Abrir a solução") : t("Link em configuração")} onClick={() => m.url && window.open(m.url, "_blank", "noopener")}><span className="crasto-btn__label">{t("Acessar")}</span></button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Aba NEGÓCIOS — CRM + financeiro do PRÓPRIO negócio do cliente (resultados que as soluções
          geram). Próxima fase: nada fictício ainda, então mostra o que vem, sem números inventados. */}
      {tab === "negocios" && (
        <div className="scopebox">
          <div className="scopehead"><div><span className="scopedot mute" /><Activity size={17} /><span>{t("Negócios do cliente")}</span></div><small>{t("Em construção · próxima fase")}</small></div>
          <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--crasto-text-muted)", fontSize: 14, lineHeight: 1.7 }}>
            <p style={{ fontWeight: 600, color: "var(--crasto-text-primary)", marginBottom: 6 }}>{t("Painel de negócios em construção.")}</p>
            <p style={{ maxWidth: 520, margin: "0 auto" }}>{t("Aqui você vai acompanhar os resultados que as suas soluções geram: leads e conversas do WhatsApp CRM, oportunidades e faturamento do seu negócio — em tempo real, sem dados fictícios.")}</p>
          </div>
        </div>
      )}

      <Modal title={t("Histórico de implantação")} open={implOpen} onClose={() => setImplOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 14 }}>
          <div style={{ color: "var(--crasto-text-muted)", fontSize: 12.5, marginBottom: 6 }}>{t("O que foi implantado, quando e por quem — registrado pela Crasto.AI.")}</div>
          {implEvents.length === 0 ? (
            <div style={{ color: "var(--crasto-text-muted)", padding: "8px 0" }}>{t("Ainda não há marcos de implantação registrados.")}</div>
          ) : implEvents.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: "1px solid var(--crasto-border, rgba(0,0,0,.08))" }}>
              <div style={{ fontSize: 18, lineHeight: 1.2 }}>✅</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{e.title}{e.module_name ? <span style={{ fontWeight: 400, color: "var(--crasto-text-muted)" }}> · {e.module_name}</span> : null}</div>
                <div style={{ fontSize: 12.5, color: "var(--crasto-text-muted)", marginTop: 2 }}>
                  {new Date(e.happened_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {e.performed_by_name ? ` · ${t("por")} ${e.performed_by_name}` : ""}
                </div>
                {e.detail && <div style={{ fontSize: 13, marginTop: 4, whiteSpace: "pre-wrap" }}>{e.detail}</div>}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal title={reuAberta?.title || t("Reunião")} open={!!reuAberta} onClose={() => setReuAberta(null)} wide>
        {reuAberta && (
          <div className="meetdoc">
            <div className="meetdoc-meta">
              {new Date(reuAberta.meeting_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              {reuAberta.created_by_name ? ` · ${t("registrado por")} ${reuAberta.created_by_name}` : ""}
            </div>
            {reuAberta.attendees && (
              <div className="meetdoc-sec"><span className="meetdoc-lab">{t("Participantes")}</span><div className="meetdoc-attendees">{reuAberta.attendees}</div></div>
            )}
            {reuAberta.summary && (
              <div className="meetdoc-sec"><span className="meetdoc-lab">{t("Resumo")}</span>
                <div className="meetdoc-body">{reuAberta.summary.split(/\n\s*\n/).map((p, i) => <p key={i}>{p.trim()}</p>)}</div>
              </div>
            )}
            {reuAberta.transcript && (
              <div className="meetdoc-sec"><span className="meetdoc-lab">{t("Minuta / transcrição")}</span>
                <div className="meetdoc-transcript">{reuAberta.transcript.split(/\n\s*\n/).map((p, i) => <p key={i}>{p.trim()}</p>)}</div>
              </div>
            )}
            {!reuAberta.summary && !reuAberta.transcript && <div style={{ color: "var(--crasto-text-muted)" }}>{t("Sem resumo ou minuta registrados nesta reunião.")}</div>}
          </div>
        )}
      </Modal>

      {/* Detalhes da solução — custo por módulo, data do contrato e os marcos daquela solução.
          Dado REAL: o que a Crasto.AI não preencheu aparece como "—", nunca inventado. */}
      <Modal title={detMod ? (detMod.label || detMod.vdi?.name || t("Solução")) : t("Solução")} open={!!detMod} onClose={() => setDetMod(null)}>
        {detMod && (() => {
          const marcos = implEvents.filter((e) => e.client_module_id === detMod.id);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{t("Custo mensal")}</div><div style={{ fontSize: 18, fontWeight: 700, marginTop: 3 }}>{detMod.monthly_cost != null ? money(detMod.monthly_cost) : "—"}</div></div>
                <div><div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{t("Custo de implantação")}</div><div style={{ fontSize: 18, fontWeight: 700, marginTop: 3 }}>{detMod.setup_cost != null ? money(detMod.setup_cost) : "—"}</div></div>
                <div><div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{t("Data do contrato")}</div><div style={{ fontSize: 15, fontWeight: 600, marginTop: 5 }}>{detMod.contract_date ? new Date(detMod.contract_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</div></div>
                <div><div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{t("Implantação")}</div><div style={{ fontSize: 15, fontWeight: 600, marginTop: 5 }}>{detMod.rollout_progress}%</div></div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("Histórico de implantação desta solução")}</div>
                {marcos.length === 0 ? (
                  <div style={{ color: "var(--crasto-text-muted)", fontSize: 13 }}>{t("Ainda não há marcos registrados para esta solução.")}</div>
                ) : marcos.map((e) => (
                  <div key={e.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid var(--crasto-border, rgba(0,0,0,.08))" }}>
                    <span style={{ fontSize: 15 }}>✅</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.title}</div>
                      <div style={{ fontSize: 12, color: "var(--crasto-text-muted)", marginTop: 1 }}>{new Date(e.happened_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}{e.performed_by_name ? ` · ${t("por")} ${e.performed_by_name}` : ""}</div>
                      {e.detail && <div style={{ fontSize: 12.5, marginTop: 3, whiteSpace: "pre-wrap" }}>{e.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Modal>

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
