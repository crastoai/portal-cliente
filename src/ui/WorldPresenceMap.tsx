// Mapa-múndi REAL, zoomável (react-simple-maps + world-atlas). Substitui o SVG desenhado à mão.
// v3 (pedido do Crasto): UMA bolinha POR CLIENTE (não mais um ponto gordo agrupando a cidade toda).
// Clientes da mesma cidade recebem um leve espalhamento (ring) feito na origem (ConsoleHealthCheck):
// no mundo/Brasil parecem um cluster; ao dar ZOOM eles se separam e dá pra clicar em cada um.
// Clique num ponto ABRE o cartão daquele cliente (nome · cidade · nicho). Os NICHOS de mercado saíram
// do card fixo pro BALÃO RETRÁTIL embaixo à direita (abre/fecha). tones: active (pulso) · negotiating · future.
import { useState, type CSSProperties } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import worldTopo from "../assets/world-countries-110m.json";

export type PresencePoint = {
  id: string; coordinates: [number, number];
  name: string; city: string; niche: string;
  tone?: "active" | "negotiating" | "future";
};

const TONE: Record<string, string> = { active: "#1F8A5B", negotiating: "#C7962B", future: "#8A94A6" };

export default function WorldPresenceMap({ points, total, height = 460 }: { points: PresencePoint[]; total: number; height?: number }) {
  const [view, setView] = useState<{ center: [number, number]; zoom: number }>({ center: [0, 12], zoom: 1 });
  const [sel, setSel] = useState<PresencePoint | null>(null);
  const [nichesOpen, setNichesOpen] = useState(false);
  const clamp = (z: number) => Math.max(1, Math.min(16, z));
  const z = view.zoom;

  // Nichos de mercado (todos os pontos), do maior pro menor. Usado só no balão retrátil.
  const nicheTotals = (() => {
    const m: Record<string, string[]> = {};
    for (const p of points) (m[p.niche] || (m[p.niche] = [])).push(p.name);
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
  })();

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--crasto-border-soft)", background: "#EFF3F9" }}>
        <ComposableMap projection="geoMercator" projectionConfig={{ scale: 125 }} width={980} height={height} style={{ width: "100%", height: "auto", display: "block" }}>
          <rect x={0} y={0} width={980} height={height} fill="#EFF3F9" />
          <ZoomableGroup center={view.center} zoom={z} minZoom={1} maxZoom={16}
            onMoveEnd={(p: any) => setView({ center: p.coordinates, zoom: p.zoom })}
            translateExtent={[[-120, -60], [1100, height + 60]]}>
            <Geographies geography={worldTopo as any}>
              {({ geographies }: any) => geographies.map((geo: any) => (
                <Geography key={geo.rsmKey} geography={geo}
                  fill="#CDD8E7" stroke="#9AABC1" strokeWidth={0.7 / z}
                  style={{ default: { outline: "none" }, hover: { fill: "#BECBDF", outline: "none" }, pressed: { outline: "none" } }} />
              ))}
            </Geographies>
            {points.map((p) => {
              const tone = TONE[p.tone || "active"];
              const r = 4.6 / z; const on = sel?.id === p.id; const future = p.tone === "future";
              return (
                <Marker key={p.id} coordinates={p.coordinates} onClick={() => setSel(on ? null : p)} style={{ default: { cursor: "pointer" }, hover: { cursor: "pointer" }, pressed: {} }}>
                  {/* elementos VISUAIS não capturam clique (pointerEvents:none) — só o círculo de hit
                      abaixo capta. Assim o pulso de um cliente não rouba o clique do vizinho. */}
                  {p.tone === "active" && (
                    <circle r={r * 1.6} fill="none" stroke={tone} strokeWidth={1.1 / z} opacity={0.35} style={{ pointerEvents: "none" }}>
                      <animate attributeName="r" values={`${r * 1.2};${r * 2.8};${r * 1.2}`} dur="2.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0;0.4" dur="2.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {on && <circle r={r * 2.3} fill="none" stroke={tone} strokeWidth={1.5 / z} style={{ pointerEvents: "none" }} />}
                  <circle r={r} fill={future ? "none" : tone} stroke={future ? tone : "#fff"} style={{ pointerEvents: "none" }}
                    strokeWidth={(future ? 1.4 : 1.3) / z} strokeDasharray={future ? `${2 / z} ${2 / z}` : undefined} />
                  {/* área de clique maior + acessível por teclado (Enter/Espaço) + tooltip no hover */}
                  <circle r={5.5 / z} fill="transparent" tabIndex={0} role="button"
                    aria-label={`${p.name} — ${p.city} · ${p.niche}`}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(on ? null : p); } }}>
                    <title>{`${p.name} · ${p.city}`}</title>
                  </circle>
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* Total (top-left) — mesmo número da pílula do cabeçalho: um por cliente plotado */}
      <div style={{ position: "absolute", left: 12, top: 12, display: "flex", alignItems: "center", gap: 8, background: "var(--crasto-surface)", border: "1px solid var(--crasto-border-soft)", borderRadius: 999, padding: "6px 14px", boxShadow: "0 1px 3px rgba(1,14,38,.12)" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1F8A5B" }} />
        <b style={{ fontSize: 14, color: "var(--crasto-text-primary)" }}>{total}</b>
        <span style={{ fontSize: 12.5, color: "var(--crasto-text-muted)" }}>clientes no mapa</span>
      </div>

      {/* Cartão do cliente ao clicar num ponto (top-right) */}
      {sel && (
        <div style={{ position: "absolute", right: 12, top: 12, width: 236, maxWidth: "62%", background: "var(--crasto-surface)", border: "1px solid var(--crasto-border-soft)", borderRadius: 12, boxShadow: "0 12px 34px -12px rgba(1,14,38,.34)", padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: TONE[sel.tone || "active"], flex: "none", marginTop: 5 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13.5, color: "var(--crasto-text-primary)", display: "block", lineHeight: 1.3 }}>{sel.name}</b>
              <div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", marginTop: 2 }}>{sel.city}</div>
            </div>
            <button onClick={() => setSel(null)} aria-label="Fechar" style={{ border: "none", background: "transparent", color: "var(--crasto-text-muted)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(31,138,91,.1)", border: "1px solid rgba(31,138,91,.28)", color: "#1F6E4B", borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 600 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#1F8A5B" }} />{sel.niche}
          </div>
        </div>
      )}

      {/* Zoom (bottom-right, canto) */}
      <div style={{ position: "absolute", right: 12, bottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <button title="Aproximar" style={btn} onClick={() => setView((v) => ({ ...v, zoom: clamp(v.zoom * 1.6) }))}>+</button>
        <button title="Afastar" style={btn} onClick={() => setView((v) => ({ ...v, zoom: clamp(v.zoom / 1.6) }))}>−</button>
      </div>

      {/* Balão retrátil de NICHOS de mercado (bottom-right, acima do zoom) */}
      <div style={{ position: "absolute", right: 54, bottom: 12, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, maxWidth: "min(70%, 260px)" }}>
        {nichesOpen && nicheTotals.length > 0 && (
          <div style={{ width: 232, background: "var(--crasto-surface)", border: "1px solid var(--crasto-border-soft)", borderRadius: 12, boxShadow: "0 12px 34px -12px rgba(1,14,38,.34)", padding: "10px 12px", maxHeight: "min(56vh, 300px)", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <div style={{ flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--crasto-text-muted)" }}>Nichos de mercado</div>
              <button onClick={() => setNichesOpen(false)} aria-label="Fechar" style={{ border: "none", background: "transparent", color: "var(--crasto-text-muted)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
            </div>
            {nicheTotals.map(([niche, names]) => (
              <div key={niche} style={{ padding: "4px 0", borderTop: "1px solid var(--crasto-border-soft)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#1F8A5B", flex: "none" }} />
                  <span style={{ flex: 1, fontSize: 12, color: "var(--crasto-text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={niche}>{niche}</span>
                  <b style={{ fontSize: 12.5, color: "var(--crasto-text-primary)" }}>{names.length}</b>
                </div>
                <div style={{ paddingLeft: 13, fontSize: 11, color: "var(--crasto-text-muted)", lineHeight: 1.5 }}>{names.join(" · ")}</div>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setNichesOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--crasto-surface)", border: "1px solid var(--crasto-border-soft)", borderRadius: 999, padding: "6px 12px", boxShadow: "0 1px 3px rgba(1,14,38,.12)", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--crasto-text-body)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#1F8A5B" }} />
          Nichos<span style={{ color: "var(--crasto-text-muted)" }}>· {nicheTotals.length}</span>
          <span style={{ fontSize: 10, color: "var(--crasto-text-muted)" }}>{nichesOpen ? "▾" : "▴"}</span>
        </button>
      </div>

      {/* Atalhos de enquadramento (bottom-left) */}
      <div style={{ position: "absolute", left: 12, bottom: 12, display: "flex", gap: 6 }}>
        <button style={{ ...btn, width: "auto", padding: "0 12px", fontSize: 12 }} onClick={() => { setSel(null); setView({ center: [-51, -14], zoom: 4.5 }); }}>Brasil</button>
        <button style={{ ...btn, width: "auto", padding: "0 12px", fontSize: 12 }} onClick={() => { setSel(null); setView({ center: [0, 12], zoom: 1 }); }}>Mundo</button>
      </div>
    </div>
  );
}

const btn: CSSProperties = { width: 32, height: 32, borderRadius: 8, border: "1px solid var(--crasto-border-soft)", background: "var(--crasto-surface)", color: "var(--crasto-text-body)", cursor: "pointer", fontSize: 18, fontWeight: 600, display: "grid", placeItems: "center", boxShadow: "0 1px 3px rgba(1,14,38,.1)" };
