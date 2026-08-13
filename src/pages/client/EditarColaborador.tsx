import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, IdCard, Briefcase, MessageSquare, Shield, ChevronDown, Sparkles, Bot, Calculator } from "lucide-react";
import { services, errorMessage } from "../../services";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";
import { SCREENS_BY_CATEGORY, ALL_SCREEN_KEYS, BASE_SCREEN } from "../../lib/screens";
import "../../styles/colaboradores.css";

// Modal "Editar Colaborador" (4 abas) — REUSÁVEL no CLIENTE (Gestão de Acessos) e no ADMIN
// (Permissões & Acessos). Grava em três destinos com autorização única no backend
// (gerenciaModulos aceita crasto_admin/dono/admin-level): perfil+ficha (delivery.collaborator),
// telas do Portal (cliente=delivery.userScreens · admin=admin_set_user_access), módulos
// (delivery.userModules) e subtelas do WhatsApp CRM (delivery.crmScreens → proxy interno).
// SEM campo de senha (decisão #5: acesso por e-mail). O papel Dono só é editável no ADMIN.

type Kind = "portal" | "crm" | "mod";
type Item = { key: string; label: string; base: boolean };
type Group = { key: string; label: string; kind: Kind; items: Item[] };
// Mínimo p/ abrir o editor — o resto (access_level/ficha/telas) é carregado por collaborator.get.
export type EditUser = { id: string; full_name: string | null; email: string | null; role: string; access_level?: string | null };

const ACCESS_LEVELS: { key: string; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "supervisor", label: "Supervisor" },
  { key: "agente", label: "Agente" },
  { key: "visualizador", label: "Visualizador" },
];
// Modalidade do colaborador. CLT = folha (valor total que recebe). PJ = prestador por hora,
// registrado como valor MENSAL. Projeto = escopo fechado (paga-se um valor pelo resultado).
const TIPOS: { key: string; label: string }[] = [
  { key: "", label: "—" },
  { key: "clt", label: "CLT" },
  { key: "pj", label: "PJ / Prestador (mensal)" },
  { key: "projeto", label: "Projeto (escopo fechado)" },
  { key: "estagio", label: "Estágio" },
  { key: "temporario", label: "Temporário" },
];
// Rótulo do campo de valor conforme a modalidade (o significado do "salário" muda).
function labelValor(tipo: string, t: (k: string) => string): string {
  if (tipo === "projeto") return t("Valor do projeto (escopo fechado)");
  if (tipo === "pj") return t("Valor mensal (PJ)");
  if (tipo === "clt") return t("Salário CLT (total que recebe)");
  return t("Salário / Valor");
}

