// ============================================================================
// PersonaStats — indicadores de PERSONA agregados no topo de Empresas, filtráveis
// por estágio do funil. Alimenta avatar/campanhas (decisão Crasto 2026-07-27):
// homens/mulheres, casados, filhos por idade/sexo, aniversariantes, parceiros.
// Fonte: RPC public.admin_crm_persona_stats(stage) via /api/crm/persona-stats.
// ============================================================================
import { useState } from "react";
import { useAsync } from "../../ui/ui";
import { services as api } from "../../services";
import { useT } from "../../lib/i18n";

const STAGES: [string, string][] = [["", "Todos"], ["prospecto", "Prospecto"], ["lead", "Lead"], ["oportunidade", "Oportunidade"], ["cliente", "Cliente"]];

export default function PersonaStats() {
  const t = useT();
  const [stage, setStage] = useState("");
  const [open, setOpen] = useState(true);
  const { data, loading } = useAsync(() => api.crm.personaStats(stage), [stage]);
  const s = (data || {}) as Record<string, number>;
  const n = (k: string) => Number(s[k] ?? 0);

  const cards: { v: number; l: string; acc?: boolean }[] = [
    { v: n("empresas"), l: t("empresas no funil") },
    { v: n("contatos"), l: t("contatos") },
    { v: n("homens"), l: `♂ ${t("homens")} · ♀ ${n("mulheres")}`, acc: true },
    { v: n("casados"), l: t("casados"), acc: true },
    { v: n("com_filhos"), l: t("têm filhos") },
    { v: n("filhos_maior_5"), l: t("filhos > 5 anos") },
    { v: n("filhos_maior_10"), l: `${t("filhos > 10")} · ♂ ${n("filhos_10_h")} / ♀ ${n("filhos_10_m")}` },
    { v: n("aniversario_mes"), l: t("aniversário este mês 🎂") },
    { v: n("parceiros"), l: t("parceiros"), acc: true },
  ];

  return (
    <div style={{ background: "var(--crasto-surface)", border: "1px solid var(--crasto-border)", borderRadius: "var(--crasto-radius-md, 14px)", padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: open ? 12 : 0 }}>
        <button type="button" onClick={() => setOpen((o) => !o)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5, color: "var(--crasto-text-primary)", display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
          📊 {t("Indicadores do CRM")} <span style={{ transform: open ? "rotate(90deg)" : "none", transition: ".2s", fontSize: 11 }}>▸</span>
        </button>
        <span className="mt" style={{ fontSize: 11.5 }}>{t("soma de todas as empresas · filtra por estágio")}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STAGES.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setStage(v)}
              className={"stagetab" + (stage === v ? " on" : "")} style={{ fontSize: 12, padding: "5px 12px" }}>{t(l)}</button>
          ))}
        </div>
      </div>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, opacity: loading ? 0.5 : 1, transition: ".2s" }}>
          {cards.map((c, i) => (
            <div key={i} style={{ background: "var(--crasto-bg-2)", border: "1px solid var(--crasto-border-soft)", borderRadius: 9, padding: "11px 12px" }}>
              <div className="tnum" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: c.acc ? "var(--crasto-blue)" : "var(--crasto-text-primary)" }}>{c.v}</div>
              <div className="mt" style={{ fontSize: 11, marginTop: 3 }}>{c.l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
