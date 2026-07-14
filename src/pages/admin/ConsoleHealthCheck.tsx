import { useNavigate } from "react-router-dom";
import { Activity, CheckCircle, Shield, AlertTriangle, Globe, Server, Lock } from "lucide-react";
import { services } from "../../services";
import { PageHead, useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";

type Agent = { name: string; status: string };
type Client = {
  id: string; name: string; agents: Agent[];
  agents_live: number; agents_total: number;
  q_grouping: number; q_processing: number; q_send: number; q_dlq: number;
  farol: string; farol_msg: string | null; is_internal: boolean;
};
type HCData = { isolation: string; clients: Client[] };

function clientHealth(c: Client): "green" | "yellow" | "red" {
  if (c.q_dlq > 0) return "red";
  if (c.farol === "red") return "red";
  if (c.farol === "amber" || c.farol === "yellow") return "yellow";
  if (c.agents_total > 0 && c.agents_live === 0) return "yellow";
  return "green";
}

function Farol({ status }: { status: "green" | "yellow" | "red" }) {
  return (
    <span className="farol" style={{ display: "inline-flex", gap: 5, padding: "5px 8px", background: "var(--crasto-navy)", borderRadius: 999 }}>
      <span className={"fl" + (status === "red" ? " red on" : "")} />
      <span className={"fl" + (status === "yellow" ? " amber on" : "")} />
      <span className={"fl" + (status === "green" ? " green on" : "")} />
    </span>
  );
}

function Qmark({ tip }: { tip: string }) {
  return (
    <span title={tip} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: "var(--crasto-bg-3)", color: "var(--crasto-text-muted)", fontSize: 10, fontWeight: 700, cursor: "help", marginLeft: 4, verticalAlign: "middle" }}>?</span>
  );
}

