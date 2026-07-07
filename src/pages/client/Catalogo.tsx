import { useState } from "react";
import { Check } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Empty, useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";

type V = { id: string; name: string; description: string | null; category: string | null };

export default function Catalogo() {
  const t = useT();
  const { data, loading } = useAsync(
    async () => (await services.catalog.vdiModules.listActive()) as unknown as V[],
    []
  );
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const items = data ?? [];
  const cats = Array.from(new Set(items.map((i) => i.category || "Outros")));

  function toggle(id: string) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  async function solicitar() {
    const nomes = items.filter((i) => sel.has(i.id)).map((i) => i.name);
    if (nomes.length === 0) return;
    setBusy(true);
    try {
      const r = await services.support.tickets.open({
        subject: t("Solicitação de implementação"),
        description: t("O cliente solicitou a implementação de: {lista}", { lista: nomes.join(", ") }),
      });
      if (!r.ok) { setToast(t("Não foi possível enviar. Tente de novo.")); }
      else { setSel(new Set()); setToast(t("Solicitação enviada ✓ A Crasto.AI vai avaliar e retornar.")); }
    } catch (e) { setToast(errorMessage(e)); }
    setBusy(false);
    setTimeout(() => setToast(""), 8000);
  }

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Soluções disponíveis" sub="Escolha o que você quer que a Crasto.AI implemente. Padrão: 30 dias por módulo." />
      <div className="note">
        <span>{t("Selecione os módulos e clique em Solicitar implementação. Precisa de algo sob medida? Pedimos um projeto à parte.")}</span>
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
                  <span className="pill info" style={{ marginLeft: "auto" }}><span className="d" />{t("30 dias")}</span>
                </div>
              ))}
            </div>
          ))}
          <div style={{ position: "sticky", bottom: 0, display: "flex", justifyContent: "flex-end", gap: 12, alignItems: "center", padding: "16px 0", marginTop: 10 }}>
            <span style={{ fontSize: 13, color: "var(--crasto-text-muted)", fontWeight: 600 }}>{sel.size === 1 ? t("{n} selecionado", { n: sel.size }) : t("{n} selecionados", { n: sel.size })}</span>
            <button className="crasto-btn crasto-btn--primary crasto-btn--md" disabled={sel.size === 0 || busy} onClick={solicitar}><span className="crasto-btn__label">{busy ? t("Enviando…") : t("Solicitar implementação")}</span></button>
          </div>
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
