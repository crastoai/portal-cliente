import { useMemo, useRef, useState } from "react";
import { UploadCloud, FileText, CheckCircle2, X, Loader2, AlertTriangle, Sparkles, Ban } from "lucide-react";
import { services, errorMessage } from "../../services";
import { money } from "../../ui/ui";

// ============================================================================
// CONCILIAÇÃO POR IA — COMPROVANTE **ou** EXTRATO (Fatia 2)
// Um caminho só: a IA detecta o tipo do documento e devolve TODOS os lançamentos,
// já classificados (receita de cliente / custo / interna / imposto / pessoal).
// O sistema então CASA cada linha com a parcela a receber ou a conta a pagar em
// aberto, trava duplicidade pelo E2E e o operador confirma em lote.
//
// Portão de dinheiro continua HUMANO: nada vira "pago" sem clique. Linhas
// "interna"/"pessoal" nascem marcadas para IGNORAR (não são resultado).
// ============================================================================

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const ymd = (x: any) => (x ? String(x).slice(0, 10) : "");
const brDate = (iso?: string) => { if (!iso) return "—"; const [y, m, d] = ymd(iso).split("-"); return d ? `${d}/${m}/${y}` : "—"; };
const norm = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const diasEntre = (a?: string, b?: string) => { if (!a || !b) return 999; const d = (new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) / 86400000; return Math.abs(d); };

type Alvo = { kind: "rec" | "pay"; accId: string; accName: string; inst: number; total: number; venc: string; valor: number };

// Uma linha lida do documento + o que o operador decidiu fazer com ela.
type Linha = {
  key: string;
  ex: any;                       // lançamento cru lido pela IA
  acao: "baixar" | "despesa" | "ignorar";
  alvo: string;                  // "kind:accId:inst" do alvo escolhido
  status: "pend" | "saving" | "done" | "error";
  erro?: string;
  duplicado?: string;            // se o E2E já existe no sistema
};

type Doc = {
  key: string; fileName: string; file: File; previewUrl: string; isImg: boolean;
  status: "reading" | "ready" | "error";
  head?: any; erro?: string; proofKey?: string;
  linhas: Linha[];
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || "").split(",")[1] || "");
    r.onerror = () => rej(new Error("falha ao ler o arquivo"));
    r.readAsDataURL(file);
  });
}

const NAT_UI: Record<string, { lbl: string; cor: string; bg: string }> = {
  receita_cliente: { lbl: "Receita de cliente", cor: "#1F8A5B", bg: "rgba(31,138,91,.12)" },
  custo: { lbl: "Custo", cor: "#B54708", bg: "rgba(181,71,8,.12)" },
  interna: { lbl: "Interna (não é resultado)", cor: "#3E6FB8", bg: "rgba(62,111,184,.12)" },
  imposto: { lbl: "Imposto", cor: "#8B5CF6", bg: "rgba(139,92,246,.12)" },
  pessoal: { lbl: "Pessoal (fora da empresa)", cor: "#667085", bg: "rgba(102,112,133,.12)" },
  desconhecido: { lbl: "Não identificado", cor: "#B42318", bg: "rgba(180,35,24,.10)" },
};

