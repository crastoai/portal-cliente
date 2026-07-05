import { supabase } from "../../lib/supabase";
import { PageHead, Pill, Empty, useAsync, initials } from "../../ui/ui";

type Row = { id: string; name: string; progress: number | null; status: string | null; health: string | null; mods: number };

export default function Entregas() {
  const { data, loading } = useAsync(async () => {
    const [o, i, h, cm] = await Promise.all([
      supabase.from("organizations").select("id,name"),
      supabase.schema("delivery").from("implementations").select("organization_id,overall_progress,status"),
      supabase.schema("delivery").from("system_health").select("organization_id,status"),
      supabase.schema("delivery").from("client_modules").select("organization_id"),
    ]);
    const im = Object.fromEntries(((i.data as any[]) ?? []).map((r) => [r.organization_id, r]));
    const hm = Object.fromEntries(((h.data as any[]) ?? []).map((r) => [r.organization_id, r.status]));
    const counts: Record<string, number> = {};
    ((cm.data as any[]) ?? []).forEach((r) => (counts[r.organization_id] = (counts[r.organization_id] || 0) + 1));
    return ((o.data as any[]) ?? []).map((r) => ({ id: r.id, name: r.name, progress: im[r.id]?.overall_progress ?? null, status: im[r.id]?.status ?? null, health: hm[r.id] ?? null, mods: counts[r.id] || 0 }));
  }, []);
  const rows = data ?? [];
  const delivered = rows.filter((r) => r.status === "delivered").length;

  return (
    <div>
      <PageHead eyebrow="Viver de IA · Compliance" title="Entregas dos seus indicados" sub="Acompanhe o andamento e o prazo de cada cliente que você indicou à Crasto.AI." />
      <div className="kpis">
        <div className="kpi navy"><div className="lab">Clientes indicados</div><div className="val tnum">{rows.length}</div><div className="delta">no portal</div></div>
        <div className="kpi g"><div className="lab">Entregues</div><div className="val tnum">{delivered}</div><div className="delta">100% no contrato</div></div>
        <div className="kpi"><div className="lab">Em andamento</div><div className="val tnum">{rows.length - delivered}</div><div className="delta">implantação</div></div>
        <div className="kpi"><div className="lab">Módulos entregues</div><div className="val tnum">{rows.reduce((s, r) => s + r.mods, 0)}</div><div className="delta">total</div></div>
      </div>
      <div className="sec-h"><h2>Andamento por cliente</h2><Pill tone="mute">Somente leitura</Pill></div>
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty>Você ainda não indicou clientes.</Empty> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Cliente indicado</th><th>Módulos</th><th>Progresso</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><div className="cust"><div className="logo">{initials(r.name)}</div><div className="nm">{r.name}</div></div></td>
                  <td className="tnum">{r.mods} módulos</td>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div className="barmini"><span style={{ width: `${r.progress ?? 0}%`, background: (r.progress ?? 0) >= 100 ? "#1F8A5B" : "#3E6FB8" }} /></div><span className="tnum" style={{ fontSize: 12, fontWeight: 600 }}>{r.progress ?? 0}%</span></div></td>
                  <td><Pill tone={r.status === "delivered" ? "ok" : "info"}>{r.status === "delivered" ? "Concluído" : "Em andamento"}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
