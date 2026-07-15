import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { previewOrgId } from "./preview";

const API_URL = (import.meta.env.VITE_API_URL as string) || "https://portal-api.4hqjjr.easypanel.host";

/**
 * Consome um SSE da Portal API — a tela atualiza sozinha, sem recarregar.
 *
 * Por que fetch-stream e não EventSource: o EventSource não manda cabeçalho, o que
 * obrigaria o token na URL — e token em URL vaza em log de proxy, histórico e Referer.
 * Com fetch lemos `res.body` como stream e mandamos o Bearer normalmente.
 * (Mesmo padrão do dashboard do WhatsApp CRM.)
 *
 * Reconecta sozinho: queda de rede, deploy da API ou notebook que dormiu não podem
 * deixar a tela "morta" mostrando dado velho sem avisar — daí o estado `live`.
 */
export function useStream<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [live, setLive] = useState(false);
  const [ago, setAgo] = useState(0);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    const ctrl = new AbortController();
    let stop = false;

    (async () => {
      while (!stop) {
        try {
          const { data: s } = await supabase.auth.getSession();
          const token = s.session?.access_token;
          if (!token) { await new Promise((r) => setTimeout(r, 2000)); continue; }
          const org = previewOrgId();
          const res = await fetch(`${API_URL}${path}`, {
            headers: { Authorization: "Bearer " + token, ...(org ? { "X-Preview-Org": org } : {}) },
            signal: ctrl.signal,
          });
          if (!res.ok || !res.body) throw new Error("stream " + res.status);
          setLive(true);

          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          while (!stop) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            // Um evento SSE termina em linha em branco; pode vir picado entre chunks.
            let idx;
            while ((idx = buf.indexOf("\n\n")) >= 0) {
              const evt = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              const linha = evt.split("\n").find((l) => l.startsWith("data:"));
              if (linha) {
                try {
                  setData(JSON.parse(linha.slice(5).trim()));
                  lastRef.current = Date.now();
                  setAgo(0);
                } catch { /* evento partido: o próximo vem inteiro */ }
              }
            }
          }
          if (!stop) throw new Error("stream encerrado");
        } catch (e: any) {
          if (stop || e?.name === "AbortError") return;
          setLive(false);
          await new Promise((r) => setTimeout(r, 3000)); // espera e tenta de novo
        }
      }
    })();

    return () => { stop = true; ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Rótulo "há Xs" — só o contador, sem refazer chamada.
  useEffect(() => {
    const t = setInterval(() => { if (lastRef.current) setAgo(Math.floor((Date.now() - lastRef.current) / 1000)); }, 1000);
    return () => clearInterval(t);
  }, []);

  return { data, live, ago };
}
