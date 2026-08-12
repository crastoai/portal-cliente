import { useMemo, useRef, useState } from "react";
import { UploadCloud, FileText, CheckCircle2, X, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { services, errorMessage } from "../../services";
import { money } from "../../ui/ui";

// ============================================================================
// CONCILIAÇÃO POR COMPROVANTE (IA) — Fatia 1
// O operador ARRASTA o comprovante (imagem/PDF); a IA LÊ (valor/data/hora/pagador)
// e SUGERE a parcela em aberto que casa. Nada vira "pago" sozinho: o operador
// confirma em 1 clique → grava paid_date + proof_url + proof_note na parcela
// (mesmo caminho de sempre, accounts.save). Portão de dinheiro = humano.
//
// Fatias seguintes: 2 (ler a pasta do Drive por conta de serviço) e 3 (cron 20:00).
// ============================================================================

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const ymd = (x: any) => (x ? String(x).slice(0, 10) : "");
const brDate = (iso?: string) => { if (!iso) return "—"; const [y, m, d] = ymd(iso).split("-"); return d ? `${d}/${m}/${y}` : "—"; };

type Parc = { accId: string; accName: string; desc: string; inst: number; total: number; venc: string; valor: number };
type Card = {
  key: string; fileName: string; file: File; previewUrl: string; isImg: boolean;
  status: "reading" | "ready" | "error" | "saving" | "done";
  extracted?: any; error?: string; proofKey?: string; uploadFailed?: boolean;
  accId: string; inst: number;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || "").split(",")[1] || "");
    r.onerror = () => rej(new Error("falha ao ler o arquivo"));
    r.readAsDataURL(file);
  });
}

