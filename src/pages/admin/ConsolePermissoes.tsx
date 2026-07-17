import { useMemo, useState } from "react";
import { Shield, Users, Building2, Lock, Search, ChevronDown, ChevronRight, SlidersHorizontal, Check } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, useToast, initials } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";
import { CLIENT_SCREENS, ALL_SCREEN_KEYS, BASE_SCREEN, allowedScreens } from "../../lib/screens";

// Permissões & Acessos (Fase C.2) — por cliente, com busca; o acesso é POR TELA.
type U = { id: string; full_name: string | null; email: string | null; role: string; last_login: string | null; screens?: string[] };
type Client = { organization_id: string; name: string; users: U[] };

const roleLabel = (r: string) => (r === "client_owner" ? "Dono" : r === "client_member" ? "Equipe" : r === "crasto_admin" ? "Super-admin" : r === "connector" ? "Indicador" : r);
const lastLogin = (s: string | null, t: (k: string, p?: any) => string) => {
  if (!s) return t("nunca acessou");
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  return d <= 0 ? t("hoje") : t("há {n} dia(s)", { n: d });
};
const accessSummary = (u: U, t: (k: string, p?: any) => string) =>
  u.role === "client_owner" ? t("Dono — acesso total")
    : t("{n} de {total} telas", { n: allowedScreens(u.screens).size, total: ALL_SCREEN_KEYS.length });

