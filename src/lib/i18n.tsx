// ============================================================================
// i18n aditivo e à prova de falhas. A CHAVE é o próprio texto em PT.
// Se faltar tradução (EN/ES), cai no PT — nunca quebra, nunca fica em branco.
// Uso:  const t = useT();  ...  {t("Entrar")}  ou  {t("Olá, {n}", { n: nome })}
// ============================================================================
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DICT } from "./translations";

export type Lang = "pt" | "en" | "es";
export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "pt", label: "PT", flag: "🇧🇷" },
  { code: "en", label: "EN", flag: "🇺🇸" },
  { code: "es", label: "ES", flag: "🇪🇸" },
];
const KEY = "crasto_lang";

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangCtx = createContext<Ctx>({ lang: "pt", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { const s = localStorage.getItem(KEY); if (s === "pt" || s === "en" || s === "es") return s; } catch { /* ignore */ }
    return "pt";
  });
  useEffect(() => { try { document.documentElement.lang = lang; } catch { /* ignore */ } }, [lang]);
  const setLang = (l: Lang) => { try { localStorage.setItem(KEY, l); } catch { /* ignore */ } setLangState(l); };
  const value = useMemo(() => ({ lang, setLang }), [lang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useLang() { return useContext(LangCtx); }

/** Retorna a função tradutora ligada ao idioma atual (reativa). */
export function useT() {
  const { lang } = useContext(LangCtx);
  return useMemo(() => {
    return (pt: string, vars?: Record<string, string | number>) => {
      let s = lang === "pt" ? pt : (DICT[pt]?.[lang] ?? pt);
      if (vars) for (const k in vars) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
      return s;
    };
  }, [lang]);
}
