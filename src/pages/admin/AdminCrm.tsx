import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, Search, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { services } from "../../services";
import { useT } from "../../lib/i18n";

// WhatsApp CRM INTERNO da Crasto.AI (admin) — embarcado, tela cheia, com SELETOR DE CLIENTE no topo.
//
// Um só lugar pra ver qualquer WhatsApp CRM:
//  • "Crasto.AI · interno" → NATIVO (org ativa; o admin é membro), sem banner de visualização.
//  • um CLIENTE → IMPERSONAÇÃO (o admin não é membro): o CRM mostra o banner "Visualizando…
//    (Console)" — aí é CORRETO, é a trava de auditoria de ver o dado do cliente.
//
// Como troca o escopo: o CRM mora em portal.crasto.ai/crm (MESMA origem do Portal), então o
// localStorage é COMPARTILHADO — escrevemos aqui `wacrm.active_org` (interno) OU `wacrm.impersonate`
// (cliente) e recarregamos o iframe (via `key`). Token do admin no FRAGMENTO (#), nunca na query.
const CRM_WEB_FALLBACK = "https://portal.crasto.ai/crm";
const CRASTO_ORG = "8052e24d-eed4-4bbc-bcfb-f9b66ba41cdd";
const JULIE_ID = "5acfe775-1f15-46d2-9393-20a5e2ba5b78";

type Sel = { kind: "internal" } | { kind: "client"; orgId: string; name: string };

export default function AdminCrm() {
  const t = useT();
  const [token, setToken] = useState<string | null>(null);
  const [base, setBase] = useState(CRM_WEB_FALLBACK);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [sel, setSel] = useState<Sel>({ kind: "internal" });
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  // Escreve o escopo no localStorage compartilhado e monta a src. Síncrono: garante que o iframe
  // (que recarrega pelo `key`) já leia o escopo novo no boot.
  function aplicar(s: Sel, b: string, tk: string) {
    try {
      if (s.kind === "internal") {
        localStorage.setItem("wacrm.active_org", CRASTO_ORG); // membro → sem banner
        localStorage.removeItem("wacrm.impersonate");
      } else {
        localStorage.setItem("wacrm.impersonate", JSON.stringify({ orgId: s.orgId, name: s.name })); // visualização do cliente
        localStorage.removeItem("wacrm.active_org");
      }
    } catch { /* storage indisponível */ }
    const agentQS = s.kind === "internal" ? `&agent=${encodeURIComponent(JULIE_ID)}` : "";
    setSrc(`${b.replace(/\/$/, "")}/?embedded=1${agentQS}#access_token=${encodeURIComponent(tk)}`);
  }

  function selecionar(s: Sel) {
    if (!token) return;
    setSel(s);
    aplicar(s, base, token);
    setOpen(false); setQ("");
  }

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const tk = data.session?.access_token;
        if (!tk) { setErr(t("Sessão expirada — recarregue a página.")); return; }
        setToken(tk);
        let b = CRM_WEB_FALLBACK;
        try { const ov = await services.crmAccess.overview(CRASTO_ORG); if (ov.crm_url) b = ov.crm_url; } catch { /* fallback */ }
        setBase(b);
        try { const list = await services.identity.organizations.listBrief(); setOrgs((list || []).filter((o) => o.id !== CRASTO_ORG)); } catch { /* sem lista de clientes */ }
        aplicar({ kind: "internal" }, b, tk); // abre no interno (Julie)
      } catch (e: any) { setErr(e?.message || t("Não foi possível abrir o WhatsApp CRM.")); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? orgs.filter((o) => o.name.toLowerCase().includes(s)) : orgs;
  }, [orgs, q]);

  const label = sel.kind === "internal" ? "Crasto.AI" : sel.name;
  const key = sel.kind === "internal" ? "internal" : sel.orgId;

  return (
    <div className="admin-crm-fill">
      <div className="crm-fs-top">
        <div className="crm-switch">
          <button className="crm-switch-btn" onClick={() => setOpen((v) => !v)} title={t("Trocar o WhatsApp CRM que você está vendo")}>
            <Building2 size={15} />
            <b>{label}</b>
            {sel.kind === "internal" && <span className="crm-switch-tag">{t("interno")}</span>}
            <ChevronDown size={14} style={{ opacity: 0.7 }} />
          </button>
          {open && (
            <>
              <div className="crm-switch-ovl" onClick={() => { setOpen(false); setQ(""); }} />
              <div className="crm-switch-panel">
                <div className="crm-switch-search">
                  <Search size={14} />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar cliente…")} />
                </div>
                <button className="crm-switch-item" onClick={() => selecionar({ kind: "internal" })}>
                  <b>Crasto.AI</b> <span className="crm-switch-sub">{t("interno")}</span>
                  {sel.kind === "internal" && <Check size={15} style={{ marginLeft: "auto", color: "var(--crasto-navy)" }} />}
                </button>
                <div className="crm-switch-sep">{t("Clientes")}</div>
                {filtered.map((o) => (
                  <button key={o.id} className="crm-switch-item" onClick={() => selecionar({ kind: "client", orgId: o.id, name: o.name })}>
                    {o.name}
                    {sel.kind === "client" && sel.orgId === o.id && <Check size={15} style={{ marginLeft: "auto", color: "var(--crasto-navy)" }} />}
                  </button>
                ))}
                {!filtered.length && <div className="crm-switch-empty">{t("Nenhum cliente encontrado.")}</div>}
              </div>
            </>
          )}
        </div>
        {sel.kind === "client" && <span className="crm-fs-title">{t("Visualizando como admin")}</span>}
      </div>

      {err ? <div className="crm-fs-msg">{err}</div>
        : !src ? <div className="crm-fs-msg">{t("Abrindo o WhatsApp CRM…")}</div>
        : <iframe key={key} title="WhatsApp CRM" src={src} className="crm-fs-frame" allow="clipboard-write; microphone; camera; autoplay" />}
    </div>
  );
}
