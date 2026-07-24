import { useState } from "react";
import { MessageCircle, Mail, ShieldCheck, Sparkles, Paperclip, X } from "lucide-react";
import { services, errorMessage } from "../../services";
import { PageHead, Empty, useAsync, Pill, Field } from "../../ui/ui";
import { useSettings } from "../../lib/settings";
import { useAuth } from "../../lib/auth";
import { preview } from "../../lib/preview";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";

type Anexo = { name: string; key: string; url: string; isImg: boolean };

type Hours = { period: string; plan_hours: number; used_hours: number; balance: number; status: string };
type Ticket = { id: string; subject: string; status: string };

const stLabel = (s: string) => ({ open: "Aberto", in_progress: "Em andamento", resolved: "Resolvido", closed: "Fechado" } as any)[s] || s;
const stTone = (s: string) => (s === "resolved" || s === "closed" ? "ok" : s === "in_progress" ? "warn" : "info");

export default function Suporte() {
  const { supportWhatsapp } = useSettings();
  const t = useT();
  const { data, reload } = useAsync(async () => {
    const [h, t] = await Promise.all([
      services.analytics.client.supportHours<Hours[]>(),
      services.support.tickets.listMine(),
    ]);
    const hours = (h ?? [])[0] ?? null;
    return { hours, tickets: (t as unknown as Ticket[]) ?? [] };
  }, []);
  const hours = data?.hours ?? null;
  const usedPct = hours ? Math.min(100, (Number(hours.used_hours) / Math.max(1, Number(hours.plan_hours))) * 100) : 0;

  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ subject: "", description: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [toast, setToast] = useState("");
  const [files, setFiles] = useState<Anexo[]>([]);
  const [uploading, setUploading] = useState(0);

  // Anexos (prints): sobem para o R2 na hora; guardamos {name, key, url}. Aceita imagem e PDF.
  async function addFiles(list: File[]) {
    const orgId = profile?.organization_id || preview.orgId() || "support";
    const ok = list.filter((x) => /^image\//.test(x.type) || x.type === "application/pdf");
    if (list.length && !ok.length) { setErr(t("Só aceitamos imagens ou PDF.")); return; }
    for (const file of ok.slice(0, 8)) {
      if (file.size > 10 * 1024 * 1024) { setErr(t("Cada anexo deve ter até 10 MB.")); continue; }
      setUploading((n) => n + 1);
      try {
        const key = await services.storage.upload(orgId, file);
        const url = (await services.storage.getUrl(key)) || "";
        setFiles((fs) => [...fs, { name: file.name || "print.png", key, url, isImg: /^image\//.test(file.type) }]);
      } catch { setErr(t("Não foi possível anexar o arquivo.")); }
      finally { setUploading((n) => n - 1); }
    }
  }
  async function removeFile(i: number) {
    const anexo = files[i];
    setFiles((fs) => fs.filter((_, idx) => idx !== i));
    try { if (anexo?.key) await services.storage.remove(anexo.key); } catch { /* melhor esforço */ }
  }
  // Ctrl+V: se o clipboard tem imagem (print), captura e sobe (não atrapalha colar texto).
  function onPaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData?.items || []).filter((it) => it.type.startsWith("image/")).map((it) => it.getAsFile()).filter(Boolean) as File[];
    if (imgs.length) { e.preventDefault(); addFiles(imgs); }
  }
  async function closeModal() {
    for (const anexo of files) { try { await services.storage.remove(anexo.key); } catch { /* órfão será limpo depois */ } }
    setFiles([]); setOpen(false);
  }

  function openWhatsApp() {
    const digits = (supportWhatsapp || "").replace(/\D/g, "");
    if (!digits) { setToast(t("Canal de WhatsApp ainda não configurado.")); setTimeout(() => setToast(""), 5000); return; }
    const msg = encodeURIComponent(t("Olá! Sou cliente da Crasto.AI e preciso de ajuda com o meu portal."));
    window.open(`https://wa.me/${digits}?text=${msg}`, "_blank", "noopener");
  }

  async function submitTicket() {
    if (!f.subject.trim()) { setErr(t("Informe o assunto.")); return; }
    if (uploading > 0) { setErr(t("Aguarde o envio dos anexos terminar.")); return; }
    setBusy(true); setErr("");
    try {
      // URL assinada FRESCA por anexo (o Resend baixa dela para anexar no e-mail do suporte).
      const attachments = await Promise.all(files.map(async (a) => ({ name: a.name, key: a.key, url: (await services.storage.getUrl(a.key).catch(() => a.url)) || a.url })));
      const r = await services.support.tickets.open({ subject: f.subject.trim(), description: f.description, attachments });
      if (!r.ok) { setErr(r.error || t("Não foi possível abrir o chamado.")); return; }
      setOpen(false); setF({ subject: "", description: "" }); setFiles([]); reload();
      setToast(t("✓ Chamado #{n} aberto.", { n: r.number }) + (r.confirmed ? " " + t("Enviamos uma confirmação para o seu e-mail.") : ""));
      setTimeout(() => setToast(""), 8000);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Suporte & Ajuda" sub="Abra um chamado, acompanhe seu plano e aprenda a usar cada solução." />

      <div className="grid2" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3>{t("Abrir um chamado")}</h3>
          <div className="csub">{t("Nosso time responde em até 1 dia útil.")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="arow" style={{ textAlign: "left", cursor: "pointer" }} onClick={openWhatsApp}><span className="ico" style={{ background: "#1FA855" }}><MessageCircle size={16} /></span><span><span className="t">{t("Falar no WhatsApp")}</span><br /><span className="s">{t("Resposta mais rápida")}</span></span></button>
            <button className="arow" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => { setF({ subject: "", description: "" }); setErr(""); setFiles([]); setOpen(true); }}><span className="ico" style={{ background: "var(--crasto-text-primary)" }}><Mail size={16} /></span><span><span className="t">{t("Abrir ticket por e-mail")}</span><br /><span className="s">{t("Para assuntos detalhados")}</span></span></button>
          </div>
        </div>
        <div className="card">
          <h3>{t("Meu plano de suporte")}</h3>
          <div className="csub">{hours ? t("{u}h de {p}h usadas neste mês", { u: hours.used_hours, p: hours.plan_hours }) : t("Sem plano de horas ativo")}</div>
          <div style={{ height: 10, borderRadius: 99, background: "var(--crasto-border)", overflow: "hidden", margin: "6px 0 12px" }}>
            <div style={{ height: "100%", width: `${usedPct}%`, borderRadius: 99, background: "linear-gradient(90deg,#1F8A5B,#3fae78)" }} />
          </div>
          <div style={{ fontSize: 12, color: "var(--crasto-text-body)", lineHeight: 1.7 }}>
            {t("Saldo")}: <b style={{ color: "var(--crasto-text-primary)" }}>{hours ? `${hours.balance}h` : "—"}</b>. {t("Se acabar, você pode contratar horas extras, aguardar o próximo mês ou antecipar horas (nesse caso, o mês seguinte fica sem suporte).")}
          </div>
        </div>
      </div>

      <div className="assign" style={{ marginBottom: 18 }}>
        <div className="arow"><span className="ico" style={{ background: "#1F8A5B" }}><ShieldCheck size={16} /></span><span><span className="t">{t("Suporte do Agente")}</span><br /><span className="s">{t("Manter no ar, corrigir erros e estabilidade. Incluso no seu plano.")}</span></span></div>
        <div className="arow"><span className="ico" style={{ background: "#3E6FB8" }}><Sparkles size={16} /></span><span><span className="t">{t("Suporte de Melhorias")}</span><br /><span className="s">{t("Evoluir o agente, novos fluxos e recursos. Orçado à parte.")}</span></span></div>
      </div>

      <div className="card" style={{ background: "linear-gradient(155deg,var(--crasto-navy),var(--crasto-navy-deep))", color: "#fff", marginBottom: 18 }}>
        <div style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--crasto-blue)", fontWeight: 700 }}>{t("Garantia de treinamento")}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "8px 0 6px" }}>{t("90 dias por agente")}</div>
        <div style={{ color: "rgba(255,255,255,.75)", fontSize: 12.5 }}>{t("Todo agente que entregamos tem 3 meses de treinamento para falar o seu idioma, ter a identidade da sua marca e eliminar erros.")}</div>
      </div>

      <div className="sec-h"><h2>{t("Meus chamados")}</h2></div>
      {(data?.tickets ?? []).length === 0 ? <Empty>Você ainda não abriu chamados.</Empty> : (data?.tickets ?? []).map((tk) => (
        <div className="lead" key={tk.id}><div className="av">#</div><div style={{ flex: 1 }}><div className="nm">{tk.subject}</div></div><Pill tone={stTone(tk.status)}>{t(stLabel(tk.status))}</Pill></div>
      ))}

      <Modal title={t("Abrir ticket por e-mail")} open={open} onClose={closeModal}
        footer={<><button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={closeModal}><span className="crasto-btn__label">{t("Cancelar")}</span></button><button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy || uploading > 0} onClick={submitTicket}><span className="crasto-btn__label">{busy ? t("Enviando…") : t("Enviar chamado")}</span></button></>}>
        <div onPaste={onPaste}>
          {err && <div className="formerr">{err}</div>}
          <Field label="Assunto *"><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder={t("Ex.: Meu agente não está respondendo")} /></Field>
          <Field label="Descreva o que está acontecendo"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={5} placeholder={t("Conte os detalhes: o que aconteceu, quando, prints se tiver…")} /></Field>

          <Field label={t("Anexos (prints, imagens ou PDF)")}>
            <div className="attbox" onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files || [])); }} onDragOver={(e) => e.preventDefault()}>
              <input id="ticketfile" type="file" hidden multiple accept="image/*,application/pdf" onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.currentTarget.value = ""; }} />
              <button type="button" className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => document.getElementById("ticketfile")?.click()}><span className="crasto-btn__icon"><Paperclip size={14} /></span><span className="crasto-btn__label">{t("Escolher arquivo")}</span></button>
              <span className="attbox-hint">{t("ou cole um print com Ctrl+V, ou arraste aqui")}</span>
            </div>
            {uploading > 0 && <div className="attup">{t("Enviando anexo…")}</div>}
            {files.length > 0 && (
              <div className="attlist">
                {files.map((a, i) => (
                  <div className="attchip" key={a.key}>
                    {a.isImg && a.url ? <img src={a.url} alt="" /> : <span className="attchip-ic"><Paperclip size={13} /></span>}
                    <span className="attchip-n" title={a.name}>{a.name}</span>
                    <button type="button" className="attchip-x" onClick={() => removeFile(i)} aria-label={t("Remover")}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </Field>

          <div className="note" style={{ marginTop: 4 }}><span>{t("Nosso time recebe na hora e responde em até 1 dia útil. Você recebe uma confirmação por e-mail e acompanha aqui em \"Meus chamados\".")}</span></div>
        </div>
      </Modal>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
