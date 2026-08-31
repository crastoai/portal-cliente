import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ChevronDown, Search, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { services } from "../../services";
import { useT } from "../../lib/i18n";
import AcessarComoModal from "../../ui/AcessarComo";

// WhatsApp CRM INTERNO da Crasto.AI (admin) — embarcado, tela cheia, com SELETOR no topo.
//
// DUAS COISAS DIFERENTES, e a distinção é o ponto deste arquivo:
//  • "Crasto.AI · interno" → NATIVO. O admin É membro desta org: vê o CRM dela como ele mesmo.
//    Não é impersonação, não precisa de nada especial — continua embarcado aqui.
//  • um CLIENTE → é VER O DADO DE OUTRA EMPRESA, e para isso o sistema tem UM caminho só:
//    "Acessar como" (impersonação real). Abre o seletor de pessoa e troca a identidade.
//
// Antes, escolher um cliente escrevia `wacrm.impersonate` no localStorage (compartilhado, porque o
// CRM mora na mesma origem) e recarregava o iframe com o token do ADMIN — um terceiro mecanismo,
// que dependia de o CRM saber tratar um escopo alheio, e cujo resquício no localStorage ainda
// contaminava outras telas. Trocar de identidade dispensa tudo isso.
//
// O que ficou: `wacrm.active_org` para o modo interno (é o escopo do próprio admin, legítimo).
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
  const [verComo, setVerComo] = useState<{ org: string; nome: string } | null>(null);
  const nav = useNavigate();

  // Escreve o escopo no localStorage compartilhado e monta a src. Síncrono: garante que o iframe
  // (que recarrega pelo `key`) já leia o escopo novo no boot.
  function aplicar(_s: Sel, b: string, tk: string) {
    // Só o modo interno chega aqui (ver o cabeçalho): o escopo é a própria org do admin.
    try {
      localStorage.setItem("wacrm.active_org", CRASTO_ORG); // membro → sem banner
      localStorage.removeItem("wacrm.impersonate");
    } catch { /* storage indisponível */ }
    setSrc(`${b.replace(/\/$/, "")}/?embedded=1&agent=${encodeURIComponent(JULIE_ID)}#access_token=${encodeURIComponent(tk)}`);
  }

  function selecionar(s: Sel) {
    if (!token) return;
    setOpen(false); setQ("");
    // Cliente = dado de outra empresa → caminho único: "Acessar como" (troca a identidade).
    if (s.kind === "client") { setVerComo({ org: s.orgId, nome: s.name }); return; }
    setSel(s);
    aplicar(s, base, token);
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
        <span className="crm-fs-title">{t("Escolher um cliente abre o CRM dele como um usuário dele.")}</span>
      </div>

      <AcessarComoModal orgId={verComo?.org || ""} orgName={verComo?.nome || ""} open={!!verComo}
        onClose={() => setVerComo(null)}
        onIrParaPermissoes={() => { const o = verComo?.org; setVerComo(null); nav(`/admin/console/permissoes?org=${o}`); }} />

      {err ? <div className="crm-fs-msg">{err}</div>
        : !src ? <div className="crm-fs-msg">{t("Abrindo o WhatsApp CRM…")}</div>
        : <iframe key={key} title="WhatsApp CRM" src={src} className="crm-fs-frame" allow="clipboard-write; microphone; camera; autoplay" />}
    </div>
  );
}
