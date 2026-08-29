// Mapa-múndi REAL, zoomável (react-simple-maps + world-atlas). Substitui o SVG desenhado à mão.
// Recebe `points` (localizações reais dos clientes) e desenha o mundo com fronteiras de países +
// marcadores. Zoom/pan por roda/arraste + botões. Marcadores mantêm tamanho na tela (dividem por z).
// tones: active = cliente (navy, com pulso) · negotiating = em negociação (âmbar) · future = meta (tracejado).
import { useState, type CSSProperties } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import worldTopo from "../assets/world-countries-110m.json";

export type PresencePoint = {
  id: string; coordinates: [number, number]; label: string; count?: number;
  tone?: "active" | "negotiating" | "future";
};

const TONE: Record<string, string> = { active: "#0B2A6B", negotiating: "#C7962B", future: "#8A94A6" };

export default function WorldPresenceMap({ points, height = 460 }: { points: PresencePoint[]; height?: number }) {
  const [view, setView] = useState<{ center: [number, number]; zoom: number }>({ center: [0, 12], zoom: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const clamp = (z: number) => Math.max(1, Math.min(16, z));
  const z = view.zoom;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--crasto-border-soft)", background: "var(--crasto-bg-2)" }}>
        <ComposableMap projection="geoMercator" projectionConfig={{ scale: 125 }} width={980} height={height} style={{ width: "100%", height: "auto", display: "block" }}>
          <rect x={0} y={0} width={980} height={height} fill="#EAEFF6" />
          <ZoomableGroup center={view.center} zoom={z} minZoom={1} maxZoom={16}
            onMoveEnd={(p: any) => setView({ center: p.coordinates, zoom: p.zoom })}
            translateExtent={[[-120, -60], [1100, height + 60]]}>
            <Geographies geography={worldTopo as any}>
              {({ geographies }: any) => geographies.map((geo: any) => (
                <Geography key={geo.rsmKey} geography={geo}
                  fill="#BFCCDE"
                  stroke="#7F92AC"
                  strokeWidth={0.7 / z}
                  style={{ default: { outline: "none" }, hover: { fill: "#A9B9D2", outline: "none" }, pressed: { outline: "none" } }} />
              ))}
            </Geographies>
            {points.map((p) => {
              const tone = TONE[p.tone || "active"];
              const r = 5.5 / z; const on = hover === p.id;
              const future = p.tone === "future";
              return (
                <Marker key={p.id} coordinates={p.coordinates}
                  onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}
                  style={{ default: { cursor: "pointer" }, hover: { cursor: "pointer" }, pressed: {} }}>
                  {p.tone === "active" && (
                    <circle r={r * 1.6} fill="none" stroke={tone} strokeWidth={1.2 / z} opacity={0.35}>
                      <animate attributeName="r" values={`${r * 1.3};${r * 3.2};${r * 1.3}`} dur="2.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0;0.4" dur="2.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle r={r} fill={future ? "none" : tone} stroke={future ? tone : "#fff"}
                    strokeWidth={(future ? 1.4 : 1.3) / z} strokeDasharray={future ? `${2 / z} ${2 / z}` : undefined} />
                  <text textAnchor="middle" y={-r - 5 / z}
                    style={{ fontSize: `${(on ? 12 : 10.5) / z}px`, fontWeight: 600, fill: "#0C1322", paintOrder: "stroke", stroke: "#EAEFF6", strokeWidth: `${3.5 / z}px` }}>
                    {p.label}{p.count != null ? ` · ${p.count}` : ""}
                  </text>
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>
      </div>
      <div style={{ position: "absolute", right: 12, bottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <button title="Aproximar" style={btn} onClick={() => setView((v) => ({ ...v, zoom: clamp(v.zoom * 1.6) }))}>+</button>
        <button title="Afastar" style={btn} onClick={() => setView((v) => ({ ...v, zoom: clamp(v.zoom / 1.6) }))}>−</button>
      </div>
      <div style={{ position: "absolute", left: 12, bottom: 12, display: "flex", gap: 6 }}>
        <button style={{ ...btn, width: "auto", padding: "0 12px", fontSize: 12 }} onClick={() => setView({ center: [-51, -14], zoom: 4.5 })}>Brasil</button>
        <button style={{ ...btn, width: "auto", padding: "0 12px", fontSize: 12 }} onClick={() => setView({ center: [0, 12], zoom: 1 })}>Mundo</button>
      </div>
    </div>
  );
}

const btn: CSSProperties = { width: 32, height: 32, borderRadius: 8, border: "1px solid var(--crasto-border-soft)", background: "var(--crasto-surface)", color: "var(--crasto-text-body)", cursor: "pointer", fontSize: 18, fontWeight: 600, display: "grid", placeItems: "center", boxShadow: "0 1px 3px rgba(1,14,38,.1)" };
