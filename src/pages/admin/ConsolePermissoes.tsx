import { useMemo, useState } from "react";
import { Shield, Users, Building2, Lock, Search, ChevronDown, ChevronRight, SlidersHorizontal, Check, MessageSquare, LayoutGrid } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, useToast, initials } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";
import { CLIENT_SCREENS, ALL_SCREEN_KEYS, BASE_SCREEN, allowedScreens } from "../../lib/screens";
import type { CrmUser } from "../../services/crmAccess.service";

// Permissões & Acessos — por cliente, com busca; o acesso é POR TELA.
// SEPARAÇÃO DELIBERADA (pedido do Crasto): "Usuários do Portal" e "Usuários do WhatsApp CRM"
// são DOIS conjuntos distintos. Na maioria dos casos o CRM tem operadores que NÃO estão no
// Portal — cada sistema é dono das suas telas e da sua lista. Por isso: duas seções, duas
// listas (cada uma da sua fonte da verdade) e dois popups (um só de telas do Portal, outro
// só de telas do CRM). Nunca mais um popup de Portal com "um cantinho de CRM".
type U = { id: string; full_name: string | null; email: string | null; role: string; last_login: string | null; screens?: string[] };
type Client = { organization_id: string; name: string; users: U[] };
type CrmBucket = { loading: boolean; enabled: boolean; users: CrmUser[]; error?: string };

const roleLabel = (r: string) => (r === "client_owner" ? "Dono" : r === "client_member" ? "Equipe" : r === "crasto_admin" ? "Super-admin" : r === "connector" ? "Indicador" : r);
const lastLogin = (s: string | null, t: (k: string, p?: any) => string) => {
  if (!s) return t("nunca acessou");
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  return d <= 0 ? t("hoje") : t("há {n} dia(s)", { n: d });
};
const accessSummary = (u: U, t: (k: string, p?: any) => string) =>
  u.role === "client_owner" ? t("Dono — acesso total")
    : t("{n} de {total} telas", { n: allowedScreens(u.screens).size, total: ALL_SCREEN_KEYS.length });
// Resumo das telas do CRM (a fronteira de dados é a RLS por org; tela é UI → dono vê tudo,
// lista vazia/'*' = todas). Sem contagem "de M" na lista: o M vive no CRM; o popup mostra tudo.
const crmSummary = (u: CrmUser, t: (k: string, p?: any) => string) => {
  if (u.role === "client_owner") return t("Dono — todas as telas");
  const arr = u.crm_screens;
  if (!arr || arr.includes("*")) return t("todas as telas");
  const n = new Set(["dashboard", ...arr]).size;
  return t("{n} tela(s)", { n });
};

