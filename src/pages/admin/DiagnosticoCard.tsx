// ============================================================================
// DiagnosticoCard — card compacto do "Diagnóstico do site" para a ficha de CLIENTE.
// Autocarrega a última submissão do /mapa da org; se NÃO houver, não renderiza nada
// (clientes que nunca fizeram o diagnóstico não veem nada de novo). Ao clicar, abre
// o Mapa completo (DiagnosticoMapa) num popup.
//
// O popup é renderizado via createPortal no <body>: o conteúdo do admin tem ancestrais
// com backdrop-filter (sidebar/header), o que faria um overlay position:fixed se conter
// nesse ancestral e a página "vazar" por cima. Portando pro body, o overlay cobre a
// viewport de verdade e nada vaza. Reusa as classes .modal-overlay/.modal do DS.
// ============================================================================
import { useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, ArrowRight, X } from "lucide-react";
import { services as api } from "../../services";
import { useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import DiagnosticoMapa, { fmtDate, band, BAND_COLOR } from "./DiagnosticoMapa";

export default function DiagnosticoCard({ orgId }: { orgId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data: diag } = useAsync(() => api.analytics.admin.diagnostic<any>(orgId).catch(() => null), [orgId]);
  if (!diag) return null;
  const mat: number | null = diag.maturidade ?? null;
  const b = mat != null ? BAND_COLOR[band(mat)] : null;
  return (
    <div className="card" style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <MapPin size={18} style={{ color: "var(--crasto-text-primary)" }} />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 700, color: "var(--crasto-text-primary)" }}>{t("Diagnóstico do site")}</div>
        <div className="mt">{t("Mapa de IA preenchido pelo cliente")} · {fmtDate(diag.created_at)}</div>
      </div>
      {mat != null && b && <span className="chip" style={{ background: b.bg, color: b.fg }}>{t("Maturidade")}: {mat}/100</span>}
      <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => setOpen(true)}>
        <span className="crasto-btn__label">{t("Ver Mapa completo")}</span><span className="crasto-btn__icon"><ArrowRight size={14} /></span>
      </button>

      {open && createPortal(
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal modal--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-h">
              <h3>{t("Mapa de IA — diagnóstico do site")}</h3>
              <button className="icobtn" onClick={() => setOpen(false)} aria-label={t("Fechar")}><X size={16} /></button>
            </div>
            <div className="modal-body"><DiagnosticoMapa diag={diag} /></div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
