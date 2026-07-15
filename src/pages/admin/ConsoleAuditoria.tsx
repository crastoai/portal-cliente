import { useState } from "react";
import { Eye, Settings, KeyRound, ShieldCheck, Lock } from "lucide-react";
import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";

// Auditoria & Logs — trilha UNICA e append-only (audit.events) do sistema inteiro:
// Portal e WhatsApp CRM escrevem aqui. Login/senha sao reportados pela tela (acontecem
// entre o navegador e o Auth, o servidor nao os ve); o resto e gravado pela API/RPC.
const ACTION_LABEL: Record<string, string> = {
  login: "Entrou",
  logout: "Saiu",
  password_set: "Definiu a senha",
  first_access: "Primeiro acesso",
  password_reset_requested: "Pediu redefinição de senha",
  portal_access_granted: "Liberou acesso ao Portal",
  access_link_resent: "Reenviou link de acesso",
  crm_access_granted: "Liberou acesso ao CRM",
  crm_access_revoked: "Tirou acesso ao CRM",
  crm_access_resent: "Reenviou acesso ao CRM",
  crm_agent_linked: "Vinculou agente ao cliente",
  ticket_opened: "Abriu chamado",
  ticket_notified: "Avisou sobre chamado",
  impersonate_attempt: "Entrou no CRM (impersonação)",
  impersonate: "Impersonação",
  config_change: "Alterou configuração",
  secret_reveal: "Revelou segredo",
  role_change: "Mudou papel",
  access_change: "Mudou acesso",
};
const ACTION_TONE = (a: string) =>
  a === "login" || a === "password_set" ? "ok"
  : a.startsWith("impersonate") ? "info"
  : a === "secret_reveal" || a === "crm_access_revoked" ? "crit"
  : ["role_change", "access_change", "portal_access_granted", "crm_access_granted", "password_reset_requested"].includes(a) ? "warn"
  : "mute";
