import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../lib/i18n";

export function money(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
export function initials(s?: string | null) {
  return (s || "?").trim().slice(0, 2).toUpperCase();
}

/** Avatar com foto (se houver) e fallback nas iniciais. Usa a classe .logo do DS. */
export function Avatar({ name, url, size = 34, style }: { name?: string | null; url?: string | null; size?: number; style?: React.CSSProperties }) {
  return (
    <div className="logo" style={{ width: size, height: size, borderRadius: Math.round(size * 0.27), background: "var(--crasto-bg-3)", color: "var(--crasto-text-primary)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: Math.round(size * 0.38), overflow: "hidden", flexShrink: 0, ...style }}>
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(name)}
    </div>
  );
}

export function PageHead({ eyebrow = "Portal", title, sub, right }: { eyebrow?: string; title: string; sub?: string; right?: ReactNode }) {
  const t = useT();
  return (
    <div className={right ? "phead-row" : ""}>
      <div className="phead">
        <div className="ey">{t(eyebrow)}</div>
        <h1>{t(title)}</h1>
        {sub && <div className="sub">{t(sub)}</div>}
      </div>
      {right && <div className="hactions">{right}</div>}
    </div>
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
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then((d) => { if (alive) { setData(d); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
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
