import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { services } from "../../services";
import { useT } from "../../lib/i18n";

// API do wacrm (fonte de verdade dos agentes). Domínio PRÓPRIO, não o host cru do EasyPanel:
// esta chamada sai do navegador do CLIENTE e aparece no inspetor dele.
const WACRM_API = "https://api.wacrm.crasto.ai";
type Agent = { id: string; name: string; slug?: string; status?: string };

// FASE 3 — WhatsApp CRM embarcado (tela cheia). Se o usuário tem >1 agente, o Portal mostra
// o SELETOR (cada agente = um CRM próprio) e embarca o escolhido (?agent=<id>). Sessão por
// handoff de token (mesmo IdP). Cada usuário abre com o próprio token → atividade atribuída a ele.
export default function CrmEmbed() {
  const t = useT();
  const navigate = useNavigate();
  const [crmUrl, setCrmUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null); // id do agente ou "*" (empresa inteira)
  const [err, setErr] = useState<string>("");
  const [live, setLive] = useState<import("../../services/delivery.service").CrmLive | null>(null);

  // Mini-cockpit AO VIVO (pulso do WhatsApp CRM) — atualiza a cada 30s. CRM fora → null → "—".
  useEffect(() => {
    let alive = true;
    const load = () => services.delivery.crmLive.getMine().then((l) => { if (alive) setLive(l); }).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cms = (await services.delivery.clientModules.listMine()) as any[];
        const crm = (cms || []).find((c) => c.crm_url);
        if (!crm?.crm_url) { setErr(t("O WhatsApp CRM não está liberado para o seu acesso.")); return; }
        const { data } = await supabase.auth.getSession();
        const tk = data.session?.access_token;
        if (!tk) { setErr(t("Sessão expirada — recarregue a página.")); return; }
        setCrmUrl(String(crm.crm_url).replace(/\/$/, "")); setToken(tk);
        // Agentes que este usuário pode entrar (fonte = wacrm).
        let ags: Agent[] = [];
        try {
          const r = await fetch(`${WACRM_API}/api/me`, { headers: { Authorization: "Bearer " + tk } });
          const j = await r.json();
          ags = Array.isArray(j?.agents) ? j.agents : [];
        } catch { /* sem lista → entra direto no principal */ }
        setAgents(ags);
        if (ags.length <= 1) setChosen(ags[0]?.id || "*"); // 0/1 agente → sem tela, entra direto
      } catch (e: any) { setErr(e?.message || t("Não foi possível abrir o WhatsApp CRM.")); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const back = (
    <div className="crm-fs-top">
      <button className="crm-back" onClick={() => navigate("/app")}><ChevronLeft size={16} /> {t("Voltar ao Portal")}</button>
      <span className="crm-fs-title">WhatsApp CRM</span>
    </div>
  );

  if (err) return <div className="crm-fs">{back}<div className="crm-fs-msg">{err}</div></div>;
  if (!crmUrl || agents === null || (agents.length > 1 && !chosen)) {
    // Carregando OU aguardando escolha do agente.
    if (agents && agents.length > 1 && !chosen) {
      return (
        <div className="crm-fs">{back}
          <div className="crm-pick">
            <div className="crm-pick-card">
              <div className="crm-pick-h"><span className="crm-pick-ic"><MessageCircle size={18} /></span>
                <div><h3>{t("Entrar no WhatsApp CRM")}</h3><p>{t("Escolha o agente — cada um tem o próprio CRM.")}</p></div>
              </div>
              {agents.map((a) => (
                <button key={a.id} className="crm-pick-item" onClick={() => setChosen(a.id)}>
                  <span className={"crm-pick-dot" + (a.status === "live" || a.status === "active" ? " on" : "")} />
                  <b>{a.name}</b>{a.slug && <span className="crm-pick-sub">{a.slug}</span>}
                  <ChevronRight size={16} style={{ marginLeft: "auto", opacity: .6 }} />
                </button>
              ))}
              <button className="crm-pick-all" onClick={() => setChosen("*")}>{t("Ver a empresa inteira ({n} agentes juntos)", { n: agents.length })}</button>
            </div>
          </div>
        </div>
      );
    }
    return <div className="crm-fs">{back}<div className="crm-fs-msg">{t("Abrindo o WhatsApp CRM…")}</div></div>;
  }

  const agentQS = chosen && chosen !== "*" ? `&agent=${encodeURIComponent(chosen)}` : "";
  // Token no FRAGMENTO (#), NUNCA na query: o `#` não é enviado ao servidor, então o JWT do cliente
  // não vaza no access-log/histórico/Referer do iframe (era um vazamento diário). O CRM já lê do #
  // (session.ts), com fallback pra ?query durante a transição.
  const src = `${crmUrl}/?embedded=1${agentQS}#access_token=${encodeURIComponent(token || "")}`;
  // Mini-cockpit de BI no topo do módulo (dado real do wacrm). Sem fonte = "—".
  const stat = (label: string, value: any, tone?: "warn") => (
    <div style={{ padding: "8px 16px", borderRight: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", minWidth: 120 }}>
      <div style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--crasto-text-muted)", fontWeight: 600 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 18, fontWeight: 700, color: tone === "warn" ? "#B54708" : "var(--crasto-text-primary)", marginTop: 1 }}>{value}</div>
    </div>
  );
  return (
    <div className="crm-fs">{back}
      <div style={{ display: "flex", alignItems: "stretch", background: "var(--crasto-surface, #fff)", borderBottom: "1px solid var(--crasto-border-soft, rgba(1,14,38,.08))", overflowX: "auto", flex: "0 0 auto" }}>
        {stat(t("Agentes conectados"), live ? `${live.agentesOnline}/${live.agentesTotal}` : "—")}
        {stat(t("Conversas ativas"), live ? live.conversasAtivas : "—")}
        {stat(t("Aguardando na fila"), live ? live.fila : "—", live && live.fila > 0 ? "warn" : undefined)}
        {stat(t("Atendido pela IA · hoje"), live ? (live.automacaoHoje != null ? `${live.automacaoHoje}%` : "—") : "—")}
        <div style={{ marginLeft: "auto", alignSelf: "center", padding: "0 14px", fontSize: 11, color: "var(--crasto-text-muted)" }}>{t("ao vivo · atualiza a cada 30s")}</div>
      </div>
      <iframe title="WhatsApp CRM" src={src} className="crm-fs-frame" allow="clipboard-write; microphone; camera; autoplay" />
    </div>
  );
}
