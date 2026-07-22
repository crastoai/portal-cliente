import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { services } from "../../services";
import { Empty } from "../../ui/ui";
import { useT } from "../../lib/i18n";

// FASE 3 — embarque do WhatsApp CRM DENTRO da casca do Portal (sem nova aba).
// O wacrm é um app separado (banco próprio) servido em outra origem; renderizamos num iframe
// e entregamos a sessão por HANDOFF de token: o wacrm lê `?access_token=<JWT do Portal>` e
// entra logado (mesmo IdP), sem pedir senha. O wacrm apaga o token da URL ao carregar.
export default function CrmEmbed() {
  const t = useT();
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        // URL do wacrm = crm_url do módulo CRM contratado (a mesma p/ todos; o tenant vem do login).
        const cms = (await services.delivery.clientModules.listMine()) as any[];
        const crm = (cms || []).find((c) => c.crm_url);
        if (!crm?.crm_url) { setErr(t("O WhatsApp CRM não está liberado para o seu acesso.")); return; }
        const { data } = await supabase.auth.getSession();
        const tk = data.session?.access_token;
        if (!tk) { setErr(t("Sessão expirada — recarregue a página.")); return; }
        setSrc(`${String(crm.crm_url).replace(/\/$/, "")}/?access_token=${encodeURIComponent(tk)}`);
      } catch (e: any) { setErr(e?.message || t("Não foi possível abrir o WhatsApp CRM.")); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <Empty>{err}</Empty>;
  if (!src) return <Empty>{t("Abrindo o WhatsApp CRM…")}</Empty>;
  return <iframe title="WhatsApp CRM" src={src} className="module-frame" allow="clipboard-write; microphone; camera; autoplay" />;
}
