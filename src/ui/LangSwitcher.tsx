import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { LANGS, useLang, type Lang } from "../lib/i18n";

const FULL: Record<Lang, string> = { pt: "Português", en: "English", es: "Español" };

// Bandeiras REDONDAS em SVG (o Windows não renderiza emoji de bandeira — mostrava "BR"/"US"/"ES").
const FLAG: Record<Lang, JSX.Element> = {
  pt: (<svg viewBox="0 0 24 24" width="100%" height="100%"><rect width="24" height="24" fill="#009C3B" /><path d="M12 3.4 20.6 12 12 20.6 3.4 12Z" fill="#FFDF00" /><circle cx="12" cy="12" r="4.3" fill="#002776" /></svg>),
  en: (<svg viewBox="0 0 24 24" width="100%" height="100%"><rect width="24" height="24" fill="#B22234" /><g fill="#fff"><rect y="3.4" width="24" height="1.85" /><rect y="7.1" width="24" height="1.85" /><rect y="10.8" width="24" height="1.85" /><rect y="14.5" width="24" height="1.85" /><rect y="18.2" width="24" height="1.85" /></g><rect width="11" height="10.8" fill="#3C3B6E" /></svg>),
  es: (<svg viewBox="0 0 24 24" width="100%" height="100%"><rect width="24" height="24" fill="#AA151B" /><rect y="6" width="24" height="12" fill="#F1BF00" /></svg>),
};

/** Seletor de idioma como dropdown (abre uma lista ao clicar). Persistente. */
export default function LangSwitcher({ up = false }: { up?: boolean }) {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="langdd" ref={ref}>
      <button type="button" className={"langdd-btn" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} title="Idioma / Language">
        <span className="langdd-flag">{FLAG[cur.code as Lang]}</span>
        <span className="langdd-code">{cur.label}</span>
        <ChevronDown size={13} className="langdd-chev" />
      </button>
      {open && (
        <div className={"langdd-menu" + (up ? " up" : "")} role="listbox">
          {LANGS.map((l) => (
            <button key={l.code} type="button" role="option" aria-selected={l.code === lang} className={"langdd-item" + (l.code === lang ? " on" : "")} onClick={() => { setLang(l.code); setOpen(false); }}>
              <span className="langdd-flag">{FLAG[l.code]}</span>
              <span className="langdd-name">{FULL[l.code]}</span>
              {l.code === lang && <Check size={14} className="langdd-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
