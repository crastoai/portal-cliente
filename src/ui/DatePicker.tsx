import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

// Calendário/intervalo de datas 100% no Design System da Crasto (sem lib externa — o Portal não
// tem date-picker; o input nativo abre o calendário do SO, fora do DS). Abre como POP-UP flutuante
// (portal + position:fixed) para não ser recortado nem empurrar o conteúdo do modal (que rola em 90vh).

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DOW = ["D", "S", "T", "Q", "Q", "S", "S"];

function parseISO(s: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtBR(s: string | null): string {
  const d = parseISO(s);
  return d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : "";
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function MonthCal({ value, min, max, onPick }: { value: string | null; min?: string | null; max?: string | null; onPick: (iso: string) => void }) {
  const sel = parseISO(value);
  const today = new Date();
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = sel || today;
    return { y: base.getFullYear(), m: base.getMonth() };
  });
  const minD = parseISO(min ?? null);
  const maxD = parseISO(max ?? null);
  const startDow = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(view.y, view.m, d));
  const prev = () => setView((v) => (v.m - 1 < 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }));
  const next = () => setView((v) => (v.m + 1 > 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }));
  const disabled = (d: Date) => (minD ? d < minD : false) || (maxD ? d > maxD : false);
  return (
    <div className="dp-cal">
      <div className="dp-head">
        <button type="button" className="dp-nav" onClick={prev} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
        <span className="dp-title">{MESES[view.m]} {view.y}</span>
        <button type="button" className="dp-nav" onClick={next} aria-label="Próximo mês"><ChevronRight size={16} /></button>
      </div>
      <div className="dp-grid dp-dow">{DOW.map((w, i) => <span key={i} className="dp-dowc">{w}</span>)}</div>
      <div className="dp-grid">
        {cells.map((d, i) => d === null ? <span key={i} /> : (
          <button
            key={i}
            type="button"
            disabled={disabled(d)}
            className={"dp-day" + (sel && sameDay(d, sel) ? " is-sel" : "") + (sameDay(d, today) ? " is-today" : "")}
            onClick={() => onPick(toISO(d))}
          >{d.getDate()}</button>
        ))}
      </div>
    </div>
  );
}

// Pop-up flutuante: renderiza no body (portal), posicionado sob o campo âncora, com overlay
// transparente que fecha ao clicar fora. Reposiciona se não couber na tela.
function CalPopover({ anchor, value, min, max, onPick, onClose }: { anchor: DOMRect; value: string | null; min?: string | null; max?: string | null; onPick: (iso: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: anchor.bottom + 6, left: anchor.left });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = anchor.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (left < 8) left = 8;
    let top = anchor.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.top - h - 6);
    setPos({ top, left });
  }, [anchor]);
  return createPortal(
    <>
      <div className="dp-overlay" onClick={onClose} />
      <div ref={ref} className="dp-pop" style={{ top: pos.top, left: pos.left }} role="dialog" aria-label="Calendário">
        <MonthCal value={value} min={min} max={max} onPick={onPick} />
      </div>
    </>,
    document.body,
  );
}

export function DateRange({ from, to, onChange }: { from: string | null; to: string | null; onChange: (from: string | null, to: string | null) => void }) {
  const [open, setOpen] = useState<null | "from" | "to">(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const todayISO = toISO(new Date());
  const openField = (which: "from" | "to", e: React.MouseEvent<HTMLButtonElement>) => {
    setAnchor(e.currentTarget.getBoundingClientRect());
    setOpen((o) => (o === which ? null : which));
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="dp-range">
      <div className="dp-bar">
        <CalIcon size={15} style={{ opacity: 0.6, flexShrink: 0 }} />
        <span className="dp-lbl">Período:</span>
        <button type="button" className={"dp-field" + (open === "from" ? " is-open" : "")} onClick={(e) => openField("from", e)}>{from ? fmtBR(from) : "início"}</button>
        <span className="dp-sep">→</span>
        <button type="button" className={"dp-field" + (open === "to" ? " is-open" : "")} onClick={(e) => openField("to", e)}>{to ? fmtBR(to) : "hoje"}</button>
        {(from || to) && <button type="button" className="dp-clear" onClick={() => { onChange(null, null); setOpen(null); }} aria-label="Limpar período"><X size={13} /> limpar</button>}
      </div>
      {open && anchor && (
        <CalPopover
          anchor={anchor}
          value={open === "from" ? from : to}
          max={todayISO}
          min={open === "to" ? from : null}
          onPick={(iso) => {
            if (open === "from") onChange(iso, to && to < iso ? null : to);
            else onChange(from, iso);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
