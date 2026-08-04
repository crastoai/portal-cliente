import { X } from "lucide-react";
import type { ReactNode } from "react";

export default function Modal({ title, open, onClose, children, footer, wide, fullscreen }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; fullscreen?: boolean;
}) {
  if (!open) return null;
  return (
    <div className={"modal-overlay" + (fullscreen ? " modal-overlay--fs" : "")} onClick={onClose}>
      <div className={"modal" + (wide ? " modal--wide" : "") + (fullscreen ? " modal--fullscreen" : "")} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-h">
          <h3>{title}</h3>
          <button className="icobtn" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
