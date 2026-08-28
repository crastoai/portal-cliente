import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { useT } from "../lib/i18n";

// ============================================================================
// REGRA GLOBAL DE UI: TODA tabela do sistema tem cabeçalho clicável para ordenar
// aquela coluna (crescente ↔ decrescente), com seta indicadora. Use este hook +
// <SortTh> (tabelas <table>) ou <SortArrow>/`sortProps` (cabeçalhos em grid/div).
// Ordenação natural: strings via localeCompare pt (case-insensitive); números
// numéricos; vazios (null/""/undefined) SEMPRE por último em qualquer direção.
// ============================================================================
export type SortState = { col: string; dir: 1 | -1 };
function cmpVals(a: unknown, b: unknown): number {
  const na = a === null || a === undefined || a === "";
  const nb = b === null || b === undefined || b === "";
  if (na && nb) return 0;
  if (na) return 1;   // vazio depois
  if (nb) return -1;
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase().localeCompare(b.toLowerCase(), "pt");
  const x = a as number, y = b as number;
  return x < y ? -1 : x > y ? 1 : 0;
}
/** Estado + helpers de ordenação de tabela. `sorted(rows, val)` devolve cópia ordenada. */
export function useSort(initialCol = "", initialDir: 1 | -1 = 1) {
  const [sort, setSort] = useState<SortState>({ col: initialCol, dir: initialDir });
  const toggle = (col: string) => setSort((s) => ({ col, dir: s.col === col ? (s.dir === 1 ? -1 : 1) : 1 }));
  function sorted<R>(rows: R[], val: (r: R, col: string) => unknown): R[] {
    if (!sort.col) return rows;
    return [...rows].sort((a, b) => cmpVals(val(a, sort.col), val(b, sort.col)) * sort.dir);
  }
  return { sort, toggle, sorted };
}
/** Seta indicadora (↑/↓ na coluna ativa; ⇅ apagado nas demais). Serve p/ qualquer cabeçalho. */
export function SortArrow({ col, sort }: { col: string; sort: SortState }) {
  if (sort.col !== col) return <ChevronsUpDown size={12} style={{ opacity: 0.35, flexShrink: 0 }} />;
  return sort.dir === 1 ? <ArrowUp size={12} style={{ flexShrink: 0 }} /> : <ArrowDown size={12} style={{ flexShrink: 0 }} />;
}
/** Célula de cabeçalho <th> clicável e ordenável. `center`/`right` alinham o conteúdo. */
export function SortTh({ col, sort, toggle, children, style, center, right }: {
  col: string; sort: SortState; toggle: (c: string) => void; children: ReactNode; style?: CSSProperties; center?: boolean; right?: boolean;
}) {
  return (
    <th onClick={() => toggle(col)} style={{ cursor: "pointer", whiteSpace: "nowrap", userSelect: "none", ...style }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: center ? "center" : right ? "flex-end" : "flex-start" }}>
        {children}<SortArrow col={col} sort={sort} />
      </span>
    </th>
  );
}
/** Props para tornar um cabeçalho em grid/div clicável (não-<table>). Combine com <SortArrow>. */
export function sortProps(col: string, toggle: (c: string) => void): { onClick: () => void; style: CSSProperties } {
  return { onClick: () => toggle(col), style: { cursor: "pointer", userSelect: "none" } };
}

/** Toast tipado (DS): sucesso=verde, erro=vermelho, atenção=laranja.
 *  Uso: const toast = useToast(); toast.ok("Salvo ✓"); toast.err(msg); ... {toast.node} */
export function useToast(ms = 5000) {
  const [t, setT] = useState<{ msg: string; tone: "ok" | "err" | "warn" } | null>(null);
  const ref = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = (msg: string, tone: "ok" | "err" | "warn") => {
    setT({ msg, tone });
    if (ref.current) clearTimeout(ref.current);
    ref.current = setTimeout(() => setT(null), ms);
  };
  return {
    node: t ? <div className={"toast toast--" + t.tone}>{t.msg}</div> : null,
    ok: (m: string) => show(m, "ok"),
    err: (m: string) => show(m, "err"),
    warn: (m: string) => show(m, "warn"),
  };
}

