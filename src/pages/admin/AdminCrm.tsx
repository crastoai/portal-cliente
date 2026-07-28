import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { services, errorMessage } from "../../services";
import { useT } from "../../lib/i18n";

// WhatsApp CRM INTERNO da Crasto.AI (admin). É o NOSSO próprio WhatsApp — a Julie (comercial,
// com o Jorge técnico DENTRO dela) — para acompanharmos a operação por dentro do admin. Como a
// Julie é a agente PRINCIPAL, abrimos ela DIRETO (sem tela de escolher agente).
//
// Reusa o MESMO fluxo de entrada do admin da Visão Geral: pedimos ao Portal um OTP de uso único
// (magiclink do próprio admin) e o CRM troca por sessão na origem dele (/entrar). NUNCA vai
// bearer na URL (decisão de 15/07). Quem autoriza é o is_admin do JWT.
//
// Org e agente FIXOS (a Crasto.AI / a Julie): não dá para inferir "a org do usuário logado" — o
// admin pode não ser membro dela. Mirar explicitamente é o robusto. Se a Julie for recriada, o
// match por nome no overview cobre o id novo; a constante é só o fallback.
const CRASTO_ORG = "8052e24d-eed4-4bbc-bcfb-f9b66ba41cdd";
const CRASTO_NOME = "Crasto.AI";
const JULIE_ID = "5acfe775-1f15-46d2-9393-20a5e2ba5b78";
const JULIE_NOME = "Julie, Comercial";

export default function AdminCrm() {
  const t = useT();
  const [err, setErr] = useState("");
  const rodou = useRef(false);

  async function abrir() {
    setErr("");
    try {
      const ov = await services.crmAccess.overview(CRASTO_ORG);
      const url = ov.crm_url || "";
      if (!url) { setErr(t("CRM ainda não configurado (CRM_WEB_URL).")); return; }
      // Julie = agente principal. Preferimos o id vindo do overview (nome contém "Julie");
      // se não achar, caímos na constante conhecida.
      const julie = (ov.agents || []).find((a) => /julie/i.test(a.name));
      const agentId = julie?.id || JULIE_ID;
      const agentNome = julie?.name || JULIE_NOME;

      try {
        await services.analytics.admin.auditRecord({
          action: "impersonate_attempt", target_type: "agent", target_id: agentId,
          organization_id: CRASTO_ORG, context: { via: "admin_whatsapp_crm_interno", agent: agentNome },
        });
      } catch { /* best-effort */ }

      const { token, type } = await services.crmAccess.enter();
      const u = new URL(url);
      u.pathname = "/entrar"; // o CRM trata /entrar na RAIZ (wacrm/web App.tsx), como na Visão Geral
      u.searchParams.set("token", token);
      u.searchParams.set("type", type || "magiclink");
      u.searchParams.set("imp_org", CRASTO_ORG);
      u.searchParams.set("imp_org_nome", CRASTO_NOME);
      u.searchParams.set("imp_agent", agentId);
      u.searchParams.set("imp_agent_nome", agentNome);
      window.location.href = u.toString();
    } catch (e) { setErr(errorMessage(e)); }
  }

  // Abre a Julie assim que a tela monta (StrictMode roda o efeito 2x em dev → guarda).
  useEffect(() => {
    if (rodou.current) return;
    rodou.current = true;
    abrir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <div className="sec-h"><h1>{t("WhatsApp CRM")}</h1></div>
      <div style={{ display: "grid", placeItems: "center", minHeight: "50vh", gap: 16 }}>
        <div style={{ display: "grid", placeItems: "center", gap: 12, textAlign: "center", maxWidth: 420 }}>
          <span className="crm-pick-ic" style={{ width: 48, height: 48, borderRadius: 14 }}><MessageCircle size={22} /></span>
          {err ? (
            <>
              <div className="formerr" style={{ marginTop: 4 }}>{err}</div>
              <button className="crasto-btn crasto-btn--primary" onClick={abrir}>
                <span className="crasto-btn__label">{t("Tentar de novo")}</span>
              </button>
            </>
          ) : (
            <p className="mt" style={{ margin: 0 }}>{t("Abrindo o WhatsApp interno da Crasto (Julie)…")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
