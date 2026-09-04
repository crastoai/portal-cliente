import { useEffect, useRef, useState } from "react";
import { mktApi } from "../../../lib/mktApi";
import { MktModal } from "./_ui";

// ============================================================================
// Contas conectadas (via Post for Me) — conexão das redes sociais do cliente.
// MULTI-TENANT: cada empresa só vê/gerencia as contas DELA (o back amarra por
// org via external_id, resolvido na sessão; o front nunca passa o org). Conectar
// abre o OAuth da rede numa janela; ao autorizar, detectamos por polling.
// Reutilizável: usado no Calendário e (depois) em Agendamento & Automação.
// ============================================================================

const PLATFORMS = [
  { key: "instagram", label: "Instagram", ic: "ig", abbr: "IG", connType: "instagram" },
  { key: "facebook", label: "Facebook", ic: "fb", abbr: "f" },
  { key: "tiktok", label: "TikTok", ic: "tt", abbr: "TT" },
  { key: "linkedin", label: "LinkedIn", ic: "li", abbr: "in" },
  { key: "youtube", label: "YouTube", ic: "yt", abbr: "▶" },
];

type Acc = { id: string; platform: string; username?: string; status: string; profile_photo_url?: string | null };

export function ChannelsPanel({ flash }: { flash: (m: string) => void }) {
  const [accounts, setAccounts] = useState<Acc[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const poll = useRef<number | undefined>(undefined);

  async function load() {
    try { const r = await mktApi.get<any>("/marketing/channels"); setEnabled(!!r.enabled); setAccounts(r.accounts || []); }
    catch { setAccounts([]); }
  }
  useEffect(() => { load(); return () => { if (poll.current) window.clearInterval(poll.current); }; }, []);

  function startPoll() {
    if (poll.current) window.clearInterval(poll.current);
    let n = 0;
    poll.current = window.setInterval(() => { n++; load(); if (n > 30) { window.clearInterval(poll.current); poll.current = undefined; } }, 4000);
  }

  async function connect(p: typeof PLATFORMS[number]) {
    setBusy(p.key);
    try {
      const r = await mktApi.post<any>("/marketing/channels/connect", { platform: p.key, connectionType: p.connType });
      if (r?.url) {
        window.open(r.url, "_blank", "width=560,height=760");
        flash("Conclua a conexão na janela que abriu — depois volte aqui.");
        startPoll();
      } else {
        flash(r?.error === "rede em configuração" ? p.label + " em configuração — em breve." : (r?.error || "Não foi possível iniciar a conexão."));
      }
    } catch { flash("Não foi possível iniciar a conexão agora."); } finally { setBusy(null); }
  }

  async function disconnect(id: string) {
    try { await mktApi.post("/marketing/channels/disconnect", { id }); flash("Rede desconectada"); load(); }
    catch { flash("Não foi possível desconectar agora."); }
  }

  // conectada = presente para aquela rede e não em estado quebrado (o back já
  // marca `connected`); tolerante aos vários status que o Post for Me devolve
  const connectedOf = (key: string) => (accounts || []).find((a: any) => String(a.platform).toLowerCase() === key && a.connected !== false && !["disconnected", "error", "revoked", "expired"].includes(String(a.status || "").toLowerCase()));

  if (!enabled) return <div className="ap-hint">Conexão de redes em configuração. Em breve você poderá conectar Instagram, Facebook e outras.</div>;

  return (
    <>
      <div className="ap-accounts">
        {PLATFORMS.map((p) => {
          const acc = connectedOf(p.key);
          return (
            <div className="ap-acc" key={p.key}>
              <span className={"ap-ic " + p.ic}>{p.abbr}</span>
              <div className="ap-acc-n">{p.label}</div>
              {acc ? (
                <div className="ap-acc-s on">{acc.username ? "@" + String(acc.username).replace(/^@/, "") : "conectado"}<button className="ap-disc" onClick={() => disconnect(acc.id)}>desconectar</button></div>
              ) : (
                <>
                  <div className="ap-acc-s off">não conectado</div>
                  <button className="ap-connect" disabled={busy === p.key} onClick={() => connect(p)}>{busy === p.key ? "Abrindo…" : "Conectar"}</button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="ap-hint">Conecte pelo menos 1 rede. A gente só publica onde você aprovar. Cada empresa vê e gerencia apenas as suas próprias contas.</div>
    </>
  );
}

// Modal que embrulha o painel (usado pelo botão "Redes conectadas").
export function ChannelsModal({ onClose, flash }: { onClose: () => void; flash: (m: string) => void }) {
  return (
    <MktModal title="Contas conectadas (redes sociais)" onClose={onClose} footer={<button className="bk-mini pri" onClick={onClose}>Fechar</button>}>
      <ChannelsPanel flash={flash} />
    </MktModal>
  );
}