export function money(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
export function initials(s?: string | null) {
  return (s || "?").trim().slice(0, 2).toUpperCase();
}

/** Nome "de gente": se o valor parece um slug de e-mail (ex.: "fabio.pando", tudo minúsculo
 *  com ponto/underscore), vira "Fabio Pando". Nome já normal (com espaço/acento/maiúscula)
 *  é preservado. Usado no CRM para exibir contatos vindos do site de forma apresentável. */
export function prettyName(s?: string | null): string {
  const v = (s || "").trim();
  if (!v) return "—";
  const looksSlug = /^[a-z0-9._-]+$/.test(v) && /[._-]/.test(v);
  if (!looksSlug) return v;
  return v.split(/[._-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Avatar com foto (se houver) e fallback nas iniciais. Usa a classe .logo do DS. */
export function Avatar({ name, url, size = 34, style }: { name?: string | null; url?: string | null; size?: number; style?: React.CSSProperties }) {
  return (
    <div className="logo" style={{ width: size, height: size, borderRadius: Math.round(size * 0.27), background: "var(--crasto-bg-3)", color: "var(--crasto-text-primary)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: Math.round(size * 0.38), overflow: "hidden", flexShrink: 0, ...style }}>
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(name)}
    </div>
  );
}

export function PageHead({ eyebrow = "Portal", title, sub, right, titleAside }: { eyebrow?: string; title: string; sub?: string; right?: ReactNode; titleAside?: ReactNode }) {
  const t = useT();
  return (
    <div className={right ? "phead-row" : ""}>
      <div className="phead">
        <div className="ey">{t(eyebrow)}</div>
        {/* titleAside = algo COLADO no título (ex.: farol de status em tempo real) */}
        {titleAside ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0 }}>{t(title)}</h1>{titleAside}
          </div>
        ) : <h1>{t(title)}</h1>}
        {sub && <div className="sub">{t(sub)}</div>}
      </div>
      {right && <div className="hactions">{right}</div>}
    </div>
  );
}

/**
 * Farol de status em TEMPO REAL — semáforo horizontal (3 luzes lado a lado).
 * A luz do status atual acende (com brilho) e PISCA; as outras ficam cinza (apagadas).
 * verde = tudo em dia · amarelo = alerta/pendência · vermelho = pendência grave.
 */
export function Farol({ status, titulo }: { status: "verde" | "amarelo" | "vermelho"; titulo?: string }) {
  const luzes: ("vermelho" | "amarelo" | "verde")[] = ["vermelho", "amarelo", "verde"];
  return (
    <span className="farol" role="img" aria-label={titulo || status} title={titulo || status}>
      {luzes.map((c) => <span key={c} className={"farol-luz" + (status === c ? " on " + c : "")} />)}
    </span>
  );
}

export function Pill({ tone = "mute", children }: { tone?: string; children: ReactNode }) {
  return <span className={"pill " + tone}><span className="d" />{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  const t = useT();
  return <div className="empty">{typeof children === "string" ? t(children) : children}</div>;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  // Só mostra "Carregando…" no 1º carregamento. reload()/refetch depois disso acontecem em
  // SEGUNDO PLANO — os dados atuais ficam na tela enquanto rebusca, então a lista não some,
  // a página não encolhe e o scroll NÃO volta pro topo (fix da UX de salvar/apagar).
  const loadedOnce = useRef(false);
  useEffect(() => {
    let alive = true;
    if (!loadedOnce.current) setLoading(true);
    fn().then((d) => { if (alive) { setData(d); setLoading(false); loadedOnce.current = true; } }).catch(() => { if (alive) { setLoading(false); loadedOnce.current = true; } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { data, loading, reload: () => setN((x) => x + 1) };
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const t = useT();
  return <label className="frow"><span>{t(label)}</span>{children}</label>;
}

export function Loader() {
  const t = useT();
  return <div className="empty">{t("Carregando…")}</div>;
}
