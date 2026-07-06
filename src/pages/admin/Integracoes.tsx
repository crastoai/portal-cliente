import { useState } from "react";
import { Plug, Settings2 } from "lucide-react";
import { services as api, errorMessage } from "../../services";
import { PageHead, Pill, useAsync, Field } from "../../ui/ui";
import Modal from "../../ui/Modal";

type Integ = { key: string; display_name: string; status: string };
type Status = Record<string, { status: string; has_secret: boolean; from_addr: string | null }>;

// integrações que usam remetente de e-mail (mostram o campo "remetente")
const EMAIL_KEYS = new Set(["resend_email"]);
// dica de onde obter a chave, por integração
const HINTS: Record<string, string> = {
  resend_email: "Chave de API do Resend (começa com re_). Para enviar de no-reply@crasto.ai, verifique o domínio crasto.ai no Resend.",
  openai: "Chave da OpenAI (sk-...).", anthropic: "Chave da Anthropic (sk-ant-...).",
  asaas: "Chave de API do Asaas (produção).", stripe: "Secret key do Stripe (sk_live_...).",
  whatsapp_official: "Token da WhatsApp Cloud API (Meta).", autentique: "Token da Autentique.",
  cloudflare_r2: "Configurado via secrets do servidor.",
};

export default function Integracoes() {
  const { data, reload } = useAsync(async () => {
    const [list, st] = await Promise.all([
      api.automation.integrations.list(),
      api.automation.integrations.status().catch(() => ({} as Status)),
    ]);
    return { items: (list as unknown as Integ[]) ?? [], st: (st as Status) ?? {} };
  }, []);
  const items = data?.items ?? []; const st = data?.st ?? {};

  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState<Integ | null>(null);
  const [secret, setSecret] = useState(""); const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [toast, setToast] = useState("");

  const tone = (s: string) => (s === "connected" ? "ok" : s === "error" ? "warn" : "mute");
  const label = (s: string) => (s === "connected" ? "Conectado" : s === "error" ? "Ação necessária" : "Desconectado");

  function openCfg(i: Integ) { setCur(i); setSecret(""); setFrom(st[i.key]?.from_addr ?? ""); setErr(""); setOpen(true); }
  async function save() {
    if (!cur) return;
    setBusy(true); setErr("");
    try {
      await api.automation.integrations.configure(cur.key, secret, from, "connected");
      setOpen(false); reload();
      setToast(`${cur.display_name} configurado ✓`); setTimeout(() => setToast(""), 5000);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    if (!cur) return;
    setBusy(true); setErr("");
    try {
      await api.automation.integrations.configure(cur.key, "", from, "disconnected");
      setOpen(false); reload();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  const isEmail = cur ? EMAIL_KEYS.has(cur.key) : false;
  const hasKey = cur ? !!st[cur.key]?.has_secret : false;

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Integrações & pagamentos" sub="Conecte as tecnologias que o portal usa. As chaves ficam no cofre — nunca no navegador." />
      <div className="assign">
        {items.map((i) => (
          <div className="arow" key={i.key}>
            <span className="ico" style={{ background: i.status === "connected" ? "#1F8A5B" : "var(--crasto-navy)" }}><Plug size={16} /></span>
            <span><span className="t">{i.display_name}</span><br /><span className="s">{i.key}{st[i.key]?.has_secret ? " · chave salva" : ""}</span></span>
            <Pill tone={tone(i.status)}>{label(i.status)}</Pill>
            <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" style={{ marginLeft: 10 }} onClick={() => openCfg(i)}>
              <span className="crasto-btn__icon"><Settings2 size={14} /></span><span className="crasto-btn__label">Configurar</span>
            </button>
          </div>
        ))}
      </div>
      <div className="note" style={{ marginTop: 22 }}><span>Gateway de pagamento escolhido: <b>Asaas</b> (menor taxa para Pix/boleto no Brasil). <b>Autentique</b> para contratos. <b>Resend</b> para e-mails do portal.</span></div>

      <Modal title={cur ? `Configurar · ${cur.display_name}` : "Configurar"} open={open} onClose={() => setOpen(false)}
        footer={<>
          {hasKey && <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} onClick={disconnect} style={{ marginRight: "auto" }}><span className="crasto-btn__label">Desconectar</span></button>}
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">Cancelar</span></button>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={save}><span className="crasto-btn__label">{busy ? "Salvando…" : "Salvar & conectar"}</span></button>
        </>}>
        {err && <div className="formerr">{err}</div>}
        {cur && <div className="note" style={{ marginBottom: 14 }}><span>{HINTS[cur.key] || "Cole a chave/segredo do provedor."}</span></div>}
        <Field label={hasKey ? "Nova chave (deixe em branco p/ manter a atual)" : "Chave / segredo *"}>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={hasKey ? "•••••••• (chave salva)" : "cole a chave aqui"} autoComplete="off" />
        </Field>
        {isEmail && (
          <Field label="Remetente (from)">
            <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Crasto.AI <no-reply@crasto.ai>" />
          </Field>
        )}
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
