import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "../../lib/supabase";
import { services } from "../../services";
import { useT } from "../../lib/i18n";

// WhatsApp CRM INTERNO da Crasto.AI (admin). É o NOSSO próprio WhatsApp — a Julie (comercial,
// com o Jorge técnico DENTRO dela) — para acompanharmos a operação por dentro do admin.
//
// COMO ABRE (por que assim): o CRM mora em portal.crasto.ai/crm — MESMA origem do Portal. Então
// embarcamos igual ao CRM do cliente (CrmEmbed): iframe com o token do admin no FRAGMENTO (#),
// que NUNCA vai ao servidor (não vaza em log/Referer — decisão de 15/07). O escopo de admin
// (imp_org/imp_agent) vai na QUERY: o App.tsx do CRM lê e aplica a impersonação; quem AUTORIZA é
// o is_admin do JWT (admin@crasto.ai é crasto_admin). Não usamos o /entrar (aquele exige raiz,
// que aqui é o Portal, e por isso o redirect voltava pra Visão Geral).
//
// Org/agente FIXOS (a Crasto.AI / a Julie): o admin não é membro da Crasto.AI (org própria), por
// isso miramos explicitamente. Julie é a agente PRINCIPAL → abre nela direto.
const CRM_WEB_FALLBACK = "https://portal.crasto.ai/crm";
const CRASTO_ORG = "8052e24d-eed4-4bbc-bcfb-f9b66ba41cdd";
const JULIE_ID = "5acfe775-1f15-46d2-9393-20a5e2ba5b78";
const JULIE_NOME = "Julie, Comercial";

export default function AdminCrm() {
  const t = useT();
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const tk = data.session?.access_token;
        if (!tk) { setErr(t("Sessão expirada — recarregue a página.")); return; }
        // O crm_url canônico vem do overview (CRM_WEB_URL da API); fallback pra constante.
        let base = CRM_WEB_FALLBACK;
        try { const ov = await services.crmAccess.overview(CRASTO_ORG); if (ov.crm_url) base = ov.crm_url; } catch { /* usa fallback */ }
        base = base.replace(/\/$/, "");
        // Registro do acesso (trilha) — best-effort, nunca trava a abertura.
        try {
          await services.analytics.admin.auditRecord({
            action: "impersonate_attempt", target_type: "agent", target_id: JULIE_ID,
            organization_id: CRASTO_ORG, context: { via: "admin_whatsapp_crm_interno", agent: JULIE_NOME },
          });
        } catch { /* ignora */ }
        const qs = `embedded=1&imp_org=${CRASTO_ORG}&imp_org_nome=${encodeURIComponent("Crasto.AI")}`
          + `&imp_agent=${encodeURIComponent(JULIE_ID)}&imp_agent_nome=${encodeURIComponent(JULIE_NOME)}`;
        setSrc(`${base}/?${qs}#access_token=${encodeURIComponent(tk)}`);
      } catch (e: any) { setErr(e?.message || t("Não foi possível abrir o WhatsApp CRM.")); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Embarcado DENTRO do admin (não em tela cheia): preenche o conteúdo e mantém o sidebar do
  // Portal visível. O container ocupa toda a altura do .canvas (flex:1) e o iframe ocupa o resto.
  const wrap: CSSProperties = { display: "flex", flexDirection: "column", height: "100%", minHeight: "70vh", gap: 10 };
  const msg = (texto: string) => (
    <div style={wrap}>
      <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--crasto-text-muted)", fontSize: 14 }}>{texto}</div>
    </div>
  );
  if (err) return msg(err);
  if (!src) return msg(t("Abrindo o WhatsApp interno da Crasto (Julie)…"));
  return (
    <div style={wrap}>
      <iframe
        title="WhatsApp CRM"
        src={src}
        style={{ flex: 1, width: "100%", border: 0, borderRadius: 12, minHeight: 0, background: "#fff" }}
        allow="clipboard-write; microphone; camera; autoplay"
      />
    </div>
  );
}
