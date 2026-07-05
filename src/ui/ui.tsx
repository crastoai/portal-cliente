import { useEffect, useState, type ReactNode } from "react";

export function money(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
export function initials(s?: string | null) {
  return (s || "?").trim().slice(0, 2).toUpperCase();
}

export function PageHead({ eyebrow = "Portal", title, sub, right }: { eyebrow?: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className={right ? "phead-row" : ""}>
      <div className="phead">
        <div className="ey">{eyebrow}</div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right && <div className="hactions">{right}</div>}
    </div>
  );
}

export function Pill({ tone = "mute", children }: { tone?: string; children: ReactNode }) {
  return <span className={"pill " + tone}><span className="d" />{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then((d) => { if (alive) { setData(d); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

export function Loader() {
  return <div className="empty">Carregando…</div>;
}
