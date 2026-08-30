import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, LayoutGrid, Activity, Sparkles, Wallet, Users, LifeBuoy, Eye, IdCard,
  Megaphone, Share2, Target, ShoppingCart, PackageOpen, TrendingUp, Factory, Cpu, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useAsync } from "../ui/ui";
import { services } from "../services";
import { supabase } from "../lib/supabase";
import { preview } from "../lib/preview";
import { useT } from "../lib/i18n";
import { CLIENT_SCREENS, allowedScreens, firstAllowedPath } from "../lib/screens";
import { UnitScopeContext, type Unit } from "../lib/unitScope";
import Shell, { type NavItem, type NavChild } from "./Shell";
import JoyWidget from "../ui/JoyWidget";

const SCREEN_ICON: Record<string, any> = {
  inicio: Home, modulos: LayoutGrid, implementacao: Activity, solucoes: Sparkles,
  financeiro: Wallet, usuarios: Users, perfil: IdCard, suporte: LifeBuoy,
};

// Catálogo canônico de módulos (a "Conta Azul" da Crasto.AI). O que o cliente contratou
// aparece destravado (abre o módulo); o resto aparece com cadeado (upsell → Catálogo).
// `rx` casa a categoria/nome do módulo contratado com o slot canônico.
const MODULES: { key: string; label: string; icon: LucideIcon; rx: RegExp; crm?: boolean }[] = [
  // WhatsApp CRM casa pelo SINAL de ser a solução CRM (crm_url presente), não pelo nome —
  // o nome comercial do produto pode variar por cliente e ainda ser o CRM.
  { key: "crm", label: "Vendas", icon: TrendingUp, rx: /atend|crm|whats|convers|sdr|openclaw/i, crm: true },
  { key: "financeiro", label: "Financeiro", icon: Wallet, rx: /financ|erp financ/i },
  { key: "marketing", label: "Marketing", icon: Megaphone, rx: /market/i },
  { key: "social", label: "Social Media", icon: Share2, rx: /social/i },
  { key: "trafego", label: "Tráfego Pago", icon: Target, rx: /tr[aá]feg|ads|paga|paid/i },
  { key: "compras", label: "Compras", icon: ShoppingCart, rx: /compra|purchas|suprim/i },
  { key: "importacao", label: "Importação", icon: PackageOpen, rx: /importa[çc][ãa]o|import\b/i },
  // Novos módulos (upsell): Produção é só p/ indústria (chão de fábrica); Tecnologia ≠ Console.
  // Ambos entram bloqueados (cadeado → "Conhecer módulo") até serem contratados/liberados.
  { key: "producao", label: "Produção", icon: Factory, rx: /produ[çc][ãa]o|manufatur|f[áa]bric|ind[úu]stri|ch[ãa]o de f[áa]bric/i },
  { key: "tecnologia", label: "Tecnologia", icon: Cpu, rx: /tecnolog|\bti\b|software|sistemas?\b/i },
];

// API do wacrm (fonte das permissões de tela do CRM). Mesmo domínio próprio usado pelo CrmEmbed.
// DEV: VITE_WACRM_API_LOCAL aponta pra uma wacrm api local (validar units/crm_screens sem prod).
const WACRM_API = (import.meta.env.DEV && (import.meta.env.VITE_WACRM_API_LOCAL as string | undefined)) || "https://api.wacrm.crasto.ai";
// Árvore de navegação do módulo "Vendas" (o CRM é o núcleo). `screen` casa com `crm_screens`
// (dono = ['*'] = tudo) e filtra recursivamente. Estrutura aprovada (spec do sidebar):
//   Dashboard · CRM · WhatsApp[Conversas · Minhas Tarefas · Contatos · Agendamentos · Config] · Catálogo de serviços
// O "WhatsApp" vira um GRUPO (o canal): as telas que fluem da conversa (tarefas/contatos/agenda/
// config) aninham sob ele — 3º nível. "Conversas" é a caixa de entrada (antiga tela "chat").
// NOTA: "Contatos" segue aninhado por ora — na Fatia 3 vira BOTÃO dentro das Conversas.
// "Catálogo de serviços" é novo: entra "em breve" (visual-first, sem rota ainda).
type CrmNode = { screen?: string; label: string; to?: string; end?: boolean; tag?: string; children?: CrmNode[] };
const CRM_TREE: CrmNode[] = [
  // Regra global: a 1ª tela de todo módulo chama-se "Cockpit" — NUNCA "Dashboard". O `screen`
  // continua "dashboard" (chave de permissão/rota do wacrm); só o RÓTULO é Cockpit.
  { screen: "dashboard", label: "Cockpit", to: "/app/crm", end: true },
  { screen: "crm", label: "CRM", to: "/app/crm/funil" },
  { label: "WhatsApp", children: [
    { screen: "chat", label: "Conversas", to: "/app/crm/conversas" },
    { screen: "mesa", label: "Minhas Tarefas", to: "/app/crm/tarefas" },
    { screen: "contatos", label: "Contatos", to: "/app/crm/contatos" },
    { screen: "agenda", label: "Agendamentos", to: "/app/crm/agenda" },
    { screen: "config", label: "Configurações", to: "/app/crm/config" },
  ] },
  { label: "Catálogo de serviços", tag: "em breve" },
];

