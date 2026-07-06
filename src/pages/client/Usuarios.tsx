import { UserPlus } from "lucide-react";
import { services } from "../../services";
import { useAuth } from "../../lib/auth";
import { PageHead, Pill, Empty, useAsync, initials } from "../../ui/ui";

type U = { id: string; full_name: string | null; email: string | null; role: string };

export default function Usuarios() {
  const { profile } = useAuth();
  const { data, loading } = useAsync(
    async () => (await services.identity.profiles.listByOrg(profile?.organization_id ?? "")) as unknown as U[],
    [profile?.organization_id]
  );
  const users = data ?? [];
  const roleLabel = (r: string) => (r === "client_owner" ? "Dono" : r === "client_member" ? "Membro" : r);
  const roleTone = (r: string) => (r === "client_owner" ? "ok" : "mute");

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Usuários & Equipe" sub="Convide sua equipe e defina quem acessa o quê."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm"><span className="crasto-btn__icon"><UserPlus size={15} /></span><span className="crasto-btn__label">Convidar usuário</span></button>} />
      <div className="note"><span>Sua conta suporta <b>vários usuários</b>. Você define o papel de cada um; a Crasto.AI libera as funcionalidades do seu plano.</span></div>
      {loading ? <Empty>Carregando…</Empty> : users.length === 0 ? <Empty>Nenhum usuário.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Usuário</th><th>Papel</th><th>E-mail</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><div className="cust"><div className="logo" style={{ background: "var(--crasto-bg-3)", color: "var(--crasto-text-primary)" }}>{initials(u.full_name || u.email)}</div><div className="nm">{u.full_name || "—"}</div></div></td>
                  <td><Pill tone={roleTone(u.role)}>{roleLabel(u.role)}</Pill></td>
                  <td className="cust"><span className="em">{u.email}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
