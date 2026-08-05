import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Search, Send, Wallet, ArrowRight, AlertTriangle, Clock, FileSignature, Headphones, Bot, Activity } from "lucide-react";
import { services } from "../../services";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { money } from "../../ui/ui";
import Modal from "../../ui/Modal";
import { summarizeFaturas, type Fatura, type FaturaSummary } from "../../lib/faturas";
import { allowedScreens } from "../../lib/screens";

type Health = { status: "green" | "amber" | "red"; message: string | null };
type Impl = { overall_progress: number; due_date: string | null; status: string };
type Mod = { id: string; status: string; url: string | null; rollout_progress: number; label: string | null; monthly_cost: number | null; setup_cost: number | null; contract_date: string | null; isCrm: boolean; mode: string; vdi: { name: string; description: string | null; category: string | null } | null };

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
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [self, setSelf] = useState<any>(null);
  const [team, setTeam] = useState<{ scope: string; rows: { id: string; email: string; full_name: string | null; online: boolean; sessoes: number; minutos: number; ultimo: string | null }[] } | null>(null);
  const [reunioes, setReunioes] = useState<import("../../services/delivery.service").Meeting[]>([]);
  const [reuAberta, setReuAberta] = useState<import("../../services/delivery.service").Meeting | null>(null);
  const [implEvents, setImplEvents] = useState<import("../../services/delivery.service").ImplEvent[]>([]);
  const [implOpen, setImplOpen] = useState(false);
  const [detMod, setDetMod] = useState<Mod | null>(null);
  const [agent, setAgent] = useState<import("../../services/delivery.service").AgentUsage | null>(null);
  const [cock, setCock] = useState<import("../../services/delivery.service").CockpitMine | null>(null);
  // Defesa em profundidade: financeiro/negócios do Início só para quem tem a permissão "Financeiro"
  // (dono ou membro liberado). Começa false para o membro nunca ver nem por um instante; o backend
  // (my_faturas + pode_ver_financeiro) já protege o dado, isto só limpa a tela.
  const [podeFin, setPodeFin] = useState(false);
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
      // COCKPIT · Meus Resultados (Fase 1) — métricas antes×depois (depois ao vivo do wacrm),
      // conquistas e jornada. Sem CRM/atividade → o próprio endpoint devolve null → a tela mostra "—".
      services.delivery.cockpit.getMine().then(setCock).catch(() => setCock(null));
      // Permissão financeira (dono sempre; membro só se liberado) — gate do bloco financeiro/negócios.
      services.identity.access.myScreens().then((s) => setPodeFin(allowedScreens(s as string[] | null).has("financeiro"))).catch(() => setPodeFin(false));
      const invRows = (inv as unknown as Fatura[]) ?? [];
      setFaturas(invRows);
      setFin(summarizeFaturas(invRows));
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
        return { id: r.id, status: r.status, url, rollout_progress: (r as any).rollout_progress ?? 0, label: (r as any).label ?? null, monthly_cost: numOrNull((r as any).monthly_cost), setup_cost: numOrNull((r as any).setup_cost), contract_date: (r as any).contract_date ?? null, isCrm: !!(r as any).crm_url, mode: (r as any).access_mode || "link", vdi: (vmap[r.vdi_module_id] as Mod["vdi"]) ?? null };
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
  // Status FIEL de cada item, pela fonte certa e sem rótulo fictício:
  //  • módulo  → rollout_status (delivered=Operando · in_progress=Em implantação · on_hold=Em espera)
  //  • serviço → client_services.status (delivered=Concluído · in_progress=Em execução ·
  //              scheduled=Agendado · active=Ativo). "active" NÃO é verde: é só "contratado", não
  //              entregue — reflete exatamente o que o admin definir no detalhe do cliente.
  const statusInfo = (item: any): { tom: "green" | "amber" | "red"; label: string } => {
    const raw = String((item.kind === "service" ? item.status : (item.rollout_status || item.status)) || "").toLowerCase();
    if (item.kind === "service") {
      if (raw === "delivered" || raw === "done") return { tom: "green", label: t("Concluído") };
      if (raw === "in_progress") return { tom: "amber", label: t("Em execução") };
      if (raw === "scheduled") return { tom: "amber", label: t("Agendado") };
      if (raw === "cancelled" || raw === "canceled" || raw === "paused") return { tom: "red", label: t("Pausado") };
      if (raw === "active") return { tom: "amber", label: t("Ativo") };
      return { tom: "amber", label: raw ? item.status : "—" };
    }
    // módulo AGENTE (WhatsApp CRM): a FONTE CERTA do status é o console (wacrm), federado como
    // agent_status. Só cai no rollout_status do portal se o console não respondeu (agent_status null).
    if (item.agent_status === "live") return { tom: "green", label: t("No ar") };
    if (item.agent_status === "implanting") return { tom: "amber", label: t("Em implantação") };
    // demais módulos — a implantação real vem do rollout_status; o progresso 100% é reforço.
    if (raw === "delivered" || raw === "done" || raw === "live" || raw === "green") return { tom: "green", label: t("Operando") };
    if (raw === "on_hold" || raw === "paused" || raw === "red") return { tom: "red", label: t("Em espera") };
    if (raw === "in_progress" || raw === "amber") return { tom: "amber", label: t("Em implantação") };
    if (Number(item.rollout_progress || 0) >= 100) return { tom: "green", label: t("Operando") };
    return { tom: "amber", label: t("Em implantação") };
  };
  const piorDe = (tons: string[]) => tons.includes("red") ? "red" : tons.includes("amber") ? "amber" : "green";
  const farolSolucoes = itensEscopo.length ? piorDe(itensEscopo.map((it) => statusInfo(it).tom)) : null;
  // Conta REAL de soluções operando / total no escopo (módulos + serviços) — o KPI "Soluções
  // ativas" passa a bater com a lista de escopo logo abaixo (antes contava só client_modules).
  const escopoAtivos = itensEscopo.filter((it) => statusInfo(it).tom === "green").length;
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
  const [tab, setTab] = useState<"resultados" | "solucoes" | "minhas" | "negocios">("resultados");
  // Abrir o contrato de prestação de serviço (documento subido pelo admin) — URL assinada do R2.
  const [abrindoContrato, setAbrindoContrato] = useState(false);
  // Abrir uma solução: o WhatsApp CRM abre DENTRO do portal (/app/crm → seletor de agente +
  // embed, sessão do usuário logado), módulos embed/sso também embarcam; só link externo real
  // abre em nova aba. Nunca mandar o CRM para uma URL externa.
  const abrirSolucao = (m: Mod) => {
    if (m.isCrm) { navigate("/app/crm"); return; }
    if (m.mode === "embed" || m.mode === "sso") { navigate(`/app/m/${m.id}`); return; }
    if (m.url) window.open(m.url, "_blank", "noopener");
  };
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

  // ── COCKPIT · Meus Resultados (Fase 1) — formatação HONESTA do dado real ──
  // Nunca inventa: valor null → "—". tempo em s/min/h; % com sufixo. O "antes" só aparece
  // quando existir (Baseline de Entrada, item 1.3); senão mostra a evolução (trend).
  const fmtSeg = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}min` : `${(s / 3600).toFixed(1)}h`);
  const fmtMetric = (m: any, v: number | null) => (v == null ? "—" : m.key === "tempo_resposta" ? fmtSeg(v) : m.unidade === "%" ? `${v}%` : Number(v).toLocaleString("pt-BR"));
  const deltaMetric = (m: any) =>
    m.antes != null ? `${t("antes")} ${fmtMetric(m, m.antes)}${m.fonte_antes ? " · " + m.fonte_antes : ""}`
      : m.trend != null ? `${m.trend > 0 ? "▲" : m.trend < 0 ? "▼" : ""} ${Math.abs(m.trend)}% ${t("vs. período anterior")}`
        : m.depois == null ? t("sem atividade ainda") : t("medido ao vivo");
  const conquistaTom = (c: any): Tom => { const r = String(c.rollout_status || c.status || "").toLowerCase(); return ["delivered", "done", "live"].includes(r) ? "green" : ["on_hold", "paused", "cancelled", "canceled"].includes(r) ? "red" : "amber"; };

  // ── ENTREGAS & IMPLANTAÇÃO (Fase 2) — Gantt planejado×realizado + FAROL DE PRAZO por solução.
  // Tudo derivado do dado real (início/previsão/entrega real/progresso). Sem fonte = "—".
  const ymd2 = (x: any) => (x ? String(x).slice(0, 10) : "");
  const diasEntre = (a?: string, b?: string) => (!a || !b ? null : Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000));
  const FAROL_COR: Record<string, string> = { green: "#1F8A5B", amber: "#B54708", red: "#B42318", mute: "#98A2B3" };
  const brData = (iso?: string) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "—");
  const brDataHora = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  const entregaInfo = (m: any, hoje: string) => {
    const inicio = ymd2(m.rollout_start) || ymd2(m.contract_date) || ymd2(m.activated_at);
    const previsao = ymd2(m.rollout_due);
    const entregaReal: string | null = m.delivered_at || null;
    const prog = Number(m.rollout_progress || 0);
    const st = String(m.rollout_status || "").toLowerCase();
    const entregue = !!entregaReal || st === "delivered" || prog >= 100;
    let tom: Tom = "green", label = t("No prazo");
    if (st === "on_hold") { tom = "red"; label = t("Em espera"); }
    else if (entregue) {
      const d = entregaReal && previsao ? diasEntre(previsao, ymd2(entregaReal)) : null;
      if (d != null && d > 0) { tom = "amber"; label = t("Entregue {n}d depois", { n: d }); }
      else { tom = "green"; label = t("Entregue no prazo"); }
    } else if (previsao) {
      const atraso = diasEntre(previsao, hoje);
      if (atraso != null && atraso > 0) { tom = "red"; label = t("Atrasado {n}d", { n: atraso }); }
      else if (atraso != null && atraso >= -5) { tom = "amber"; label = t("Faltam {n}d", { n: -atraso }); }
    }
    let meta: number | null = null;
    if (!entregue && inicio && previsao) { const tot = diasEntre(inicio, previsao), dec = diasEntre(inicio, hoje); if (tot && tot > 0 && dec != null) meta = Math.max(0, Math.min(100, Math.round((dec / tot) * 100))); }
    return { inicio, previsao, entregaReal, prog: entregue ? 100 : prog, tom, label, meta, temData: !!(inicio || previsao || entregaReal) };
  };

  return (
    <div>
      <div className="phead">
        <div className="ey">{t("Portal do Cliente")}</div>
        <h1>{firstName ? t("Olá, {n} 👋", { n: firstName }) : t("Olá 👋")}</h1>
        {/* Etiquetas de identidade (Item 1): cargo + empresa — dado real do cadastro de Pessoas/Sócios.
            Sem cargo cadastrado p/ o e-mail do logado → só a empresa; sem org → nada (nunca inventa). */}
        {(cock?.identity?.cargo || cock?.identity?.org_name) && (
          <div className="ident-chips">
            {cock.identity.cargo && <span className="ident-chip is-role">{cock.identity.cargo}</span>}
            {cock.identity.org_name && <span className="ident-chip">{cock.identity.org_name}</span>}
          </div>
        )}
        <div className="sub">{t("Aqui está o resumo do que a sua IA fez por você.")}</div>
      </div>

      {/* Abas do dashboard — separam o acompanhamento das SOLUÇÕES do painel de NEGÓCIOS do cliente. */}
      <div className="dashtabs" role="tablist">
        <button role="tab" aria-selected={tab === "resultados"} className={"dashtab" + (tab === "resultados" ? " on" : "")} onClick={() => setTab("resultados")}>{t("Meus Resultados")}</button>
        <button role="tab" aria-selected={tab === "solucoes"} className={"dashtab" + (tab === "solucoes" ? " on" : "")} onClick={() => setTab("solucoes")}>{t("Entregas & Implantação")}</button>
        <button role="tab" aria-selected={tab === "minhas"} className={"dashtab" + (tab === "minhas" ? " on" : "")} onClick={() => setTab("minhas")}>{t("Minhas soluções")}{mods.length ? <span className="dashtab-cnt">{mods.length}</span> : null}</button>
        {podeFin && <button role="tab" aria-selected={tab === "negocios"} className={"dashtab" + (tab === "negocios" ? " on" : "")} onClick={() => setTab("negocios")}>{t("Contrato & Financeiro")}</button>}
      </div>

      {/* ═══ MEUS RESULTADOS ═══ o que a IA gerou (antes×depois real). O "antes" entra com o
          Baseline de Entrada (item 1.3) e a narrativa com a Psiquê (item 1.4). Zero número fixo. */}
      {tab === "resultados" && (<>
        {/* Hero — a narrativa da Psiquê entra aqui (1.4); por ora, abertura + dado real ao vivo. */}
        <div className="scopebox" style={{ background: "linear-gradient(150deg,var(--crasto-navy,#010E26),#000714)", border: 0, color: "#fff" }}>
          <div style={{ padding: "24px 22px" }}>
            <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--crasto-blue,#6E9CE8)", fontWeight: 600 }}>{t("Meus resultados · o que a sua IA fez por você")}</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 10, lineHeight: 1.3, maxWidth: 680 }}>
              {cock?.narrativa?.headline || t("Acompanhe, em tempo real, o que a sua IA já mudou no seu atendimento.")}
            </div>
            {cock?.narrativa?.resumo && <div style={{ fontSize: 14, color: "rgba(255,255,255,.78)", marginTop: 8, maxWidth: 680, lineHeight: 1.6 }}>{cock.narrativa.resumo}</div>}
            {Array.isArray(cock?.narrativa?.destaques) && cock!.narrativa.destaques.length > 0 && (
              <div style={{ display: "flex", gap: 30, flexWrap: "wrap", marginTop: 18 }}>
                {cock!.narrativa.destaques.map((d: any, i: number) => (
                  <div key={i}><div className="tnum" style={{ fontSize: 26, fontWeight: 600, color: "#fff" }}>{d.n}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", marginTop: 2, maxWidth: 150 }}>{d.l}</div></div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Antes × Depois — métricas reais. O "depois" vem ao vivo do WhatsApp CRM. */}
        <SecHead title={t("Antes × Depois")} tom="mute" caption={cock?.fontes?.crm ? t("dado real · em tempo real") : t("aguardando atividade no WhatsApp CRM")} />
        <div className="kpis kpis--3">
          {(cock?.metrics || []).map((m) => (
            <div className="kpi" key={m.key}>
              <div className="lab">{m.label}</div>
              <div className="val">{fmtMetric(m, m.depois)}</div>
              <div className="delta">{deltaMetric(m)}</div>
            </div>
          ))}
        </div>

        {/* Você não tinha, agora tem — conquistas reais (módulos/serviços contratados). */}
        {(cock?.conquistas || []).length > 0 && (
          <div className="scopebox">
            <div className="scopehead"><div><span className="scopedot green" /><Activity size={17} /><span>{t("Você não tinha, agora tem")}</span></div><small>{t("capacidades desbloqueadas com a Crasto.AI")}</small></div>
            <div className="scopelist">
              {cock!.conquistas.map((c, i) => { const tom = conquistaTom(c); return (
                <div className="scoperow" key={i}><span className={"scopedot " + tom} /><div><strong>{c.titulo}</strong><small>{c.tipo === "service" ? t("Serviço") : t("Solução")}</small></div><span className={"scopepill " + tom}>{tom === "green" ? t("Ativo") : tom === "red" ? t("Pausado") : t("Em implantação")}</span></div>
              ); })}
            </div>
          </div>
        )}

        {/* Nossa jornada — marcos reais de implantação (registrados pela Crasto.AI). */}
        {(cock?.jornada || []).length > 0 && (
          <div className="scopebox">
            <div className="scopehead"><div><span className="scopedot mute" /><FileSignature size={17} /><span>{t("Nossa jornada juntos")}</span></div><small>{t("marcos do relacionamento")}</small></div>
            <div className="scopelist">
              {cock!.jornada.map((e, i) => (
                <div className="scoperow" key={i}><span className="scopedot green" /><div><strong>{e.title}{e.module_name ? <span style={{ fontWeight: 400, color: "var(--crasto-text-muted)" }}> · {e.module_name}</span> : null}</strong><small>{new Date(e.happened_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div></div>
              ))}
            </div>
          </div>
        )}

        {/* Vazio HONESTO: sem fonte viva e sem conquistas → convite, nunca número inventado. */}
        {!cock?.fontes?.crm && (cock?.conquistas || []).length === 0 && (
          <div className="empty"><p><strong>{t("Seus resultados aparecem aqui.")}</strong> {t("Assim que suas soluções entrarem em operação, os números aparecem em tempo real — sem dados fictícios.")}</p></div>
        )}
      </>)}

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

      {/* ═══ ENTREGAS & IMPLANTAÇÃO ═══ Gantt planejado×realizado por solução (dado real). */}
      <div className="scopebox">
        <div className="scopehead"><div>{farolSolucoes && <span className={"scopedot " + farolSolucoes} />}<Activity size={17} /><span>{t("Entregas & Implantação")}</span></div><small>{t("início · previsão · entrega real · farol de prazo — dado real")}</small></div>
        {itensEscopo.length === 0 ? (
          <div className="scopeempty">{t("Nenhuma solução vinculada ao contrato ainda.")}</div>
        ) : (() => {
          const hoje = new Date().toISOString().slice(0, 10);
          return (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead><tr style={{ textAlign: "left", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--crasto-text-muted)" }}>
                  <th style={{ padding: "8px 10px" }}>{t("Solução")}</th><th style={{ padding: "8px 10px" }}>{t("Início")}</th><th style={{ padding: "8px 10px" }}>{t("Previsão")}</th><th style={{ padding: "8px 10px" }}>{t("Entrega real")}</th><th style={{ padding: "8px 10px", minWidth: 180 }}>{t("Implantação")}</th><th style={{ padding: "8px 10px" }}>{t("Prazo")}</th>
                </tr></thead>
                <tbody>
                  {itensEscopo.map((item: any, idx: number) => {
                    const isMod = item.kind !== "service";
                    const info = isMod ? entregaInfo(item, hoje) : null;
                    const { tom, label } = isMod ? { tom: info!.tom as string, label: info!.label } : statusInfo(item);
                    return (
                      <tr key={`${item.id || idx}-${idx}`} style={{ borderTop: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))" }}>
                        <td style={{ padding: "11px 10px" }}><div style={{ fontWeight: 600, color: "var(--crasto-text-primary)", fontSize: 13.5 }}>{item.name || t("Solução contratada")}</div>{item.description && <div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)" }}>{item.description}</div>}</td>
                        <td className="tnum" style={{ padding: "11px 10px", fontSize: 12.5, color: "var(--crasto-text-muted)" }}>{info ? brData(info.inicio) : "—"}</td>
                        <td className="tnum" style={{ padding: "11px 10px", fontSize: 12.5 }}>{info ? brData(info.previsao) : "—"}</td>
                        <td className="tnum" style={{ padding: "11px 10px", fontSize: 12 }}>{info?.entregaReal ? brDataHora(info.entregaReal) : "—"}</td>
                        <td style={{ padding: "11px 10px", minWidth: 180 }}>
                          {info ? (
                            <div>
                              <div style={{ position: "relative", height: 8 }}>
                                <div style={{ height: 8, borderRadius: 999, background: "rgba(1,14,38,.08)", overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${info.prog}%`, borderRadius: 999, background: FAROL_COR[tom] }} />
                                </div>
                                {info.meta != null && <div title={t("meta hoje")} style={{ position: "absolute", top: -2, left: `${info.meta}%`, width: 2, height: 12, background: "var(--crasto-text-primary)", opacity: .5, borderRadius: 2 }} />}
                              </div>
                              <div className="tnum" style={{ fontSize: 11, color: "var(--crasto-text-muted)", marginTop: 3 }}>{info.prog}%</div>
                            </div>
                          ) : <span style={{ fontSize: 12, color: "var(--crasto-text-muted)" }}>—</span>}
                        </td>
                        <td style={{ padding: "11px 10px" }}><span className={"scopepill " + tom}>{label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", padding: "10px 10px 2px", fontSize: 11.5, color: "var(--crasto-text-muted)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 8, borderRadius: 3, background: FAROL_COR.green }} /> {t("no prazo")}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 8, borderRadius: 3, background: FAROL_COR.amber }} /> {t("atenção")}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 8, borderRadius: 3, background: FAROL_COR.red }} /> {t("atrasado")}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 2, height: 12, background: "var(--crasto-text-primary)", opacity: .5 }} /> {t("meta planejada para hoje")}</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ═══ SEU CONTRATO ═══ health check do contrato (situação financeira) — farol próprio,
          separado do farol das soluções. Verde/âmbar/vermelho pela situação real das faturas. */}
      {fin && podeFin && (
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
                        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={!m.isCrm && !m.url} title={m.isCrm || m.url ? t("Abrir a solução") : t("Link em configuração")} onClick={() => abrirSolucao(m)}><span className="crasto-btn__label">{t("Acessar")}</span></button>
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
      {/* ═══ CONTRATO & FINANCEIRO ═══ situação real + parcelas com farol de vencimento + contrato. */}
      {tab === "negocios" && podeFin && (() => {
        const hoje = new Date().toISOString().slice(0, 10);
        const settled = (f: Fatura) => f.status === "paid" || f.status === "canceled";
        const total = faturas.reduce((s, f) => s + Number(f.amount || 0), 0);
        const pago = faturas.filter((f) => f.status === "paid").reduce((s, f) => s + Number(f.amount || 0), 0);
        const restante = faturas.filter((f) => !settled(f)).reduce((s, f) => s + Number(f.amount || 0), 0);
        const faturaFarol = (f: Fatura): { tom: Tom; label: string } => {
          if (f.status === "paid") return { tom: "green", label: t("Paga") };
          if (f.status === "canceled") return { tom: "mute", label: t("Cancelada") };
          if (f.due_date && f.due_date < hoje) return { tom: "red", label: t("Vencida") };
          const d = diasEntre(hoje, f.due_date || undefined);
          if (d != null && d <= 5) return { tom: "amber", label: d <= 0 ? t("Vence hoje") : t("Vence em {n}d", { n: d }) };
          return { tom: "mute", label: t("A vencer") };
        };
        return (<>
          <SecHead title={t("Situação financeira")} tom={(fin?.status as Tom) ?? "mute"} caption={t("dado real do seu contrato · parcelas")} icon={<Wallet size={16} />} />
          <div className="kpis kpis--3">
            <div className="kpi"><div className="lab">{t("Total do contrato")}</div><div className="val tnum">{money(total)}</div><div className="delta">{t("{n} parcelas", { n: faturas.length })}</div></div>
            <div className="kpi g"><div className="lab">{t("Já pago")}</div><div className="val tnum">{money(pago)}</div><div className="delta">{t("{n} paga(s)", { n: faturas.filter((f) => f.status === "paid").length })}</div></div>
            <div className="kpi"><div className="lab">{t("Restante")}</div><div className="val tnum">{money(restante)}</div><div className="delta">{fin?.status === "red" ? t("com atraso") : fin?.status === "amber" ? t("vencendo em breve") : t("em dia")}</div></div>
          </div>

          {/* Parcelas com farol de vencimento */}
          <div className="scopebox">
            <div className="scopehead"><div><span className={"scopedot " + ((fin?.status as string) || "mute")} /><Wallet size={17} /><span>{t("Parcelas")}</span></div><small>🟢 {t("paga")} · 🟡 {t("a vencer (≤5 dias)")} · 🔴 {t("vencida")}</small></div>
            {faturas.length === 0 ? (
              <div className="scopeempty">{t("Nenhuma fatura registrada.")}</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                  <thead><tr style={{ textAlign: "left", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--crasto-text-muted)" }}>
                    <th style={{ padding: "8px 10px" }}>{t("Parcela")}</th><th style={{ padding: "8px 10px" }}>{t("Vencimento")}</th><th style={{ padding: "8px 10px", textAlign: "right" }}>{t("Valor")}</th><th style={{ padding: "8px 10px" }}>{t("Pago em")}</th><th style={{ padding: "8px 10px" }}>{t("Status")}</th>
                  </tr></thead>
                  <tbody>
                    {faturas.map((f) => { const { tom, label } = faturaFarol(f); return (
                      <tr key={f.id} style={{ borderTop: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))" }}>
                        <td style={{ padding: "11px 10px", fontSize: 13, fontWeight: 600, color: "var(--crasto-text-primary)" }}>{f.description || t("Fatura")}</td>
                        <td className="tnum" style={{ padding: "11px 10px", fontSize: 12.5, color: "var(--crasto-text-muted)" }}>{brData(f.due_date || undefined)}</td>
                        <td className="tnum" style={{ padding: "11px 10px", fontSize: 13, textAlign: "right" }}>{money(Number(f.amount || 0))}</td>
                        <td className="tnum" style={{ padding: "11px 10px", fontSize: 12.5, color: f.paid_date ? "var(--crasto-text-body)" : "var(--crasto-text-muted)" }}>{f.paid_date ? brData(f.paid_date) : "—"}</td>
                        <td style={{ padding: "11px 10px" }}><span className={"scopepill " + tom}>{label}</span></td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Contrato — assinado + PDF */}
          <div className="scopebox">
            <div className="scopehead"><div><span className="scopedot mute" /><FileSignature size={17} /><span>{t("Contrato")}</span></div><small>{t("seu contrato de prestação de serviço")}</small></div>
            <div className="scoperow">
              <span className="scopedot green" />
              <div><strong>{self?.contract_doc?.file_name || self?.contract?.title || t("Contrato da Crasto.AI")}</strong><small>{self?.contract?.signed_at ? t("Assinado em {d}", { d: new Date(self.contract.signed_at).toLocaleDateString("pt-BR") }) : self?.contract_doc ? t("Disponível para download") : self?.contract?.status === "signed" ? t("Assinado") : self?.contract ? t("Em andamento") : t("Ainda não disponível")}</small></div>
              {self?.contract_doc
                ? <button className="scopepill mute" style={{ cursor: "pointer", border: 0 }} onClick={abrirContrato} disabled={abrindoContrato}>{abrindoContrato ? t("Abrindo…") : t("Abrir")} <ArrowRight size={12} style={{ verticalAlign: -2 }} /></button>
                : self?.contract?.url && <a className="scopepill mute" href={self.contract.url} target="_blank" rel="noreferrer">{t("Abrir")} <ArrowRight size={12} style={{ verticalAlign: -2 }} /></a>}
            </div>
          </div>
        </>);
      })()}

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
