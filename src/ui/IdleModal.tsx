import { Clock } from "lucide-react";
import { useT } from "../lib/i18n";
import { WARN_MS } from "../lib/idle";

/**
 * Aviso de inatividade. NÃO fecha por clique fora nem por ESC de propósito: a pessoa
 * precisa escolher (é isso que diferencia "estou aqui" de "esbarrei no mouse").
 */
export default function IdleModal({ restante, onContinuar, onSair }: {
  restante: number; onContinuar: () => void; onSair: () => void;
}) {
  const t = useT();
  const total = Math.ceil(WARN_MS / 1000);
  const pct = Math.max(0, Math.min(100, (restante / total) * 100));

  return (
    <div className="modal-overlay" role="alertdialog" aria-modal="true" aria-labelledby="idle-t">
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><h3 id="idle-t">{t("Ainda está aí?")}</h3></div>
        <div className="modal-body">
          <p style={{ margin: "0 0 16px", lineHeight: 1.6, color: "var(--crasto-text-body)" }}>
            {t("Você está parado há um tempo. Por segurança, vamos encerrar a sua sessão.")}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Clock size={15} style={{ color: "var(--crasto-text-muted)", flex: "none" }} />
            <span style={{ fontSize: 13.5, color: "var(--crasto-text-muted)" }}>
              {t("Saindo em")} <strong style={{ color: "var(--crasto-navy)" }}>{restante}s</strong>
            </span>
          </div>
          {/* Barra: a contagem precisa ser vista, não lida. */}
          <div style={{ height: 4, borderRadius: 999, background: "var(--crasto-navy-08)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "var(--crasto-navy)", transition: "width 1s linear" }} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={onSair}>
            <span className="crasto-btn__label">{t("Não, sair agora")}</span>
          </button>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={onContinuar} autoFocus>
            <span className="crasto-btn__label">{t("Sim, continuar")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