export default function ConsolePermissoes() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => (await services.analytics.admin.accessList()) as any, []);
  const platform: U[] = data?.platform ?? [];
  const clients: Client[] = data?.clients ?? [];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [crmUsers, setCrmUsers] = useState<Record<string, CrmBucket>>({});
  const toast = useToast();

  // Popup 1 — telas do PORTAL (usuário do Portal)
  const [cfg, setCfg] = useState<{ user: U; orgName: string; orgId: string } | null>(null);
  const [pf, setPf] = useState<{ owner: boolean; screens: Set<string> }>({ owner: false, screens: new Set() });
  // Popup 2 — telas do CRM (usuário do CRM)
  const [cfgCrm, setCfgCrm] = useState<{ user: CrmUser; orgName: string; orgId: string } | null>(null);
  type CrmState = { loading: boolean; hasAccess: boolean; owner: boolean; catalog: { key: string; label: string }[]; screens: Set<string> };
  const [crm, setCrm] = useState<CrmState | null>(null);
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

  // Usuários do CRM carregam sob demanda (ao abrir o cliente): é uma chamada à ponte por org,
  // e a lista vem do CRM — inclui quem NÃO está no Portal.
  function loadCrmUsers(orgId: string) {
    setCrmUsers((m) => (m[orgId] && !m[orgId].error ? m : { ...m, [orgId]: { loading: true, enabled: false, users: [] } }));
    services.crmAccess.overview(orgId)
      .then((o) => setCrmUsers((m) => ({ ...m, [orgId]: { loading: false, enabled: !!o.enabled, users: o.users || [], error: o.crm_error || undefined } })))
      .catch((e) => setCrmUsers((m) => ({ ...m, [orgId]: { loading: false, enabled: false, users: [], error: errorMessage(e) } })));
  }
  function toggleClient(orgId: string) {
    const willOpen = !isOpen(orgId);
    setOpen((o) => ({ ...o, [orgId]: willOpen }));
    if (willOpen && !crmUsers[orgId]) loadCrmUsers(orgId);
  }

  // ---- Portal ----
  function configurePortal(u: U, orgName: string, orgId: string) {
    const owner = u.role === "client_owner";
    setPf({ owner, screens: new Set(owner ? ALL_SCREEN_KEYS : (u.screens && u.screens.length ? u.screens : [BASE_SCREEN])) });
    setCfg({ user: u, orgName, orgId });
  }
  function toggleScreen(k: string) {
    if (k === BASE_SCREEN) return; // Início é base, sempre visível
    setPf((p) => { const s = new Set(p.screens); s.has(k) ? s.delete(k) : s.add(k); return { ...p, screens: s }; });
  }
  async function savePortal() {
    if (!cfg) return;
    setBusy(true);
    try {
      const role = pf.owner ? "client_owner" : "client_member";
      const screens = pf.owner ? [] : Array.from(new Set([BASE_SCREEN, ...pf.screens]));
      await services.analytics.admin.setUserAccess(cfg.user.id, role, screens);
      setCfg(null); await reload(); toast.ok(t("Telas do Portal atualizadas ✓"));
    } catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
  }

  // ---- CRM ----
  function configureCrm(u: CrmUser, orgName: string, orgId: string) {
    setCrm({ loading: true, hasAccess: true, owner: u.role === "client_owner", catalog: [], screens: new Set() });
    setCfgCrm({ user: u, orgName, orgId });
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
  async function saveCrm() {
    if (!cfgCrm || !crm) return;
    setBusy(true);
    try {
      const r = await services.crmAccess.setCrmScreens(cfgCrm.orgId, cfgCrm.user.id, Array.from(crm.screens));
      if (r?.error) throw new Error(r.error);
      const orgId = cfgCrm.orgId;
      setCfgCrm(null); loadCrmUsers(orgId); toast.ok(t("Telas do CRM atualizadas ✓"));
    } catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHead eyebrow="Console · IA 🔒 · Segurança" title="Permissões & Acessos"
        sub="Por cliente, SEPARADO em dois: usuários do Portal e usuários do WhatsApp CRM — o CRM costuma ter gente que não está no Portal. Isolado por RLS: cada cliente só enxerga a própria empresa." />

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

      {/* Por cliente — colapsável + busca. Dentro: DUAS seções separadas (Portal / CRM). */}
      <div className="sec-h" style={{ marginTop: 22 }}><h2>{t("Acessos por cliente")}</h2></div>
      {loading ? <Empty>{t("Carregando…")}</Empty> : filtered.length === 0 ? <Empty>{t("Nenhum cliente encontrado.")}</Empty> : filtered.map((c) => {
        const opened = isOpen(c.organization_id);
        const bucket = crmUsers[c.organization_id];
        const crmList = (bucket?.users ?? []).filter((u) => !query || `${u.full_name || ""} ${u.email || ""}`.toLowerCase().includes(query));
        return (
          <div className="card acccard" key={c.organization_id}>
            <button className="acchead" onClick={() => toggleClient(c.organization_id)}>
              {opened ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <div className="logo" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(c.name)}</div>
              <h3 style={{ margin: 0, flex: 1, textAlign: "left" }}>{c.name}</h3>
              <Pill tone="mute">{t("{n} no Portal", { n: c.users.length })}</Pill>
              {bucket?.enabled && <Pill tone="info">{t("{n} no CRM", { n: bucket.users.length })}</Pill>}
            </button>

            {opened && (<>
              {/* ---- Seção 1: Usuários do PORTAL ---- */}
              <div className="permsub">
                <div className="permsub-h"><LayoutGrid size={14} /><span>{t("Usuários do Portal")}</span><span className="permsub-hint">{t("acesso e telas do Portal do Cliente")}</span></div>
                {c.users.length === 0
                  ? <div className="mt permsub-empty">{t("Ninguém acessa o Portal deste cliente ainda.")}</div>
                  : c.users.map((u) => (
                    <div className="crmrow accrow" key={u.id}>
                      <div className="logo" style={{ width: 32, height: 32, fontSize: 12 }}>{initials(u.full_name || u.email || "?")}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{u.full_name || "—"}</div><div className="mt">{u.email} · {lastLogin(u.last_login, t)}</div></div>
                      <Pill tone={u.role === "client_owner" ? "ok" : "mute"}>{accessSummary(u, t)}</Pill>
                      <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => configurePortal(u, c.name, c.organization_id)}><span className="crasto-btn__icon"><SlidersHorizontal size={14} /></span><span className="crasto-btn__label">{t("Telas do Portal")}</span></button>
                    </div>
                  ))}
              </div>

              {/* ---- Seção 2: Usuários do WhatsApp CRM (fonte: CRM) ---- */}
              <div className="permsub">
                <div className="permsub-h"><MessageSquare size={14} /><span>{t("Usuários do WhatsApp CRM")}</span><span className="permsub-hint">{t("operadores do CRM — muitos não estão no Portal")}</span></div>
                {bucket?.loading && <div className="mt permsub-empty">{t("Carregando usuários do CRM…")}</div>}
                {bucket && !bucket.loading && !bucket.enabled && <div className="mt permsub-empty">{bucket.error || t("Este cliente não usa o WhatsApp CRM.")}</div>}
                {bucket && !bucket.loading && bucket.enabled && crmList.length === 0 && <div className="mt permsub-empty">{t("Nenhum usuário no WhatsApp CRM ainda. Convide em Clientes → Acesso ao CRM.")}</div>}
                {bucket && !bucket.loading && bucket.enabled && crmList.map((u) => (
                  <div className="crmrow accrow" key={u.id}>
                    <div className="logo" style={{ width: 32, height: 32, fontSize: 12 }}>{initials(u.full_name || u.email || "?")}</div>
                    <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{u.full_name || "—"}{u.online ? <span className="dot-online" title={t("online")} /> : null}</div><div className="mt">{u.email}</div></div>
                    <Pill tone={u.role === "client_owner" ? "ok" : "mute"}>{crmSummary(u, t)}</Pill>
                    {u.role === "client_owner"
                      ? <span className="crasto-btn crasto-btn--sm" style={{ opacity: .5, cursor: "default" }}><span className="crasto-btn__label">{t("Dono")}</span></span>
                      : <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => configureCrm(u, c.name, c.organization_id)}><span className="crasto-btn__icon"><SlidersHorizontal size={14} /></span><span className="crasto-btn__label">{t("Telas do CRM")}</span></button>}
                  </div>
                ))}
              </div>
            </>)}
          </div>
        );
      })}

      <div className="note" style={{ marginTop: 8 }}>
        <Lock size={15} />
        <div>{t("O acesso é por tela, e cada sistema tem a sua lista: telas do Portal (esquerda) e telas do CRM (direita) são independentes. A RLS por organização protege os dados; toda mudança fica em Auditoria & Logs.")}</div>
      </div>

      {/* Popup 1 — telas do PORTAL */}
      <Modal title={t("Telas do Portal")} open={!!cfg} onClose={() => setCfg(null)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setCfg(null)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={savePortal}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
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
        </>)}
      </Modal>

      {/* Popup 2 — telas do CRM */}
      <Modal title={t("Telas do WhatsApp CRM")} open={!!cfgCrm} onClose={() => setCfgCrm(null)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setCfgCrm(null)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy || !!crm?.loading || (crm ? !crm.hasAccess || crm.owner : true)} onClick={saveCrm}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        {cfgCrm && (<>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div className="logo" style={{ width: 36, height: 36, fontSize: 12 }}>{initials(cfgCrm.user.full_name || cfgCrm.user.email || "?")}</div>
            <div><div className="nm">{cfgCrm.user.full_name || "—"}</div><div className="mt">{cfgCrm.user.email} · {cfgCrm.orgName}</div></div>
          </div>
          {crm?.loading && <div className="mt">{t("Carregando…")}</div>}
          {crm && !crm.loading && !crm.hasAccess && (
            <div className="mt" style={{ color: "var(--crasto-text-muted)" }}>{t("Este usuário não tem acesso ao WhatsApp CRM.")}</div>
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
