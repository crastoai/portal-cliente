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

// Pizza SVG nativa (sem lib) — fatias preenchidas + percentual DENTRO da fatia.
function Pie({ data }: { data: KV[] }) {
  const total = data.reduce((s, x) => s + x.v, 0) || 1;
  const R = 92, cx = 100, cy = 100;
  let acc = -Math.PI / 2; // começa no topo
  const wedges = data.map((x, i) => {
    const frac = x.v / total, a0 = acc, a1 = acc + frac * 2 * Math.PI; acc = a1;
    const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const am = (a0 + a1) / 2, lr = 0.6 * R;
    return { d: `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`, color: COLORS[i % COLORS.length], lx: cx + lr * Math.cos(am), ly: cy + lr * Math.sin(am), pct: Math.round(frac * 100), show: frac >= 0.045 };
  });
  return (
    <svg viewBox="0 0 200 200" style={{ width: 180, height: 180, flex: "none" }}>
      {wedges.map((w, i) => <path key={i} d={w.d} fill={w.color} stroke="var(--crasto-surface)" strokeWidth="1.5" />)}
      {wedges.map((w, i) => (w.show ? <text key={"t" + i} x={w.lx.toFixed(1)} y={w.ly.toFixed(1)} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fontWeight: 700, fill: "#fff" }}>{w.pct}%</text> : null))}
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

// Centróides dos 27 UFs no viewBox 1000×1000 (posição relativa geográfica).
const UF_XY: Record<string, [number, number]> = { RR: [334, 130], AP: [547, 143], AM: [262, 271], PA: [534, 266], AC: [129, 380], RO: [298, 424], TO: [628, 408], MA: [696, 292], PI: [748, 346], CE: [824, 292], RN: [892, 307], PB: [889, 337], PE: [862, 367], AL: [892, 394], SE: [874, 417], BA: [777, 460], MT: [457, 471], MS: [489, 642], GO: [599, 540], DF: [640, 535], MG: [714, 597], ES: [799, 622], RJ: [757, 683], SP: [622, 681], PR: [554, 736], SC: [579, 797], RS: [518, 854] };
const MAP_STATUS: Record<string, { c: string; l: string }> = { ativo: { c: "#1D9E75", l: "Ativo" }, inativo: { c: "#8A8F98", l: "Inativo" }, prospecto: { c: "#2E6F9E", l: "Prospecto" }, lead: { c: "#0EA5A0", l: "Lead" }, oportunidade: { c: "#D9820B", l: "Oportunidade" }, ganho: { c: "#1D9E75", l: "Cliente" }, perdido: { c: "#E24B4A", l: "Perdido" } };

// Mapa do Brasil com bolinhas iluminadas por status (posicionadas pela UF do cliente).
function BrazilMap({ dots, semUf, t }: { dots: { uf: string; status: string }[]; semUf: number; t: (s: string) => string }) {
  const byUf: Record<string, { uf: string; status: string }[]> = {};
  dots.forEach((d) => { if (UF_XY[d.uf]) (byUf[d.uf] ??= []).push(d); });
  const present = [...new Set(dots.map((d) => d.status))].filter((s) => MAP_STATUS[s]);
  const nodes: { x: number; y: number; c: string }[] = [];
  Object.entries(byUf).forEach(([uf, arr]) => {
    const [bx, by] = UF_XY[uf];
    arr.forEach((d, i) => { const ang = (i / Math.max(1, arr.length)) * 2 * Math.PI; const r = arr.length > 1 ? 20 : 0; nodes.push({ x: bx + r * Math.cos(ang), y: by + r * Math.sin(ang), c: (MAP_STATUS[d.status] || { c: "#8A8F98" }).c }); });
  });
  return (
    <div>
      <svg viewBox="0 0 1000 1000" style={{ width: "100%", maxWidth: 340, height: "auto", display: "block", margin: "0 auto" }}>
        {Object.entries(UF_XY).map(([uf, [x, y]]) => <circle key={uf} cx={x} cy={y} r={6} fill="var(--crasto-border-soft)" />)}
        {nodes.map((n, i) => <g key={i}><circle cx={n.x} cy={n.y} r={17} fill={n.c} opacity={0.22} /><circle cx={n.x} cy={n.y} r={9.5} fill={n.c} stroke="var(--crasto-surface)" strokeWidth={2} /></g>)}
      </svg>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 8, fontSize: 11.5 }}>
        {present.length === 0 ? <span className="mt">{t("Sem UF preenchida ainda")}</span> : present.map((s) => <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--crasto-text-body)" }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: MAP_STATUS[s].c }} />{t(MAP_STATUS[s].l)}</span>)}
      </div>
      {semUf > 0 && <div className="mt" style={{ fontSize: 11, textAlign: "center", marginTop: 6 }}>{semUf} {t("sem localização — preencha a UF na ficha")}</div>}
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
  const nichos = arr("nichos");
  const nichoTot = nichos.reduce((a, x) => a + x.v, 0) || 1;
  const mapa = (Array.isArray(s.mapa) ? s.mapa : []) as { uf: string; status: string }[];
  const semUf = Number(s.sem_uf ?? 0);

  const cards: { v: number | string; l: string; acc?: boolean }[] = [
    { v: n("empresas"), l: t("empresas no funil") },
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
                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <Pie data={nichos} />
                  <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 160 }}>
                    {nichos.map((x, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], flex: "none" }} />
                        <span style={{ color: "var(--crasto-text-body)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.k}</span>
                        <span className="tnum" style={{ color: "var(--crasto-text-primary)", fontWeight: 600 }}>{x.v}</span>
                        <span className="tnum" style={{ color: "var(--crasto-text-muted)", width: 34, textAlign: "right" }}>{Math.round((x.v / nichoTot) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ background: "var(--crasto-bg-2)", border: "1px solid var(--crasto-border-soft)", borderRadius: 9, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--crasto-text-primary)", marginBottom: 4 }}>{t("Localidade dos clientes")}</div>
              <div style={{ fontSize: 11, color: "var(--crasto-text-muted)", marginBottom: 8 }}>{t("por UF · cor = status (verde ativo, azul prospecto, laranja oportunidade…)")}</div>
              <BrazilMap dots={mapa} semUf={semUf} t={t} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
