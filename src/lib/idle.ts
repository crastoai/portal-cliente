import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Expiração por INATIVIDADE.
 *
 * Por que existe: o token do Supabase dura 1h, mas o refresh token se renova sozinho
 * — na prática a sessão nunca morria. Quem esquece o portal aberto num computador
 * compartilhado fica logado para sempre.
 *
 * Regras (decisão do Crasto): 10 min parado → aviso "Ainda está aí?" com 30s para
 * escolher; sem escolha, volta para a tela de entrada.
 *
 * Decisões que valem explicar:
 * - Contamos por RELÓGIO (timestamp), não por setTimeout: se a máquina dorme, o
 *   timer congela junto e a pessoa acordaria ainda logada. Comparando timestamps,
 *   voltar do sono depois de 2h derruba na hora.
 * - `lastActivity` vive no localStorage → vale para TODAS as abas. Trabalhar numa aba
 *   não derruba a outra, e clicar "Sim" numa fecha o aviso nas demais.
 * - Com o aviso na tela, mexer o mouse NÃO conta como resposta: a pessoa precisa
 *   escolher. Senão um esbarrão no mouse "responderia" por ela.
 */
const KEY = "crasto.lastActivity";
export const IDLE_MS = 10 * 60 * 1000; // 10 min parado → pergunta
export const WARN_MS = 30 * 1000;      // 30s para responder → sai

const agora = () => Date.now();

export function marcarAtividade() {
  try { localStorage.setItem(KEY, String(agora())); } catch { /* aba privada: cai no fallback abaixo */ }
}

function ultimaAtividade(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (Number.isFinite(v) && v > 0) return v;
  } catch { /* ignora */ }
  const t = agora();
  marcarAtividade();
  return t;
}

/**
 * @param ativo  só vigia quando há sessão (não faz sentido na tela de login)
 * @param sair   o que fazer quando o tempo acaba (logout de verdade)
 */
export function useIdleGuard(ativo: boolean, sair: (motivo: "inatividade" | "escolha") => void) {
  const [avisando, setAvisando] = useState(false);
  const [restante, setRestante] = useState(Math.ceil(WARN_MS / 1000));
  const avisandoRef = useRef(false);
  const saindoRef = useRef(false);
  const sairRef = useRef(sair);
  sairRef.current = sair;

  useEffect(() => {
    if (!ativo) { setAvisando(false); avisandoRef.current = false; saindoRef.current = false; return; }
    marcarAtividade();

    // Throttle: mousemove dispara centenas de vezes por segundo; escrever no
    // localStorage a cada uma é desperdício puro.
    let ultimoToque = 0;
    const aoInteragir = () => {
      if (avisandoRef.current) return; // com o aviso aberto, só o botão responde
      const t = agora();
      if (t - ultimoToque < 5000) return;
      ultimoToque = t;
      marcarAtividade();
    };
    const eventos = ["pointerdown", "keydown", "wheel", "touchstart", "scroll", "mousemove"];
    eventos.forEach((e) => window.addEventListener(e, aoInteragir, { passive: true }));

    const tick = () => {
      const parado = agora() - ultimaAtividade();
      if (parado >= IDLE_MS + WARN_MS) {
        if (saindoRef.current) return;
        saindoRef.current = true;
        sairRef.current("inatividade");
      } else if (parado >= IDLE_MS) {
        avisandoRef.current = true;
        setAvisando(true);
        setRestante(Math.max(0, Math.ceil((IDLE_MS + WARN_MS - parado) / 1000)));
      } else if (avisandoRef.current) {
        // outra aba respondeu "Sim" (ou houve atividade lá): o aviso some aqui também
        avisandoRef.current = false;
        setAvisando(false);
      }
    };
    const id = setInterval(tick, 1000);
    // Voltar de outra aba/do sono: confere na hora, sem esperar o próximo tick.
    const aoVoltar = () => tick();
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      clearInterval(id);
      eventos.forEach((e) => window.removeEventListener(e, aoInteragir));
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [ativo]);

  const continuar = useCallback(() => {
    marcarAtividade();
    avisandoRef.current = false;
    setAvisando(false);
  }, []);

  return { avisando, restante, continuar };
}
