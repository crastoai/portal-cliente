import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { services } from "../../services";
import { useT } from "../../lib/i18n";

// FASE 3 — WhatsApp CRM embarcado em TELA CHEIA dentro do Portal (sem nova aba).
// A casca do Portal some; aparece a casca do CRM (a sidebar dele, via ?embedded=1); no topo,
// a faixa "Voltar ao Portal". Sessão por handoff de token (?access_token=<JWT do Portal>) —
// mesmo IdP, sem login. Cada usuário abre com o PRÓPRIO token, então rotas/atividades no CRM
// ficam atribuídas a ele (RLS + presença por usuário no wacrm).
export default function CrmEmbed() {
  const t = useT();
  const navigate = useNavigate();
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const cms = (await services.delivery.clientModules.listMine()) as any[];
        const crm = (cms || []).find((c) => c.crm_url);
        if (!crm?.crm_url) { setErr(t("O WhatsApp CRM não está liberado para o seu acesso.")); return; }
        const { data } = await supabase.auth.getSession();
        const tk = data.session?.access_token;
        if (!tk) { setErr(t("Sessão expirada — recarregue a página.")); return; }
        setSrc(`${String(crm.crm_url).replace(/\/$/, "")}/?embedded=1&access_token=${encodeURIComponent(tk)}`);
      } catch (e: any) { setErr(e?.message || t("Não foi possível abrir o WhatsApp CRM.")); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="crm-fs">
      <div className="crm-fs-top">
        <button className="crm-back" onClick={() => navigate("/app")}><ChevronLeft size={16} /> {t("Voltar ao Portal")}</button>
        <span className="crm-fs-title">WhatsApp CRM</span>
      </div>
      {err ? (
        <div className="crm-fs-msg">{err}</div>
      ) : !src ? (
        <div className="crm-fs-msg">{t("Abrindo o WhatsApp CRM…")}</div>
      ) : (
        <iframe title="WhatsApp CRM" src={src} className="crm-fs-frame" allow="clipboard-write; microphone; camera; autoplay" />
      )}
    </div>
  );
}
