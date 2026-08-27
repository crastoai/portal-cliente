// ============================================================================
// WhatsApp (Evolution) — gerenciador de instâncias do Portal.
// Botão "Nova instância" → popup p/ nomear → gera o QR (Evolution API, via o proxy
// admin do backend) → o Crasto escaneia com o WhatsApp p/ conectar. Lista, reconecta e exclui.
// Base dos disparos automáticos (aniversários, follow-ups). Admin-only (guard no servidor).
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { Smartphone, Plus, Trash2, QrCode, RefreshCw, X } from "lucide-react";
import { services as api } from "../../services";
import { useAsync, useToast, Empty, Field, Pill } from "../../ui/ui";
import Modal from "../../ui/Modal";
import { useT } from "../../lib/i18n";

type Inst = { name: string; state: string };
function normalize(resp: any): Inst[] {
  const arr = Array.isArray(resp?.data) ? resp.data : Array.isArray(resp) ? resp : [];
  return arr
    .map((it: any) => {
      const i = it.instance || it;
      return { name: i.instanceName || i.name || i.id || "", state: i.state || i.connectionStatus || i.status || "unknown" };
    })
    .filter((x: Inst) => x.name);
}
const stateTone = (s: string) => (s === "open" ? "ok" : s === "connecting" ? "warn" : "mute");
const stateLabel = (s: string, t: (k: string) => string) => (s === "open" ? t("Conectado") : s === "connecting" ? t("Conectando…") : s === "close" ? t("Desconectado") : t("Aguardando"));
const qrSrc = (b64: string) => (b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`);

export default function WhatsAppInstances() {
  const t = useT();
  const toast = useToast();
  const { data, loading, reload } = useAsync(async () => normalize(await api.automation.whatsapp.instances().catch(() => ({}))), []);
  const list = data ?? [];

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrName, setQrName] = useState<string>("");
  const pollRef = useRef<any>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Enquanto o QR está na tela, verifica o estado a cada 3s; quando "open", fecha e recarrega.
  function startPolling(inst: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await api.automation.whatsapp.state(inst);
        const st = r?.data?.instance?.state || r?.data?.state;
        if (st === "open") { clearInterval(pollRef.current); pollRef.current = null; setQr(null); setOpen(false); toast.ok(t("WhatsApp conectado ✓")); reload(); }
      } catch { /* silencioso */ }
    }, 3000);
  }
  function stopPolling() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }

  async function criar() {
    const nm = name.trim();
    if (!nm) { toast.err(t("Informe o nome da instância.")); return; }
    setBusy(true); setQr(null);
    try {
      const r = await api.automation.whatsapp.create(nm);
      if (r?.ok === false) { toast.err(r.error?.message || r.error || t("Erro ao criar a instância.")); return; }
      const b64 = r?.data?.qrcode?.base64 || r?.qrcode?.base64;
      setQrName(nm);
      if (b64) { setQr(b64); startPolling(nm); } else { toast.ok(t("Instância criada. Abra o QR para conectar.")); reload(); }
    } catch { toast.err(t("Erro ao criar a instância.")); }
    finally { setBusy(false); }
  }

  async function verQr(inst: string) {
    setBusy(true); setQr(null); setQrName(inst); setOpen(true);
    try {
      const r = await api.automation.whatsapp.connect(inst);
      const b64 = r?.data?.base64 || r?.data?.qrcode?.base64;
      if (b64) { setQr(b64); startPolling(inst); } else { toast.ok(t("Sem QR — a instância pode já estar conectada.")); }
    } catch { toast.err(t("Erro ao obter o QR.")); }
    finally { setBusy(false); }
  }

  async function excluir(inst: string) {
    if (!confirm(t("Excluir a instância \"{n}\"? O WhatsApp será desconectado.", { n: inst } as any))) return;
    try { await api.automation.whatsapp.remove(inst); toast.ok(t("Instância excluída ✓")); reload(); }
    catch { toast.err(t("Erro ao excluir a instância.")); }
  }

  function fechar() { stopPolling(); setOpen(false); setQr(null); setName(""); }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <Smartphone size={16} style={{ color: "var(--crasto-text-primary)" }} />
        <h3 style={{ margin: 0 }}>{t("WhatsApp (Evolution)")}</h3>
        <span className="mt" style={{ fontSize: 11.5 }}>{t("instâncias do Portal para disparos (aniversários, follow-ups)")}</span>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" style={{ marginLeft: "auto" }} onClick={() => { setName(""); setQr(null); setQrName(""); setOpen(true); }}>
          <span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Nova instância")}</span>
        </button>
      </div>

      {loading ? <Empty>{t("Carregando…")}</Empty> : list.length === 0 ? (
        <div className="mt" style={{ padding: "6px 2px" }}>{t("Nenhuma instância ainda. Clique em \"Nova instância\" para conectar um WhatsApp.")}</div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {list.map((i) => (
            <div key={i.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--crasto-border-soft)", borderRadius: "var(--crasto-radius-md)", flexWrap: "wrap" }}>
              <Smartphone size={15} style={{ color: "var(--crasto-text-muted)", flex: "none" }} />
              <b style={{ color: "var(--crasto-text-primary)" }}>{i.name}</b>
              <Pill tone={stateTone(i.state)}>{stateLabel(i.state, t)}</Pill>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                {i.state !== "open" && <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => verQr(i.name)}><span className="crasto-btn__icon"><QrCode size={14} /></span><span className="crasto-btn__label">{t("Conectar (QR)")}</span></button>}
                <button className="iconbtn" title={t("Excluir instância")} onClick={() => excluir(i.name)}><Trash2 size={15} color="var(--crasto-red, #E74C3C)" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal title={t("Nova instância de WhatsApp")} open={open} onClose={fechar}
        footer={<>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={fechar}><span className="crasto-btn__label">{t("Fechar")}</span></button>
          {!qr && <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={criar}><span className="crasto-btn__icon"><QrCode size={14} /></span><span className="crasto-btn__label">{busy ? t("Gerando…") : t("Gerar QR")}</span></button>}
        </>}>
        {!qr ? (
          <>
            <Field label={t("Nome da instância")}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ex.: Portal Crasto")} autoFocus />
            </Field>
            <div className="mt" style={{ fontSize: 11.5, marginTop: 6 }}>{t("Dê um nome e clique em \"Gerar QR\". Depois escaneie com o WhatsApp (Aparelhos conectados) para conectar.")}</div>
          </>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 700, color: "var(--crasto-text-primary)", marginBottom: 8 }}>{qrName}</div>
            <img src={qrSrc(qr)} alt="QR" style={{ width: 260, height: 260, maxWidth: "100%", border: "1px solid var(--crasto-border-soft)", borderRadius: 12, background: "#fff", padding: 8 }} />
            <div className="mt" style={{ fontSize: 12.5, marginTop: 10 }}>{t("No WhatsApp: Aparelhos conectados → Conectar um aparelho → aponte para este QR.")}</div>
            <div className="mt" style={{ fontSize: 11.5, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 6 }}><RefreshCw size={12} /> {t("Aguardando a conexão…")}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
