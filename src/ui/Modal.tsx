import { X } from "lucide-react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

// Renderiza via PORTAL no <body>: escapa de qualquer ancestral com transform/filter/animação
// (ex.: .page-enter, .main em transição), que viraria o bloco de contenção do position:fixed e
// prenderia o backdrop à área de conteúdo. No body, o overlay (fixed inset:0 z-index:200) cobre a
// TELA INTEIRA — sidebar + topbar inclusos — e o modal centraliza de verdade. Vale p/ TODO popup.
export default function Modal({ title, open, onClose, children, footer, wide, fullscreen, persistent }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; fullscreen?: boolean; persistent?: boolean;
}) {
  if (!open) return null;
  return createPortal(
    <div className={"modal-overlay" + (fullscreen ? " modal-overlay--fs" : "")} onClick={persistent ? undefined : onClose}>
      <div className={"modal" + (wide ? " modal--wide" : "") + (fullscreen ? " modal--fullscreen" : "")} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-h">
          <h3>{title}</h3>
          <button className="icobtn" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
