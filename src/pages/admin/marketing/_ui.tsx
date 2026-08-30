import { useEffect } from "react";
import { createPortal } from "react-dom";

// ============================================================================
// UI compartilhada do módulo Marketing (nativo no portal).
//
// ⚠️ REGRA GLOBAL (recorrência do portal): TODO modal/overlay é renderizado via
// createPortal no document.body — NUNCA como filho de uma tela animada. O portal
// usa animação page-enter (transform/filter) nos containers; um `position:fixed`
// dentro deles herda um "containing block" e abre DESCENTRALIZADO, com o fundo
// sem cobrir a tela. Montar no body escapa qualquer ancestral transformado, então
// o overlay fica sempre centralizado e o backdrop 100% opaco. Reusar SEMPRE isto.
// ============================================================================
export function MktModal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  // trava o scroll do body + fecha no ESC enquanto o modal está aberto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return createPortal(
    <div
      className="mkt-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={"mkt-modal-box" + (wide ? " wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="mkt-modal-h">
          <span className="mm-t">{title}</span>
          <button className="mm-x" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="mkt-modal-b">{children}</div>
        {footer ? <div className="mkt-modal-f">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
