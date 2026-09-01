import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Expiração por INATIVIDADE.
 *
 * Por que existe: o token do Supabase dura 1h, mas o refresh token se renova sozinho
 * — na prática a sessão nunca morria. Quem esquece o portal aberto num computador
 * compartilhado fica logado para sempre.
 *
 * Regras (decisão do Crasto): 1 hora parado → aviso "Ainda está aí?" com 30s para
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
// Reunião SR Brasil (01/09): o logout a cada 30 min derrubava a equipe o dia todo (re-login
// constante). Subimos para 12h — na prática ninguém cai durante o expediente; só uma inatividade
// LONGA (madrugada / máquina esquecida) fecha a sessão, mantendo a segurança e o relógio de ponto
// (o servidor carimba logout_at = last_active_at, então as horas seguem corretas). GLOBAL.
export const IDLE_MS = 12 * 60 * 60 * 1000; // 12h parado → pergunta (servidor também enforça 12h)
export const WARN_MS = 30 * 1000;      // 30s para responder → sai

const agora = () => Date.now();

export function marcarAtividade() {
  try { localStorage.setItem(KEY, String(agora())); } catch { /* aba privada: cai no fallback abaixo */ }
}

export function ultimaAtividade(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    if (Number.isFinite(v) && v > 0) return v;
  } catch { /* ignora */ }
  return null;
}

/**
 * @param ativo  só vigia quando há sessão (não faz sentido na tela de login)
 * @param sair   o que fazer quando o tempo acaba (logout de verdade)
 */
export function useIdleGuard(ativo: boolean, sair: (motivo: "inatividade" | "escolha") => void) {
  const [avisando, setAvisando] = useState(false);
  const [restante, setRestante] = useState(Math.ceil(WARN_MS / 1000));
  const avisandoRef = useRef(false);
  const avisoDesdeRef = useRef(0); // quando o aviso APARECEU (base dos 30s, não o relógio absoluto)
  const saindoRef = useRef(false);
  const sairRef = useRef(sair);
  sairRef.current = sair;

  useEffect(() => {
    if (!ativo) { setAvisando(false); avisandoRef.current = false; avisoDesdeRef.current = 0; saindoRef.current = false; return; }
    // NÃO marcamos atividade aqui: montar não é interagir. Se marcássemos, um F5
    // (ou o navegador recarregando a aba sozinho) zeraria o contador e a sessão
    // voltaria a durar para sempre. Quem marca é o login e a interação de verdade.
    if (ultimaAtividade() === null) marcarAtividade(); // 1ª vez neste navegador

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
    const eventos = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"];
    eventos.forEach((e) => window.addEventListener(e, aoInteragir, { passive: true }));

    // Bridge: o CRM embarcado em iframe cross-origin posta 'crasto-activity' quando
    // o usuário interage lá. Sem isso o Portal conta inatividade enquanto o CRM é usado.
    const aoMensagem = (ev: MessageEvent) => {
      if (ev.data?.type === "crasto-activity") aoInteragir();
    };
    window.addEventListener("message", aoMensagem);

    const tick = () => {
      const ultima = ultimaAtividade();
      if (ultima === null) return;
      const parado = agora() - ultima;
      if (parado >= IDLE_MS) {
        // Cruzou o limite de inatividade: MOSTRA o aviso e só ENTÃO começa a contar os
        // 30s — a partir de quando o aviso apareceu, não do relógio absoluto. Por que:
        // um navegador estrangula o setInterval de uma aba em SEGUNDO PLANO para ~1x/min.
        // Com a conta absoluta antiga, o tick pulava de "29:50 (sem aviso)" direto para
        // "30:55 (logout)" e o usuário caía SEM NUNCA ver o aviso. Agora o aviso é
        // "pegajoso": na 1ª vez que o tick vê o limite, ele aparece e garante os 30s
        // inteiros — inclusive quando o usuário VOLTA para a aba (o visibilitychange
        // dispara um tick na hora). É a garantia de "sempre avisa antes de fechar".
        if (!avisandoRef.current) {
          avisandoRef.current = true;
          avisoDesdeRef.current = agora();
          setAvisando(true);
        }
        const faltamMs = WARN_MS - (agora() - avisoDesdeRef.current);
        if (faltamMs <= 0) {
          if (saindoRef.current) return;
          saindoRef.current = true;
          sairRef.current("inatividade");
        } else {
          setRestante(Math.max(0, Math.ceil(faltamMs / 1000)));
        }
      } else if (avisandoRef.current) {
        // outra aba respondeu "Sim" (ou houve atividade lá): o aviso some aqui também
        avisandoRef.current = false;
        avisoDesdeRef.current = 0;
        setAvisando(false);
      }
    };
    const id = setInterval(tick, 1000);
    // Voltar de outra aba/do sono: confere na hora, sem esperar o próximo tick. E se o aviso
    // já tinha aparecido enquanto a aba estava em segundo plano, REINICIA os 30s a partir de
    // agora — a pessoa só está VENDO o aviso neste momento, tem de ter a chance justa de
    // responder (não cair no logout no primeiro tick de volta). Não enfraquece a segurança:
    // uma aba de fato abandonada nunca dispara este evento e sai no tick estrangulado.
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && avisandoRef.current) avisoDesdeRef.current = agora();
      tick();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      clearInterval(id);
      eventos.forEach((e) => window.removeEventListener(e, aoInteragir));
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("message", aoMensagem);
    };
  }, [ativo]);

  const continuar = useCallback(() => {
    marcarAtividade();
    avisandoRef.current = false;
    avisoDesdeRef.current = 0;
    setAvisando(false);
  }, []);

  return { avisando, restante, continuar };
}