export default function ConsolePermissoes() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => (await services.analytics.admin.accessList()) as any, []);
  const platform: U[] = data?.platform ?? [];
  const clients: Client[] = data?.clients ?? [];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toast = useToast();

  // popup de configuração de acesso
  const [cfg, setCfg] = useState<{ user: U; orgName: string; orgId: string } | null>(null);
  type CrmState = { loading: boolean; hasAccess: boolean; owner: boolean; catalog: { key: string; label: string }[]; screens: Set<string> } | null;
  const [crm, setCrm] = useState<CrmState>(null);
  const [pf, setPf] = useState<{ owner: boolean; screens: Set<string> }>({ owner: false, screens: new Set() });
  const [busy, setBusy] = useState(false);

  const totalUsers = platform.length + clients.reduce((s, c) => s + c.users.length, 0);
  const withAccess = clients.filter((c) => c.users.length > 0).length;

  const query = q.trim().toLowerCase();
  const filtered = useMemo(() => clients
    .map((c) => {
      if (!query) return c;
      const nameHit = c.name.toLowerCase().includes(query);
      const users = c.users.filter((u) => `${u.full_name || ""} ${u.email || ""}`.toLowerCase().includes(query));
      return nameHit ? c : { ...c, users };
    })
    .filter((c) => !query || c.name.toLowerCase().includes(query) || c.users.length > 0), [clients, query]);
  const isOpen = (id: string) => open[id] ?? !!query; // busca abre automaticamente

  function configure(u: U, orgName: string, orgId: string) {
    const owner = u.role === "client_owner";
    setPf({ owner, screens: new Set(owner ? ALL_SCREEN_KEYS : (u.screens && u.screens.length ? u.screens : [BASE_SCREEN])) });
    setCfg({ user: u, orgName, orgId });
    // Telas do CRM: vive no CRM, então perguntamos à ponte. Só aparece se o usuário tiver
    // acesso ao WhatsApp CRM daquele cliente (decisão do Crasto).
    setCrm({ loading: true, hasAccess: false, owner: false, catalog: [], screens: new Set() });
    services.crmAccess.crmScreens(orgId, u.id).then((r) => {
      if (r.error && !r.catalog) { setCrm({ loading: false, hasAccess: false, owner: false, catalog: [], screens: new Set() }); return; }
      setCrm({ loading: false, hasAccess: !!r.has_access, owner: !!r.owner, catalog: r.catalog || [],
               screens: new Set(r.screens && r.screens.length ? r.screens : (r.catalog || []).map((x) => x.key)) });
    }).catch(() => setCrm({ loading: false, hasAccess: false, owner: false, catalog: [], screens: new Set() }));
  }
  function toggleCrmScreen(k: string) {
    if (k === "dashboard") return; // base do CRM
    setCrm((c) => { if (!c) return c; const s = new Set(c.screens); s.has(k) ? s.delete(k) : s.add(k); return { ...c, screens: s }; });
  }
  function toggleScreen(k: string) {
    if (k === BASE_SCREEN) return; // Início é base, sempre visível
    setPf((p) => { const s = new Set(p.screens); s.has(k) ? s.delete(k) : s.add(k); return { ...p, screens: s }; });
  }
  async function saveAccess() {
    if (!cfg) return;
    setBusy(true);
    try {
      const role = pf.owner ? "client_owner" : "client_member";
      const screens = pf.owner ? [] : Array.from(new Set([BASE_SCREEN, ...pf.screens]));
      await services.analytics.admin.setUserAccess(cfg.user.id, role, screens);
      // Telas do CRM (só se o usuário tiver acesso e não for o dono do CRM, que vê tudo):
      // sistema à parte, chamada à parte — mas UM Salvar.
      if (crm?.hasAccess && !crm.owner) {
        const r = await services.crmAccess.setCrmScreens(cfg.orgId, cfg.user.id, Array.from(crm.screens));
        if (r?.error) throw new Error(t("Telas do Portal salvas, mas as do CRM falharam: ") + r.error);
      }
      setCfg(null); await reload(); toast.ok(t("Acesso atualizado ✓"));
    } catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHead eyebrow="Console · IA 🔒 · Segurança" title="Permissões & Acessos"
        sub="Por cliente: quem tem acesso e QUAIS TELAS cada usuário vê. Isolado por RLS — cada cliente só enxerga a própria empresa." />

      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="lab"><Users size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Usuários")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : totalUsers}</div><div className="delta">{t("plataforma + clientes")}</div></div>
        <div className="kpi"><div className="lab"><Shield size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Admins de plataforma")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : platform.length}</div><div className="delta">{t("equipe Crasto.AI")}</div></div>
        <div className="kpi g"><div className="lab"><Building2 size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Clientes com acesso")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : withAccess}<small> / {clients.length}</small></div><div className="delta">{t("com usuário ativo")}</div></div>
        <div className="kpi"><div className="lab"><Lock size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Isolamento")}</div><div className="val" style={{ fontSize: 18, color: "#1F8A5B" }}>RLS</div><div className="delta">{t("por organização")}</div></div>
      </div>

      <div className="catsearch" style={{ marginBottom: 14 }}>
        <Search size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar cliente ou usuário…")} />
      </div>

      {/* Plataforma (leitura) */}
      <div className="sec-h"><h2>{t("Plataforma (Crasto.AI)")}</h2><Pill tone="info">{t("concedido manualmente")}</Pill></div>
      {loading ? <Empty>{t("Carregando…")}</Empty> : platform.map((u) => (
        <div className="crmrow" key={u.id}>
          <div className="logo" style={{ width: 34, height: 34, fontSize: 12 }}>{initials(u.full_name || u.email || "?")}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{u.full_name || "—"}</div><div className="mt">{u.email} · {lastLogin(u.last_login, t)}</div></div>
          <Pill tone="info">{t(roleLabel(u.role))}</Pill>
        </div>
      ))}

      {/* Por cliente — colapsável + busca */}
      <div className="sec-h" style={{ marginTop: 22 }}><h2>{t("Acessos por cliente")}</h2></div>
      {loading ? <Empty>{t("Carregando…")}</Empty> : filtered.length === 0 ? <Empty>{t("Nenhum cliente encontrado.")}</Empty> : filtered.map((c) => {
        const opened = isOpen(c.organization_id);
        return (
          <div className="card acccard" key={c.organization_id}>
            <button className="acchead" onClick={() => setOpen((o) => ({ ...o, [c.organization_id]: !opened }))}>
              {opened ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <div className="logo" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(c.name)}</div>
              <h3 style={{ margin: 0, flex: 1, textAlign: "left" }}>{c.name}</h3>
              <Pill tone="mute">{t("{n} usuário(s)", { n: c.users.length })}</Pill>
            </button>
            {opened && (c.users.length === 0
              ? <div className="mt" style={{ padding: "6px 2px 2px 40px" }}>{t("Nenhum usuário cadastrado neste cliente ainda.")}</div>
              : c.users.map((u) => (
                <div className="crmrow accrow" key={u.id}>
                  <div className="logo" style={{ width: 32, height: 32, fontSize: 12 }}>{initials(u.full_name || u.email || "?")}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{u.full_name || "—"}</div><div className="mt">{u.email} · {lastLogin(u.last_login, t)}</div></div>
                  <Pill tone={u.role === "client_owner" ? "ok" : "mute"}>{accessSummary(u, t)}</Pill>
                  <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => configure(u, c.name, c.organization_id)}><span className="crasto-btn__icon"><SlidersHorizontal size={14} /></span><span className="crasto-btn__label">{t("Configurar acesso")}</span></button>
                </div>
              )))}
          </div>
        );
      })}

      <div className="note" style={{ marginTop: 8 }}>
        <Lock size={15} />
        <div>{t("O acesso é por tela: o dono vê tudo; para os demais você escolhe as telas. A RLS por organização protege dados e permissões, e toda mudança fica em Auditoria & Logs.")}</div>
      </div>

      {/* Popup: configurar acesso do usuário */}
      <Modal title={t("Configurar acesso")} open={!!cfg} onClose={() => setCfg(null)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setCfg(null)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={saveAccess}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar acesso")}</span></button></>}>
        {cfg && (<>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div className="logo" style={{ width: 36, height: 36, fontSize: 12 }}>{initials(cfg.user.full_name || cfg.user.email || "?")}</div>
            <div><div className="nm">{cfg.user.full_name || "—"}</div><div className="mt">{cfg.user.email} · {cfg.orgName}</div></div>
          </div>

          <div className="accseg">
            <button className={"accseg-b" + (pf.owner ? " on" : "")} onClick={() => setPf((p) => ({ ...p, owner: true }))}>
              <div className="t">{t("Dono — acesso total")}</div><div className="s">{t("vê todas as telas e gerencia a empresa")}</div>
            </button>
            <button className={"accseg-b" + (!pf.owner ? " on" : "")} onClick={() => setPf((p) => ({ ...p, owner: false }))}>
              <div className="t">{t("Acesso personalizado")}</div><div className="s">{t("você escolhe as telas abaixo")}</div>
            </button>
          </div>

          {!pf.owner && (
            <div className="screengrid">
              {CLIENT_SCREENS.map((s) => {
                const on = s.key === BASE_SCREEN || pf.screens.has(s.key);
                const base = s.key === BASE_SCREEN;
                return (
                  <button key={s.key} className={"screenpick" + (on ? " on" : "") + (base ? " base" : "")} onClick={() => toggleScreen(s.key)} disabled={base} title={base ? t("Início é sempre visível") : ""}>
                    <span className="box">{on && <Check size={13} />}</span>
                    <span className="lb">{t(s.label)}{base && <em> · {t("base")}</em>}</span>
                  </button>
                );
              })}
            </div>
          )}
          {pf.owner && <div className="note"><Check size={15} /><div>{t("Este usuário verá todas as telas do portal e poderá gerenciar a empresa.")}</div></div>}

          <div style={{ borderTop: "1px solid var(--crasto-border)", margin: "18px 0 14px" }} />
          <div className="nm" style={{ marginBottom: 8 }}>{t("Telas do WhatsApp CRM")}</div>
          {crm?.loading && <div className="mt">{t("Carregando…")}</div>}
          {crm && !crm.loading && !crm.hasAccess && (
            <div className="mt" style={{ color: "var(--crasto-text-muted)" }}>{t("Este usuário não tem acesso ao WhatsApp CRM. Conceda o acesso em Clientes → Acesso ao CRM para escolher as telas.")}</div>
          )}
          {crm && !crm.loading && crm.hasAccess && crm.owner && (
            <div className="note"><Check size={15} /><div>{t("Dono do CRM: vê todas as telas do WhatsApp CRM (não é restringível).")}</div></div>
          )}
          {crm && !crm.loading && crm.hasAccess && !crm.owner && (
            <div className="screengrid">
              {crm.catalog.map((sc) => {
                const on = sc.key === "dashboard" || crm.screens.has(sc.key);
                const base = sc.key === "dashboard";
                return (
                  <button key={sc.key} className={"screenpick" + (on ? " on" : "") + (base ? " base" : "")} onClick={() => toggleCrmScreen(sc.key)} disabled={base} title={base ? t("Dashboard é sempre visível") : ""}>
                    <span className="box">{on && <Check size={13} />}</span>
                    <span className="lb">{t(sc.label)}{base && <em> · {t("base")}</em>}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>)}
      </Modal>
      {toast.node}
    </div>
  );
}