export default function ConsoleHealthCheck() {
  const t = useT();
  const navigate = useNavigate();
  const { data, loading } = useAsync(() => services.analytics.admin.healthCheck<HCData>(), []);
  const clients = data?.clients ?? [];

  const healthy = clients.filter(c => clientHealth(c) === "green").length;
  const total = clients.length;
  const incidents7d = clients.reduce((s, c) => s + c.q_dlq, 0);
  const iso = data?.isolation ?? "ok";

  const agentsLive = clients.reduce((s, c) => s + c.agents_live, 0);
  const agentsTotal = clients.reduce((s, c) => s + c.agents_total, 0);

  return (
    <div>
      <PageHead eyebrow="Console · IA · Plataforma" title={t("Health Check")}
        sub={t("Saúde do sistema e de cada cliente: disponibilidade, pipelines, isolamento e presença geográfica. Clique numa linha para abrir o cliente.")} />

      {/* KPIs */}
      <div className="kpis" style={{ marginBottom: 18 }}>
        <div className="kpi g">
          <div className="lab"><CheckCircle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Clientes saudáveis")}</div>
          <div className="val tnum" style={{ fontSize: 28 }}>{loading ? "—" : `${healthy}/${total}`}</div>
          <div className="delta">{loading ? "" : (incidents7d === 0 ? t("sem incidentes") : `${incidents7d} ${t("falha(s) na DLQ")}`)}</div>
        </div>
        <div className="kpi">
          <div className="lab"><Activity size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Agentes no ar")}</div>
          <div className="val tnum" style={{ fontSize: 28 }}>{loading ? "—" : `${agentsLive}/${agentsTotal}`}</div>
          <div className="delta">{t("ao vivo agora")}</div>
        </div>
        <div className="kpi" style={iso !== "ok" ? { borderColor: "rgba(234,84,85,.4)" } : undefined}>
          <div className="lab"><Shield size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Isolamento (CI)")}</div>
          <div className="val" style={{ fontSize: 24, color: iso === "ok" ? "#1F8A5B" : "#C0362C" }}>{iso === "ok" ? "OK" : t("Atenção")}</div>
          <div className="delta">{t("RLS por cliente")}</div>
        </div>
        <div className="kpi" style={incidents7d > 0 ? { borderColor: "rgba(234,84,85,.4)" } : undefined}>
          <div className="lab"><AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Falhas (DLQ)")}</div>
          <div className="val tnum" style={{ fontSize: 28, color: incidents7d > 0 ? "#C0362C" : undefined }}>{loading ? "—" : incidents7d}</div>
          <div className="delta">{t("mensagens a revisar")}</div>
        </div>
      </div>

      {/* Mapa de presença */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(110,156,232,.12)", color: "var(--crasto-blue, #3E6FB8)", flexShrink: 0 }}><Globe size={17} /></div>
          <div style={{ flex: 1 }}><h3 style={{ margin: 0 }}>{t("Presença global")}</h3><div className="csub" style={{ margin: 0 }}>{t("onde estão os clientes (mapa ilustrativo)")}</div></div>
          <span className="pill ok" style={{ marginLeft: "auto" }}><span className="d" />{total} {t("clientes ativos")}</span>
        </div>
        <svg viewBox="0 0 1000 460" style={{ width: "100%", height: "auto", display: "block" }}>
          <rect x="1" y="1" width="998" height="458" rx="16" fill="var(--crasto-bg-2)" stroke="var(--crasto-border-soft)" />
          <g stroke="var(--crasto-border-soft)" strokeWidth="1"><line x1="0" y1="115" x2="1000" y2="115" /><line x1="0" y1="230" x2="1000" y2="230" /><line x1="0" y1="345" x2="1000" y2="345" /><line x1="250" y1="0" x2="250" y2="460" /><line x1="500" y1="0" x2="500" y2="460" /><line x1="750" y1="0" x2="750" y2="460" /></g>
          <g fill="var(--crasto-text-faint)" opacity=".22"><ellipse cx="225" cy="140" rx="115" ry="72" /><ellipse cx="360" cy="305" rx="52" ry="92" /><ellipse cx="348" cy="70" rx="34" ry="24" /><ellipse cx="520" cy="120" rx="46" ry="32" /><ellipse cx="558" cy="255" rx="70" ry="95" /><ellipse cx="720" cy="150" rx="145" ry="82" /><ellipse cx="735" cy="245" rx="55" ry="46" /><ellipse cx="835" cy="330" rx="56" ry="38" /></g>
          <g><circle cx="250" cy="135" r="6" fill="none" stroke="var(--crasto-text-muted)" strokeWidth="2" strokeDasharray="3 3" /><text x="250" y="118" textAnchor="middle" fontSize="13" fill="var(--crasto-text-muted)">EUA · {t("mercado futuro")}</text></g>
          <g>
            <circle cx="368" cy="292" r="16" fill="none" stroke="var(--crasto-navy)" strokeOpacity="0.45"><animate attributeName="r" values="10;26;10" dur="2.6s" repeatCount="indefinite" /><animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="2.6s" repeatCount="indefinite" /></circle>
            <circle cx="368" cy="292" r="7" fill="var(--crasto-navy)" />
            <text x="368" y="332" textAnchor="middle" fontSize="15" fill="var(--crasto-text-primary)" fontWeight="600">{t("São Paulo")} · BR</text>
            <text x="368" y="350" textAnchor="middle" fontSize="12" fill="var(--crasto-text-muted)">{total} {t("clientes")} · {agentsTotal} {t("agentes")}</text>
          </g>
        </svg>
      </div>

      {/* Legenda */}
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--crasto-text-primary)", margin: "6px 0 6px" }}>{t("Saúde por cliente — clique numa linha para atuar")}</div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 10, fontSize: 11.5, color: "var(--crasto-text-muted)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#28C76F" }} />{t("tudo certo")}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#C7962B" }} />{t("atenção")}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EA5455" }} />{t("problema — ação necessária")}</span>
      </div>

      {/* Tabela por cliente */}
      <div className="tbl-wrap" style={{ marginBottom: 18 }}>
        <table className="tbl">
          <thead><tr>
            <th style={{ width: "22%" }}>{t("Cliente / Agente")}</th>
            <th>{t("Saúde")}</th>
            <th>{t("Mensagens chegando")} <Qmark tip={t("Mensagens que o cliente acabou de enviar. O sistema espera alguns segundos ele terminar de digitar antes de a IA responder tudo de uma vez. Back-office: fila message_grouping_queue.")} /></th>
            <th>{t("Respostas em preparo")} <Qmark tip={t("Respostas que a IA está redigindo agora. Back-office: fila ai_processing_queue.")} /></th>
            <th>{t("Saindo ao cliente")} <Qmark tip={t("Respostas prontas, sendo entregues no WhatsApp. Back-office: fila send_queue.")} /></th>
            <th>{t("Falhas a revisar")} <Qmark tip={t("Mensagens que falharam e ficaram guardadas para revisão manual. 0 = tudo certo; acima de 0 acende alerta. Back-office: DLQ / dead-letter.")} /></th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ color: "var(--crasto-text-muted)" }}>{t("Carregando…")}</td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={6} style={{ color: "var(--crasto-text-muted)" }}>{t("Nenhum cliente cadastrado.")}</td></tr>
            ) : clients.map(c => {
              const h = clientHealth(c);
              const agentLabel = c.agents.length > 0 ? c.agents.map(a => a.name).join(", ") : "";
              const nameDisplay = agentLabel ? `${c.name} — ${agentLabel}` : c.name;
              const hasAlert = h !== "green";
              return [
                <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/admin/cliente/${c.id}`)}>
                  <td style={{ fontWeight: 600 }}>
                    {nameDisplay}
                    {c.is_internal && <span className="pill mute" style={{ marginLeft: 6, fontSize: 10 }}>{t("Interno")}</span>}
                  </td>
                  <td><Farol status={h} /></td>
                  <td style={{ fontVariantNumeric: "tabular-nums", fontFamily: "var(--crasto-font-mono, monospace)" }}>{c.q_grouping}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums", fontFamily: "var(--crasto-font-mono, monospace)" }}>{c.q_processing}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums", fontFamily: "var(--crasto-font-mono, monospace)" }}>{c.q_send}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums", fontFamily: "var(--crasto-font-mono, monospace)", color: c.q_dlq > 0 ? "#C0362C" : undefined, fontWeight: c.q_dlq > 0 ? 700 : undefined }}>{c.q_dlq}</td>
                </tr>,
                hasAlert && (
                  <tr key={c.id + "-alert"} style={{ cursor: "pointer" }} onClick={() => navigate(`/admin/cliente/${c.id}`)}>
                    <td colSpan={6} style={{ padding: "0 18px 14px", borderBottom: "1px solid var(--crasto-border-soft)" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: h === "red" ? "rgba(234,84,85,.08)" : "rgba(255,159,67,.08)", border: `1px solid ${h === "red" ? "rgba(234,84,85,.3)" : "rgba(255,159,67,.3)"}`, borderRadius: "var(--crasto-radius-md)", padding: "10px 14px", fontSize: 12.5 }}>
                        <AlertTriangle size={15} style={{ color: h === "red" ? "#C0362C" : "#B5760B", flexShrink: 0, marginTop: 1 }} />
                        <div style={{ color: h === "red" ? "#8A2A2A" : "#7A5A1A" }}>
                          {c.q_dlq > 0 && <><b>{t("O que está acontecendo:")}</b> {t("{n} mensagem(ns) falharam e estão na fila de revisão (DLQ).", { n: c.q_dlq })}<br /><b>{t("Como resolver:")}</b> {t("verificar os erros no log do agente e reprocessar ou descartar.")}</>}
                          {c.q_dlq === 0 && c.agents_total > 0 && c.agents_live === 0 && <><b>{t("O que está acontecendo:")}</b> {t("o agente está cadastrado mas não está ao vivo — mensagens não serão respondidas automaticamente.")}<br /><b>{t("Como resolver:")}</b> {t("configurar a chave da LLM, sincronizar o cérebro e ativar o agente.")}</>}
                          {c.q_dlq === 0 && (c.farol === "red" || c.farol === "amber" || c.farol === "yellow") && c.agents_live > 0 && <><b>{t("O que está acontecendo:")}</b> {c.farol_msg || t("o farol de saúde indica atenção.")}<br /><b>{t("Como resolver:")}</b> {t("clique nesta linha para abrir a configuração do cliente.")}</>}
                          {" "}<u style={{ cursor: "pointer" }}>{t("Clique nesta linha para abrir a configuração.")}</u>
                        </div>
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* Notas informativas */}
      <div className="note">
        <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div><b>{t("Rotinas automáticas no ar:")}</b> {t("a plataforma recupera sozinha conversas que travaram e reengaja leads parados — sem ninguém precisar tocar.")} <Qmark tip={t("Back-office: rotinas reaper (recupera turnos órfãos) e stale_leads (follow-up de lead frio), agendadas globalmente.")} /></div>
      </div>
      <div className="note" style={{ marginTop: 0 }}>
        <Server size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div><b>{t("Instâncias dedicadas (OpenClaw):")}</b> {t("quando um cliente roda em VPS própria (tier premium), a saúde da instância aparece aqui, por-cliente. Hoje todos rodam gerenciados na plataforma.")}</div>
      </div>
      <div className="note" style={{ marginTop: 0 }}>
        <Lock size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div><b>{t("Teste de isolamento (CI):")}</b> {iso === "ok" ? t("último run verde — usuário do cliente A retornou 0 linhas do cliente B em todas as tabelas. Nada sobe sem esse teste passar.") : t("atenção — há tabelas sem FORCE ROW LEVEL SECURITY ativo. Verifique os schemas agents/whatsapp/audit.")}</div>
      </div>
    </div>
  );
}