const SISTEMA: Record<string, string> = { portal: "Portal", crm: "WhatsApp CRM" };
// Grupos que respondem a "o que aconteceu aqui": acesso x senha x permissao x config.
const GRUPO: Record<string, string[]> = {
  acesso: ["login", "logout", "impersonate_attempt", "impersonate"],
  senha: ["password_set", "first_access", "password_reset_requested", "access_link_resent"],
  permissao: ["portal_access_granted", "crm_access_granted", "crm_access_revoked", "crm_access_resent", "role_change", "access_change"],
  config: ["config_change", "secret_reveal", "crm_agent_linked"],
  chamado: ["ticket_opened", "ticket_notified"],
};
const fmtDT = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function ConsoleAuditoria() {
  const t = useT();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [org, setOrg] = useState("");
  const [sys, setSys] = useState("");
  const [acao, setAcao] = useState("");
  const { data, loading } = useAsync(async () => {
    const [events, orgs] = await Promise.all([
      services.analytics.admin.auditLog(from || undefined, to || undefined, org || undefined),
      services.identity.organizations.listBrief().catch(() => [] as any[]),
    ]);
    return { events: (events as any[]) ?? [], orgs: (orgs as any[]) ?? [] };
  }, [from, to, org]);
  const todos = data?.events ?? [];
  const orgs = data?.orgs ?? [];
  const events = todos.filter((e) =>
    (!sys || (e.system || "portal") === sys) && (!acao || (GRUPO[acao] || []).includes(e.action)));
  const orgName = (id?: string | null) => (id ? (orgs.find((o: any) => o.id === id)?.name ?? "—") : "—");

  const now = Date.now();
  const k7d = todos.filter((e) => now - new Date(e.at).getTime() < 7 * 86400000).length;
  const kImp = todos.filter((e) => (e.action || "").startsWith("impersonate")).length;
  const kSenha = todos.filter((e) => ["password_set", "password_reset_requested"].includes(e.action)).length;
  const kCfg = todos.filter((e) => ["config_change", "secret_reveal", "role_change", "access_change"].includes(e.action)).length;

  return (
    <div>
      <PageHead eyebrow="Console · IA 🔒 · Segurança" title="Auditoria & Logs"
        sub="Quem fez o quê, quando e por quê. Trilha append-only imutável — visão central para compliance." />

      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="lab"><Eye size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Eventos (7 dias)")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : k7d}</div><div className="delta">{t("ações registradas")}</div></div>
        <div className="kpi"><div className="lab"><Lock size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Impersonações")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : kImp}</div><div className="delta">{t("acessos a clientes")}</div></div>
        <div className="kpi"><div className="lab"><KeyRound size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Senhas")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : kSenha}</div><div className="delta">{t("definições · pedidos de troca")}</div></div>
        <div className="kpi"><div className="lab"><Settings size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Mudanças sensíveis")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : kCfg}</div><div className="delta">{t("config · segredo · papel · acesso")}</div></div>
        <div className="kpi g"><div className="lab"><ShieldCheck size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Imutável")}</div><div className="val" style={{ fontSize: 20 }}>{t("append-only")}</div><div className="delta">{t("não editável")}</div></div>
      </div>

      <div className="filt-bar" style={{ marginBottom: 14 }}>
        <div className="filt"><span>{t("De")}</span><input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="filt"><span>{t("Até")}</span><input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="filt"><span>{t("Cliente")}</span>
          <select value={org} onChange={(e) => setOrg(e.target.value)}><option value="">{t("Todos")}</option>{orgs.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </div>
        <div className="filt"><span>{t("Sistema")}</span>
          <select value={sys} onChange={(e) => setSys(e.target.value)}>
            <option value="">{t("Todos")}</option><option value="portal">{t("Portal")}</option><option value="crm">{t("WhatsApp CRM")}</option>
          </select>
        </div>
        <div className="filt"><span>{t("Tipo")}</span>
          <select value={acao} onChange={(e) => setAcao(e.target.value)}>
            <option value="">{t("Tudo")}</option>
            <option value="acesso">{t("Acessos")}</option>
            <option value="senha">{t("Senhas")}</option>
            <option value="permissao">{t("Permissões")}</option>
            <option value="config">{t("Configuração")}</option>
            <option value="chamado">{t("Chamados")}</option>
          </select>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>{t("Quando")}</th><th>{t("Sistema")}</th><th>{t("Ator")}</th><th>{t("Ação")}</th><th>{t("Alvo")}</th><th>{t("Cliente")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ color: "var(--crasto-text-muted)" }}>{t("Carregando…")}</td></tr>
              : events.length === 0 ? <tr><td colSpan={6}><Empty><p><strong>{t("Sem eventos no período.")}</strong> {t("Entradas, senhas, permissões e mudanças de configuração — do Portal e do WhatsApp CRM — aparecem aqui automaticamente.")}</p></Empty></td></tr>
                : events.map((e) => (
                  <tr key={e.id}>
                    <td className="tnum" style={{ whiteSpace: "nowrap" }}>{fmtDT(e.at)}</td>
                    <td><Pill tone={(e.system === "crm" ? "info" : "mute") as any}>{t(SISTEMA[e.system || "portal"])}</Pill></td>
                    <td>{e.actor_email || (e.actor_id ? e.actor_id.slice(0, 8) : t("sistema"))}</td>
                    <td><Pill tone={ACTION_TONE(e.action) as any}>{t(ACTION_LABEL[e.action] || e.action)}</Pill></td>
                    <td className="mt">
                      {[e.target_type, e.target_type === "org" ? orgName(e.target_id) : e.target_id].filter(Boolean).join(" · ") || "—"}
                      {e.context?.email && <div className="mt">{e.context.email}{e.context.primeiro_acesso ? " · primeiro acesso" : ""}</div>}
                      {!e.context?.email && e.context?.primeiro_acesso && <div className="mt">{t("primeiro acesso")}</div>}
                    </td>
                    <td>{orgName(e.organization_id)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        <Lock size={15} />
        <div>{t("Como funciona: uma trilha única para o Portal e o WhatsApp CRM. Entradas e definições de senha são reportadas pela própria tela (acontecem entre o navegador e o Auth — o servidor não as vê), e o ator sai sempre do token verificado, nunca do que a tela diz ser. O resto é gravado pela API. Append-only: nada é editável nem apagável, nem por nós.")}</div>
      </div>
    </div>
  );
}
