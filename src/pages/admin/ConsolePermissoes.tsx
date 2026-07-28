import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shield, Users, Building2, Lock, Search, ChevronRight, SlidersHorizontal, Check, MessageSquare, LayoutGrid, UserPlus, RefreshCw } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, useToast, initials, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";
import { CLIENT_SCREENS, ALL_SCREEN_KEYS, BASE_SCREEN, allowedScreens } from "../../lib/screens";
import type { CrmUser } from "../../services/crmAccess.service";

// Permissões & Acessos — UMA PESSOA, UMA LINHA (refeito em 24/07/2026).
//
// O modelo anterior tinha duas listas ("Usuários do Portal" e "Usuários do WhatsApp CRM"),
// a pedido do Crasto, e estava CERTO para aquele mundo: eram dois sistemas com duas portas,
// e o CRM tinha operadores que não existiam no Portal.
//
// Essa premissa caiu quando o Portal virou a ÚNICA porta (unificação de domínios, §J do
// Blueprint v1.1). "Operador que não está no Portal" deixou de ser um caso comum e passou a
// ser um DEFEITO: netoconnect2@gmail.com operava o CRM da Connect, não tinha empresa no
// Portal, e ficou sem porta de entrada. Duas listas escondiam isso — a mesma pessoa aparecia
// duas vezes e ninguém via quem estava só de um lado.
//
// Agora: uma pessoa por linha, e o que ela pode fazer é lido em três perguntas —
//   papel (dono/membro) · telas do Portal · módulos (e, dentro do módulo, as telas dele).
// "Telas do CRM" não é um terceiro eixo: é o detalhe DENTRO do módulo WhatsApp CRM. Quando
// entrar Marketing, ele declara as telas dele e esta tela não muda de forma.
//
// O que a decisão antiga tinha de bom fica de pé: as telas do Portal e as do CRM NUNCA se
// misturam numa lista só — são blocos separados, cada um da sua fonte da verdade (o Portal
// guarda as suas; o CRM guarda as dele, lidas pela ponte /api/crm-access).
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

/** Uma pessoa pode existir no Portal, no CRM, ou nos dois — o e-mail é a identidade. */
type Pessoa = { chave: string; nome: string; email: string; portal?: U; crm?: CrmUser; online?: boolean; ultimo?: string | null };

/** Junta as duas fontes numa lista só. Quem aparece SEM `portal` é o caso do Neto: opera o
 *  CRM mas não entra pelo Portal — hoje isso é bloqueio de acesso, e a linha precisa gritar. */
