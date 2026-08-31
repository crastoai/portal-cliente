import { useEffect, useState } from "react";

// Hook de leitura da API com STALE-WHILE-REVALIDATE — igual ao do CRM (wacrm).
//
// Problema: cada tela buscava tudo do zero a cada navegação → "tela em branco → carrega" toda
// vez, somando o round-trip de várias chamadas. O dado é rápido; o incômodo é a ESPERA repetida.
//
// Solução (sem perder tempo real): cache em MEMÓRIA por sessão da aba. Ao reabrir uma tela, o
// dado aparece NA HORA (do cache) e revalida em 2º plano — o número certo chega em seguida.
// Nunca é dado velho parado: toda montagem dispara o fetch fresco; o cache só evita o branco.
//
// ESCOPO: não precisa entrar na chave. Ver o sistema como outra pessoa é impersonação, que troca
// a sessão e RECARREGA a página — este cache é de memória, então morre junto. Não há como o dado
// de uma identidade sobreviver para a seguinte.
const mem = new Map<string, unknown>();
const MAX = 120; // teto do cache (evita crescer sem fim); descarta o mais antigo.

export function useFetch<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  let autoKey = "";
  try { autoKey = fn.toString() + "|" + JSON.stringify(deps); } catch { autoKey = ""; }

  const read = (): T | null => {
    if (autoKey && mem.has(autoKey)) return mem.get(autoKey) as T;
    return null;
  };

  const [data, setData] = useState<T | null>(read);
  const [loading, setLoading] = useState<boolean>(() => read() == null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    const cached = read();
    if (cached != null) { setData(cached); setLoading(false); } else { setLoading(true); }
    setError(null);
    fn()
      .then((d) => {
        if (!live) return;
        setData(d);
        if (autoKey) {
          if (mem.size >= MAX && !mem.has(autoKey)) { const k = mem.keys().next().value; if (k !== undefined) mem.delete(k); }
          mem.set(autoKey, d);
        }
      })
      .catch((e) => live && setError(e?.message || String(e)))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, autoKey]);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}
