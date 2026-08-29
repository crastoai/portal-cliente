// Mapa-múndi REAL, zoomável (react-simple-maps + world-atlas). Substitui o SVG desenhado à mão.
// v2 (pedido do Crasto): sem rótulos na cara (encavalavam) — clique num ponto ABRE os clientes
// daquele local num painel; um badge mostra o TOTAL de clientes; cores um pouco mais claras.
// tones: active (navy, com pulso) · negotiating (âmbar) · future (tracejado).
import { useState, type CSSProperties } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import worldTopo from "../assets/world-countries-110m.json";

export type PresencePoint = {
  id: string; coordinates: [number, number]; label: string;
  clients: string[]; tone?: "active" | "negotiating" | "future";
};

const TONE: Record<string, string> = { active: "#1F8A5B", negotiating: "#C7962B", future: "#8A94A6" };

export default function WorldPresenceMap({ points, total, height = 460 }: { points: PresencePoint[]; total: number; height?: number }) {
  const [view, setView] = useState<{ center: [number, number]; zoom: number }>({ center: [0, 12], zoom: 1 });
  const [sel, setSel] = useState<PresencePoint | null>(null);
  const clamp = (z: number) => Math.max(1, Math.min(16, z));
  const z = view.zoom;

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
              const r = 5.5 / z; const on = sel?.id === p.id; const future = p.tone === "future";
              return (
                <Marker key={p.id} coordinates={p.coordinates} onClick={() => setSel(on ? null : p)} style={{ default: { cursor: "pointer" }, hover: { cursor: "pointer" }, pressed: {} }}>
                  {/* elementos VISUAIS não capturam clique (pointerEvents:none) — só o círculo de hit
                      abaixo capta. Assim o pulso grande de uma cidade não rouba o clique da vizinha. */}
                  {p.tone === "active" && (
                    <circle r={r * 1.6} fill="none" stroke={tone} strokeWidth={1.2 / z} opacity={0.35} style={{ pointerEvents: "none" }}>
                      <animate attributeName="r" values={`${r * 1.3};${r * 3.2};${r * 1.3}`} dur="2.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0;0.4" dur="2.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {on && <circle r={r * 2.1} fill="none" stroke={tone} strokeWidth={1.4 / z} style={{ pointerEvents: "none" }} />}
                  <circle r={r} fill={future ? "none" : tone} stroke={future ? tone : "#fff"} style={{ pointerEvents: "none" }}
                    strokeWidth={(future ? 1.4 : 1.3) / z} strokeDasharray={future ? `${2 / z} ${2 / z}` : undefined} />
                  {/* área de clique maior + acessível por teclado (Enter/Espaço) + tooltip no hover */}
                  <circle r={6 / z} fill="transparent" tabIndex={0} role="button"
                    aria-label={`${p.label} — ${p.clients.length} ${p.clients.length === 1 ? "cliente" : "clientes"}`}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(on ? null : p); } }}>
                    <title>{`${p.label} · ${p.clients.length}`}</title>
                  </circle>
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* Total de clientes (badge no mapa) */}
      <div style={{ position: "absolute", left: 12, top: 12, display: "flex", alignItems: "center", gap: 8, background: "var(--crasto-surface)", border: "1px solid var(--crasto-border-soft)", borderRadius: 999, padding: "6px 14px", boxShadow: "0 1px 3px rgba(1,14,38,.12)" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1F8A5B" }} />
        <b style={{ fontSize: 14, color: "var(--crasto-text-primary)" }}>{total}</b>
        <span style={{ fontSize: 12.5, color: "var(--crasto-text-muted)" }}>clientes no mapa</span>
      </div>

      {/* Painel de detalhes ao clicar num ponto */}
      {sel && (
        <div style={{ position: "absolute", right: 12, top: 12, width: 236, maxWidth: "62%", background: "var(--crasto-surface)", border: "1px solid var(--crasto-border-soft)", borderRadius: 12, boxShadow: "0 12px 34px -12px rgba(1,14,38,.34)", padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: TONE[sel.tone || "active"], flex: "none" }} />
            <b style={{ fontSize: 13.5, color: "var(--crasto-text-primary)", flex: 1 }}>{sel.label}</b>
            <button onClick={() => setSel(null)} aria-label="Fechar" style={{ border: "none", background: "transparent", color: "var(--crasto-text-muted)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", marginBottom: 8 }}>{sel.clients.length} {sel.clients.length === 1 ? "cliente" : "clientes"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "min(72vh, 430px)", overflowY: "auto" }}>
            {sel.clients.map((c, i) => (
              <div key={i} style={{ fontSize: 13, color: "var(--crasto-text-body)", display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: TONE[sel.tone || "active"], flex: "none" }} />{c}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ position: "absolute", right: 12, bottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <button title="Aproximar" style={btn} onClick={() => setView((v) => ({ ...v, zoom: clamp(v.zoom * 1.6) }))}>+</button>
        <button title="Afastar" style={btn} onClick={() => setView((v) => ({ ...v, zoom: clamp(v.zoom / 1.6) }))}>−</button>
      </div>
      <div style={{ position: "absolute", left: 12, bottom: 12, display: "flex", gap: 6 }}>
        <button style={{ ...btn, width: "auto", padding: "0 12px", fontSize: 12 }} onClick={() => { setSel(null); setView({ center: [-51, -14], zoom: 4.5 }); }}>Brasil</button>
        <button style={{ ...btn, width: "auto", padding: "0 12px", fontSize: 12 }} onClick={() => { setSel(null); setView({ center: [0, 12], zoom: 1 }); }}>Mundo</button>
      </div>
    </div>
  );
}

const btn: CSSProperties = { width: 32, height: 32, borderRadius: 8, border: "1px solid var(--crasto-border-soft)", background: "var(--crasto-surface)", color: "var(--crasto-text-body)", cursor: "pointer", fontSize: 18, fontWeight: 600, display: "grid", placeItems: "center", boxShadow: "0 1px 3px rgba(1,14,38,.1)" };
