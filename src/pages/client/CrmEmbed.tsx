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
// Onde guardamos a última escolha de agente (p/ F5 não voltar ao seletor).
const CHOSEN_KEY = "crm_agent_choice";

export default function CrmEmbed() {
  const t = useT();
  const navigate = useNavigate();
  const [crmUrl, setCrmUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null); // id do agente ou "*" (empresa inteira)
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        // PARALELIZA o que é independente (módulos + sessão) — antes eram 2 esperas em série.
        const [cms, sess] = await Promise.all([
          services.delivery.clientModules.listMine() as Promise<any[]>,
          supabase.auth.getSession(),
        ]);
        const crm = (cms || []).find((c) => c.crm_url);
        if (!crm?.crm_url) { setErr(t("O WhatsApp CRM não está liberado para o seu acesso.")); return; }
        const tk = sess.data.session?.access_token;
        if (!tk) { setErr(t("Sessão expirada — recarregue a página.")); return; }
        const url = String(crm.crm_url).replace(/\/$/, "");
        setCrmUrl(url); setToken(tk);

        // CLICOU no menu (navegação normal) → MOSTRA o seletor de agente para ele escolher.
        // F5 dentro do CRM (reload) → RESTAURA a escolha salva e entra direto (não volta ao seletor).
        // É o que distingue "entrar" de "recarregar" — ambos montam este componente.
        const recarregou = (() => {
          try { const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming; return n?.type === "reload" || n?.type === "back_forward"; } catch { return false; }
        })();
        let saved: string | null = null;
        try { saved = localStorage.getItem(CHOSEN_KEY); } catch { /* storage indisponível */ }
        if (saved && recarregou) setChosen(saved); // só no F5: embarca imediato mantendo a escolha

        // Agentes (fonte = wacrm) — decidem se aparece o seletor.
        let ags: Agent[] = [];
        try {
          const r = await fetch(`${WACRM_API}/api/me`, { headers: { Authorization: "Bearer " + tk } });
          const j = await r.json();
          ags = Array.isArray(j?.agents) ? j.agents : [];
        } catch { /* sem lista → entra direto no principal */ }
        setAgents(ags);
        if (ags.length <= 1) setChosen(ags[0]?.id || "*"); // 0/1 agente → sem seletor, entra direto
        else if (recarregou && saved && !ags.some((a) => a.id === saved) && saved !== "*") setChosen(null); // F5 com escolha inválida → seletor
        // Clique normal (não-reload) em org com >1 agente: chosen fica null → o seletor aparece.
      } catch (e: any) { setErr(e?.message || t("Não foi possível abrir o WhatsApp CRM.")); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Escolher um agente PERSISTE a escolha — assim o F5 dentro do CRM não volta ao seletor.
  const pick = (v: string) => { try { localStorage.setItem(CHOSEN_KEY, v); } catch { /* nada */ } setChosen(v); };

  const back = (
    <div className="crm-fs-top">
      <button className="crm-back" onClick={() => navigate("/app")}><ChevronLeft size={16} /> {t("Voltar ao Portal")}</button>
      <span className="crm-fs-title">WhatsApp CRM</span>
    </div>
  );

  if (err) return <div className="crm-fs">{back}<div className="crm-fs-msg">{err}</div></div>;
  // Embarca assim que tiver a URL e a escolha do agente — NÃO espera mais a lista de agentes
  // (/api/me). Quem já tem escolha salva (o normal) entra na hora; só mostra o seletor quando de
  // fato há mais de um agente e nenhuma escolha.
  if (!crmUrl || !chosen) {
    if (agents && agents.length > 1 && !chosen) {
      return (
        <div className="crm-fs">{back}
          <div className="crm-pick">
            <div className="crm-pick-card">
              <div className="crm-pick-h"><span className="crm-pick-ic"><MessageCircle size={18} /></span>
                <div><h3>{t("Entrar no WhatsApp CRM")}</h3><p>{t("Escolha o agente — cada um tem o próprio CRM.")}</p></div>
              </div>
              {agents.map((a) => (
                <button key={a.id} className="crm-pick-item" onClick={() => pick(a.id)}>
                  <span className={"crm-pick-dot" + (a.status === "live" || a.status === "active" ? " on" : "")} />
                  <b>{a.name}</b>{a.slug && <span className="crm-pick-sub">{a.slug}</span>}
                  <ChevronRight size={16} style={{ marginLeft: "auto", opacity: .6 }} />
                </button>
              ))}
              <button className="crm-pick-all" onClick={() => pick("*")}>{t("Ver a empresa inteira ({n} agentes juntos)", { n: agents.length })}</button>
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
  return (
    <div className="crm-fs">{back}
      <iframe title="WhatsApp CRM" src={src} className="crm-fs-frame" allow="clipboard-write; microphone; camera; autoplay" />
    </div>
  );
}
