import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, KeyRound, Copy, Check, ShieldCheck } from "lucide-react";
import { services } from "../../services";
import { supabase } from "../../lib/supabase";
import { useT } from "../../lib/i18n";

/**
 * MÓDULO EMBARCADO — abre qualquer módulo DENTRO do Portal (tela cheia, "Voltar ao Portal"),
 * do mesmo jeito que o WhatsApp CRM. Genérica de propósito: hoje o destino é um app do
 * Lovable; amanhã, quando o módulo virar serviço próprio com banco separado, só muda a URL.
 *
 * Verificado antes de construir: apps do Lovable NÃO bloqueiam iframe (não mandam
 * X-Frame-Options nem CSP frame-ancestors). Se um destino específico bloquear, a tela avisa
 * e oferece abrir em nova aba — nunca deixa o cliente olhando para um quadro branco.
 *
 * MÉTRICA: abre uma sessão ao entrar, pulsa a cada minuto e fecha ao sair. É o que permite
 * responder "quem usou qual módulo e por quanto tempo" mesmo com o login compartilhado da
 * empresa lá no destino — o destino não sabe distinguir as pessoas, mas o Portal sabe.
 */
export default function ModuleEmbed() {
  const t = useT();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>(); // client_module_id (a INSTÂNCIA, não o módulo)
  const [mod, setMod] = useState<{ nome: string; url: string | null; cred: any | null; sso: boolean; token: string | null } | null>(null);
  const [err, setErr] = useState("");
  const [segredo, setSegredo] = useState<{ login: string | null; senha: string } | null>(null);
  const [copiado, setCopiado] = useState("");
  const sessRef = useRef<string | null>(null);

  // A senha fica no servidor, cifrada, e só é revelada a pedido — mesma RPC de "Minhas
  // Soluções". A diferença é o LUGAR: aqui, sem tirar a pessoa da tela do módulo.
  async function revelar(credId: string, login: string | null) {
    const pw = await services.analytics.client.revealModuleSecret<string>(credId).catch(() => null);
    setSegredo({ login, senha: pw ?? "—" });
  }
  function copiar(txt: string, tag: string) {
    navigator.clipboard?.writeText(txt);
    setCopiado(tag); setTimeout(() => setCopiado(""), 1500);
  }

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [cms, creds] = await Promise.all([
          services.delivery.clientModules.listMine() as Promise<any[]>,
          services.delivery.moduleCredentials.listMine().catch(() => [] as any[]) as Promise<any[]>,
        ]);
        const inst = (cms || []).find((c) => c.id === id);
        // Não achou = não liberado para ESTE usuário (a permissão por usuário já filtra a lista).
        if (!inst) { if (vivo) setErr(t("Este módulo não está liberado para o seu acesso.")); return; }
        const cred = (creds || []).find((c) => c.client_module_id === id) || null;
        // Social Media (solução própria): a URL vem do catálogo (social_url) e o login é POR SSO —
        // o Portal injeta o próprio JWT no módulo (via #token, que o app lê e limpa da URL).
        const isSocial = !!inst.social_solution;
        const url = (cred?.access_url || inst.crm_url || inst.social_url || null) as string | null;
        let token: string | null = null;
        if (isSocial) { const { data } = await supabase.auth.getSession(); token = data.session?.access_token ?? null; }
        if (vivo) setMod({ nome: inst.label || t("Módulo"), url, cred, sso: isSocial, token });
        if (!url) return; // sem URL não há o que medir: o módulo ainda está em configuração

        const s = await services.delivery.moduleSessions.open(id!, inst.access_mode || (isSocial ? "sso" : "embed")).catch(() => null);
        if (s?.id) sessRef.current = s.id;
      } catch (e: any) {
        if (vivo) setErr(e?.message || t("Não foi possível abrir o módulo."));
      }
    })();
    return () => { vivo = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Heartbeat + fechamento. O `pagehide` cobre fechar a aba/navegar para fora (o `unmount`
  // sozinho não roda nesses casos); o retorno do efeito cobre a navegação interna do Portal.
  useEffect(() => {
    const pulso = setInterval(() => { if (sessRef.current) services.delivery.moduleSessions.ping(sessRef.current).catch(() => {}); }, 60_000);
    const fechar = () => { if (sessRef.current) { services.delivery.moduleSessions.close(sessRef.current).catch(() => {}); sessRef.current = null; } };
    window.addEventListener("pagehide", fechar);
    return () => { clearInterval(pulso); window.removeEventListener("pagehide", fechar); fechar(); };
  }, []);

  const cred = mod?.cred;
  const pedeLogin = !!cred?.login && !cred?.sso_enabled;

  const topo = (
    <div className="crm-fs-top">
      <button className="crm-back" onClick={() => navigate("/app/modulos")}><ChevronLeft size={16} /> {t("Voltar ao Portal")}</button>
      <span className="crm-fs-title">{mod?.nome || t("Módulo")}</span>
      {(cred?.sso_enabled || mod?.sso) && (
        <span className="mod-cred-sso"><ShieldCheck size={13} /> {t("Entra direto")}</span>
      )}
      {/* Credencial DENTRO da tela: o módulo (ainda no Lovable) tem login próprio, e mandar a
          pessoa a outra página só para copiar a senha quebraria justamente o fluxo que este
          embed veio consertar. Quando o módulo migrar para a nossa base, entra SSO e esta
          barra some sozinha — é por isso que ela depende de `login && !sso`. */}
      {pedeLogin && !segredo && (
        <button className="crm-back" style={{ marginLeft: "auto" }} onClick={() => revelar(cred.id, cred.login)}>
          <KeyRound size={14} /> {t("Login e senha")}
        </button>
      )}
      {segredo && (
        <div className="mod-cred">
          <span className="mod-cred-item"><b>{segredo.login || "—"}</b>
            <button className="icobtn" title={t("Copiar")} onClick={() => copiar(segredo.login || "", "l")}>{copiado === "l" ? <Check size={12} /> : <Copy size={12} />}</button>
          </span>
          <span className="mod-cred-item"><b>{segredo.senha}</b>
            <button className="icobtn" title={t("Copiar")} onClick={() => copiar(segredo.senha, "s")}>{copiado === "s" ? <Check size={12} /> : <Copy size={12} />}</button>
          </span>
        </div>
      )}
    </div>
  );

  if (err) return <div className="crm-fs">{topo}<div className="crm-fs-msg">{err}</div></div>;
  if (!mod) return <div className="crm-fs">{topo}<div className="crm-fs-msg">{t("Abrindo o módulo…")}</div></div>;
  if (!mod.url) {
    // Honestidade: módulo liberado mas ainda sem endereço. Antes ele simplesmente sumia do menu.
    return (
      <div className="crm-fs">{topo}
        <div className="crm-fs-msg">
          <strong>{t("Módulo em configuração.")}</strong><br />
          {t("A Crasto.AI já liberou este módulo para você; o acesso é publicado assim que a configuração terminar.")}
        </div>
      </div>
    );
  }
  // SSO embarcado: o JWT do Portal viaja no fragmento (#token) — não é query string, não vai ao
  // servidor, e o app o lê e o apaga da URL no boot. O postMessage no onLoad é reforço (caso o
  // app já tenha montado o listener). Só para módulo social (nossa solução), nunca para terceiros.
  const frameSrc = mod.sso && mod.token ? `${mod.url}#token=${encodeURIComponent(mod.token)}` : mod.url;
  const origin = (() => { try { return new URL(mod.url).origin; } catch { return "*"; } })();
  return (
    <div className="crm-fs">{topo}
      <iframe
        title={mod.nome}
        src={frameSrc}
        className="crm-fs-frame"
        allow="clipboard-write; microphone; camera; autoplay"
        onLoad={(e) => {
          if (mod.sso && mod.token && origin !== "*") {
            try { (e.currentTarget as HTMLIFrameElement).contentWindow?.postMessage({ type: "crasto-token", token: mod.token }, origin); } catch { /* ignore */ }
          }
        }}
      />
    </div>
  );
}
