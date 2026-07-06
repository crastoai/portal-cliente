import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { LANGS, useLang, type Lang } from "../lib/i18n";

const FULL: Record<Lang, string> = { pt: "Português", en: "English", es: "Español" };

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
        <span className="langdd-flag">{cur.flag}</span>
        <span className="langdd-code">{cur.label}</span>
        <ChevronDown size={13} className="langdd-chev" />
      </button>
      {open && (
        <div className={"langdd-menu" + (up ? " up" : "")} role="listbox">
          {LANGS.map((l) => (
            <button key={l.code} type="button" role="option" aria-selected={l.code === lang} className={"langdd-item" + (l.code === lang ? " on" : "")} onClick={() => { setLang(l.code); setOpen(false); }}>
              <span className="langdd-flag">{l.flag}</span>
              <span className="langdd-name">{FULL[l.code]}</span>
              {l.code === lang && <Check size={14} className="langdd-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
