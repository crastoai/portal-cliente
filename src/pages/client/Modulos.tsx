import { MessageCircle, Search, Send, Grid3x3 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PageHead, Pill, Empty, useAsync } from "../../ui/ui";

type Mod = { id: string; status: string; vdi: { name: string; description: string | null; category: string | null } | null };

async function fetchModules(): Promise<Mod[]> {
  const cm = await supabase.schema("delivery").from("client_modules").select("id,status,vdi_module_id");
  const rows = (cm.data as { id: string; status: string; vdi_module_id: string }[]) ?? [];
  const ids = rows.map((r) => r.vdi_module_id);
  if (!ids.length) return [];
  const vm = await supabase.schema("catalog").from("vdi_modules").select("id,name,description,category").in("id", ids);
  const map = Object.fromEntries(((vm.data as { id: string }[]) ?? []).map((v) => [v.id, v]));
  return rows.map((r) => ({ id: r.id, status: r.status, vdi: (map[r.vdi_module_id] as Mod["vdi"]) ?? null }));
}

function icon(cat?: string | null) {
  const c = (cat || "").toLowerCase();
  if (c.includes("atend")) return <MessageCircle />;
  if (c.includes("market")) return <Send />;
  if (c.includes("vend")) return <Search />;
  return <Grid3x3 />;
}

export default function Modulos() {
  const { data, loading } = useAsync(fetchModules, []);
  const mods = data ?? [];
  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Meus módulos" sub="Clique em Acessar para entrar em cada solução." />
      {loading ? <Empty>Carregando…</Empty> : mods.length === 0 ? (
        <Empty><p><strong>Nenhum módulo ativo ainda.</strong></p></Empty>
      ) : (
        <div className="mods">
          {mods.map((m) => {
            const st = m.status === "active" ? "ok" : m.status === "implementing" ? "warn" : "info";
            const stl = m.status === "active" ? "Ativo" : m.status === "implementing" ? "Em implementação" : m.status;
            return (
              <div className="mod" key={m.id}>
                <div className="cover"><div className="glow" />{icon(m.vdi?.category)}</div>
                <div className="body">
                  <h3>{m.vdi?.name}</h3>
                  <p>{m.vdi?.description || "Solução de IA da Crasto.AI."}</p>
                  <div className="foot">
                    <Pill tone={st}>{stl}</Pill>
                    <button className="crasto-btn crasto-btn--primary crasto-btn--sm"><span className="crasto-btn__label">Acessar</span></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