// Dica de parcela pelo NOME do arquivo ("parcela 03 de 5", "parcela 3", "3/5").
function instFromName(name: string): number | null {
  const m = name.toLowerCase().match(/parcela\s*0*(\d{1,2})|(?:^|\D)0*(\d{1,2})\s*\/\s*\d{1,2}/);
  const n = m ? Number(m[1] || m[2]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function Conciliacao({ rec, reload, flash }: { rec: any[]; reload: () => void; flash: (m: string) => void }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [drag, setDrag] = useState(false);
  const inp = useRef<HTMLInputElement>(null);

  // Todas as parcelas EM ABERTO (não pagas), achatadas — universo de match.
  const abertas = useMemo<Parc[]>(() => {
    const out: Parc[] = [];
    for (const a of rec || []) {
      if (a.status === "cancelled") continue;
      const ps: any[] = Array.isArray(a.payment_schedule) ? a.payment_schedule : [];
      if (ps.length) {
        ps.forEach((p, k) => {
          if (p.status === "paid") return;
          out.push({ accId: a.id, accName: a.contact_name || "(sem empresa)", desc: a.description || "", inst: p.installment ?? k + 1, total: ps.length, venc: ymd(p.date), valor: Number(p.amount || 0) });
        });
      } else if (a.status !== "paid") {
        out.push({ accId: a.id, accName: a.contact_name || "(sem empresa)", desc: a.description || "", inst: 0, total: 1, venc: ymd(a.due_date), valor: Number(a.amount || 0) });
      }
    }
    return out;
  }, [rec]);

  // Melhor parcela para um comprovante lido: casa por VALOR (exato ganha), com
  // desempate pela dica do nome do arquivo e pelo nome do pagador. Sem valor legível → sem palpite.
  function melhorMatch(ex: any, fileName: string): { accId: string; inst: number } {
    const val = ex?.valor != null ? Number(ex.valor) : null;
    const hintInst = instFromName(fileName);
    const pag = String(ex?.pagador_nome || "").toLowerCase();
    const cand = abertas
      .map((p) => {
        let score = 0;
        if (val != null && Math.abs(p.valor - val) < 0.01) score += 100;
        else if (val != null && p.valor > 0 && Math.abs(p.valor - val) / p.valor < 0.02) score += 60;
        if (hintInst && p.inst === hintInst) score += 25;
        if (pag && p.accName.toLowerCase().includes(pag.split(" ")[0])) score += 15;
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const top = cand[0]?.p;
    return { accId: top?.accId || "", inst: top?.inst ?? 0 };
  }

  function patch(key: string, up: Partial<Card>) { setCards((cs) => cs.map((c) => (c.key === key ? { ...c, ...up } : c))); }
  function discard(key: string) { setCards((cs) => cs.filter((c) => c.key !== key)); }

  async function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => /image\/|pdf/.test(f.type) || /\.(jpe?g|png|webp|heic|pdf)$/i.test(f.name));
    for (const file of arr) {
      const key = `${file.name}-${file.size}-${Math.round(performance.now())}-${cards.length}`;
      const isImg = /image\//.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(file.name);
      const card: Card = { key, fileName: file.name, file, previewUrl: isImg ? URL.createObjectURL(file) : "", isImg, status: "reading", accId: "", inst: 0 };
      setCards((cs) => [...cs, card]);
      // 1) sobe o arquivo pro R2 (mesmo storage do anexo manual) → vira o proof_url.
      services.storage.upload("financeiro", file).then((k: string) => patch(key, { proofKey: k })).catch(() => patch(key, { uploadFailed: true }));
      // 2) manda a imagem pra IA ler.
      try {
        const b64 = await fileToBase64(file);
        const res: any = await services.finance.proofs.extract(b64, file.type || "image/jpeg", file.name);
        if (!res?.ok) { patch(key, { status: "error", error: res?.error || "não foi possível ler" }); continue; }
        const ex = res.data;
        const m = melhorMatch(ex, file.name);
        patch(key, { status: "ready", extracted: ex, accId: m.accId, inst: m.inst });
      } catch (e) { patch(key, { status: "error", error: errorMessage(e) }); }
    }
  }

  async function confirmar(c: Card) {
    if (!c.accId) { flash("Escolha o cliente/parcela antes de confirmar."); return; }
    const acc = (rec || []).find((a) => a.id === c.accId);
    if (!acc) { flash("Conta não encontrada — recarregue."); return; }
    const ex = c.extracted || {};
    const paidDate = ymd(ex.data) || today();
    const nota = ex.resumo || [ex.tipo ? String(ex.tipo).toUpperCase() : "Comprovante", ex.valor != null ? money(Number(ex.valor)) : null, paidDate ? `em ${brDate(paidDate)}` : null].filter(Boolean).join(" · ");
    patch(c.key, { status: "saving" });
    try {
      const cur: any[] = Array.isArray(acc.payment_schedule) ? acc.payment_schedule : [];
      let sched: any[]; let payload: any;
      if (cur.length && c.inst) {
        sched = cur.map((p: any) => p.installment === c.inst
          ? { ...p, status: "paid", amount_paid: Number(p.amount || 0), paid_date: paidDate, proof_url: c.proofKey || p.proof_url || "", proof_note: nota, paid_at: p.paid_at || new Date().toISOString() }
          : p);
        const paid = sched.filter((p) => p.status === "paid").reduce((a, p) => a + Number(p.amount || 0), 0);
        const total = Number(acc.amount || 0) || sched.reduce((a, p) => a + Number(p.amount || 0), 0);
        const status = paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "pending";
        const lastPaid = sched.filter((p) => p.status === "paid").map((p) => p.paid_date || p.date).filter(Boolean).sort().slice(-1)[0] || null;
        payload = { id: acc.id, payment_schedule: sched, amount_paid: paid, status, payment_date: status === "paid" ? (ymd(lastPaid) || today()) : "" };
      } else {
        // conta simples (sem parcelas): marca a conta paga.
        payload = { id: acc.id, account_type: acc.account_type, status: "paid", payment_date: paidDate, amount_paid: Number(acc.amount || 0) };
      }
      await services.finance.accounts.save(payload);
      patch(c.key, { status: "done" });
      flash("Baixa confirmada ✓");
      reload();
      setTimeout(() => discard(c.key), 1200);
    } catch (e) { patch(c.key, { status: "ready", error: errorMessage(e) }); flash(errorMessage(e)); }
  }

  const parcelasDe = (accId: string) => abertas.filter((p) => p.accId === accId);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Sparkles size={16} color="#6C5CE7" />
        <span style={{ fontWeight: 700 }}>Conciliação por comprovante</span>
        <span style={{ fontSize: 12, color: "var(--crasto-text-muted)" }}>a IA lê o comprovante e sugere a baixa — você confirma</span>
      </div>

      {/* dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
        onClick={() => inp.current?.click()}
        style={{ cursor: "pointer", border: `2px dashed ${drag ? "#6C5CE7" : "var(--crasto-border)"}`, background: drag ? "rgba(108,92,231,.06)" : "var(--crasto-surface, transparent)", borderRadius: 14, padding: "26px 18px", textAlign: "center", transition: "all .15s", marginBottom: 16 }}
      >
        <UploadCloud size={26} color={drag ? "#6C5CE7" : "var(--crasto-text-muted)"} />
        <div style={{ marginTop: 8, fontWeight: 600 }}>Arraste os comprovantes aqui ou clique para escolher</div>
        <div style={{ fontSize: 12, color: "var(--crasto-text-muted)", marginTop: 3 }}>Imagens (Pix, TED, transferência) ou PDF · a leitura é feita por IA</div>
        <input ref={inp} type="file" hidden multiple accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,image/*" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); if (inp.current) inp.current.value = ""; }} />
      </div>

      {cards.length === 0 ? (
        <div className="card"><div style={{ padding: 16, color: "var(--crasto-text-muted)", fontSize: 13 }}>
          Nenhum comprovante na fila. Solte aqui os comprovantes que os clientes te mandam — a IA lê valor, data e hora, encontra a parcela em aberto que casa e você dá a baixa com 1 clique. Nada vira "pago" sem a sua confirmação.
        </div></div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {cards.map((c) => {
            const ex = c.extracted || {};
            const conf = Math.round((ex.confianca || 0) * 100);
            const parcs = parcelasDe(c.accId);
            const inconclusivo = c.status === "ready" && (ex.legivel === false || ex.valor == null);
            return (
              <div key={c.key} className="card" style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 14, padding: 14, alignItems: "start", opacity: c.status === "done" ? 0.6 : 1 }}>
                {/* thumb */}
                <div style={{ width: 84, height: 84, borderRadius: 10, overflow: "hidden", background: "var(--crasto-surface-2, #f1f1f4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {c.isImg && c.previewUrl ? <img src={c.previewUrl} alt="comprovante" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <FileText size={28} color="var(--crasto-text-muted)" />}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "var(--crasto-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{c.fileName}</span>
                    {c.status === "reading" && <span style={{ fontSize: 12, color: "#6C5CE7", display: "inline-flex", alignItems: "center", gap: 5 }}><Loader2 size={13} className="spin" /> lendo…</span>}
                    {c.status === "ready" && !inconclusivo && <span style={{ fontSize: 11, fontWeight: 700, color: conf >= 70 ? "#1F8A5B" : "#B54708", background: conf >= 70 ? "rgba(31,138,91,.1)" : "rgba(181,71,8,.1)", padding: "1px 8px", borderRadius: 999 }}>{conf}% confiança</span>}
                    <button className="icobtn" title="Descartar" style={{ marginLeft: "auto" }} onClick={() => discard(c.key)}><X size={14} /></button>
                  </div>

                  {c.status === "error" ? (
                    <div style={{ fontSize: 13, color: "#B42318", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={14} /> {c.error || "não foi possível ler o comprovante"}</div>
                  ) : c.status === "reading" ? (
                    <div style={{ fontSize: 13, color: "var(--crasto-text-muted)" }}>Extraindo valor, data e pagador da imagem…</div>
                  ) : (<>
                    {/* dados lidos */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", alignItems: "baseline", marginBottom: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 800 }}>{ex.valor != null ? money(Number(ex.valor)) : "—"}</span>
                      <span style={{ fontSize: 13 }}>{brDate(ex.data)}{ex.hora ? ` · ${ex.hora}` : ""}</span>
                      {ex.tipo && <span style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700, color: "#3E6FB8" }}>{ex.tipo}</span>}
                      {ex.pagador_nome && <span style={{ fontSize: 12, color: "var(--crasto-text-muted)" }}>de {ex.pagador_nome}</span>}
                      {ex.instituicao && <span style={{ fontSize: 12, color: "var(--crasto-text-muted)" }}>· {ex.instituicao}</span>}
                    </div>
                    {inconclusivo && <div style={{ fontSize: 12, color: "#B54708", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> A IA não leu com segurança — confira e escolha a parcela manualmente.</div>}
                    {c.uploadFailed && <div style={{ fontSize: 12, color: "#B54708", marginBottom: 8 }}>⚠ falha ao guardar o arquivo (segue sem anexo).</div>}

                    {/* match: cliente + parcela */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <select value={c.accId} onChange={(e) => patch(c.key, { accId: e.target.value, inst: parcelasDe(e.target.value)[0]?.inst ?? 0 })} style={selStyle}>
                        <option value="">— escolher cliente —</option>
                        {Array.from(new Map((rec || []).filter((a) => a.status !== "cancelled").map((a) => [a.id, a])).values()).map((a: any) => (
                          <option key={a.id} value={a.id}>{a.contact_name || a.description || a.id.slice(0, 6)}</option>
                        ))}
                      </select>
                      <select value={c.inst} onChange={(e) => patch(c.key, { inst: Number(e.target.value) })} disabled={!c.accId} style={selStyle}>
                        {parcs.length === 0 && <option value={0}>sem parcela em aberto</option>}
                        {parcs.map((p) => (
                          <option key={p.inst} value={p.inst}>{p.inst ? `Parcela ${p.inst}/${p.total}` : "Conta"} · {money(p.valor)} · vence {brDate(p.venc)}</option>
                        ))}
                      </select>
                      <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={c.status === "saving" || c.status === "done" || !c.accId} onClick={() => confirmar(c)}>
                        <span className="crasto-btn__icon">{c.status === "saving" ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}</span>
                        <span className="crasto-btn__label">{c.status === "done" ? "Baixado ✓" : "Confirmar baixa"}</span>
                      </button>
                    </div>
                    {c.error && <div style={{ fontSize: 12, color: "#B42318", marginTop: 6 }}>{c.error}</div>}
                  </>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const selStyle: any = { fontSize: 13, padding: "6px 8px", borderRadius: 8, border: "1px solid var(--crasto-border)", background: "var(--crasto-surface, #fff)", color: "var(--crasto-text)", maxWidth: 320 };
