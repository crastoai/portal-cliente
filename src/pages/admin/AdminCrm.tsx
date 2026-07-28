import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { services } from "../../services";
import { useT } from "../../lib/i18n";

// WhatsApp CRM INTERNO da Crasto.AI (admin) — TELA CHEIA e NATIVO (sem banner de "visualização").
//
// COMO (por que assim): o admin agora é MEMBRO da org Crasto.AI (public.org_members), então
// entramos por ORG ATIVA — não por impersonação. Sem impersonação, o CRM não mostra o banner
// "Visualizando… (Console)": é o sistema normal. O CRM mora em portal.crasto.ai/crm (MESMA origem
// do Portal), então o localStorage é COMPARTILHADO — escrevemos aqui a org ativa e o CRM lê no
// boot. O agente principal (Julie) vai no ?agent= (o CRM lê no boot, initActiveAgent). Token do
// admin no FRAGMENTO (#), nunca na query (não vaza — decisão 15/07). Limpamos qualquer
// impersonação antiga pra o banner não reaparecer.
const CRM_WEB_FALLBACK = "https://portal.crasto.ai/crm";
const CRASTO_ORG = "8052e24d-eed4-4bbc-bcfb-f9b66ba41cdd";
const JULIE_ID = "5acfe775-1f15-46d2-9393-20a5e2ba5b78";

export default function AdminCrm() {
  const t = useT();
  const navigate = useNavigate();
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const tk = data.session?.access_token;
        if (!tk) { setErr(t("Sessão expirada — recarregue a página.")); return; }
        let base = CRM_WEB_FALLBACK;
        try { const ov = await services.crmAccess.overview(CRASTO_ORG); if (ov.crm_url) base = ov.crm_url; } catch { /* usa fallback */ }
        base = base.replace(/\/$/, "");
        try {
          localStorage.setItem("wacrm.active_org", CRASTO_ORG); // entra na org da Crasto (membro → sem banner)
          localStorage.removeItem("wacrm.impersonate");         // sem resquício de "visualização"
        } catch { /* storage indisponível: o CRM ainda cai na org do próprio token */ }
        setSrc(`${base}/?embedded=1&agent=${encodeURIComponent(JULIE_ID)}#access_token=${encodeURIComponent(tk)}`);
      } catch (e: any) { setErr(e?.message || t("Não foi possível abrir o WhatsApp CRM.")); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const back = (
    <div className="crm-fs-top">
      <button className="crm-back" onClick={() => navigate("/admin")}><ChevronLeft size={16} /> {t("Voltar ao Admin")}</button>
      <span className="crm-fs-title">WhatsApp CRM · Crasto.AI</span>
    </div>
  );

  if (err) return <div className="crm-fs">{back}<div className="crm-fs-msg">{err}</div></div>;
  if (!src) return <div className="crm-fs">{back}<div className="crm-fs-msg">{t("Abrindo o WhatsApp interno da Crasto (Julie)…")}</div></div>;
  return (
    <div className="crm-fs">{back}
      <iframe title="WhatsApp CRM" src={src} className="crm-fs-frame" allow="clipboard-write; microphone; camera; autoplay" />
    </div>
  );
}
