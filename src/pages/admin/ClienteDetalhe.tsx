import { useState } from "react";
import { useParams } from "react-router-dom";
import { MessageCircle, Search, Send, Grid3x3 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PageHead, Pill, Empty, useAsync, initials, money } from "../../ui/ui";
import { fetchClients, healthScore, timeAgo } from "../../lib/adminData";

type Vm = { id: string; name: string; category: string | null };

function icon(cat?: string | null) {
  const c = (cat || "").toLowerCase();
  if (c.includes("atend")) return <MessageCircle size={16} />;
  if (c.includes("market")) return <Send size={16} />;
  if (c.includes("vend")) return <Search size={16} />;
  return <Grid3x3 size={16} />;
}

export default function ClienteDetalhe() {
  const { id } = useParams();
  const { data, loading } = useAsync(async () => {
    const clients = await fetchClients();
    const c = clients.find((x) => x.id === id) ?? clients[0] ?? null;
    if (!c) return null;
    const [mods, cm, users] = await Promise.all([
      supabase.schema("catalog").from("vdi_modules").select("id,name,category").eq("active", true),
      supabase.schema("delivery").from("client_modules").select("vdi_module_id,status").eq("organization_id", c.id),
      supabase.from("profiles").select("id,full_name,email,role").eq("organization_id", c.id),
    ]);
    const active = new Set(((cm.data as any[]) ?? []).map((r) => r.vdi_module_id));
    return { c, mods: (mods.data as Vm[]) ?? [], active, users: ((users.data as any[]) ?? []) };
  }, [id]);

  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  if (loading) return <><PageHead eyebrow="Painel Admin" title="Detalhe do cliente" /><Empty>Carregando…</Empty></>;
  if (!data) return <><PageHead eyebrow="Painel Admin" title="Detalhe do cliente" /><Empty>Nenhum cliente.</Empty></>;

  const { c, mods, active, users } = data;
  const h = healthScore(c);
  const isOn = (mid: string) => (mid in toggles ? toggles[mid] : active.has(mid));
  const roleLabel = (r: string) => (r === "client_owner" ? "Dono" : r === "client_member" ? "Membro" : r);

  return (
    <div>
      <PageHead eyebrow="Detalhe do cliente" title={c.name} sub={`${c.plan || "—"} · cliente do portal`}
        right={<button className="crasto-btn crasto-btn--secondary crasto-btn--sm"><span className="crasto-btn__label">Ver como cliente ↗</span></button>} />

      <div className="kpis" style={{ marginBottom: 22 }}>
        <div className="kpi g"><div className="lab">Health score</div><div className="val tnum">{h.score}</div><div className="delta">{h.label}</div></div>
        <div className="kpi"><div className="lab">Último acesso</div><div className="val" style={{ fontSize: 20 }}>{timeAgo(c.last_access)}</div><div className="delta">—</div></div>
        <div className="kpi"><div className="lab">Implantação</div><div className="val tnum">{c.progress}<small>%</small></div><div className="delta">progresso</div></div>
        <div className="kpi"><div className="lab">MRR</div><div className="val tnum">{money(c.mrr)}</div><div className="delta">recorrente</div></div>
      </div>

      <div className="sec-h"><h2>Módulos deste cliente</h2><Pill tone="mute">Ative/desative para liberar no portal</Pill></div>
      <div className="assign">
        {mods.map((m) => (
          <div className="arow" key={m.id}>
            <span className="ico" style={{ background: isOn(m.id) ? "var(--crasto-navy)" : "var(--crasto-text-faint)" }}>{icon(m.category)}</span>
            <span><span className="t">{m.name}</span><br /><span className="s">{isOn(m.id) ? "Liberado no portal" : "Não contratado"}</span></span>
            <button className={"sw" + (isOn(m.id) ? " on" : "")} onClick={() => setToggles({ ...toggles, [m.id]: !isOn(m.id) })} />
          </div>
        ))}
      </div>

      <div className="sec-h" style={{ marginTop: 30 }}><h2>Usuários deste cliente</h2></div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Usuário</th><th>Papel</th><th>E-mail</th></tr></thead>
          <tbody>
            {users.length === 0 ? <tr><td colSpan={3} style={{ color: "var(--crasto-text-muted)" }}>Sem usuários.</td></tr> :
              users.map((u) => (
                <tr key={u.id}>
                  <td><div className="cust"><div className="logo" style={{ background: "var(--crasto-bg-3)", color: "var(--crasto-navy)" }}>{initials(u.full_name || u.email)}</div><div className="nm">{u.full_name || "—"}</div></div></td>
                  <td><Pill tone={u.role === "client_owner" ? "ok" : "mute"}>{roleLabel(u.role)}</Pill></td>
                  <td className="cust"><span className="em">{u.email}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
