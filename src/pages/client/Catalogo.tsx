import { useState } from "react";
import { Search, ArrowRight, Clock, Sparkles, Check, MessageSquare, DollarSign, Scale, Megaphone, Cpu, Users, TrendingUp, Grid3x3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Empty, useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { useAuth } from "../../lib/auth";
import Modal from "../../ui/Modal";

// Catálogo de soluções (visão do cliente): o que ele pode CONTRATAR — não o que já tem.
// Cartões → tela de detalhe com a descrição → botão "Solicitar implementação".
// A descrição vem do catálogo (importada e REBRANDIZADA para Crasto.AI; nada de Viver de IA).
type V = { id: string; name: string; description: string | null; category: string | null; client_deadline_days?: number | null; setup_workdays?: number | null; customization?: string | null };

const customLabel = (c?: string | null) => (c === "standard" ? "Pronta para usar" : c === "light" ? "Ajuste leve" : c === "heavy" ? "Sob medida" : "");

// Capa ilustrativa por categoria: ícone + cor de destaque (o brilho da capa). Dá identidade
// visual a cada cartão sem precisar de 153 imagens — e a base navy mantém a marca.
const CAT: Record<string, { icon: LucideIcon; glow: string }> = {
  "Atendimento e CS": { icon: MessageSquare, glow: "rgba(110,156,232,.5)" },
  "Financeiro":       { icon: DollarSign,   glow: "rgba(52,211,153,.46)" },
  "Jurídico":         { icon: Scale,        glow: "rgba(196,181,253,.46)" },
  "Marketing":        { icon: Megaphone,    glow: "rgba(251,146,120,.46)" },
  "Modelos de IA":    { icon: Cpu,          glow: "rgba(94,234,212,.46)" },
  "RH":               { icon: Users,        glow: "rgba(250,204,120,.46)" },
  "Vendas":           { icon: TrendingUp,   glow: "rgba(129,178,255,.55)" },
  "Outros":           { icon: Grid3x3,      glow: "rgba(148,163,184,.42)" },
};
const capaDe = (cat: string) => CAT[cat] || CAT["Outros"];

export default function Catalogo() {
  const t = useT();
  const { profile } = useAuth();
  const { data, loading } = useAsync(async () => {
    const mods = (await services.catalog.vdiModules.listActive("id,name,description,category,client_deadline_days,setup_workdays,customization")) as unknown as V[];
    const org = profile?.organization_id ? await services.identity.organizations.getById(profile.organization_id).catch(() => null) : null;
    return { mods: mods ?? [], org: org as any };
  }, [profile?.organization_id]);
  const [detail, setDetail] = useState<V | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("");
  const items = data?.mods ?? [];
  const org = data?.org;
  const catOf = (i: V) => i.category || t("Outros");
  const cats = Array.from(new Set(items.map(catOf))).sort((a, b) => a.localeCompare(b, "pt"));
  const prazo = (i: V) => i.client_deadline_days || 30;

  async function solicitar(i: V) {
    setBusy(true);
    const who = profile?.full_name || profile?.email || t("Cliente");
    const empresa = org?.name || "";
    const description =
      `${t("O cliente solicitou a implementação de:")}\n- ${i.name}\n\n` +
      `${t("Solicitante")}: ${who}${profile?.email ? ` (${profile.email})` : ""}\n` +
      (empresa ? `${t("Empresa")}: ${empresa}${org?.owner_name ? ` — ${t("responsável")}: ${org.owner_name}` : ""}\n` : "") +
      `\n${t("→ Chamar o cliente no WhatsApp para dar sequência à implantação.")}`;
    try {
      const r = await services.support.tickets.open({
        subject: t("Solicitação de implementação") + `: ${i.name}` + (empresa ? ` — ${empresa}` : ""),
        description,
        kind: "implementation_request",
      });
      if (!r.ok) { setToast(t("Não foi possível enviar. Tente de novo.")); }
      else { setDetail(null); setToast(t("Solicitação enviada ✓ A Crasto.AI vai avaliar e retornar.")); }
    } catch (e) { setToast(errorMessage(e)); }
    setBusy(false);
    setTimeout(() => setToast(""), 8000);
  }

  const q = query.trim().toLowerCase();
  const filtered = items.filter((i) => (!activeCat || catOf(i) === activeCat) && (!q || `${i.name} ${i.category || ""} ${i.description || ""}`.toLowerCase().includes(q)));
  const shownCats = activeCat ? [activeCat] : cats;

  function Card({ i }: { i: V }) {
    const capa = capaDe(catOf(i));
    const Ico = capa.icon;
    // posição do brilho varia por solução (determinística pelo nome) → cada capa fica única
    const seed = [...i.name].reduce((a, c) => a + c.charCodeAt(0), 0);
    const gx = (seed % 66) + 8 + "%";
    return (
      <button className="solcard" onClick={() => setDetail(i)}>
        <div className="solcard-cover" style={{ ["--glow" as any]: capa.glow, ["--gx" as any]: gx }}>
          <span className="solcard-glow" />
          <Ico size={30} />
        </div>
        <div className="solcard-body">
          <span className="solcard-cat">{catOf(i)}</span>
          <span className="solcard-title">{i.name}</span>
          <span className="solcard-foot">
            <span className="pill info"><span className="d" />{t("{n} dias", { n: prazo(i) })}</span>
            <span className="solcard-open">{t("Ver detalhes")} <ArrowRight size={13} /></span>
          </span>
        </div>
      </button>
    );
  }

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Catálogo de soluções" sub="Explore o que a Crasto.AI pode implementar para você. Abra uma solução para ver os detalhes e solicitar a implementação." />
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
              <div key={c} style={{ marginBottom: 8 }}>
                {!activeCat && <div className="catcat">{c}</div>}
                <div className="solgrid">{rows.map((i) => <Card key={i.id} i={i} />)}</div>
              </div>
            );
          })}
        </>
      )}

      {/* Tela de detalhe da solução: descrição + solicitar implementação */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name || ""}
        footer={detail && <>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setDetail(null)}><span className="crasto-btn__label">{t("Fechar")}</span></button>
          <button className="crasto-btn crasto-btn--primary crasto-btn--md" disabled={busy} onClick={() => solicitar(detail)}><span className="crasto-btn__icon"><Sparkles size={15} /></span><span className="crasto-btn__label">{busy ? t("Enviando…") : t("Solicitar implementação")}</span></button>
        </>}>
        {detail && (
          <div className="soldetail">
            <div className="soldetail-meta">
              <span className="pill info"><span className="d" />{detail.category || t("Outros")}</span>
              <span className="soldetail-chip"><Clock size={13} /> {t("{n} dias", { n: prazo(detail) })}</span>
              {customLabel(detail.customization) && <span className="soldetail-chip"><Check size={13} /> {t(customLabel(detail.customization))}</span>}
            </div>
            {detail.description
              ? <div className="soldetail-desc">{detail.description}</div>
              : <div className="soldetail-desc muted">{t("Descrição detalhada em breve. Você já pode solicitar a implementação — a Crasto.AI retorna com todos os detalhes.")}</div>}
          </div>
        )}
      </Modal>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
