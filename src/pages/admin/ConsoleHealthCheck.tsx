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
        <svg viewBox="0 0 1000 500" style={{ width: "100%", height: "auto", display: "block" }}>
          <rect x="0" y="0" width="1000" height="500" rx="16" fill="var(--crasto-bg-2)" stroke="var(--crasto-border-soft)" />
          {/* Grid — latitude */}
          <g stroke="var(--crasto-border-soft)" strokeWidth=".5" opacity=".5" strokeDasharray="4 3">
            <line x1="30" y1="83" x2="970" y2="83" /><line x1="30" y1="167" x2="970" y2="167" />
            <line x1="30" y1="250" x2="970" y2="250" /><line x1="30" y1="333" x2="970" y2="333" />
            <line x1="30" y1="417" x2="970" y2="417" />
          </g>
          {/* Grid — longitude */}
          <g stroke="var(--crasto-border-soft)" strokeWidth=".5" opacity=".5" strokeDasharray="4 3">
            <line x1="83" y1="30" x2="83" y2="470" /><line x1="167" y1="30" x2="167" y2="470" />
            <line x1="250" y1="30" x2="250" y2="470" /><line x1="333" y1="30" x2="333" y2="470" />
            <line x1="417" y1="30" x2="417" y2="470" /><line x1="500" y1="30" x2="500" y2="470" />
            <line x1="583" y1="30" x2="583" y2="470" /><line x1="667" y1="30" x2="667" y2="470" />
            <line x1="750" y1="30" x2="750" y2="470" /><line x1="833" y1="30" x2="833" y2="470" />
            <line x1="917" y1="30" x2="917" y2="470" />
          </g>
          {/* Continents */}
          <g fill="#B8C9D9" stroke="#92A8BE" strokeWidth=".7" strokeLinejoin="round">
            {/* North America */}
            <path d="M 33,61 Q 38,78 45,94 L 58,92 Q 80,88 105,86 L 125,88 Q 138,95 147,108 Q 152,116 155,128 Q 157,138 160,147 Q 165,156 175,168 Q 185,178 195,186 Q 202,192 215,198 Q 228,203 242,208 L 250,211 Q 258,215 267,220 L 275,225 L 278,228 Q 275,220 270,214 L 262,208 Q 258,200 260,194 L 258,192 Q 252,188 244,184 L 236,180 Q 242,174 250,170 Q 258,168 266,169 Q 270,173 275,181 Q 279,173 283,162 Q 287,152 292,144 Q 296,138 305,133 Q 316,128 332,126 Q 342,124 353,119 Q 346,106 336,98 Q 315,84 292,78 Q 265,70 238,65 Q 205,60 175,57 Q 145,55 115,55 Q 85,55 60,55 Z" />
            {/* Greenland */}
            <path d="M 358,40 Q 353,48 352,58 Q 355,68 365,72 Q 375,74 385,70 Q 395,64 398,54 Q 398,45 392,40 Q 382,36 370,37 Z" />
            {/* South America */}
            <path d="M 278,228 Q 290,222 308,217 Q 322,213 336,214 Q 345,218 352,228 Q 358,242 363,258 Q 367,278 370,300 Q 370,318 367,335 Q 360,352 350,367 Q 338,380 322,388 Q 310,393 300,390 Q 288,382 278,367 Q 270,348 266,328 Q 262,305 261,282 Q 261,260 264,242 Q 268,233 274,230 Z" />
            {/* Europe */}
            <path d="M 467,55 Q 462,68 460,82 Q 460,92 464,100 Q 468,108 475,114 Q 482,118 492,119 Q 503,118 514,114 Q 525,108 536,105 Q 542,104 546,108 Q 544,114 538,122 Q 530,130 522,136 Q 514,140 506,140 Q 498,138 490,142 Q 480,148 472,155 Q 466,150 460,144 Q 455,134 454,122 Q 454,108 458,94 Q 462,78 467,55 Z" />
            {/* UK & Ireland */}
            <path d="M 462,95 Q 458,102 456,110 Q 457,118 462,118 Q 466,114 468,108 Q 468,100 465,96 Z" />
            <path d="M 455,100 Q 452,106 453,112 Q 456,112 457,108 Q 457,103 455,100 Z" />
            {/* Iceland */}
            <path d="M 440,68 Q 436,72 436,78 Q 438,82 444,82 Q 450,80 451,75 Q 450,70 446,68 Z" />
            {/* Africa */}
            <path d="M 472,158 Q 485,155 500,152 Q 518,149 535,150 Q 553,152 570,156 Q 583,160 592,167 Q 590,178 592,192 Q 598,205 610,214 Q 622,220 636,225 Q 630,242 622,262 Q 615,280 608,298 Q 600,316 590,332 Q 578,345 564,352 Q 548,356 536,350 Q 526,340 519,325 Q 514,308 510,288 Q 506,268 503,250 Q 499,235 492,224 Q 482,217 470,214 Q 460,212 454,208 Q 456,198 462,185 Q 468,172 472,162 Z" />
            {/* Madagascar */}
            <path d="M 610,312 Q 615,306 620,314 Q 620,328 616,338 Q 612,340 608,332 Q 607,322 610,312 Z" />
            {/* Asia */}
            <path d="M 548,55 Q 550,70 554,85 Q 560,96 570,100 Q 582,98 598,92 Q 618,86 642,82 Q 668,78 698,76 Q 728,76 758,80 Q 785,85 810,90 Q 830,92 845,90 Q 858,94 870,103 Q 882,115 892,130 Q 898,145 896,158 Q 890,168 878,175 Q 864,180 848,186 Q 835,192 824,200 Q 815,208 806,218 Q 798,224 788,226 Q 776,228 766,235 Q 758,244 754,255 Q 748,248 740,238 Q 732,230 722,228 Q 714,232 708,244 Q 702,254 697,258 Q 690,250 684,238 Q 676,224 665,215 Q 652,208 638,200 Q 622,192 608,182 Q 596,174 584,166 Q 574,160 565,155 Q 558,150 554,142 Q 550,132 549,118 Q 548,105 548,88 Z" />
            {/* Japan */}
            <path d="M 880,122 Q 884,130 884,140 Q 882,150 878,156 Q 874,152 872,144 Q 872,134 876,126 Z" />
            {/* Sri Lanka */}
            <path d="M 702,226 Q 708,228 708,234 Q 706,238 702,236 Q 698,232 700,228 Z" />
            {/* Sumatra/Malaysia */}
            <path d="M 758,252 Q 768,248 780,250 Q 788,254 795,260 Q 790,266 780,266 Q 770,264 762,258 Z" />
            {/* Borneo */}
            <path d="M 802,250 Q 812,246 822,250 Q 826,258 822,266 Q 814,270 806,266 Q 800,260 802,250 Z" />
            {/* Papua */}
            <path d="M 870,262 Q 880,258 892,260 Q 898,266 894,274 Q 886,278 878,274 Q 872,268 870,262 Z" />
            {/* Australia */}
            <path d="M 842,298 Q 856,290 874,286 Q 894,284 910,290 Q 922,298 928,312 Q 928,328 920,342 Q 910,354 896,360 Q 880,362 866,358 Q 852,350 846,338 Q 842,324 840,310 Z" />
            {/* New Zealand */}
            <path d="M 944,356 Q 948,362 948,372 Q 946,380 942,382 Q 938,376 938,366 Q 940,360 944,356 Z" />
            <path d="M 940,384 Q 944,388 942,394 Q 940,396 936,392 Q 936,388 940,384 Z" />
          </g>
          {/* Labels — EUA (mercado futuro) */}
          <g>
            <circle cx="220" cy="140" r="5" fill="none" stroke="var(--crasto-text-muted)" strokeWidth="1.5" strokeDasharray="2 2" opacity=".6" />
            <text x="220" y="128" textAnchor="middle" fontSize="11" fill="var(--crasto-text-muted)" opacity=".7">EUA · {t("mercado futuro")}</text>
          </g>
          {/* São Paulo marker */}
          <g>
            <circle cx="370" cy="315" r="18" fill="none" stroke="var(--crasto-navy)" strokeOpacity="0.4">
              <animate attributeName="r" values="10;28;10" dur="2.6s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="2.6s" repeatCount="indefinite" />
            </circle>
            <circle cx="370" cy="315" r="6" fill="var(--crasto-navy)" />
            <text x="370" y="342" textAnchor="middle" fontSize="14" fill="var(--crasto-text-primary)" fontWeight="600">{t("São Paulo")} · BR</text>
            <text x="370" y="358" textAnchor="middle" fontSize="11.5" fill="var(--crasto-text-muted)">{total} {t("clientes")} · {agentsTotal} {t("agentes")}</text>
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
