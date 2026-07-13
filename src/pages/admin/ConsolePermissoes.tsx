import { useState } from "react";
import { Shield, Users, Building2, Lock } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, initials } from "../../ui/ui";
import { useT } from "../../lib/i18n";

// Permissões & Acessos (Fase C.1) — por cliente: os usuários cadastrados + o acesso de cada um.
type U = { id: string; full_name: string | null; email: string | null; role: string; last_login: string | null };
type Client = { organization_id: string; name: string; users: U[] };

// papéis por-cliente que definem o que o usuário vê (acesso)
const CLIENT_ROLES = [
  { v: "client_owner", l: "Dono — acesso total" },
  { v: "client_member", l: "Equipe — acesso padrão" },
];
const roleLabel = (r: string) => (r === "client_owner" ? "Dono" : r === "client_member" ? "Equipe" : r === "crasto_admin" ? "Super-admin" : r === "connector" ? "Indicador" : r);
const roleTone = (r: string) => (r === "client_owner" ? "ok" : r === "crasto_admin" ? "info" : "mute");
const lastLogin = (s: string | null, t: (k: string, p?: any) => string) => {
  if (!s) return t("nunca acessou");
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  return d <= 0 ? t("hoje") : t("há {n} dia(s)", { n: d });
};

export default function ConsolePermissoes() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => (await services.analytics.admin.accessList()) as any, []);
  const platform: U[] = data?.platform ?? [];
  const clients: Client[] = data?.clients ?? [];
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 5000); };

  const totalUsers = platform.length + clients.reduce((s, c) => s + c.users.length, 0);
  const withAccess = clients.filter((c) => c.users.length > 0).length;

  async function changeRole(u: U, role: string) {
    if (role === u.role) return;
    if (!confirm(t("Alterar o acesso de {n} para \"{r}\"?", { n: u.full_name || u.email || "", r: t(roleLabel(role)) }))) return;
    setBusy(u.id);
    try { await services.analytics.admin.setUserRole(u.id, role); await reload(); flash(t("Acesso atualizado ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(""); }
  }

  return (
    <div>
      <PageHead eyebrow="Console · IA 🔒 · Segurança" title="Permissões & Acessos"
        sub="Por cliente: os usuários cadastrados e o que cada um vê no seu acesso. Isolado por RLS — cada cliente só enxerga a própria empresa." />

      <div className="kpis" style={{ marginBottom: 18 }}>
        <div className="kpi"><div className="lab"><Users size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Usuários")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : totalUsers}</div><div className="delta">{t("plataforma + clientes")}</div></div>
        <div className="kpi"><div className="lab"><Shield size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Admins de plataforma")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : platform.length}</div><div className="delta">{t("equipe Crasto.AI")}</div></div>
        <div className="kpi g"><div className="lab"><Building2 size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Clientes com acesso")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : withAccess}<small> / {clients.length}</small></div><div className="delta">{t("com usuário ativo")}</div></div>
        <div className="kpi"><div className="lab"><Lock size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Isolamento")}</div><div className="val" style={{ fontSize: 18, color: "#1F8A5B" }}>RLS</div><div className="delta">{t("por organização")}</div></div>
      </div>

      {/* Papéis de plataforma (Crasto.AI) — leitura */}
      <div className="sec-h"><h2>{t("Plataforma (Crasto.AI)")}</h2><Pill tone="info">{t("concedido manualmente")}</Pill></div>
      {loading ? <Empty>{t("Carregando…")}</Empty> : platform.length === 0 ? <Empty>{t("Nenhum admin de plataforma.")}</Empty> : platform.map((u) => (
        <div className="crmrow" key={u.id}>
          <div className="logo" style={{ width: 34, height: 34, fontSize: 12 }}>{initials(u.full_name || u.email || "?")}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{u.full_name || "—"}</div><div className="mt">{u.email}</div></div>
          <div className="mt">{lastLogin(u.last_login, t)}</div>
          <Pill tone={roleTone(u.role) as any}>{t(roleLabel(u.role))}</Pill>
        </div>
      ))}

      {/* Por cliente */}
      <div className="sec-h" style={{ marginTop: 22 }}><h2>{t("Acessos por cliente")}</h2></div>
      {loading ? <Empty>{t("Carregando…")}</Empty> : clients.map((c) => (
        <div className="card" style={{ marginBottom: 12 }} key={c.organization_id}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: c.users.length ? 8 : 0 }}>
            <div className="logo" style={{ width: 30, height: 30, fontSize: 11 }}>{initials(c.name)}</div>
            <h3 style={{ margin: 0 }}>{c.name}</h3>
            <Pill tone="mute">{t("{n} usuário(s)", { n: c.users.length })}</Pill>
          </div>
          {c.users.length === 0 ? <div className="mt">{t("Nenhum usuário cadastrado neste cliente ainda.")}</div> : c.users.map((u) => (
            <div className="crmrow" key={u.id}>
              <div className="logo" style={{ width: 32, height: 32, fontSize: 12 }}>{initials(u.full_name || u.email || "?")}</div>
              <div style={{ flex: 1, minWidth: 0 }}><div className="nm">{u.full_name || "—"}</div><div className="mt">{u.email} · {lastLogin(u.last_login, t)}</div></div>
              <select value={u.role} disabled={busy === u.id} onChange={(e) => changeRole(u, e.target.value)} style={{ maxWidth: 210 }}>
                {CLIENT_ROLES.map((r) => <option key={r.v} value={r.v}>{t(r.l)}</option>)}
                {!CLIENT_ROLES.some((r) => r.v === u.role) && <option value={u.role}>{t(roleLabel(u.role))}</option>}
              </select>
            </div>
          ))}
        </div>
      ))}

      <div className="note" style={{ marginTop: 8 }}>
        <Lock size={15} />
        <div>{t("O admin de um cliente só enxerga e altera a própria empresa — a mesma RLS por organização que protege os dados protege as permissões. Toda mudança de acesso é registrada em Auditoria & Logs.")}</div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
