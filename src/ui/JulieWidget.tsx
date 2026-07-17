import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Sparkles, X, Paperclip, Mic, Send, Square, FileText } from "lucide-react";
import "../styles/julie.css";

// Julie — a CFO de IA da Crasto.AI. Botão-círculo no canto inferior direito de TODO o admin.
// 3 entradas: texto, anexo (PDF/imagem — NF, contrato) e áudio. Fala com /api/assistant/chat.
type Anexo = { mime: string; data: string; name: string };
type Pending = { kind: string; payload: any; resumo: string };
type CardState = "pending" | "busy" | "done" | "error" | "cancelled";
type Msg = { role: "user" | "assistant"; text: string; anexos?: { name: string }[]; pending?: Pending; card?: CardState; cardMsg?: string };
const MAX_MB = 15; // request inline do Gemini ~20MB; deixamos folga p/ histórico

async function paraB64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(new Error("falha ao ler arquivo")); r.readAsDataURL(blob); });
}

export default function JulieWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight); }, [msgs, busy]);
  useEffect(() => { const el = taRef.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 110) + "px"; } }, [input]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fs = Array.from(e.target.files || []); e.target.value = "";
    for (const f of fs) {
      if (f.size > MAX_MB * 1024 * 1024) { setErr(`"${f.name}" passa de ${MAX_MB}MB — envie um arquivo menor.`); continue; }
      try { const data = await paraB64(f); setAnexos((a) => [...a, { mime: f.type || "application/octet-stream", data, name: f.name }]); }
      catch { setErr("Não consegui ler " + f.name); }
    }
  }
  async function startRec() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
      recRef.current = mr; chunks.current = [];
      mr.ondataavailable = (ev) => chunks.current.push(ev.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        try { const data = await paraB64(blob); setAnexos((a) => [...a, { mime: blob.type, data, name: "áudio" }]); } catch { setErr("Falha ao processar o áudio."); }
      };
      mr.start(); setRec(true);
    } catch { setErr("Não consegui acessar o microfone."); }
  }
  function stopRec() { recRef.current?.stop(); setRec(false); }

  async function enviar() {
    const texto = input.trim();
    if ((!texto && !anexos.length) || busy) return;
    setErr("");
    const enviados = anexos;
    const next: Msg[] = [...msgs, { role: "user", text: texto, anexos: enviados.map((a) => ({ name: a.name })) }];
    setMsgs(next); setInput(""); setAnexos([]); setBusy(true);
    try {
      // histórico vai só como texto; os anexos (base64) só na última mensagem (não reenvia antigos).
      const payload = next.map((m, i) =>
        i === next.length - 1
          ? { role: "user", text: texto, attachments: enviados.map((a) => ({ mime: a.mime, data: a.data })) }
          : { role: m.role, text: m.text });
      // Se o admin está na ficha de um cliente (/admin/cliente/:id), a Julie recebe esse
      // contexto — aí um contrato social anexado já preenche ESSE cliente.
      const mCli = window.location.pathname.match(/\/admin\/cliente\/([0-9a-f-]{36})/i);
      const contexto = mCli ? { organization_id: mCli[1] } : undefined;
      const r = await api.post<{ reply: string; pending?: Pending }>("/api/assistant/chat", { messages: payload, contexto });
      setMsgs((m) => [...m, { role: "assistant", text: r.reply, pending: r.pending || undefined, card: r.pending ? "pending" : undefined }]);
    } catch (e: any) { setErr(e?.message || "Falha ao falar com a Julie."); }
    finally { setBusy(false); }
  }

  // Confirmar/Cancelar a ação PROPOSTA pela Julie — só aqui grava (via /execute + Auditoria).
  const setCard = (idx: number, card: CardState, cardMsg?: string) => setMsgs((x) => x.map((m, i) => (i === idx ? { ...m, card, cardMsg } : m)));
  async function confirmar(idx: number) {
    const m = msgs[idx]; if (!m?.pending || m.card !== "pending") return;
    setCard(idx, "busy");
    try { await api.post("/api/assistant/execute", { kind: m.pending.kind, payload: m.pending.payload }); setCard(idx, "done", "Lançado no financeiro"); }
    catch (e: any) { setCard(idx, "error", e?.message || "Não consegui lançar."); }
  }
  function cancelar(idx: number) { setCard(idx, "cancelled"); }

  return (
    <>
      {!open && (
        <button className="julie-fab" onClick={() => setOpen(true)} aria-label="Abrir a Julie (assistente financeira)">
          <Sparkles size={22} />
        </button>
      )}
      {open && (
        <div className="julie-panel" role="dialog" aria-label="Julie — assistente financeira">
          <div className="julie-head">
            <div className="julie-id"><span className="julie-av"><Sparkles size={15} /></span><div className="julie-idt"><b>Julie</b><span>CFO · assistente financeira</span></div></div>
            <button className="julie-x" onClick={() => setOpen(false)} aria-label="Fechar"><X size={18} /></button>
          </div>
          <div className="julie-body" ref={bodyRef}>
            {msgs.length === 0 && (
              <div className="julie-hi">
                Oi! Sou a <b>Julie</b>, sua CFO de IA. Posso te dar o panorama do financeiro, ou ler uma <b>nota fiscal</b>/<b>contrato</b> que você anexar e organizar os dados.<br /><br />
                Nesta fase eu <b>ainda não gravo nada</b> — preparo e te mostro para conferir. É só perguntar, anexar ou mandar um áudio.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={"julie-msg " + m.role}>
                {m.anexos?.map((a, j) => <div key={j} className="julie-anexo"><FileText size={13} /> {a.name}</div>)}
                {m.text && <div className="julie-bubble">{m.text}</div>}
                {m.pending && m.card && (
                  <div className={"julie-card is-" + m.card}>
                    <div className="julie-card-h"><Sparkles size={13} /> Confirmar ação no financeiro</div>
                    <div className="julie-card-b">{m.pending.resumo}</div>
                    {m.card === "pending" && (
                      <div className="julie-card-f">
                        <button className="jc-no" onClick={() => cancelar(i)}>Cancelar</button>
                        <button className="jc-yes" onClick={() => confirmar(i)}>Confirmar e lançar</button>
                      </div>
                    )}
                    {m.card === "busy" && <div className="julie-card-s">Lançando…</div>}
                    {m.card === "done" && <div className="julie-card-s ok">✓ {m.cardMsg}</div>}
                    {m.card === "error" && <div className="julie-card-s err">{m.cardMsg}</div>}
                    {m.card === "cancelled" && <div className="julie-card-s">Cancelado — nada foi gravado.</div>}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="julie-msg assistant"><div className="julie-bubble julie-typing"><span /><span /><span /></div></div>}
          </div>
          {err && <div className="julie-err">{err}</div>}
          {anexos.length > 0 && (
            <div className="julie-chips">
              {anexos.map((a, i) => <span key={i} className="julie-chip"><FileText size={12} /> {a.name}<button onClick={() => setAnexos((x) => x.filter((_, j) => j !== i))} aria-label="Remover">×</button></span>)}
            </div>
          )}
          <div className="julie-composer">
            <input ref={fileRef} type="file" hidden multiple onChange={onFile} accept="image/*,application/pdf,audio/*" />
            <button className="julie-ic" title="Anexar documento" onClick={() => fileRef.current?.click()}><Paperclip size={18} /></button>
            {rec
              ? <button className="julie-ic is-rec" title="Parar gravação" onClick={stopRec}><Square size={15} /></button>
              : <button className="julie-ic" title="Gravar áudio" onClick={startRec}><Mic size={18} /></button>}
            <textarea ref={taRef} className="julie-input" value={input} rows={1} placeholder={rec ? "Gravando áudio…" : "Pergunte ou peça algo do financeiro…"} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
            <button className="julie-send" disabled={busy || (!input.trim() && !anexos.length)} onClick={enviar} aria-label="Enviar"><Send size={16} /></button>
          </div>
        </div>
      )}
    </>
  );
}