export default function ClientShell() {
  const { profile } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [pv, setPv] = useState({ active: preview.active(), name: preview.orgName() });
  useEffect(() => preview.subscribe(() => setPv({ active: preview.active(), name: preview.orgName() })), []);
  // Reatualiza as unidades (CNPJs) após o cliente adicionar uma empresa no seletor/perfil.
  const [unitReload, setUnitReload] = useState(0);
  const reloadUnits = () => setUnitReload((k) => k + 1);

  // "Minha Implementação" só aparece enquanto a implantação não terminou (< 100%).
  const { data: impl } = useAsync(() => services.delivery.implementations.getMine(), [pv.active]);
  const implDone = impl ? (((impl as any).overall_progress ?? 0) >= 100 || (impl as any).status === "delivered") : false;

  // Permissão POR TELA: o menu mostra só as telas que este usuário pode ver (dono = todas).
  const { data: myScreens } = useAsync(() => services.identity.access.myScreens(), [pv.active]);
  const allowed = allowedScreens(myScreens as string[] | null);

  // Permissões de tela do WhatsApp CRM + UNIDADES (CNPJs) da empresa — ambos vêm do /api/me
  // (fonte = wacrm), numa chamada só. `crm_screens` filtra os sub-itens; `units` alimenta o
  // seletor de CNPJ da topbar. null enquanto carrega OU dono (['*']) → mostra todas as seções.
  const { data: crmMe } = useAsync(async () => {
    const { data } = await supabase.auth.getSession();
    const tk = data.session?.access_token;
    if (!tk) return null;
    try {
      const r = await fetch(`${WACRM_API}/api/me`, { headers: { Authorization: "Bearer " + tk } });
      const j = await r.json();
      return {
        crm_screens: Array.isArray(j?.crm_screens) ? (j.crm_screens as string[]) : null,
        units: Array.isArray(j?.units) ? (j.units as Unit[]) : [],
        role: typeof j?.role === "string" ? (j.role as string) : null,
        is_admin: j?.is_admin === true,
      };
    } catch { return null; }
  }, [pv.active, unitReload]);
  const crmScreens = crmMe?.crm_screens ?? null;
  const units = crmMe?.units ?? [];
  const crmScreenSet = crmScreens && !crmScreens.includes("*") ? new Set(crmScreens) : null; // null = todas
  // Monta os filhos de "Vendas" a partir da árvore, filtrando por permissão de tela e podando
  // grupos que ficaram vazios (ex.: WhatsApp sem nenhuma sub-tela permitida some inteiro).
  const buildCrm = (nodes: CrmNode[]): NavChild[] => nodes.flatMap((n): NavChild[] => {
    if (n.children) {
      const kids = buildCrm(n.children);
      return kids.length ? [{ label: n.label, children: kids }] : [];
    }
    if (n.screen && crmScreenSet && !crmScreenSet.has(n.screen)) return [];
    return [{ to: n.to, label: n.label, end: n.end, tag: n.tag }];
  });
  const crmChildren = buildCrm(CRM_TREE);

  // Unidade (CNPJ) ATIVA — escolhida no seletor da topbar. Persistida por org. Por PADRÃO abre na
  // MATRIZ (a empresa em que o usuário está logado) — NÃO em "Todas as unidades" — para o dono saber
  // de cara em qual empresa está. Escolher "Todas as unidades" é explícito e PERSISTE (sentinela
  // `__all__`), então só cai na matriz quem nunca escolheu. Se a guardada não existe mais (trocou de
  // empresa / unidade removida), volta pra matriz. Todo agente pertence a uma unidade (a matriz
  // contém todos) → escopar na matriz mostra os mesmos agentes que "todas", só muda o rótulo.
  const ALL_UNITS = "__all__";
  const scopeKey = `crasto_active_unit_${pv.active ? preview.orgId() || "self" : "self"}`;
  const storedUnit = (() => { try { return localStorage.getItem(scopeKey); } catch { return null; } })();
  const [unitId, setUnitIdState] = useState<string | null>(storedUnit === ALL_UNITS ? null : storedUnit);
  const unitChosen = useRef<boolean>(storedUnit != null); // já há escolha guardada (unidade OU __all__)?
  const primaryUnitId = () => (units.find((u) => u.is_primary) || units[0])?.id ?? null;
  useEffect(() => {
    if (!units.length) return;
    if (!unitChosen.current) { setUnitIdState(primaryUnitId()); unitChosen.current = true; return; } // 1ª vez → matriz
    if (unitId && !units.some((u) => u.id === unitId)) setUnitIdState(primaryUnitId());              // guardada sumiu → matriz
  }, [units]); // eslint-disable-line react-hooks/exhaustive-deps
  const setUnitId = (id: string | null) => {
    setUnitIdState(id);
    unitChosen.current = true;
    try { localStorage.setItem(scopeKey, id ?? ALL_UNITS); } catch { /* storage indisponível */ }
  };
  // Quem pode ADICIONAR/editar empresa (CNPJ): o DONO da conta (ou um admin logado direto). Membro
  // comum só seleciona. NÃO liberamos por preview: em "ver como cliente" o /api/me devolve a org do
  // próprio admin (não impersona no wacrm), então o add-aqui miraria a org errada — o admin gere as
  // unidades do cliente pela seção dedicada (CrmAccessSection). O wacrm reconfere o papel no banco.
  const canManageUnits = crmMe?.is_admin === true || crmMe?.role === "client_owner";
  const createUnit = async (d: { name: string; cnpj?: string | null; legal_name?: string | null }) => {
    const { data } = await supabase.auth.getSession();
    const tk = data.session?.access_token;
    if (!tk) return { error: "sessão expirada — entre novamente" };
    try {
      const r = await fetch(`${WACRM_API}/api/me/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
        body: JSON.stringify(d),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) return { error: j?.error || "não foi possível adicionar a empresa" };
      reloadUnits();
      return { unit: j.unit };
    } catch { return { error: "falha de conexão com o CRM" }; }
  };

  // Módulos contratados (para a seção "Módulos" da sidebar, estilo Conta Azul).
  const { data: contratados } = useAsync(async () => {
    const cms = await services.delivery.clientModules.listMine().catch(() => [] as any[]);
    const rows = (cms as any[]).filter((r) => ["active", "implementing", "pending"].includes(r.status));
    const ids = rows.map((r) => r.vdi_module_id);
    const [vms, creds] = await Promise.all([
      ids.length ? services.catalog.vdiModules.listByIds(ids, "id,name,category,external_url").catch(() => [] as any[]) : Promise.resolve([] as any[]),
      services.delivery.moduleCredentials.listMine().catch(() => [] as any[]),
    ]);
    const vmap = Object.fromEntries((vms as any[]).map((v) => [v.id, v]));
    const cmap = Object.fromEntries((creds as any[]).map((c) => [c.client_module_id, c]));
    return rows.map((r) => {
      const v = vmap[r.vdi_module_id] || {};
      const cred = cmap[r.id];
      return {
        id: r.id as string, // client_module_id = a INSTÂNCIA (é o que a rota embarcada usa)
        text: `${v.category || ""} ${v.name || ""}`,
        name: ((r as any).label || v.name || "Módulo") as string,
        url: (cred?.access_url || (r as any).crm_url || v.external_url || null) as string | null,
        mode: ((r as any).access_mode || "link") as string,
        active: r.status === "active",
        rollout_status: (r as any).rollout_status ?? null, // só 'delivered' libera o acesso
        isCrm: !!(r as any).crm_url, // sinal robusto: é a solução WhatsApp CRM
        isSocial: !!(r as any).social_solution, // Social Media: abre embarcado por SSO
      };
    });
  }, [pv.active]);

  // Monta a seção "Módulos": contratado+ativo → abre; contratado+configurando → "em breve";
  // não contratado → cadeado (leva ao Catálogo para solicitar/liberar).
  // ⚠️ useAsync inicia `data` como NULL (não undefined) — blindar contra .find em null.
  const cs: any[] = Array.isArray(contratados) ? contratados : [];
  // Como abrir um módulo contratado: dentro do Portal (embed/sso), em nova aba (link) ou,
  // sem endereço ainda, levando a "Minhas Soluções" com a marca "em configuração".
  // Implantação ainda não entregue (Em andamento / Em espera) → NÃO abre; mostra o status e leva a
  // "Minhas Soluções" (onde o card fica bloqueado com a mensagem). Só 'delivered' libera. Igual ao card.
  const emAndamento = (c: any) => c && (c.rollout_status === "in_progress" || c.rollout_status === "on_hold");
  const abrir = (c: any): Partial<NavItem> => {
    if (!c.url) return { tag: t("em configuração"), onClick: () => navigate("/app/modulos") };
    if (emAndamento(c)) return { tag: t("em andamento"), onClick: () => navigate("/app/modulos") };
    // Social Media (nossa solução) e módulos embed/sso abrem DENTRO do Portal (com SSO); o resto, nova aba.
    if (c.isSocial || c.mode === "embed" || c.mode === "sso") return { to: `/app/m/${c.id}` };
    return { onClick: () => window.open(c.url as string, "_blank", "noopener") };
  };
  // props de UM módulo (destravado→abre · em breve · bloqueado→cadeado). Extraído p/ reusar tanto
  // como item de topo quanto como FILHO do grupo "Marketing & Growth".
  const slotFor = (m: (typeof MODULES)[number]): Partial<NavItem> => {
    const owned = m.crm ? cs.find((c) => c.isCrm) : cs.find((c) => m.rx.test(c.text));
    if (owned && owned.active) {
      // WhatsApp CRM abre EMBARCADO (rota interna → iframe); demais externos/SSO.
      if (m.crm) return emAndamento(owned) ? { tag: t("em andamento"), onClick: () => navigate("/app/modulos") } : { to: "/app/crm", children: crmChildren };
      return abrir(owned);
    }
    if (owned) return { tag: t("em breve"), onClick: () => navigate("/app/modulos") };
    return { locked: true, onClick: () => navigate("/app/catalogo") };
  };
  // Marketing/Social/Tráfego agrupados sob "Marketing". Cada filho preserva seu estado real.
  // O 1º filho (o próprio módulo Marketing) é rotulado "Cockpit" — a 1ª tela NUNCA repete o nome
  // do módulo (regra da spec do sidebar); mata a duplicidade "Marketing › Marketing".
  const byKey = (k: string) => MODULES.find((m) => m.key === k)!;
  // Árvore do módulo MARKETING — estrutura APROVADA pelo Crasto (2026-08-29), SEM "Produzir/
  // Distribuir" (eram verbos artificiais): funil real Marca → Orgânico → Pago. 1ª tela = "Cockpit"
  // (regra global). As telas ainda não existem (o FRONT está sendo construído em OUTRA sessão) →
  // entram "em breve" (skeleton navegável, manda pro /app/modulos). Social Media e Tráfego Pago são
  // só grupos que EXPANDEM — a visão consolidada é o Cockpit; só há sub-item onde haverá tela de
  // verdade. Quando as telas existirem, troca-se o "em breve" pela rota real.
  // Ver memória project-marketing-modulo-sidebar. ⚠️ ESTA sessão é dona do sidebar (não editar de fora).
  // Estrutura ALINHADA AO PROTÓTIPO APROVADO (Crasto 2026-08-30): Cockpit · Produzir · Distribuir.
  // Módulo NATIVO (sem iframe): cada folha aponta p/ /app/marketing/<secao>. A Cockpit já está
  // ligada ao back; as demais renderizam a tela (placeholder até serem ligadas, tela por tela).
  const mktChildren: NavChild[] = [
    { label: "Cockpit", to: "/app/marketing", end: true },
    { label: "Produzir", children: [
      { label: "Brand Kit", to: "/app/marketing/brand-kit" },
      { label: "Vídeos Virais", to: "/app/marketing/videos", children: [
        { label: "Meus Avatares/Clone", to: "/app/marketing/avatar" },
        { label: "Cortes", to: "/app/marketing/cortes" },
        { label: "Gerador de Roteiros", to: "/app/marketing/roteiros" },
      ] },
      { label: "Imagens & Carrossel", to: "/app/marketing/imagens" },
    ] },
    { label: "Distribuir", children: [
      { label: "Calendário", to: "/app/marketing/calendario" },
      { label: "Agendamento & Automação", to: "/app/marketing/automacao" },
      { label: "Mídia Paga (Tráfego Pago)", to: "/app/marketing/midia-paga" },
    ] },
  ];

  // TODO módulo vira uma ÁRVORE (pedido do Crasto): o nome do módulo é o nó PAI (azul, negrito, com
  // "+"); quem tem sub-telas (Vendas, Marketing & Growth) expande as seções, e os de destino único
  // (Financeiro, Compras, Importação…) expandem UM galho que carrega a ação real (abrir / cadeado).
  const galhoUnico = (label: string, slot: Partial<NavItem>): NavChild => {
    if (slot.locked) return { label: t("Conhecer módulo"), locked: true, onClick: slot.onClick };
    if (slot.tag) return { label: t("Abrir") + " " + label, tag: slot.tag, onClick: slot.onClick };
    if (slot.to) return { label: t("Abrir") + " " + label, to: slot.to };
    return { label: t("Abrir") + " " + label, onClick: slot.onClick };
  };
  const moduloArvore = (m: (typeof MODULES)[number]): NavItem => {
    const slot = slotFor(m);
    const children = (slot.children && slot.children.length) ? slot.children : [galhoUnico(m.label, slot)];
    return { icon: m.icon, label: m.label, section: "Módulos", to: slot.to, children };
  };
  // Importação é SUB-MENU de Compras (pedido do Crasto): entra como galho dentro da árvore Compras,
  // preservando seu estado real (aberto / em breve / cadeado). Não aparece mais como módulo de topo.
  const impSlot = slotFor(byKey("importacao"));
  const impChild: NavChild = impSlot.locked
    ? { label: "Importação", locked: true, onClick: impSlot.onClick }
    : impSlot.to ? { label: "Importação", to: impSlot.to }
      : { label: "Importação", tag: impSlot.tag, onClick: impSlot.onClick };
  const comprasM = byKey("compras");
  const comprasSlot = slotFor(comprasM);
  const comprasChildren: NavChild[] = (comprasSlot.children && comprasSlot.children.length)
    ? [...comprasSlot.children, impChild]
    : [galhoUnico(comprasM.label, comprasSlot), impChild];
  const comprasTree: NavItem = { icon: comprasM.icon, label: comprasM.label, section: "Módulos", to: comprasSlot.to, children: comprasChildren };
  // Ordem: Vendas · Marketing · Financeiro · Compras (com Importação) · Produção · Tecnologia.
  // Produção e Tecnologia são novos e ainda não contratados → entram como árvore bloqueada
  // (cadeado + "Conhecer módulo"), mesmo padrão de upsell dos demais módulos não contratados.
  const modItems: NavItem[] = [
    moduloArvore(byKey("crm")),                                                    // Vendas
    { icon: Megaphone, label: "Marketing", section: "Módulos", children: mktChildren },
    moduloArvore(byKey("financeiro")),
    comprasTree,
    moduloArvore(byKey("producao")),
    moduloArvore(byKey("tecnologia")),
  ];
  // Extras: contratados que NÃO são o CRM e NÃO casam com nenhum canônico → também como árvore.
  for (const c of cs) {
    if (c.active && !c.isCrm && !MODULES.some((m) => m.rx.test(c.text))) {
      const s = abrir(c);
      modItems.push({ icon: LayoutGrid, label: c.name, section: "Módulos", to: s.to, children: [galhoUnico(c.name, s)] });
    }
  }

  // Guarda de rota: se cair numa tela sem permissão (inclusive o Início, que o dono pode
  // bloquear para um membro), manda para a PRIMEIRA tela permitida — nunca de volta ao Início.
  useEffect(() => {
    if (!myScreens) return;
    const scr = CLIENT_SCREENS.find((s) => (s.to === "/app" ? location.pathname === "/app" : location.pathname.startsWith(s.to)));
    if (scr && !allowed.has(scr.key)) {
      const dest = firstAllowedPath(allowed);
      if (dest !== location.pathname) navigate(dest, { replace: true });
    }
  }, [location.pathname, myScreens]); // eslint-disable-line react-hooks/exhaustive-deps

  // Categorias do sidebar do cliente (colapsáveis, com seta — igual ao admin). Início fica no
  // topo, sem categoria (sempre visível). O resto entra numa das seções abaixo.
  // Seções do protótipo aprovado (Minha Crasto.AI · Módulos · Ajuda). O Shell agrupa por seção
  // CONSECUTIVA — por isso a montagem do nav abaixo mantém cada seção junta e na ordem certa.
  const REL = "Minha Crasto.AI";
  const SECAO: Record<string, string | undefined> = {
    inicio: REL, modulos: REL, implementacao: REL, solucoes: REL, financeiro: REL, perfil: REL,
    // `usuarios` e `suporte` NÃO entram aqui: viram a árvore "Gestão de RH" e o item solto
    // "Suporte Crasto.ai" (ambos por último) — montados à parte abaixo (pedido do Crasto).
  };
  const telas = CLIENT_SCREENS
    .filter((s) => allowed.has(s.key))
    .filter((s) => s.key !== "implementacao" || !implDone)
    .filter((s) => s.key !== "usuarios" && s.key !== "suporte")
    .map((s) => ({ to: s.to, end: s.key === "inicio", icon: SCREEN_ICON[s.key], label: s.label, section: SECAO[s.key] }));
  // "RH" (o antigo grupo "Colaboradores" foi eliminado): árvore com "Gestão de Acessos" dentro —
  // pronta p/ ganhar Equipe/Cargos depois. Vai por ÚLTIMO entre os módulos.
  const rhNav: NavItem[] = allowed.has("usuarios")
    ? [{ icon: Users, label: "RH", section: "Módulos", children: [{ to: "/app/usuarios", label: "Gestão de Acessos" }] }]
    : [];
  // NB: o "Suporte" SAIU da sidebar (pedido do Crasto) — agora o suporte é acessado pela JOY, o
  // agente flutuante no canto inferior direito (ver JoyWidget). A rota /app/suporte segue existindo
  // como back-end de chamados/horas, mas a JOY é a porta de entrada.
  const nav: NavItem[] = [
    ...telas.filter((s) => s.section === REL),
    ...modItems,
    ...rhNav,
  ];

  // Barra inferior do CELULAR (thumb zone): prioriza Início, WhatsApp CRM, Suporte, Perfil e
  // completa com o que houver — até 4 rotas reais + "Menu" (abre o drawer com tudo).
  const flatNav = nav.filter((n) => n.to);
  const PREF_BOTTOM = ["/app", "/app/crm", "/app/suporte", "/app/perfil"];
  const pickedBottom: NavItem[] = [];
  for (const p of PREF_BOTTOM) { const it = flatNav.find((n) => n.to === p); if (it) pickedBottom.push(it); }
  for (const n of flatNav) { if (pickedBottom.length >= 4) break; if (!pickedBottom.includes(n)) pickedBottom.push(n); }
  const bottomNav = pickedBottom.slice(0, 4);

  function exitPreview() {
    const oid = preview.orgId();
    preview.clear();
    navigate(oid ? `/admin/cliente/${oid}` : "/admin/clientes");
  }

  // Nome da EMPRESA logada (matriz) — vai numa tag ao lado da logo (o dono vê o nome da empresa dele).
  // Em preview (admin "ver como cliente"), usa a org visualizada. `undefined` (units carregando) = sem tag.
  const companyName = pv.active ? pv.name : ((units.find((u) => u.is_primary) || units[0])?.name || undefined);

  return (
    <UnitScopeContext.Provider value={{ units, unitId, setUnitId, canManage: canManageUnits, createUnit, reload: reloadUnits }}>
      <Shell nav={nav} bottomNav={bottomNav} brandTag={companyName} who={pv.active ? pv.name : (profile?.full_name || "Cliente")} sub={pv.active ? t("Visualização (admin)") : "Portal do Cliente"} logoTone="linear-gradient(145deg,#1F8A5B,#0d5c3a)" />
      {/* JOY — assistente de suporte flutuante (canto inferior direito). Substitui o antigo item
          "Suporte" da sidebar; sem IA/API (FAQ local + fallback humano). Só no portal do cliente. */}
      <JoyWidget />
      {pv.active && (
        <div style={{ position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 9999, display: "flex", alignItems: "center", gap: 12, background: "var(--crasto-text-primary)", color: "#fff", padding: "10px 8px 10px 16px", borderRadius: 999, boxShadow: "0 10px 34px rgba(1,14,38,.34)", fontSize: 13.5, maxWidth: "92vw" }}>
          <Eye size={15} style={{ flex: "none" }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("Visualizando como")} <b>{pv.name}</b></span>
          <button onClick={exitPreview} style={{ flex: "none", background: "rgba(255,255,255,.16)", color: "#fff", border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{t("Sair da visualização")}</button>
        </div>
      )}
    </UnitScopeContext.Provider>
  );
}
