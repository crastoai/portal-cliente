// ============================================================================
// PersonaStats — Ideal Client Profile / AVATAR (Tarefa C). Agregado no topo de
// Empresas, filtrável por estágio. Tiles (sexo, estado civil, filhos, aniversários,
// parceiros, ONGs) + PIZZA de nichos + LOCALIDADE (país e região do CNPJ).
// Fonte: RPC public.admin_crm_persona_stats(stage) (migration 053).
// ============================================================================
import { useState } from "react";
import { useAsync } from "../../ui/ui";
import { services as api } from "../../services";
import { useT } from "../../lib/i18n";
import { STAGES as FUNNEL_STAGES, countryOf } from "../../lib/countries";

const STAGES: [string, string][] = [["", "Todos"], ...FUNNEL_STAGES.map((s) => [s.key, s.label] as [string, string])];
const COLORS = ["#2E6F9E", "#1D9E75", "#BA7517", "#8B5CF6", "#E24B4A", "#0EA5A0", "#D9820B", "#6366F1", "#DB2777", "#0891B2", "#65A30D", "#9333EA"];
type KV = { k: string; v: number };

// Donut SVG nativo (sem lib) — cada fatia é um arco via stroke-dasharray.
function Donut({ data }: { data: KV[] }) {
  const total = data.reduce((s, x) => s + x.v, 0) || 1;
  const R = 52, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 140 140" style={{ width: 132, height: 132, flex: "none" }}>
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--crasto-border-soft)" strokeWidth="18" />
      {data.map((x, i) => {
        const frac = x.v / total, dash = frac * C, off = -acc * C; acc += frac;
        return <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="18"
          strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={off} transform="rotate(-90 70 70)" />;
      })}
      <text x="70" y="66" textAnchor="middle" style={{ fontSize: 20, fontWeight: 700, fill: "var(--crasto-text-primary)" }}>{total}</text>
      <text x="70" y="84" textAnchor="middle" style={{ fontSize: 9, fill: "var(--crasto-text-muted)" }}>empresas</text>
    </svg>
  );
}

function Bars({ data, labelOf }: { data: KV[]; labelOf?: (k: string) => string }) {
  const max = Math.max(1, ...data.map((x) => x.v));
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {data.map((x, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "96px 1fr 26px", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ color: "var(--crasto-text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelOf ? labelOf(x.k) : x.k}</span>
          <span style={{ height: 8, borderRadius: 6, background: "var(--crasto-border-soft)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(x.v / max) * 100}%`, background: "var(--crasto-blue)" }} /></span>
          <span className="tnum" style={{ textAlign: "right", color: "var(--crasto-text-muted)" }}>{x.v}</span>
        </div>
      ))}
    </div>
  );
}

export default function PersonaStats() {
  const t = useT();
  const [stage, setStage] = useState("");
  const [open, setOpen] = useState(true);
  const { data, loading } = useAsync(() => api.crm.personaStats(stage), [stage]);
  const s = (data || {}) as Record<string, any>;
  const n = (k: string) => Number(s[k] ?? 0);
  const arr = (k: string): KV[] => (Array.isArray(s[k]) ? s[k] : []);
  const nichos = arr("nichos"), paises = arr("paises"), regioes = arr("regioes");

  const cards: { v: number | string; l: string; acc?: boolean }[] = [
    { v: n("empresas"), l: t("empresas no funil") },
    { v: n("contatos"), l: t("contatos") },
    { v: `${n("homens")} / ${n("mulheres")}`, l: `♂ ${t("homens")} · ♀ ${t("mulheres")}`, acc: true },
    { v: `${n("casados")} / ${n("solteiros")}`, l: `${t("casados")} · ${t("solteiros")}`, acc: true },
    { v: `${n("com_filhos")} / ${n("sem_filhos")}`, l: `${t("têm")} · ${t("não têm filhos")}` },
    { v: `${n("filhos_maior_16")} / ${n("filhos_menor_16")}`, l: `${t("filhos")} ≥16 · <16` },
    { v: n("aniversario_mes"), l: t("aniversário este mês 🎂") },
    { v: n("parceiros"), l: t("parceiros"), acc: true },
    { v: n("ongs"), l: t("ONGs"), acc: true },
  ];

  return (
    <div style={{ background: "var(--crasto-surface)", border: "1px solid var(--crasto-border)", borderRadius: "var(--crasto-radius-md, 14px)", padding: "14px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: open ? 12 : 0 }}>
        <button type="button" onClick={() => setOpen((o) => !o)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5, color: "var(--crasto-text-primary)", display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
          🧭 {t("Perfil de Cliente Ideal (Avatar)")} <span style={{ transform: open ? "rotate(90deg)" : "none", transition: ".2s", fontSize: 11 }}>▸</span>
        </button>
        <span className="mt" style={{ fontSize: 11.5 }}>{t("agregado · filtra por estágio")}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {STAGES.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setStage(v)} className={"stagetab" + (stage === v ? " on" : "")} style={{ fontSize: 12, padding: "5px 12px" }}>{t(l)}</button>
          ))}
        </div>
      </div>
      {open && (
        <div style={{ opacity: loading ? 0.5 : 1, transition: ".2s" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            {cards.map((c, i) => (
              <div key={i} style={{ background: "var(--crasto-bg-2)", border: "1px solid var(--crasto-border-soft)", borderRadius: 9, padding: "11px 12px" }}>
                <div className="tnum" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1, color: c.acc ? "var(--crasto-blue)" : "var(--crasto-text-primary)" }}>{c.v}</div>
                <div className="mt" style={{ fontSize: 11, marginTop: 3 }}>{c.l}</div>
              </div>
            ))}
          </div>

          {/* Nichos (pizza) + Localidade */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 12 }}>
            <div style={{ background: "var(--crasto-bg-2)", border: "1px solid var(--crasto-border-soft)", borderRadius: 9, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--crasto-text-primary)", marginBottom: 10 }}>{t("Nichos (segmento)")}</div>
              {nichos.length === 0 ? <div className="mt" style={{ fontSize: 12 }}>{t("Sem dados.")}</div> : (
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <Donut data={nichos} />
                  <div style={{ display: "grid", gap: 5, flex: 1, minWidth: 150 }}>
                    {nichos.map((x, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flex: "none" }} />
                        <span style={{ color: "var(--crasto-text-body)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.k}</span>
                        <span className="tnum" style={{ color: "var(--crasto-text-muted)" }}>{x.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ background: "var(--crasto-bg-2)", border: "1px solid var(--crasto-border-soft)", borderRadius: 9, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--crasto-text-primary)", marginBottom: 10 }}>{t("Localidade")}</div>
              <div style={{ fontSize: 11, color: "var(--crasto-text-muted)", marginBottom: 6 }}>{t("Por país")}</div>
              <Bars data={paises} labelOf={(k) => `${countryOf(k).flag} ${countryOf(k).name}`} />
              <div style={{ fontSize: 11, color: "var(--crasto-text-muted)", margin: "12px 0 6px" }}>{t("Por região (CNPJ)")}</div>
              <Bars data={regioes} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