function unirPessoas(doPortal: U[], doCrm: CrmUser[]): Pessoa[] {
  const chave = (e?: string | null) => (e || "").trim().toLowerCase();
  const mapa = new Map<string, Pessoa>();
  for (const u of doPortal) {
    const k = chave(u.email);
    mapa.set(k, { chave: k, nome: u.full_name || u.email || "—", email: u.email || "", portal: u, ultimo: u.last_login });
  }
  for (const u of doCrm) {
    const k = chave(u.email);
    const p = mapa.get(k);
    if (p) { p.crm = u; p.online = u.online; }
    else mapa.set(k, { chave: k, nome: u.full_name || u.email || "—", email: u.email || "", crm: u, online: u.online });
  }
  return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export default function ConsolePermissoes() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => (await services.analytics.admin.accessList()) as any, []);
  const platform: U[] = data?.platform ?? [];
  const clients: Client[] = data?.clients ?? [];
  const [q, setQ] = useState("");
  const [crmUsers, setCrmUsers] = useState<Record<string, CrmBucket>>({});
  const toast = useToast();

  // Popup 1 — telas do PORTAL (usuário do Portal)
  const [cfg, setCfg] = useState<{ user: U; orgName: string; orgId: string } | null>(null);
  const [pf, setPf] = useState<{ owner: boolean; screens: Set<string> }>({ owner: false, screens: new Set() });
  // Popup 2 — telas do CRM (usuário do CRM)
  const [cfgCrm, setCfgCrm] = useState<{ user: CrmUser; orgName: string; orgId: string } | null>(null);
  type CrmState = { loading: boolean; hasAccess: boolean; owner: boolean; catalog: { key: string; label: string }[]; screens: Set<string> };
  const [crm, setCrm] = useState<CrmState | null>(null);
  // Pessoa cujas permissões estão abertas (a janela é uma só, para Portal + módulos).
  const [alvo, setAlvo] = useState<{ pessoa: Pessoa; orgName: string; orgId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Convite de pessoa POR CLIENTE — pessoas moram aqui agora (antes: no detalhe do cliente).
  const [convite, setConvite] = useState<{ orgId: string; orgName: string; ownerId?: string } | null>(null);
  // Convite já com as TELAS (Portal + CRM): o admin define tudo aqui, sem ir depois em Permissões.
  type CF = { email: string; full_name: string; role: string; portalScreens: Set<string>; crmOn: boolean; crmScreens: Set<string>; crmCatalog: { key: string; label: string }[]; crmLoaded: boolean };
  const cfNovo = (): CF => ({ email: "", full_name: "", role: "client_member", portalScreens: new Set(ALL_SCREEN_KEYS), crmOn: false, crmScreens: new Set(), crmCatalog: [], crmLoaded: false });
  const [cf, setCf] = useState<CF>(cfNovo());
  // Edição do e-mail (login) direto no popup de Permissões.
  const [emailEd, setEmailEd] = useState<{ on: boolean; val: string; busy: boolean }>({ on: false, val: "", busy: false });
  const [cErr, setCErr] = useState<string | null>(null);
  // Master-detail: um cliente selecionado por vez (escala a 100+ — a lista faz scroll e só
  // o CRM do selecionado carrega). `fchip` = filtro rápido por situação de acesso.
  const [sel, setSel] = useState<string | null>(null);
  const [fchip, setFchip] = useState<"todos" | "com" | "sem">("todos");
  function selecionar(orgId: string) { setSel(orgId); if (!crmUsers[orgId]) loadCrmUsers(orgId); }
  // Foco vindo do detalhe do cliente (?org=...): seleciona aquele cliente.
  const [sp] = useSearchParams();
  const focoOrg = sp.get("org");
  useEffect(() => {
    if (focoOrg && !loading) selecionar(focoOrg);
  }, [focoOrg, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Abre o convite JÁ com as telas: guarda o dono do org (p/ buscar o catálogo de telas do CRM).
  function abrirConvite(c: Client) {
    setCErr(null); setCf(cfNovo());
    const owner = c.users.find((u) => u.role === "client_owner");
    setConvite({ orgId: c.organization_id, orgName: c.name, ownerId: owner?.id });
  }
  function toggleConvitePortal(k: string) {
    if (k === BASE_SCREEN) return;
    setCf((f) => { const s = new Set(f.portalScreens); s.has(k) ? s.delete(k) : s.add(k); return { ...f, portalScreens: s }; });
  }
  function toggleConviteCrm(k: string) {
    if (k === "mesa") return;
    setCf((f) => { const s = new Set(f.crmScreens); s.has(k) ? s.delete(k) : s.add(k); return { ...f, crmScreens: s }; });
  }
  // Liga o CRM no convite e busca o catálogo de telas do módulo (via o dono do org).
  async function ligarConviteCrm(on: boolean) {
    setCf((f) => ({ ...f, crmOn: on }));
    if (!on || cf.crmLoaded) return;
    if (!convite?.ownerId) { setCf((f) => ({ ...f, crmLoaded: true })); return; }
    try {
      const r: any = await services.crmAccess.crmScreens(convite.orgId, convite.ownerId);
      const cat = (r?.catalog || []) as { key: string; label: string }[];
      setCf((f) => ({ ...f, crmCatalog: cat, crmScreens: new Set(cat.map((x) => x.key)), crmLoaded: true }));
    } catch { setCf((f) => ({ ...f, crmLoaded: true })); }
  }

  async function convidar() {
    if (!convite) return;
    setCErr(null);
    if (!cf.email.trim()) { setCErr(t("Informe o e-mail.")); return; }
    setBusy(true);
    try {
      const r = await services.identity.users.create({ email: cf.email.trim(), full_name: cf.full_name.trim(), organization_id: convite.orgId, role: cf.role });
      if (!r.ok) throw new Error(r.error || t("Não foi possível convidar."));
      const uid = r.id;
      // 1) Telas do PORTAL — definidas aqui no convite.
      if (uid) {
        if (cf.role === "client_member") await services.analytics.admin.setUserAccess(uid, "client_member", Array.from(new Set([BASE_SCREEN, ...cf.portalScreens])));
        else await services.analytics.admin.setUserAccess(uid, "client_owner", []);
      }
      // 2) Acesso + telas do WhatsApp CRM — se marcado no convite.
      if (cf.crmOn) {
        const gi: any = await services.crmAccess.invite(convite.orgId, { email: cf.email.trim(), full_name: cf.full_name.trim(), role: cf.role });
        if (gi?.error) throw new Error(gi.error);
        if (uid && cf.role === "client_member") { const rs: any = await services.crmAccess.setCrmScreens(convite.orgId, uid, Array.from(cf.crmScreens)); if (rs?.error) throw new Error(rs.error); }
      }
      setConvite(null); setCf(cfNovo());
      await reload(); if (crmUsers[convite.orgId]) loadCrmUsers(convite.orgId);
      toast.ok(r.email_sent ? t("Convite enviado ✓") : t("Usuário criado (o e-mail não saiu)."));
    } catch (e) { setCErr(errorMessage(e)); } finally { setBusy(false); }
  }
  async function reenviar(pe: Pessoa) {
    if (!pe.portal) return;
    setBusy(true);
    try { await services.identity.users.resendAccess({ user_id: pe.portal.id }); toast.ok(t("Acesso reenviado ✓")); }
    catch (e) { toast.err(errorMessage(e)); } finally { setBusy(false); }
  }

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

  // Usuários do CRM carregam sob demanda (ao abrir o cliente): é uma chamada à ponte por org,
  // e a lista vem do CRM — inclui quem NÃO está no Portal.
  function loadCrmUsers(orgId: string) {
    setCrmUsers((m) => (m[orgId] && !m[orgId].error ? m : { ...m, [orgId]: { loading: true, enabled: false, users: [] } }));
    services.crmAccess.overview(orgId)
      .then((o) => setCrmUsers((m) => ({ ...m, [orgId]: { loading: false, enabled: !!o.enabled, users: o.users || [], error: o.crm_error || undefined } })))
      .catch((e) => setCrmUsers((m) => ({ ...m, [orgId]: { loading: false, enabled: false, users: [], error: errorMessage(e) } })));
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
  // UM popup, UM salvar. Antes eram dois — e quem quisesse ajustar Portal e CRM da mesma
  // pessoa abria duas janelas e salvava duas vezes, sem nunca ver o conjunto.
  function abrirPermissoes(pe: Pessoa, orgName: string, orgId: string) {
    if (pe.portal) configurePortal(pe.portal, orgName, orgId);
    else setCfg(null);
    if (pe.crm) configureCrm(pe.crm, orgName, orgId);
    else { setCfgCrm(null); setCrm(null); }
    setAlvo({ pessoa: pe, orgName, orgId });
  }
  function fecharPermissoes() { setAlvo(null); setCfg(null); setCfgCrm(null); setCrm(null); setEmailEd({ on: false, val: "", busy: false }); }

  // Troca o E-MAIL (que é o LOGIN). Usa o IdP do Portal (updateByAdmin: muda o auth + espelha no
  // perfil, com trava anti-colisão). Se for pessoa só do CRM, usa a ponte do CRM (mesmo idp por baixo).
  async function salvarEmail() {
    if (!alvo) return;
    const novo = emailEd.val.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novo)) { toast.err(t("E-mail inválido.")); return; }
    if (novo === (alvo.pessoa.email || "").toLowerCase()) { setEmailEd({ on: false, val: "", busy: false }); return; }
    setEmailEd((e) => ({ ...e, busy: true }));
    try {
      const portalId = alvo.pessoa.portal?.id;
      const r: any = portalId
        ? await services.identity.users.update(portalId, { email: novo })
        : await services.crmAccess.update(alvo.orgId, alvo.pessoa.crm!.id, { email: novo });
      if (r?.error) throw new Error(r.error);
      setAlvo((a) => (a ? { ...a, pessoa: { ...a.pessoa, email: novo } } : a));
      setEmailEd({ on: false, val: "", busy: false });
      await reload();
      toast.ok(t("E-mail (login) atualizado ✓ — reenvie o acesso se a pessoa ainda não definiu a senha."));
    } catch (e) { toast.err(errorMessage(e)); setEmailEd((s) => ({ ...s, busy: false })); }
  }

  async function salvarPermissoes() {
    if (!alvo) return;
    setBusy(true);
    try {
      if (cfg) {
        const role = pf.owner ? "client_owner" : "client_member";
        const screens = pf.owner ? [] : Array.from(new Set([BASE_SCREEN, ...pf.screens]));
        await services.analytics.admin.setUserAccess(cfg.user.id, role, screens);
      }
      // O papel Dono/Membro é UMA escolha só (Portal + CRM). Sincroniza o papel do CRM com o do
      // Portal — sem isto, mudar de Dono→Membro no Portal deixava o CRM ainda "Dono" (não restringível).
      if (cfgCrm && crm && !crm.loading && crm.hasAccess) {
        const dono = cfg ? pf.owner : crm.owner; // com perfil no Portal, o toggle Dono/Membro manda
        if (crm.owner !== dono) {
          const ru: any = await services.crmAccess.update(cfgCrm.orgId, cfgCrm.user.id, { role: dono ? "client_owner" : "client_member" });
          if (ru?.error) throw new Error(ru.error);
        }
        // Telas do CRM só para MEMBRO (dono vê tudo lá, não é restringível).
        if (!dono) {
          const r = await services.crmAccess.setCrmScreens(cfgCrm.orgId, cfgCrm.user.id, Array.from(crm.screens));
          if (r?.error) throw new Error(r.error);
        }
      }
      const orgId = alvo.orgId;
      fecharPermissoes();
      await reload();
      loadCrmUsers(orgId);
      toast.ok(t("Permissões atualizadas ✓"));
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
    if (k === "mesa") return; // base do CRM (Minhas Tarefas) — sempre visível
    setCrm((c) => { if (!c) return c; const s = new Set(c.screens); s.has(k) ? s.delete(k) : s.add(k); return { ...c, screens: s }; });
  }


  return (
    <div>
      <PageHead eyebrow="Console · IA 🔒 · Segurança" title="Permissões & Acessos"
        sub="Toda pessoa da plataforma mora aqui: convidar, papel, telas do Portal e módulos (incluindo o WhatsApp CRM), num lugar só. Isolado por RLS: cada cliente só enxerga a própria empresa." />

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

      {/* Acessos por cliente — MASTER-DETAIL (escala a 100+): lista buscável à esquerda,
          pessoas do cliente selecionado à direita. Só o CRM do selecionado é carregado. */}
      <div className="sec-h" style={{ marginTop: 22 }}><h2>{t("Acessos por cliente")}</h2>
        <div className="permchips">
          {([["todos", t("Todos")], ["com", t("Com acesso")], ["sem", t("Sem acesso")]] as const).map(([k, lb]) => (
            <button key={k} className={"permchip" + (fchip === k ? " on" : "")} onClick={() => setFchip(k)}>{lb}</button>
          ))}
        </div>
      </div>

      {loading ? <Empty>{t("Carregando…")}</Empty> : (() => {
        const lista = filtered.filter((c) => fchip === "com" ? c.users.length > 0 : fchip === "sem" ? c.users.length === 0 : true);
        const cliente = lista.find((c) => c.organization_id === sel) || null;
        return (
          <div className="permlayout">
            {/* Esquerda: lista compacta e buscável */}
            <div className="permlist">
              {lista.length === 0 ? <div className="permlist-empty">{t("Nenhum cliente encontrado.")}</div> : lista.map((c) => (
                <button key={c.organization_id} className={"permlist-item" + (c.organization_id === (cliente?.organization_id) ? " on" : "")}
                  onClick={() => selecionar(c.organization_id)}>
                  <div className="logo" style={{ width: 30, height: 30, fontSize: 11, flex: "none" }}>{initials(c.name)}</div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                    <div className="nm" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    <div className="mt">{c.users.length > 0 ? t("{n} no Portal", { n: c.users.length }) : t("sem acesso")}</div>
                  </div>
                  <ChevronRight size={15} style={{ opacity: .4, flex: "none" }} />
                </button>
              ))}
            </div>

            {/* Direita: detalhe do cliente selecionado */}
            <div className="permdetail">
              {!cliente ? (
                <div className="permdetail-empty"><Users size={26} style={{ opacity: .3 }} /><p>{t("Escolha um cliente à esquerda para ver e gerenciar as pessoas.")}</p></div>
              ) : (() => {
                const c = cliente;
                const bucket = crmUsers[c.organization_id];
                const pessoas = unirPessoas(c.users, bucket?.enabled ? (bucket.users ?? []) : [])
                  .filter((pe) => !query || `${pe.nome} ${pe.email}`.toLowerCase().includes(query));
                return (<>
                  <div className="permdetail-h">
                    <div className="logo" style={{ width: 34, height: 34, fontSize: 12 }}>{initials(c.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: 0 }}>{c.name}</h3>
                      <div className="mt">{t("{n} no Portal", { n: c.users.length })}{bucket?.enabled ? ` · ${t("{n} no CRM", { n: bucket.users.length })}` : ""}</div>
                    </div>
                    <button className="crasto-btn crasto-btn--primary crasto-btn--sm"
                      onClick={() => abrirConvite(c)}>
                      <span className="crasto-btn__icon"><UserPlus size={14} /></span><span className="crasto-btn__label">{t("Convidar")}</span>
                    </button>
                  </div>
                  {bucket?.loading && <div className="mt permsub-empty">{t("Carregando…")}</div>}
                  {pessoas.length === 0 && !bucket?.loading && <div className="mt permsub-empty">{t("Ninguém com acesso ainda.")}</div>}
                  {pessoas.map((pe) => (
                    <div className="crmrow accrow" key={pe.chave}>
                      <div className="logo" style={{ width: 32, height: 32, fontSize: 12 }}>{initials(pe.nome)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="nm">{pe.nome}{pe.online ? <span className="dot-online" title={t("online")} /> : null}</div>
                        <div className="mt">{pe.email}{pe.portal ? ` · ${lastLogin(pe.ultimo ?? null, t)}` : ""}</div>
                      </div>
                      {!pe.portal
                        ? <Pill tone="warn">{t("sem acesso ao Portal")}</Pill>
                        : <Pill tone={pe.portal.role === "client_owner" ? "ok" : "mute"}>{accessSummary(pe.portal, t)}</Pill>}
                      <Pill tone={pe.crm ? "info" : "mute"}>{pe.crm ? crmSummary(pe.crm, t) : t("sem WhatsApp CRM")}</Pill>
                      {pe.portal && (
                        <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} title={t("Reenvia o link de acesso (não redefine a senha atual)")} onClick={() => reenviar(pe)}>
                          <span className="crasto-btn__icon"><RefreshCw size={13} /></span><span className="crasto-btn__label">{t("Reenviar")}</span>
                        </button>
                      )}
                      <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => abrirPermissoes(pe, c.name, c.organization_id)}>
                        <span className="crasto-btn__icon"><SlidersHorizontal size={14} /></span><span className="crasto-btn__label">{t("Permissões")}</span>
                      </button>
                    </div>
                  ))}
                </>);
              })()}
            </div>
          </div>
        );
      })()}

      <div className="note" style={{ marginTop: 8 }}>
        <Lock size={15} />
        <div>{t("Uma pessoa, uma linha. Sem restrição gravada, ela enxerga tudo o que a empresa contratou — restringir é uma escolha, não o padrão. Telas do Portal e telas de cada módulo têm donos diferentes e nunca se misturam. A RLS por organização é que protege os dados; toda mudança fica em Auditoria & Logs.")}</div>
      </div>

      {/* UMA janela: papel + telas do Portal + módulos. Os blocos NUNCA se misturam — cada um
          tem a sua fonte da verdade (o Portal guarda as telas dele; o CRM, as dele). */}
      <Modal title={t("Permissões")} open={!!alvo} onClose={fecharPermissoes}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={fecharPermissoes}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={salvarPermissoes}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button></>}>
        {alvo && (<>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div className="logo" style={{ width: 36, height: 36, fontSize: 12 }}>{initials(alvo.pessoa.nome)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="nm">{alvo.pessoa.nome}</div>
              {emailEd.on ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 5, flexWrap: "wrap" }}>
                  <input type="email" autoFocus value={emailEd.val} onChange={(e) => setEmailEd({ ...emailEd, val: e.target.value })} onKeyDown={(e) => e.key === "Enter" && salvarEmail()} placeholder="novo@email.com" style={{ flex: 1, minWidth: 170 }} />
                  <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={emailEd.busy} onClick={salvarEmail}><span className="crasto-btn__label">{emailEd.busy ? t("Salvando…") : t("Salvar e-mail")}</span></button>
                  <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={emailEd.busy} onClick={() => setEmailEd({ on: false, val: "", busy: false })}><span className="crasto-btn__label">{t("Cancelar")}</span></button>
                </div>
              ) : (
                <div className="mt" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>{alvo.pessoa.email} · {alvo.orgName}</span>
                  <button type="button" onClick={() => setEmailEd({ on: true, val: alvo.pessoa.email || "", busy: false })}
                    style={{ border: 0, background: "transparent", color: "var(--crasto-blue, #6E9CE8)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                    {t("Alterar e-mail")}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ---- Bloco 1: o Portal (papel + telas) ---- */}
          <div className="permsub-h" style={{ marginBottom: 10 }}><LayoutGrid size={14} /><span>{t("No Portal")}</span></div>
          {!cfg ? (
            <div className="note" style={{ marginBottom: 18 }}><Lock size={15} />
              <div>{t("Esta pessoa opera o WhatsApp CRM mas não tem acesso ao Portal — hoje isso a deixa sem porta de entrada, porque o Portal é o único endereço do cliente. Convide-a em Clientes → Usuários.")}</div>
            </div>
          ) : (<>
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
                    <button key={s.key} className={"screenpick" + (on ? " on" : "") + (base ? " base" : "")} onClick={() => toggleScreen(s.key)} disabled={base} title={base ? t("Tela base — sempre visível") : ""}>
                      <span className="box">{on && <Check size={13} />}</span>
                      <span className="lb">{t(s.label)}{base && <em> · {t("base")}</em>}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {pf.owner && <div className="note"><Check size={15} /><div>{t("Este usuário verá todas as telas do portal e poderá gerenciar a empresa.")}</div></div>}
          </>)}

          {/* ---- Bloco 2: o módulo WhatsApp CRM (as telas DELE) ---- */}
          <div className="permsub-h" style={{ margin: "20px 0 10px" }}><MessageSquare size={14} /><span>{t("Módulo · WhatsApp CRM")}</span></div>
          {!cfgCrm && <div className="mt" style={{ color: "var(--crasto-text-muted)" }}>{t("Sem acesso ao WhatsApp CRM.")}</div>}
          {crm?.loading && <div className="mt">{t("Carregando…")}</div>}
          {cfgCrm && crm && !crm.loading && !crm.hasAccess && (
            <div className="mt" style={{ color: "var(--crasto-text-muted)" }}>{t("Este usuário não tem acesso ao WhatsApp CRM.")}</div>
          )}
          {cfgCrm && crm && !crm.loading && crm.hasAccess && (cfg ? pf.owner : crm.owner) && (
            <div className="note"><Check size={15} /><div>{t("Dono do CRM: vê todas as telas do WhatsApp CRM (não é restringível).")}</div></div>
          )}
          {cfgCrm && crm && !crm.loading && crm.hasAccess && !(cfg ? pf.owner : crm.owner) && (
            <div className="screengrid">
              {crm.catalog.map((sc) => {
                // Base do CRM = "Minhas Tarefas" (mesa): sempre visível (ninguém fica sem página).
                // O Dashboard virou opcional — pode desmarcar para quem não pode ver essa tela.
                const on = sc.key === "mesa" || crm.screens.has(sc.key);
                const base = sc.key === "mesa";
                return (
                  <button key={sc.key} className={"screenpick" + (on ? " on" : "") + (base ? " base" : "")} onClick={() => toggleCrmScreen(sc.key)} disabled={base} title={base ? t("Minhas Tarefas é a tela base — sempre visível") : ""}>
                    <span className="box">{on && <Check size={13} />}</span>
                    <span className="lb">{t(sc.label)}{base && <em> · {t("base")}</em>}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>)}
      </Modal>
      <Modal wide title={convite ? t("Convidar para {n}", { n: convite.orgName }) : t("Convidar")} open={!!convite} onClose={() => setConvite(null)}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setConvite(null)}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={convidar}><span className="crasto-btn__label">{busy ? t("Enviando…") : t("Enviar convite")}</span></button></>}>
        {cErr && <div className="formerr">{cErr}</div>}
        <Field label="E-mail *"><input type="email" value={cf.email} onChange={(e) => setCf({ ...cf, email: e.target.value })} placeholder="pessoa@empresa.com" /></Field>
        <Field label={t("Nome")}><input value={cf.full_name} onChange={(e) => setCf({ ...cf, full_name: e.target.value })} /></Field>
        <Field label={t("Papel")}><select value={cf.role} onChange={(e) => setCf({ ...cf, role: e.target.value })}><option value="client_member">{t("Membro")}</option><option value="client_owner">{t("Dono — acesso total")}</option></select></Field>

        {cf.role === "client_owner" ? (
          <div className="note" style={{ marginTop: 14 }}><Check size={15} /><div>{t("Dono vê TODAS as telas do Portal e do WhatsApp CRM e gerencia a empresa.")}</div></div>
        ) : (<>
          {/* Telas do PORTAL — já no convite (antes só em Permissões). */}
          <div className="permsub-h" style={{ margin: "18px 0 10px" }}><LayoutGrid size={14} /><span>{t("Telas do Portal")}</span></div>
          <div className="screengrid">
            {CLIENT_SCREENS.map((s) => {
              const on = s.key === BASE_SCREEN || cf.portalScreens.has(s.key);
              const base = s.key === BASE_SCREEN;
              return (
                <button key={s.key} type="button" className={"screenpick" + (on ? " on" : "") + (base ? " base" : "")} onClick={() => toggleConvitePortal(s.key)} disabled={base} title={base ? t("Tela base — sempre visível") : ""}>
                  <span className="box">{on && <Check size={13} />}</span>
                  <span className="lb">{t(s.label)}{base && <em> · {t("base")}</em>}</span>
                </button>
              );
            })}
          </div>

          {/* Módulo WhatsApp CRM — liberar acesso + telas, já no convite. */}
          <div className="permsub-h" style={{ margin: "20px 0 10px" }}><MessageSquare size={14} /><span>{t("Módulo · WhatsApp CRM")}</span></div>
          <div className="accseg">
            <button type="button" className={"accseg-b" + (!cf.crmOn ? " on" : "")} onClick={() => ligarConviteCrm(false)}>
              <div className="t">{t("Sem acesso ao CRM")}</div><div className="s">{t("só o Portal")}</div>
            </button>
            <button type="button" className={"accseg-b" + (cf.crmOn ? " on" : "")} onClick={() => ligarConviteCrm(true)}>
              <div className="t">{t("Liberar WhatsApp CRM")}</div><div className="s">{t("escolha as telas abaixo")}</div>
            </button>
          </div>
          {cf.crmOn && (cf.crmCatalog.length ? (
            <div className="screengrid" style={{ marginTop: 10 }}>
              {cf.crmCatalog.map((sc) => {
                const on = sc.key === "mesa" || cf.crmScreens.has(sc.key);
                const base = sc.key === "mesa";
                return (
                  <button key={sc.key} type="button" className={"screenpick" + (on ? " on" : "") + (base ? " base" : "")} onClick={() => toggleConviteCrm(sc.key)} disabled={base} title={base ? t("Minhas Tarefas é a tela base — sempre visível") : ""}>
                    <span className="box">{on && <Check size={13} />}</span>
                    <span className="lb">{t(sc.label)}{base && <em> · {t("base")}</em>}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt" style={{ marginTop: 8, color: "var(--crasto-text-muted)" }}>{t("Acesso ao WhatsApp CRM será liberado com todas as telas (ajuste fino depois em Permissões).")}</div>
          ))}
        </>)}

        <p className="mt" style={{ margin: "14px 2px 0", lineHeight: 1.6 }}>
          {t("A pessoa entra pelo Portal com a própria senha. As telas escolhidas aqui já valem no convite.")}
        </p>
      </Modal>

      {toast.node}
    </div>
  );
}
