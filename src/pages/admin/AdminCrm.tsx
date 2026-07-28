import { useEffect, useState } from "react";
import { MessageCircle, ChevronRight, Building2 } from "lucide-react";
import { services, errorMessage } from "../../services";
import type { CrmAgent } from "../../services/crmAccess.service";
import { useT } from "../../lib/i18n";

// WhatsApp CRM INTERNO da Crasto.AI (admin). É o NOSSO próprio WhatsApp — Julie (comercial,
// com o Jorge técnico dentro dela) e os demais agentes — para acompanharmos a operação por
// dentro do admin. Reusa o MESMO fluxo de entrada do admin da Visão Geral: pedimos ao Portal
// um OTP de uso único (magiclink do próprio admin) e o CRM troca por sessão na origem dele
// (/entrar). NUNCA vai bearer na URL (decisão de 15/07). Quem autoriza é o is_admin do JWT.
//
// A org é FIXA (a Crasto.AI): não dá para inferir "a org do usuário logado" — o admin pode não
// ser membro dela (ex.: conta sem org). Mirar explicitamente é o robusto.
const CRASTO_ORG = "8052e24d-eed4-4bbc-bcfb-f9b66ba41cdd";
const CRASTO_NOME = "Crasto.AI";

export default function AdminCrm() {
  const t = useT();
  const [agents, setAgents] = useState<CrmAgent[] | null>(null);
  const [crmUrl, setCrmUrl] = useState("");
  const [err, setErr] = useState("");
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const ov = await services.crmAccess.overview(CRASTO_ORG);
        setCrmUrl(ov.crm_url || "");
        setAgents(ov.agents || []);
        if (ov.crm_error) setErr(ov.crm_error);
      } catch (e) { setErr(errorMessage(e)); setAgents([]); }
    })();
  }, []);

  // Entra no CRM interno (num agente específico ou na empresa inteira). Idêntico ao abrirCrm
  // da Visão Geral — o CRM é outra origem/sessão, então a ponte é o OTP + escopo na URL.
  async function entrar(agent?: CrmAgent) {
    if (entrando) return;
    if (!crmUrl) { setErr(t("CRM ainda não configurado (CRM_WEB_URL).")); return; }
    setEntrando(true); setErr("");
    try {
      await services.analytics.admin.auditRecord({
        action: "impersonate_attempt", target_type: agent ? "agent" : "org",
        target_id: agent?.id || CRASTO_ORG, organization_id: CRASTO_ORG,
        context: { via: "admin_whatsapp_crm_interno", agent: agent?.name ?? null },
      });
    } catch { /* best-effort */ }
    try {
      const { token, type } = await services.crmAccess.enter();
      const u = new URL(crmUrl);
      u.pathname = "/entrar"; // o CRM trata /entrar na RAIZ (wacrm/web App.tsx), como na Visão Geral
      u.searchParams.set("token", token);
      u.searchParams.set("type", type || "magiclink");
      u.searchParams.set("imp_org", CRASTO_ORG);
      u.searchParams.set("imp_org_nome", CRASTO_NOME);
      if (agent) { u.searchParams.set("imp_agent", agent.id); u.searchParams.set("imp_agent_nome", agent.name); }
      window.location.href = u.toString();
    } catch (e) { setErr(errorMessage(e)); setEntrando(false); }
  }

  const on = (s?: string | null) => s === "live" || s === "active";

  return (
    <div className="page">
      <div className="sec-h">
        <h1>{t("WhatsApp CRM")}</h1>
      </div>
      <p className="mt" style={{ marginTop: -6, marginBottom: 18, maxWidth: 620 }}>
        {t("O WhatsApp interno da Crasto.AI. Entre para acompanhar a operação dos agentes (Julie comercial, Jorge técnico) e dos atendimentos humanos.")}
      </p>

      {err && <div className="formerr" style={{ marginBottom: 14, maxWidth: 460 }}>{err}</div>}

      <div style={{ display: "grid", placeItems: "start" }}>
        <div className="crm-pick-card">
          <div className="crm-pick-h">
            <span className="crm-pick-ic"><MessageCircle size={18} /></span>
            <div>
              <h3>{t("Entrar no WhatsApp CRM interno")}</h3>
              <p>{t("Escolha um agente — cada um tem o próprio CRM — ou entre na empresa inteira.")}</p>
            </div>
          </div>

          {agents === null ? (
            <div className="crm-pick-item" style={{ cursor: "default", justifyContent: "center", color: "var(--crasto-text-muted)" }}>
              {t("Carregando agentes…")}
            </div>
          ) : (
            <>
              {agents.map((a) => (
                <button key={a.id} className="crm-pick-item" disabled={entrando} onClick={() => entrar(a)}>
                  <span className={"crm-pick-dot" + (on(a.status) ? " on" : "")} />
                  <b>{a.name}</b>
                  {a.status && <span className="crm-pick-sub">{a.status}</span>}
                  <ChevronRight size={16} style={{ marginLeft: "auto", opacity: 0.6 }} />
                </button>
              ))}
              <button className="crm-pick-item" disabled={entrando} onClick={() => entrar()} style={{ marginTop: 10 }}>
                <span className="crm-pick-ic" style={{ width: 26, height: 26, borderRadius: 8 }}><Building2 size={14} /></span>
                <b>{t("Empresa inteira")}</b>
                <span className="crm-pick-sub">{t("todos os agentes juntos")}</span>
                <ChevronRight size={16} style={{ marginLeft: "auto", opacity: 0.6 }} />
              </button>
            </>
          )}

          {entrando && <div className="crm-pick-all" style={{ cursor: "default" }}>{t("Abrindo o WhatsApp CRM…")}</div>}
        </div>
      </div>
    </div>
  );
}