// ── Fatia 3: custo real do empregador + rescisão (ESTIMATIVA por regime — não substitui contador).
// Encargos folha: FGTS 8% + 13º 8,33% + férias+⅓ 11,11% = 27,44%. Lucro Presumido/Real somam INSS
// patronal 20% + RAT/Sistema S ~7,8%. Simples: só a folha (patronal vai no DAS). Rescisão: aviso
// prévio 30 + 3/ano (teto 90, Lei 12.506/2011) + multa 40% sobre o FGTS acumulado. Só CLT tem isso.
const REGIMES: { key: string; label: string }[] = [
  { key: "simples", label: "Simples Nacional" },
  { key: "presumido", label: "Lucro Presumido" },
  { key: "real", label: "Lucro Real" },
];
function encargoPct(regime: string): number {
  const folha = 0.08 + 0.0833 + 0.1111;
  return regime === "presumido" || regime === "real" ? folha + 0.20 + 0.078 : folha;
}
function parseValor(s: string): number {
  return Number(String(s || "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
}
const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
// INSS empregado 2026 (progressivo por faixa, teto R$ 8.475,55).
function calcINSS(sal: number): number {
  const base = Math.min(sal, 8475.55);
  const faixas: [number, number][] = [[1621.0, 0.075], [2902.84, 0.09], [4354.27, 0.12], [8475.55, 0.14]];
  let inss = 0, ant = 0;
  for (const [lim, aliq] of faixas) { if (base > ant) { inss += (Math.min(base, lim) - ant) * aliq; ant = lim; } }
  return inss;
}
// IRRF 2026 (tabela progressiva 0→27,5% + redutor da Lei 15.270/25: isento até R$5.000, decrescente
// até R$7.350). Dependentes não têm campo na ficha → assume 0 (estimativa). Fonte: Receita Federal.
function calcIRRF(sal: number, inss: number, deps = 0): number {
  const base = sal - inss - deps * 189.59;
  let irrf = 0;
  if (base <= 2428.8) irrf = 0;
  else if (base <= 2826.65) irrf = base * 0.075 - 182.16;
  else if (base <= 3751.05) irrf = base * 0.15 - 394.16;
  else if (base <= 4664.68) irrf = base * 0.225 - 675.49;
  else irrf = base * 0.275 - 908.73;
  irrf = Math.max(0, irrf);
  const fator = sal <= 5000 ? 1 : sal >= 7350 ? 0 : (7350 - sal) / 2350; // redutor 2026
  return Math.max(0, irrf * (1 - fator));
}
function calcCusto(salarioStr: string, tipo: string, regime: string, admissao: string, ultimaFerias?: string) {
  const sal = parseValor(salarioStr);
  if (!sal) return null;
  if (tipo === "pj" || tipo === "projeto") return { pj: true as const, tipo, mensal: sal, anual: sal * 12 };
  if (tipo === "estagio" || tipo === "temporario") return null; // bolsa/temporário: sem cálculo CLT
  // "clt" OU modalidade não informada ("") → tratamos como CLT (caso mais comum)
  const enc = encargoPct(regime);
  const mensal = sal * (1 + enc);
  const hoje = new Date();
  const adm = admissao ? new Date(admissao) : null;
  const anosRaw = adm ? (hoje.getTime() - adm.getTime()) / (365.25 * 864e5) : 0;
  const anos = isFinite(anosRaw) && anosRaw > 0 ? anosRaw : 0;
  const meses = Math.max(1, Math.round(anos * 12));
  // ── Simulador demissional (dispensa sem justa causa) ─────────────────────────
  const saldoSalario = (sal / 30) * hoje.getDate();                       // dias trabalhados no mês
  const avisoDias = Math.min(30 + 3 * Math.floor(anos), 90);              // aviso prévio (Lei 12.506/2011)
  const aviso = (sal / 30) * avisoDias;
  const inicioAno = new Date(hoje.getFullYear(), 0, 1).getTime();
  const baseAno = adm && adm.getTime() > inicioAno ? adm.getTime() : inicioAno;
  const mesesAno = Math.min(12, Math.max(0, (hoje.getTime() - baseAno) / (30.44 * 864e5)));
  const decimoTerceiro = (mesesAno / 12) * sal;                           // 13º proporcional
  const refFerias = ultimaFerias ? new Date(ultimaFerias).getTime() : (adm ? adm.getTime() : hoje.getTime());
  const mesesFer = Math.max(0, (hoje.getTime() - refFerias) / (30.44 * 864e5));
  const feriasVencQtd = Math.floor(mesesFer / 12);
  const feriasVencidas = feriasVencQtd * sal * (4 / 3);                   // férias vencidas + ⅓
  const feriasProp = ((mesesFer - feriasVencQtd * 12) / 12) * sal * (4 / 3); // férias proporcionais + ⅓
  const multa40 = 0.40 * (0.08 * sal * meses);                           // multa 40% sobre o FGTS acumulado
  const rescisao = saldoSalario + aviso + decimoTerceiro + feriasVencidas + feriasProp + multa40;
  // O que o colaborador RECEBE (líquido) e a "cunha" (empresa paga × pessoa recebe).
  const inss = calcINSS(sal);
  const irrf = calcIRRF(sal, inss);
  const liquido = sal - inss - irrf;
  const cunha = mensal - liquido;
  const cunhaPct = Math.round((cunha / mensal) * 100);
  return { pj: false as const, tipo, sal, encPct: Math.round(enc * 100), mensal, anual: mensal * 12, anos, saldoSalario, avisoDias, aviso, decimoTerceiro, feriasVencidas, feriasVencQtd, feriasProp, multa40, rescisao, inss, irrf, liquido, cunha, cunhaPct };
}
// Catálogo ESTÁTICO do WhatsApp CRM (fallback) — MESMAS keys/labels do sidebar (ClientShell
// CRM_SECTIONS) e do wacrm. Garante que o grupo apareça mesmo antes da API nova estar em prod;
// quando o endpoint responde, o catálogo/seleção reais o sobrescrevem. base = 'dashboard'
// (o wacrm sempre força dashboard como tela-base).
const CRM_STATIC: { key: string; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "mesa", label: "Minhas Tarefas" },
  { key: "crm", label: "CRM" },
  { key: "chat", label: "Conversas" },
  { key: "contatos", label: "Contatos" },
  { key: "agenda", label: "Agendamentos" },
  { key: "config", label: "Configurações" },
];

const EMPTY_FORM = {
  full_name: "", email: "", cpf_cnpj: "", telefone: "", tipo_contrato: "", observacoes: "",
  cargo: "", departamento: "", salario: "", data_admissao: "", cnpj_vinculado: "", sindicato: "", ultima_ferias: "",
  wa_sender_name: "", wa_number: "",
};

export default function EditarColaborador({ orgId, user, context = "client", onClose, onSaved }: {
  orgId: string;
  user: EditUser | null; // null = novo colaborador
  context?: "client" | "admin";
  onClose: () => void;
  onSaved: (msg?: string) => void;
}) {
  const t = useT();
  const { profile: me } = useAuth();
  const isNew = !user;
  const isAdmin = context === "admin";
  const targetIsOwner = user?.role === "client_owner";
  // Papel Dono: fixo no cliente (o dono não é editável por lá); editável no admin.
  const [dono, setDono] = useState(targetIsOwner);
  // Nome/e-mail: editáveis ao criar OU no admin (que tem o caminho identity.users.update).
  const idEditable = isNew || isAdmin;
  // SIGILO DE CUSTO (decisão do Crasto): só o DONO/presidente (ou a Crasto) vê e edita salário/custo.
  // Admin-level de cliente administra a equipe, mas NÃO enxerga custo. O backend também gateia.
  const podeVerCusto = isAdmin || me?.role === "client_owner" || me?.role === "crasto_admin";

  const [tab, setTab] = useState<"dados" | "prof" | "wa" | "perm">("dados");
  const [f, setF] = useState({ ...EMPTY_FORM });
  const [level, setLevel] = useState<string | null>(user?.access_level ?? null);
  const [portal, setPortal] = useState<Set<string>>(new Set(ALL_SCREEN_KEYS));
  const [modSel, setModSel] = useState<Set<string>>(new Set());
  const [mods, setMods] = useState<{ id: string; label: string }[]>([]);
  const [crmCat, setCrmCat] = useState<{ key: string; label: string }[]>(CRM_STATIC);
  const [crmSel, setCrmSel] = useState<Set<string>>(new Set(CRM_STATIC.map((x) => x.key)));
  const [crmHas, setCrmHas] = useState(true);   // default true → grupo aparece; refina no load
  const [crmOwner, setCrmOwner] = useState(false);
  const [openG, setOpenG] = useState<Set<string>>(new Set(["whatsapp_crm"]));
  // RESPONSÁVEL pelas dúvidas da IA (por agente). Quando a IA tem dúvida, a tarefa de aprovação
  // chega a quem for responsável (Minha Mesa + sino). Sem ninguém → aparece para todos.
  const [agentsList, setAgentsList] = useState<{ id: string; name: string }[]>([]);
  const [respAgents, setRespAgents] = useState<Set<string>>(new Set());
  // Regime tributário da EMPRESA (custo do empregador — Fatia 3). Padrão Simples; só o dono edita.
  const [orgTaxRegime, setOrgTaxRegime] = useState<string>("simples");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [newPw, setNewPw] = useState("");       // reset MANUAL de senha (admin/dono) — sem e-mail
  const [showPw, setShowPw] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const setField = (k: keyof typeof EMPTY_FORM, v: string) => setF((s) => ({ ...s, [k]: v }));

  // Quem vê TUDO (sem árvore, só a mensagem de acesso total): o DONO (owner) OU o nível ADMIN
  // (colaborador com acesso total). Supervisor/Agente/Visualizador escolhem as telas na árvore.
  const ehDono = isAdmin ? dono : targetIsOwner;
  const ehAdminNivel = !ehDono && level === "admin";
  const verTudo = ehDono || ehAdminNivel;

  // ── carga inicial ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        const cms = (await services.delivery.clientModules.listByOrg(orgId).catch(() => [])) as any[];
        const ativos = (cms || []).filter((c) => c.status === "active");
        const ids = [...new Set(ativos.map((c) => c.vdi_module_id as string))];
        const vms = ids.length ? await services.catalog.vdiModules.listByIds(ids, "id,name").catch(() => [] as any[]) : [];
        const nomeDe: Record<string, string> = Object.fromEntries((vms as any[]).map((v) => [v.id, v.name]));
        const vistos = new Set<string>();
        const uniq = ativos.filter((c) => !vistos.has(c.vdi_module_id) && vistos.add(c.vdi_module_id))
          .map((c) => ({ id: c.vdi_module_id as string, label: (c.label || nomeDe[c.vdi_module_id] || t("Módulo")) as string }));
        if (!alive) return;
        setMods(uniq);

        if (user) {
          const [info, tel, mod, crm] = await Promise.all([
            services.delivery.collaborator.get(user.id).catch(() => null),
            services.delivery.userScreens.list(user.id).catch(() => [] as string[]),
            services.delivery.userModules.list(user.id).catch(() => [] as string[]),
            services.delivery.crmScreens.get(user.id).catch(() => null),
          ]);
          if (!alive) return;
          if (info) {
            setLevel(info.access_level ?? null);
            if ((info as any).org_tax_regime) setOrgTaxRegime((info as any).org_tax_regime);
            const tm = info.team || {};
            setF({
              full_name: user.full_name || "", email: user.email || "",
              cpf_cnpj: tm.cpf_cnpj ?? "", telefone: tm.telefone ?? "", cargo: tm.cargo ?? "", departamento: tm.departamento ?? "",
              salario: tm.salario != null ? String(tm.salario) : "", data_admissao: tm.data_admissao ? String(tm.data_admissao).slice(0, 10) : "",
              tipo_contrato: tm.tipo_contrato ?? "", cnpj_vinculado: tm.cnpj_vinculado ?? "", observacoes: tm.observacoes ?? "",
              sindicato: tm.sindicato ?? "", ultima_ferias: tm.ultima_ferias ? String(tm.ultima_ferias).slice(0, 10) : "",
              wa_sender_name: info.wa_sender_name ?? "", wa_number: info.wa_number ?? "",
            });
          } else {
            setF((s) => ({ ...s, full_name: user.full_name || "", email: user.email || "" }));
          }
          const telArr = Array.isArray(tel) ? tel : [];
          setPortal(new Set(telArr.length ? [BASE_SCREEN, ...telArr] : ALL_SCREEN_KEYS));
          const modArr = Array.isArray(mod) ? mod : [];
          setModSel(new Set(modArr.length ? modArr : uniq.map((m) => m.id)));
          if (crm && !crm.error && crm.catalog) {
            setCrmHas(!!crm.has_access); setCrmOwner(!!crm.owner); setCrmCat(crm.catalog);
            setCrmSel(new Set(crm.screens && crm.screens.length ? crm.screens : crm.catalog.map((x) => x.key)));
          }
        } else {
          setPortal(new Set(ALL_SCREEN_KEYS));
          setModSel(new Set(uniq.map((m) => m.id)));
          // Catálogo do CRM via o usuário logado; has_access dele = "a org tem CRM". Sem resposta
          // (API nova ainda não em prod) → mantém o fallback estático (o grupo aparece no dev).
          const crm = me?.id ? await services.delivery.crmScreens.get(me.id).catch(() => null) : null;
          if (alive && crm && crm.catalog?.length) {
            setCrmHas(!!crm.has_access); setCrmOwner(false); setCrmCat(crm.catalog); setCrmSel(new Set(crm.catalog.map((x) => x.key)));
          }
        }
      } catch (e) { if (alive) setErr(errorMessage(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [orgId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Agentes da empresa + de quais a pessoa é responsável. Admin: crmAccess (bearer). Cliente
  // (dono/admin): delivery.crmAgents (guarda do delivery). Novo colaborador: lista os agentes da
  // própria org (via me) e começa sem responsável.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (isAdmin) {
          const o = await services.crmAccess.overview(orgId);
          if (!alive) return;
          setAgentsList((o.agents || []).map((a) => ({ id: a.id, name: a.name })));
          if (user) { const u = (o.users || []).find((x) => x.id === user.id); setRespAgents(new Set(u?.responsible_agents || [])); }
        } else {
          const alvo = user?.id || me?.id;
          if (!alvo) return;
          const r: any = await services.delivery.crmAgents.list(alvo);
          if (!alive || r?.error) return;
          setAgentsList((r.agents || []).map((a: any) => ({ id: a.id, name: a.name })));
          if (user) setRespAgents(new Set(r.responsible_agents || []));
        }
      } catch { /* sem agentes → o bloco some */ }
    })();
    return () => { alive = false; };
  }, [orgId, user?.id, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── árvore de permissões ──────────────────────────────────────────────────────────────────
  const groups: Group[] = useMemo(() => [
    ...SCREENS_BY_CATEGORY.map((g) => ({ key: g.key, label: g.label, kind: "portal" as Kind, items: g.screens.map((s) => ({ key: s.key, label: s.label, base: s.key === BASE_SCREEN })) })),
    ...(crmHas && !crmOwner && crmCat.length ? [{ key: "whatsapp_crm", label: "WhatsApp CRM", kind: "crm" as Kind, items: crmCat.map((c) => ({ key: c.key, label: c.label, base: c.key === "dashboard" })) }] : []),
    ...(mods.length ? [{ key: "modulos", label: t("Módulos contratados"), kind: "mod" as Kind, items: mods.map((m) => ({ key: m.id, label: m.label, base: false })) }] : []),
  ], [crmHas, crmOwner, crmCat, mods, t]);

  const isOn = (kind: Kind, key: string, base: boolean) =>
    base || (kind === "portal" ? portal.has(key) : kind === "crm" ? crmSel.has(key) : modSel.has(key));
  function toggleItem(kind: Kind, key: string, base: boolean) {
    if (base) return;
    const upd = (s: Set<string>) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; };
    kind === "portal" ? setPortal(upd) : kind === "crm" ? setCrmSel(upd) : setModSel(upd);
  }
  function setAll(g: Group, on: boolean) {
    const keys = g.items.filter((i) => !i.base).map((i) => i.key);
    const upd = (s: Set<string>) => { const n = new Set(s); keys.forEach((k) => (on ? n.add(k) : n.delete(k))); return n; };
    g.kind === "portal" ? setPortal(upd) : g.kind === "crm" ? setCrmSel(upd) : setModSel(upd);
  }
  const countOn = (g: Group) => g.items.filter((i) => isOn(g.kind, i.key, i.base)).length;

  function gerarSenha() { const cs = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < 12; i++) s += cs[Math.floor(Math.random() * cs.length)]; setNewPw(s); setShowPw(true); }
  async function definirSenha() {
    if (!user?.id || newPw.trim().length < 8) return;
    setPwBusy(true);
    try {
      const r = await services.identity.users.setPassword(user.id, newPw.trim());
      if (!r.ok) throw new Error(r.error || t("Falha ao redefinir a senha."));
      setToast(t("Senha redefinida ✓ — repasse a senha manualmente à pessoa.")); setNewPw(""); setShowPw(false); setTimeout(() => setToast(""), 6000);
    } catch (e: any) { setToast(errorMessage(e)); setTimeout(() => setToast(""), 6000); }
    finally { setPwBusy(false); }
  }
  async function reenviar() {
    if (!user) return;
    setBusy(true);
    try { const r = await services.identity.users.resendByOwner(user.id); if (!r.ok) throw new Error(r.error || t("Falha ao reenviar.")); setToast(t("Acesso reenviado ✓")); setTimeout(() => setToast(""), 5000); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  async function salvar() {
    setErr(""); setBusy(true);
    try {
      let uid = user?.id;
      if (!uid) {
        if (!f.email.trim()) { setTab("dados"); throw new Error(t("Informe o e-mail.")); }
        // Cliente: convite pelo dono (inviteByOwner). Admin: criação cross-org (create).
        const r: any = isAdmin
          ? await services.identity.users.create({ email: f.email.trim(), full_name: f.full_name.trim(), organization_id: orgId, role: dono ? "client_owner" : "client_member" })
          : await services.identity.users.invite({ email: f.email.trim(), full_name: f.full_name.trim() || undefined, role: "client_member" });
        if (!r?.ok || !r?.id) throw new Error(r?.error || t("Não foi possível criar o colaborador."));
        uid = r.id as string;
      } else if (isAdmin) {
        // Admin: nome/e-mail (sincroniza Auth + CRM) se mudaram.
        const emailNovo = f.email.trim().toLowerCase();
        const mudou = f.full_name.trim() !== (user!.full_name || "") || emailNovo !== (user!.email || "").toLowerCase();
        if (mudou) {
          const ru: any = await services.identity.users.update(uid, { full_name: f.full_name.trim(), email: emailNovo !== (user!.email || "").toLowerCase() ? emailNovo : undefined });
          if (ru?.error) throw new Error(ru.error);
        }
      }

      // 1) ficha: access_level (limpa se Dono) + WhatsApp + RH.
      const team = {
        cpf_cnpj: f.cpf_cnpj, telefone: f.telefone, cargo: f.cargo, departamento: f.departamento,
        salario: f.salario === "" ? null : f.salario, data_admissao: f.data_admissao || null,
        tipo_contrato: f.tipo_contrato, cnpj_vinculado: f.cnpj_vinculado, observacoes: f.observacoes,
        sindicato: f.sindicato || null, ultima_ferias: f.ultima_ferias || null,
      };
      const payload: { access_level?: string | null; wa_sender_name?: string | null; wa_number?: string | null; team?: typeof team; org_tax_regime?: string } =
        { wa_sender_name: f.wa_sender_name, wa_number: f.wa_number, team };
      if (podeVerCusto) payload.org_tax_regime = orgTaxRegime; // regime da empresa (só o dono grava)
      if (isAdmin) payload.access_level = ehDono ? null : (level ?? null);
      else if (!targetIsOwner) payload.access_level = level ?? null;
      const cr: any = await services.delivery.collaborator.set(uid!, payload);
      if (cr?.error) throw new Error(cr.error);

      // 2) papel + telas do Portal. Admin-nível = acesso TOTAL (todas as telas), como o Dono.
      const screensArr = ehAdminNivel ? [...ALL_SCREEN_KEYS] : ALL_SCREEN_KEYS.filter((k) => portal.has(k));
      if (isAdmin) {
        // Admin: papel + telas atômico (RPC admin) + sincroniza o papel no CRM.
        await services.analytics.admin.setUserAccess(uid!, ehDono ? "client_owner" : "client_member", ehDono ? [] : screensArr);
        if (crmHas) { const ru: any = await services.crmAccess.update(orgId, uid!, { role: ehDono ? "client_owner" : "client_member", responsible_agents: Array.from(respAgents) }); if (ru?.error) throw new Error(ru.error); }
      } else if (!targetIsOwner) {
        await services.delivery.userScreens.set(uid!, screensArr);
      }

      // 3) módulos + subtelas do CRM. O Dono vê tudo (não grava). Admin-nível = TODOS.
      if (!ehDono) {
        const allMods = mods.map((m) => m.id);
        const msel = ehAdminNivel ? [] : allMods.filter((id) => modSel.has(id));
        await services.delivery.userModules.set(uid!, msel.length === allMods.length ? [] : msel);
        if (crmHas && !crmOwner) {
          const crmToSave = ehAdminNivel ? crmCat.map((c) => c.key) : Array.from(crmSel);
          const rs: any = await services.delivery.crmScreens.set(uid!, crmToSave).catch(() => null);
          if (rs?.error && !/acesso|restring/i.test(rs.error)) throw new Error(rs.error);
        }
      }
      // Responsável pelas dúvidas da IA (cliente): grava de quais agentes esta pessoa é responsável.
      // (No admin, isso já foi pelo crmAccess.update acima.)
      if (!isAdmin && crmHas) {
        const rr: any = await services.delivery.crmAgents.setResponsibles(uid!, Array.from(respAgents));
        if (rr?.error) throw new Error(rr.error);
      }
      onSaved(isNew ? t("Colaborador criado ✓") : t("Colaborador atualizado ✓"));
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  const TABS: { key: typeof tab; label: string; icon: JSX.Element }[] = [
    { key: "dados", label: t("Dados & Acesso"), icon: <IdCard size={15} /> },
    { key: "prof", label: t("Profissional"), icon: <Briefcase size={15} /> },
    { key: "wa", label: t("WhatsApp"), icon: <MessageSquare size={15} /> },
    { key: "perm", label: t("Permissões"), icon: <Shield size={15} /> },
  ];
  const ownerNote = <div className="note"><Check size={15} /><div>{t("Dono da conta: vê todas as telas e gerencia a empresa. Acesso total, não é restringível.")}</div></div>;
  const notaTotal = ehDono ? ownerNote
    : <div className="note"><Check size={15} /><div>{t("Admin: acesso total a todas as telas e módulos — e pode gerenciar a equipe. Não é restringível.")}</div></div>;

  return (
    <Modal wide title={isNew ? t("Novo Colaborador") : t("Editar Colaborador")} open onClose={onClose}
      footer={<>
        <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={onClose}><span className="crasto-btn__label">{t("Cancelar")}</span></button>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy || loading} onClick={salvar}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar")}</span></button>
      </>}>
      {err && <div className="formerr" style={{ marginBottom: 10 }}>{err}</div>}

      <div className="ec-tabs">
        {TABS.map((tb) => (
          <button key={tb.key} type="button" className={"ec-tab" + (tab === tb.key ? " on" : "")} onClick={() => setTab(tb.key)}>
            <span className="ec-tab__ico">{tb.icon}</span>{tb.label}
          </button>
        ))}
      </div>

      {loading ? <div className="mt" style={{ padding: "24px 4px" }}>{t("Carregando…")}</div> : (<div className="ec-body">
        {/* ---- Dados & Acesso ---- */}
        {tab === "dados" && (<>
          <div className="ec-field"><label>{t("Nome completo")} *</label>
            <input value={f.full_name} disabled={!idEditable} onChange={(e) => setField("full_name", e.target.value)} placeholder={t("Nome da pessoa")} /></div>
          <div className="ec-grid">
            <div className="ec-field"><label>{t("E-mail de acesso")} *</label>
              <input type="email" value={f.email} disabled={!idEditable} onChange={(e) => setField("email", e.target.value)} placeholder="pessoa@empresa.com" /></div>
            <div className="ec-field"><label>{t("CPF / CNPJ")}</label>
              <input value={f.cpf_cnpj} onChange={(e) => setField("cpf_cnpj", e.target.value)} placeholder="000.000.000-00" /></div>
            <div className="ec-field"><label>{t("Telefone")}</label>
              <input value={f.telefone} onChange={(e) => setField("telefone", e.target.value)} placeholder="(11) 99999-0000" /></div>
            <div className="ec-field"><label>{t("Tipo")}</label>
              <select value={f.tipo_contrato} onChange={(e) => setField("tipo_contrato", e.target.value)}>{TIPOS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
          </div>
          {!isNew && (
            <div className="ec-access-note">
              <span>{isAdmin ? t("A senha vai por e-mail — a pessoa define a própria no primeiro acesso.") : t("A senha vai por e-mail — a pessoa define a própria no primeiro acesso. Nome e e-mail de login não são editados aqui.")}</span>
              <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} onClick={reenviar}>
                <span className="crasto-btn__icon"><RefreshCw size={13} /></span><span className="crasto-btn__label">{t("Reenviar acesso")}</span>
              </button>
            </div>
          )}
          {!isNew && podeVerCusto && (
            <div className="ec-field" style={{ marginTop: 12 }}>
              <label>{t("Resetar senha manualmente")}</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type={showPw ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder={t("Nova senha (mín. 8 caracteres)")} autoComplete="new-password" style={{ flex: 1, minWidth: 200 }} />
                <button type="button" className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setShowPw((v) => !v)}><span className="crasto-btn__label">{showPw ? t("Ocultar") : t("Mostrar")}</span></button>
                <button type="button" className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={gerarSenha}><span className="crasto-btn__label">{t("Gerar")}</span></button>
                <button type="button" className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={pwBusy || newPw.trim().length < 8} onClick={definirSenha}><span className="crasto-btn__label">{pwBusy ? t("Salvando…") : t("Definir senha")}</span></button>
              </div>
              <span className="muted sm" style={{ display: "block", marginTop: 4 }}>{t("Define a senha na hora — NÃO envia e-mail. Use quando a pessoa perdeu o acesso ao e-mail; depois repasse a senha por outro canal (ex.: WhatsApp).")}</span>
            </div>
          )}
          {isNew && <div className="note" style={{ marginTop: 12 }}><span>{t("A pessoa recebe um e-mail de acesso da Crasto.AI e define a própria senha no primeiro login.")}</span></div>}
          <div className="ec-field" style={{ marginTop: 14 }}><label>{t("Observações")}</label>
            <textarea value={f.observacoes} onChange={(e) => setField("observacoes", e.target.value)} placeholder={t("Notas adicionais…")} rows={3} /></div>
        </>)}

        {/* ---- Profissional ---- */}
        {tab === "prof" && (<>
          <div className="ec-grid">
            <div className="ec-field"><label>{t("Cargo / Função")}</label><input value={f.cargo} onChange={(e) => setField("cargo", e.target.value)} /></div>
            <div className="ec-field"><label>{t("Departamento")}</label><input value={f.departamento} onChange={(e) => setField("departamento", e.target.value)} /></div>
            {podeVerCusto ? (
              <div className="ec-field"><label>{labelValor(f.tipo_contrato, t)}</label><input value={f.salario} onChange={(e) => setField("salario", e.target.value)} inputMode="decimal" placeholder="0,00" /></div>
            ) : (
              <div className="ec-field"><label>{t("Valor / Custo")}</label><div className="mt" style={{ padding: "9px 2px", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}><Shield size={13} /> {t("Visível apenas ao dono da empresa.")}</div></div>
            )}
            <div className="ec-field"><label>{t("Data de Admissão")}</label><input type="date" value={f.data_admissao} onChange={(e) => setField("data_admissao", e.target.value)} /></div>
            <div className="ec-field"><label>{t("Tipo de Contrato")}</label>
              <select value={f.tipo_contrato} onChange={(e) => setField("tipo_contrato", e.target.value)}>{TIPOS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
            <div className="ec-field"><label>{t("CNPJ Vinculado")}</label><input value={f.cnpj_vinculado} onChange={(e) => setField("cnpj_vinculado", e.target.value)} /></div>
            <div className="ec-field"><label>{t("Sindicato")}</label><input value={f.sindicato} onChange={(e) => setField("sindicato", e.target.value)} placeholder={t("Ex.: SINDPD, SEESP…")} /></div>
          </div>
          {podeVerCusto && <CustoPanel salario={f.salario} tipo={f.tipo_contrato} adm={f.data_admissao} regime={orgTaxRegime} setRegime={setOrgTaxRegime} sindicato={f.sindicato} ultimaFerias={f.ultima_ferias} setUltimaFerias={(v) => setField("ultima_ferias", v)} t={t} />}
        </>)}

        {/* ---- WhatsApp ---- */}
        {tab === "wa" && (<>
          <div className="ec-uplabel">{t("Nome de exibição no WhatsApp")}</div>
          <p className="mt" style={{ margin: "0 0 12px" }}>{t("Este nome aparece no topo da mensagem quando o colaborador responde um cliente no WhatsApp CRM. Se vazio, usamos o nome completo.")}</p>
          <div className="ec-field"><label>{t("Nome de exibição")}</label>
            <input value={f.wa_sender_name} onChange={(e) => setField("wa_sender_name", e.target.value)} placeholder={f.full_name || t("Ex.: João, Suporte Técnico")} /></div>
          <div className="ec-preview">
            <div className="ec-preview__lb">{t("Prévia da mensagem")}:</div>
            <div><b>{f.wa_sender_name || f.full_name || t("Nome")}:</b> <i>{t("Olá, como posso ajudar?")}</i></div>
          </div>
        </>)}

        {/* ---- Permissões ---- */}
        {tab === "perm" && (!isAdmin && targetIsOwner ? ownerNote : (<>
          <div className="ec-uplabel">{t("Função / Nível de acesso")}</div>
          <div className="ec-seg">
            {isAdmin && <button type="button" className={"ec-seg-b" + (dono ? " on" : "")} onClick={() => setDono(true)}>{t("Dono")}</button>}
            {ACCESS_LEVELS.map((lv) => (
              <button key={lv.key} type="button" className={"ec-seg-b" + (!dono && level === lv.key ? " on" : "")} onClick={() => { setDono(false); setLevel(lv.key); }}>{t(lv.label)}</button>
            ))}
          </div>
          {agentsList.length > 0 && (
            <div style={{
              marginTop: 18, padding: 16, borderRadius: 14,
              border: "1px solid rgba(110,156,232,0.38)",
              background: "rgba(110,156,232,0.08)",
              boxShadow: "0 1px 0 rgba(110,156,232,0.10) inset",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ display: "inline-flex", width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 9, background: "linear-gradient(135deg,#6E9CE8,#2E6F9E)", color: "#fff", flex: "0 0 auto", boxShadow: "0 2px 8px rgba(46,111,158,0.35)" }}>
                  <Sparkles size={16} />
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: ".02em", color: "var(--crasto-blue)" }}>{t("Responsável pelas dúvidas da IA")}</span>
              </div>
              <p style={{ margin: "0 0 14px 40px", fontSize: 12.5, lineHeight: 1.55, color: "var(--crasto-text-body)" }}>
                {t("Quando a IA tiver dúvida, a tarefa de aprovação chega a quem for responsável pelo agente (Minha Mesa + notificação). Sem ninguém responsável, aparece para todos.")}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {agentsList.map((a) => {
                  const on = respAgents.has(a.id);
                  return (
                    <button key={a.id} type="button" aria-pressed={on}
                      onClick={() => setRespAgents((s) => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                        padding: "11px 13px", borderRadius: 11, cursor: "pointer", textAlign: "left", width: "100%",
                        transition: "background .15s, border-color .15s",
                        border: on ? "1.5px solid #6E9CE8" : "1px solid var(--crasto-border)",
                        background: on ? "rgba(110,156,232,0.16)" : "transparent",
                      }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <Bot size={17} style={{ flex: "0 0 auto", color: on ? "#6E9CE8" : "var(--crasto-text-muted)" }} />
                        <span style={{ fontSize: 14, fontWeight: on ? 700 : 500, color: on ? "var(--crasto-text-primary)" : "var(--crasto-text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                      </span>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5, flex: "0 0 auto",
                        fontSize: 11.5, fontWeight: 700, letterSpacing: ".01em",
                        padding: "3px 10px", borderRadius: 999,
                        color: on ? "#fff" : "var(--crasto-text-faint)",
                        background: on ? "linear-gradient(135deg,#6E9CE8,#4E93D4)" : "transparent",
                        border: on ? "0" : "1px solid var(--crasto-border)",
                      }}>
                        {on ? <><Check size={13} /> {t("Responsável")}</> : t("Definir")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {verTudo ? <div style={{ marginTop: 14 }}>{notaTotal}</div> : (<>
            <div className="ec-uplabel" style={{ marginTop: 18 }}>{t("Permissões de tela")}</div>
            <p className="mt" style={{ margin: "0 0 10px" }}>{t("Selecione quais telas este colaborador poderá acessar:")}</p>
            <div className="ec-tree">
              {groups.map((g) => {
                const aberto = openG.has(g.key);
                const total = g.items.length, on = countOn(g);
                return (
                  <div key={g.key} className={"ec-group" + (aberto ? " open" : "")}>
                    <button type="button" className="ec-group-head" onClick={() => setOpenG((s) => { const n = new Set(s); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })}>
                      <ChevronDown size={15} className="ec-caret" />
                      <span className="ec-group-lb">{g.label}</span>
                      <span className="ec-count">{on}/{total}</span>
                    </button>
                    {aberto && (<div className="ec-group-body">
                      <div className="ec-item ec-item--all">
                        <span className="lb">{t("Selecionar todos")}</span>
                        <button type="button" className={"ec-switch" + (on >= total ? " on" : "")} aria-label={t("Selecionar todos")} onClick={() => setAll(g, on < total)} />
                      </div>
                      {g.items.map((it) => (
                        <div key={it.key} className="ec-item">
                          <span className="lb">{t(it.label)}{it.base && <em> · {t("base")}</em>}</span>
                          <button type="button" disabled={it.base} className={"ec-switch" + (isOn(g.kind, it.key, it.base) ? " on" : "") + (it.base ? " locked" : "")}
                            aria-label={it.label} onClick={() => toggleItem(g.kind, it.key, it.base)} />
                        </div>
                      ))}
                    </div>)}
                  </div>
                );
              })}
            </div>
          </>)}
        </>))}
      </div>)}
      {toast && <div className="toast">{toast}</div>}
    </Modal>
  );
}

function Metric({ lbl, val, hint, big }: { lbl: string; val: string; hint?: string; big?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="mt" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em" }}>{lbl}</div>
      <div style={{ fontSize: big ? 21 : 16, fontWeight: 800, lineHeight: 1.15, color: "var(--crasto-text-primary)" }}>{val}</div>
      {hint && <div className="mt" style={{ fontSize: 10.5, marginTop: 1 }}>{hint}</div>}
    </div>
  );
}

// Linha de verba do simulador demissional (rótulo — valor).
function Verba({ lbl, val }: { lbl: string; val: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, fontSize: 12.5, padding: "4px 0", borderBottom: "1px dashed rgba(110,156,232,0.16)" }}>
      <span className="mt">{lbl}</span>
      <b style={{ color: "var(--crasto-text-body)", fontWeight: 700, whiteSpace: "nowrap" }}>{val}</b>
    </div>
  );
}

// Fatia 3 — painel de custo real do colaborador (só o dono vê). ESTIMATIVA por regime tributário.
function CustoPanel({ salario, tipo, adm, regime, setRegime, sindicato, ultimaFerias, setUltimaFerias, t }: { salario: string; tipo: string; adm: string; regime: string; setRegime: (v: string) => void; sindicato?: string; ultimaFerias?: string; setUltimaFerias?: (v: string) => void; t: (k: string) => string }) {
  const c = calcCusto(salario, tipo, regime, adm, ultimaFerias);
  return (
    <div style={{ marginTop: 18, padding: 16, borderRadius: 14, border: "1px solid rgba(110,156,232,0.38)", background: "rgba(110,156,232,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 800, color: "var(--crasto-blue)" }}>
          <Calculator size={15} /> {t("Custo real para a empresa")}
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span className="mt">{t("Regime")}:</span>
          <select value={regime} onChange={(e) => setRegime(e.target.value)} className="rh-ctl">
            {REGIMES.map((rg) => <option key={rg.key} value={rg.key}>{t(rg.label)}</option>)}
          </select>
        </label>
      </div>
      {!c ? (
        <p className="mt" style={{ margin: 0, fontSize: 12.5 }}>{t("Informe o salário do colaborador (aba acima) para ver o custo. Estágio/temporário não têm cálculo automático.")}</p>
      ) : c.pj ? (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Metric lbl={c.tipo === "projeto" ? t("Valor do projeto") : t("Custo mensal (PJ)")} val={brl(c.mensal)} big />
          {c.tipo !== "projeto" && <Metric lbl={t("No ano")} val={brl(c.anual)} />}
          <p className="mt" style={{ margin: "2px 0 0", fontSize: 11.5, flexBasis: "100%" }}>{t("Prestador de serviço — sem encargos CLT nem rescisão.")}</p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Metric lbl={t("Custo mensal carregado")} val={brl(c.mensal)} hint={`${t("salário")} + ${c.encPct}% ${t("encargos")}`} big />
            <Metric lbl={t("No ano")} val={brl(c.anual)} />
            <Metric lbl={t("Tempo de casa")} val={`${c.anos.toFixed(1)} ${t("anos")}`} />
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(110,156,232,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <span className="mt" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em" }}>{t("Simulador demissional (se desligar hoje)")}</span>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
                <span className="mt">{t("Última férias")}:</span>
                <input type="date" value={ultimaFerias || ""} onChange={(e) => setUltimaFerias?.(e.target.value)} className="rh-ctl" />
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0 22px" }}>
              <Verba lbl={t("Saldo de salário")} val={brl(c.saldoSalario)} />
              <Verba lbl={`${t("Aviso prévio")} (${c.avisoDias}d)`} val={brl(c.aviso)} />
              <Verba lbl={t("13º proporcional")} val={brl(c.decimoTerceiro)} />
              <Verba lbl={t("Férias proporcionais + ⅓")} val={brl(c.feriasProp)} />
              {c.feriasVencidas > 0 && <Verba lbl={`${t("Férias vencidas + ⅓")}${c.feriasVencQtd > 1 ? " ×" + c.feriasVencQtd : ""}`} val={brl(c.feriasVencidas)} />}
              <Verba lbl={t("Multa 40% FGTS")} val={brl(c.multa40)} />
            </div>
            <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="mt" style={{ fontSize: 11 }}>{t("Total da rescisão")}:</span>
              <b style={{ fontSize: 20, fontWeight: 800, color: "var(--crasto-text-primary)" }}>{brl(c.rescisao)}</b>
            </div>
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(110,156,232,0.2)" }}>
            <div className="mt" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>{t("A conta — quem fica com o quê")}</div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <Metric lbl={t("Empresa desembolsa")} val={brl(c.mensal)} />
              <Metric lbl={t("Colaborador recebe líquido")} val={brl(c.liquido)} hint={`− INSS ${brl(c.inss)} − IRRF ${brl(c.irrf)}`} />
              <Metric lbl={t("Impostos + encargos")} val={`${brl(c.cunha)} · ${c.cunhaPct}%`} hint={t("do custo total")} />
            </div>
          </div>
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(52,168,83,0.12)", border: "1px solid rgba(52,168,83,0.32)", fontSize: 12.5, lineHeight: 1.5, color: "var(--crasto-text-body)" }}>
            💡 {t("Se a IA assumir esta função, a empresa deixa de gastar")} <b style={{ color: "#34a853" }}>{brl(c.mensal)}/{t("mês")}</b> — <b style={{ color: "#34a853" }}>{brl(c.anual)}/{t("ano")}</b> {t("em folha + encargos.")}
          </div>
        </>
      )}
      {sindicato && <p className="mt" style={{ margin: "8px 2px 0", fontSize: 11.5 }}>{t("Sindicato")}: <b>{sindicato}</b> · {t("contribuição sindical é voluntária desde 2017 (Lei 13.467).")}</p>}
      <p className="mt" style={{ margin: "10px 2px 0", fontSize: 10.5, lineHeight: 1.5, opacity: 0.85 }}>🔒 {t("Estimativa para gestão — provisões médias e tabelas 2026 (INSS/IRRF). Não substitui a contabilidade.")}</p>
    </div>
  );
}
