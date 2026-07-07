import { useState } from "react";
import { Check, Search } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Empty, useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { useAuth } from "../../lib/auth";

type V = { id: string; name: string; description: string | null; category: string | null };

export default function Catalogo() {
  const t = useT();
  const { profile } = useAuth();
  const { data, loading } = useAsync(async () => {
    const mods = (await services.catalog.vdiModules.listActive()) as unknown as V[];
    const org = profile?.organization_id ? await services.identity.organizations.getById(profile.organization_id).catch(() => null) : null;
    return { mods: mods ?? [], org: org as any };
  }, [profile?.organization_id]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("");
  const items = data?.mods ?? [];
  const org = data?.org;
  const catOf = (i: V) => i.category || t("Outros");
  const cats = Array.from(new Set(items.map(catOf))).sort((a, b) => a.localeCompare(b, "pt"));

  function toggle(id: string) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  async function solicitar() {
    const escolhidos = items.filter((i) => sel.has(i.id)).map((i) => i.name);
    if (escolhidos.length === 0) return;
    setBusy(true);
    const who = profile?.full_name || profile?.email || t("Cliente");
    const empresa = org?.name || "";
    const description =
      `${t("O cliente solicitou a implementação de:")}\n- ${escolhidos.join("\n- ")}\n\n` +
      `${t("Solicitante")}: ${who}${profile?.email ? ` (${profile.email})` : ""}\n` +
      (empresa ? `${t("Empresa")}: ${empresa}${org?.owner_name ? ` — ${t("responsável")}: ${org.owner_name}` : ""}\n` : "") +
      `\n${t("→ Chamar o cliente no WhatsApp para dar sequência à implantação.")}`;
    try {
      const r = await services.support.tickets.open({
        subject: t("Solicitação de implementação") + (empresa ? ` — ${empresa}` : ""),
        description,
        kind: "implementation_request",
      });
      if (!r.ok) { setToast(t("Não foi possível enviar. Tente de novo.")); }
      else { setSel(new Set()); setToast(t("Solicitação enviada ✓ A Crasto.AI vai avaliar e retornar.")); }
    } catch (e) { setToast(errorMessage(e)); }
    setBusy(false);
    setTimeout(() => setToast(""), 8000);
  }

  const q = query.trim().toLowerCase();
  const filtered = items.filter((i) => (!activeCat || catOf(i) === activeCat) && (!q || `${i.name} ${i.category || ""} ${i.description || ""}`.toLowerCase().includes(q)));
  const shownCats = activeCat ? [activeCat] : cats;

  function Row({ i }: { i: V }) {
    return (
      <div className={"catrow" + (sel.has(i.id) ? " sel" : "")} onClick={() => toggle(i.id)}>
        <span className="cb"><Check size={13} style={{ opacity: sel.has(i.id) ? 1 : 0 }} /></span>
        <div><div className="cn">{i.name}</div><div className="cc">{i.description || catOf(i)}</div></div>
        <span className="pill info" style={{ marginLeft: "auto" }}><span className="d" />{t("30 dias")}</span>
      </div>
    );
  }

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Soluções disponíveis" sub="Escolha o que você quer que a Crasto.AI implemente. Padrão: 30 dias por módulo." />
      <div className="note">
        <span>{t("Selecione os módulos e clique em Solicitar implementação. Precisa de algo sob medida? Pedimos um projeto à parte.")}</span>
      </div>
      {loading ? <Empty>Carregando…</Empty> : (
        <>
          <div className="catsearch">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Buscar solução por nome, categoria ou descrição…")} />
            <span className="mt" style={{ whiteSpace: "nowrap" }}>{t("{n} de {total}", { n: filtered.length, total: items.length })}</span>
          </div>
          <div className="cattabs">
            <button className={"cattab" + (!activeCat ? " is-active" : "")} onClick={() => setActiveCat("")}>{t("Todas")}<span className="cnt">{items.length}</span></button>
            {cats.map((c) => (
              <button key={c} className={"cattab" + (activeCat === c ? " is-active" : "")} onClick={() => setActiveCat(c)}>{c}<span className="cnt">{items.filter((i) => catOf(i) === c).length}</span></button>
            ))}
          </div>

          {filtered.length === 0 ? <Empty>{t("Nenhuma solução encontrada.")}</Empty> : shownCats.map((c) => {
            const rows = filtered.filter((i) => catOf(i) === c);
            if (rows.length === 0) return null;
            return (
              <div key={c}>
                {!activeCat && <div className="catcat">{c}</div>}
                {rows.map((i) => <Row key={i.id} i={i} />)}
              </div>
            );
          })}

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
