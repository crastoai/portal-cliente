import { Plus, Grid3x3 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PageHead, Pill, Empty, useAsync } from "../../ui/ui";

type V = { id: string; name: string; description: string | null; category: string | null; status: string };

export default function CatalogoModulos() {
  const { data, loading } = useAsync(async () => (await supabase.schema("catalog").from("vdi_modules").select("*").order("category")).data as V[], []);
  const rows = data ?? [];
  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Catálogo de módulos" sub="O que existe para oferecer. É daqui que nascem os cards do cliente."
        right={<button className="crasto-btn crasto-btn--primary crasto-btn--sm"><span className="crasto-btn__icon"><Plus size={15} /></span><span className="crasto-btn__label">Novo módulo</span></button>} />
      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <Empty>Nenhum módulo no catálogo.</Empty> : (
        <div className="mods">
          {rows.map((m) => (
            <div className="mod" key={m.id}>
              <div className="cover"><div className="glow" /><Grid3x3 /></div>
              <div className="body">
                <h3>{m.name}</h3>
                <p>{m.description || m.category}</p>
                <div className="foot"><Pill tone={m.status === "published" ? "ok" : "warn"}>{m.status === "published" ? "Publicado" : m.status}</Pill><button className="crasto-btn crasto-btn--ghost crasto-btn--sm"><span className="crasto-btn__label">Editar</span></button></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
