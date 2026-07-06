import { useState } from "react";
import { Check } from "lucide-react";
import { services } from "../../services";
import { PageHead, Empty, useAsync } from "../../ui/ui";

type V = { id: string; name: string; description: string | null; category: string | null };

export default function Catalogo() {
  const { data, loading } = useAsync(
    async () => (await services.catalog.vdiModules.listActive()) as unknown as V[],
    []
  );
  const [sel, setSel] = useState<Set<string>>(new Set());
  const items = data ?? [];
  const cats = Array.from(new Set(items.map((i) => i.category || "Outros")));

  function toggle(id: string) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Soluções disponíveis" sub="Escolha o que você quer que a Crasto.AI implemente. Padrão: 30 dias por módulo." />
      <div className="note">
        <span>Selecione os módulos e clique em <b>Solicitar implementação</b>. Precisa de algo sob medida? Pedimos um projeto à parte.</span>
      </div>
      {loading ? <Empty>Carregando…</Empty> : (
        <>
          {cats.map((c) => (
            <div key={c}>
              <div className="catcat">{c}</div>
              {items.filter((i) => (i.category || "Outros") === c).map((i) => (
                <div key={i.id} className={"catrow" + (sel.has(i.id) ? " sel" : "")} onClick={() => toggle(i.id)}>
                  <span className="cb"><Check size={13} style={{ opacity: sel.has(i.id) ? 1 : 0 }} /></span>
                  <div><div className="cn">{i.name}</div><div className="cc">{i.description || c}</div></div>
                  <span className="pill info" style={{ marginLeft: "auto" }}><span className="d" />30 dias</span>
                </div>
              ))}
            </div>
          ))}
          <div style={{ position: "sticky", bottom: 0, display: "flex", justifyContent: "flex-end", gap: 12, alignItems: "center", padding: "16px 0", marginTop: 10 }}>
            <span style={{ fontSize: 13, color: "var(--crasto-text-muted)", fontWeight: 600 }}>{sel.size} selecionado{sel.size === 1 ? "" : "s"}</span>
            <button className="crasto-btn crasto-btn--primary crasto-btn--md" disabled={sel.size === 0}><span className="crasto-btn__label">Solicitar implementação</span></button>
          </div>
        </>
      )}
    </div>
  );
}
