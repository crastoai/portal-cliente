import { LANGS, useLang } from "../lib/i18n";

/** Seletor de idioma compacto (PT/EN/ES). Persistente em localStorage. */
export default function LangSwitcher({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <div className="langsw" role="group" aria-label="Idioma / Language">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          className={"langsw-btn" + (lang === l.code ? " on" : "")}
          onClick={() => setLang(l.code)}
          title={l.code === "pt" ? "Português" : l.code === "en" ? "English" : "Español"}
          aria-pressed={lang === l.code}
        >
          {compact ? l.flag : l.label}
        </button>
      ))}
    </div>
  );
}