export default function Conciliacao({ rec, pay, reload, flash }: { rec: any[]; pay?: any[]; reload: () => void; flash: (m: string) => void }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [drag, setDrag] = useState(false);
  const inp = useRef<HTMLInputElement>(null);

  // Universo de match: parcelas EM ABERTO, de recebíveis (crédito) e de contas a pagar (débito).
  const alvos = useMemo<Alvo[]>(() => {
    const out: Alvo[] = [];
    const push = (kind: "rec" | "pay", list: any[]) => {
      for (const a of list || []) {
        if (a.status === "cancelled") continue;
        const ps: any[] = Array.isArray(a.payment_schedule) ? a.payment_schedule : [];
        if (ps.length) {
          ps.forEach((p, k) => {
            if (p.status === "paid") return;
            out.push({ kind, accId: a.id, accName: a.contact_name || a.description || "(sem nome)", inst: p.installment ?? k + 1, total: ps.length, venc: ymd(p.date), valor: Number(p.amount || 0) });
          });
        } else if (a.status !== "paid") {
          out.push({ kind, accId: a.id, accName: a.contact_name || a.description || "(sem nome)", inst: 0, total: 1, venc: ymd(a.due_date), valor: Number(a.amount || 0) });
        }
      }
    };
    push("rec", rec || []);
    push("pay", pay || []);
    return out;
  }, [rec, pay]);

  // E2E já usados no sistema — trava anti-duplicidade (o mesmo comprovante 2x).
  const e2eUsados = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of [...(rec || []), ...(pay || [])]) {
      for (const p of (Array.isArray(a.payment_schedule) ? a.payment_schedule : [])) {
        const id = String(p?.e2e_id || "").trim();
        if (id) m.set(id.toLowerCase(), a.contact_name || a.description || "lançamento");
      }
    }
    return m;
  }, [rec, pay]);

  // Casa uma linha lida com a melhor parcela em aberto: valor (peso maior), proximidade
  // de data e nome da contraparte. Sem valor legível não há palpite.
  function melhorAlvo(ex: any): string {
    const val = ex?.valor != null ? Number(ex.valor) : null;
    if (val == null) return "";
    const kind: "rec" | "pay" = ex?.sentido === "debito" ? "pay" : "rec";
    const nome = norm(ex?.match_sugerido || ex?.contraparte_nome);
    const cand = alvos
      .filter((a) => a.kind === kind)
      .map((a) => {
        let score = 0;
        if (Math.abs(a.valor - val) < 0.01) score += 100;
        else if (a.valor > 0 && Math.abs(a.valor - val) / a.valor < 0.02) score += 55;
        else return { a, score: 0 };
        const dd = diasEntre(ymd(ex?.data), a.venc);
        if (dd <= 3) score += 30; else if (dd <= 10) score += 18; else if (dd <= 31) score += 6;
        if (nome) { const alvo = norm(a.accName); const tok = nome.split(/\s+/).filter((w: string) => w.length >= 4); if (tok.some((w: string) => alvo.includes(w))) score += 25; }
        return { a, score };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score);
    const top = cand[0]?.a;
    return top ? `${top.kind}:${top.accId}:${top.inst}` : "";
  }

  function patchDoc(key: string, up: Partial<Doc>) { setDocs((ds) => ds.map((d) => (d.key === key ? { ...d, ...up } : d))); }
  function patchLinha(dk: string, lk: string, up: Partial<Linha>) {
    setDocs((ds) => ds.map((d) => (d.key === dk ? { ...d, linhas: d.linhas.map((l) => (l.key === lk ? { ...l, ...up } : l)) } : d)));
  }
  function discard(key: string) { setDocs((ds) => ds.filter((d) => d.key !== key)); }

  async function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => /image\/|pdf/.test(f.type) || /\.(jpe?g|png|webp|heic|pdf)$/i.test(f.name));
    for (const file of arr) {
      const key = `${file.name}-${file.size}-${Math.round(performance.now())}-${docs.length}`;
      const isImg = /image\//.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(file.name);
      setDocs((ds) => [...ds, { key, fileName: file.name, file, previewUrl: isImg ? URL.createObjectURL(file) : "", isImg, status: "reading", linhas: [] }]);
      services.storage.upload("financeiro", file).then((k: string) => patchDoc(key, { proofKey: k })).catch(() => {});
      try {
        const b64 = await fileToBase64(file);
        const res: any = await services.finance.proofs.read(b64, file.type || "image/jpeg", file.name);
        if (!res?.ok) { patchDoc(key, { status: "error", erro: res?.error || "não foi possível ler" }); continue; }
        const d = res.data || {};
        const linhas: Linha[] = (d.lancamentos || []).map((ex: any, i: number) => {
          const dup = ex?.id_transacao ? e2eUsados.get(String(ex.id_transacao).toLowerCase()) : undefined;
          const naoEntra = ex?.natureza === "interna" || ex?.natureza === "pessoal";
          const alvo = naoEntra || dup ? "" : melhorAlvo(ex);
          return { key: `${key}-l${i}`, ex, acao: (naoEntra || dup ? "ignorar" : alvo ? "baixar" : "ignorar") as any, alvo, status: "pend", duplicado: dup };
        });
        patchDoc(key, { status: "ready", head: d, linhas });
      } catch (e) { patchDoc(key, { status: "error", erro: errorMessage(e) }); }
    }
  }

  // Grava UMA linha conforme a ação escolhida. Reusa os caminhos já existentes.
  async function aplicar(d: Doc, l: Linha) {
    const ex = l.ex || {};
    const paidDate = ymd(ex.data) || today();
    const nota = [ex.tipo ? String(ex.tipo).toUpperCase() : "Lançamento", ex.valor != null ? money(Number(ex.valor)) : null, `em ${brDate(paidDate)}`, ex.contraparte_nome ? `· ${ex.contraparte_nome}` : null].filter(Boolean).join(" ");
    if (l.acao === "ignorar") { patchLinha(d.key, l.key, { status: "done" }); return; }

    if (l.acao === "despesa") {
      await services.finance.transactions.save({
        type: ex.sentido === "credito" ? "income" : "expense",
        category: ex.natureza === "imposto" ? "imposto" : ex.natureza === "interna" ? "Interna -" : "",
        amount: Number(ex.valor || 0), description: ex.descricao || nota, status: "completed",
        transaction_date: paidDate, contact_name: ex.contraparte_nome || "", payment_method: ex.tipo || "",
        notes: `Conciliado por IA · ${d.fileName}${ex.id_transacao ? ` · E2E ${ex.id_transacao}` : ""}`,
      });
      patchLinha(d.key, l.key, { status: "done" });
      return;
    }

    // baixar: marca a parcela do alvo escolhido como paga (mesmo caminho do fluxo manual)
    const [kind, accId, instS] = String(l.alvo).split(":");
    const inst = Number(instS || 0);
    const acc = (kind === "pay" ? pay || [] : rec || []).find((a: any) => a.id === accId);
    if (!acc) throw new Error("conta não encontrada — recarregue");
    const cur: any[] = Array.isArray(acc.payment_schedule) ? acc.payment_schedule : [];
    let payload: any;
    if (cur.length && inst) {
      const sched = cur.map((p: any) => p.installment === inst
        ? { ...p, status: "paid", amount_paid: Number(p.amount || 0), paid_date: paidDate, proof_url: d.proofKey || p.proof_url || "", proof_note: nota, e2e_id: ex.id_transacao || p.e2e_id || "", paid_at: p.paid_at || new Date().toISOString() }
        : p);
      const pago = sched.filter((p: any) => p.status === "paid").reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
      const total = Number(acc.amount || 0) || sched.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
      const st = pago >= total && total > 0 ? "paid" : pago > 0 ? "partial" : "pending";
      const lastPaid = sched.filter((p: any) => p.status === "paid").map((p: any) => p.paid_date || p.date).filter(Boolean).sort().slice(-1)[0] || null;
      payload = { id: acc.id, payment_schedule: sched, amount_paid: pago, status: st, payment_date: st === "paid" ? (ymd(lastPaid) || today()) : "" };
    } else {
      payload = { id: acc.id, account_type: acc.account_type, status: "paid", payment_date: paidDate, amount_paid: Number(acc.amount || 0) };
    }
    await services.finance.accounts.save(payload);
    patchLinha(d.key, l.key, { status: "done" });
  }

  async function aplicarTodas(d: Doc) {
    const pend = d.linhas.filter((l) => l.status === "pend");
    if (!pend.length) { flash("Nada pendente neste documento."); return; }
    let ok = 0, err = 0;
    for (const l of pend) {
      patchLinha(d.key, l.key, { status: "saving" });
      try { await aplicar(d, l); ok++; }
      catch (e) { patchLinha(d.key, l.key, { status: "error", erro: errorMessage(e) }); err++; }
    }
    reload();
    flash(err ? `${ok} aplicada(s), ${err} com erro` : `${ok} linha(s) conciliada(s) ✓`);
  }

  const alvoLabel = (v: string) => {
    const [kind, accId, instS] = String(v).split(":");
    const a = alvos.find((x) => x.kind === kind && x.accId === accId && String(x.inst) === instS);
    return a ? `${a.accName} · ${a.inst ? `parc ${a.inst}/${a.total}` : "conta"} · ${money(a.valor)} · vence ${brDate(a.venc)}` : "";
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <Sparkles size={16} color="#6C5CE7" />
        <span style={{ fontWeight: 700 }}>Conciliação por IA — comprovante ou extrato</span>
        <span style={{ fontSize: 12, color: "var(--crasto-text-muted)" }}>a IA detecta o tipo, lê todos os lançamentos e classifica — você confirma</span>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
        onClick={() => inp.current?.click()}
        style={{ cursor: "pointer", border: `2px dashed ${drag ? "#6C5CE7" : "var(--crasto-border)"}`, background: drag ? "rgba(108,92,231,.06)" : "var(--crasto-surface, transparent)", borderRadius: 14, padding: "26px 18px", textAlign: "center", transition: "all .15s", marginBottom: 16 }}
      >
        <UploadCloud size={26} color={drag ? "#6C5CE7" : "var(--crasto-text-muted)"} />
        <div style={{ marginTop: 8, fontWeight: 600 }}>Arraste um comprovante ou um extrato aqui</div>
        <div style={{ fontSize: 12, color: "var(--crasto-text-muted)", marginTop: 3 }}>Imagem (Pix, TED) ou PDF · a IA lê linha a linha e diz o que é da empresa</div>
        <input ref={inp} type="file" hidden multiple accept=".jpg,.jpeg,.png,.webp,.heic,.pdf,image/*" onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); if (inp.current) inp.current.value = ""; }} />
      </div>

      {docs.length === 0 ? (
        <div className="card"><div style={{ padding: 16, color: "var(--crasto-text-muted)", fontSize: 13 }}>
          Nenhum documento na fila. Solte um <b>comprovante</b> (Pix que o cliente mandou) ou um <b>extrato bancário</b> — a IA identifica o tipo sozinha, lê <b>todos</b> os lançamentos, separa o que é receita de cliente, custo, transferência interna, imposto ou pessoal, e casa cada linha com a parcela em aberto. Nada vira "pago" sem a sua confirmação.
        </div></div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {docs.map((d) => {
            const pend = d.linhas.filter((l) => l.status === "pend").length;
            const naoIdent = d.linhas.filter((l) => l.ex?.natureza === "desconhecido").length;
            return (
              <div key={d.key} className="card" style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", background: "var(--crasto-surface-2, #f1f1f4)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
                    {d.isImg && d.previewUrl ? <img src={d.previewUrl} alt="doc" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <FileText size={20} color="var(--crasto-text-muted)" />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                      {d.status === "reading" ? "Lendo…" : d.head?.tipo_documento === "extrato" ? "Extrato bancário" : d.head?.tipo_documento === "comprovante" ? "Comprovante" : d.fileName}
                      {d.head?.instituicao ? <span style={{ fontWeight: 500, color: "var(--crasto-text-muted)" }}> · {d.head.instituicao}</span> : null}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 460 }}>
                      {d.fileName}{d.head?.periodo ? ` · ${d.head.periodo}` : ""}{d.linhas.length ? ` · ${d.linhas.length} lançamento(s)` : ""}
                    </div>
                  </div>
                  {d.status === "reading" && <span style={{ fontSize: 12, color: "#6C5CE7", display: "inline-flex", alignItems: "center", gap: 5 }}><Loader2 size={13} className="spin" /> lendo o documento…</span>}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                    {pend > 0 && <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => aplicarTodas(d)}><span className="crasto-btn__icon"><CheckCircle2 size={14} /></span><span className="crasto-btn__label">Aplicar {pend} linha(s)</span></button>}
                    <button className="icobtn" title="Descartar" onClick={() => discard(d.key)}><X size={14} /></button>
                  </div>
                </div>

                {d.status === "error" && <div style={{ fontSize: 13, color: "#B42318", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={14} /> {d.erro}</div>}
                {d.head?.aviso && <div style={{ fontSize: 12, color: "#B54708", marginBottom: 8 }}>⚠ {d.head.aviso}</div>}
                {naoIdent > 0 && <div style={{ fontSize: 12, color: "#B42318", marginBottom: 8 }}>⚠ {naoIdent} lançamento(s) a IA não conseguiu identificar — decida manualmente antes de aplicar.</div>}

                {d.linhas.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
                      <thead><tr style={{ textAlign: "left", color: "var(--crasto-text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>
                        <th style={thS}>Data</th><th style={thS}>Descrição</th><th style={{ ...thS, textAlign: "right" }}>Valor</th><th style={thS}>Classificação</th><th style={thS}>O que fazer</th><th style={thS}></th>
                      </tr></thead>
                      <tbody>
                        {d.linhas.map((l) => {
                          const ex = l.ex || {};
                          const nat = NAT_UI[ex.natureza] || NAT_UI.desconhecido;
                          const cred = ex.sentido === "credito";
                          const opts = alvos.filter((a) => a.kind === (cred ? "rec" : "pay"));
                          return (
                            <tr key={l.key} style={{ borderTop: "1px solid var(--crasto-border-soft)", opacity: l.status === "done" ? 0.5 : 1 }}>
                              <td style={{ ...tdS, whiteSpace: "nowrap" }}>{brDate(ex.data)}</td>
                              <td style={tdS}>
                                <div style={{ fontWeight: 600 }}>{ex.contraparte_nome || ex.descricao || "—"}</div>
                                {ex.contraparte_nome && ex.descricao && <div style={{ fontSize: 11, color: "var(--crasto-text-muted)" }}>{ex.descricao}</div>}
                                {l.duplicado && <div style={{ fontSize: 11, color: "#B54708", fontWeight: 700 }}>⚠ já conciliado antes ({l.duplicado}) — duplicidade</div>}
                              </td>
                              <td style={{ ...tdS, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: cred ? "var(--fin-green, #1F8A5B)" : "var(--fin-orange, #B54708)" }}>
                                {cred ? "+" : "−"} {ex.valor != null ? money(Number(ex.valor)) : "—"}
                              </td>
                              <td style={tdS}><span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap", color: nat.cor, background: nat.bg }}>{nat.lbl}</span></td>
                              <td style={tdS}>
                                <select value={l.acao} onChange={(e) => patchLinha(d.key, l.key, { acao: e.target.value as any })} style={selStyle} disabled={l.status !== "pend"}>
                                  <option value="baixar">Baixar parcela</option>
                                  <option value="despesa">Registrar como lançamento</option>
                                  <option value="ignorar">Ignorar (não é resultado)</option>
                                </select>
                                {l.acao === "baixar" && (
                                  <select value={l.alvo} onChange={(e) => patchLinha(d.key, l.key, { alvo: e.target.value })} style={{ ...selStyle, marginTop: 4, maxWidth: 300 }} disabled={l.status !== "pend"}>
                                    <option value="">— escolher {cred ? "recebível" : "conta a pagar"} —</option>
                                    {opts.map((a) => <option key={`${a.kind}:${a.accId}:${a.inst}`} value={`${a.kind}:${a.accId}:${a.inst}`}>{a.accName} · {a.inst ? `parc ${a.inst}/${a.total}` : "conta"} · {money(a.valor)} · {brDate(a.venc)}</option>)}
                                  </select>
                                )}
                                {l.acao === "baixar" && !l.alvo && <div style={{ fontSize: 11, color: "#B54708", marginTop: 3 }}>sem parcela em aberto que case — escolha ou troque a ação</div>}
                              </td>
                              <td style={{ ...tdS, whiteSpace: "nowrap" }}>
                                {l.status === "saving" ? <Loader2 size={14} className="spin" />
                                  : l.status === "done" ? <span style={{ color: "var(--fin-green,#1F8A5B)", fontWeight: 700, fontSize: 11.5 }}>{l.acao === "ignorar" ? <><Ban size={12} /> ignorado</> : "✓ aplicado"}</span>
                                  : l.status === "error" ? <span title={l.erro} style={{ color: "#B42318", fontWeight: 700, fontSize: 11.5 }}>erro</span>
                                  : <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={l.acao === "baixar" && !l.alvo} onClick={async () => { patchLinha(d.key, l.key, { status: "saving" }); try { await aplicar(d, l); reload(); } catch (e) { patchLinha(d.key, l.key, { status: "error", erro: errorMessage(e) }); flash(errorMessage(e)); } }}><span className="crasto-btn__label">Aplicar</span></button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {d.status === "ready" && d.linhas.length === 0 && <div style={{ fontSize: 13, color: "#B54708" }}>A IA não encontrou lançamentos neste arquivo — confira se é mesmo um comprovante ou extrato legível.</div>}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", marginTop: 12 }}>
        A leitura é feita por IA e pode errar — <b>confira cada linha antes de aplicar</b>. Nada é gravado sem o seu clique; o arquivo fica anexado como comprovante da parcela.
      </div>
    </div>
  );
}

const thS: any = { padding: "6px 8px", fontWeight: 700 };
const tdS: any = { padding: "8px", verticalAlign: "top" };
const selStyle: any = { fontSize: 12.5, padding: "5px 7px", borderRadius: 8, border: "1px solid var(--crasto-border)", background: "var(--crasto-surface, #fff)", color: "var(--crasto-text)", maxWidth: 260, width: "100%" };
