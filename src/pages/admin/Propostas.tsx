import { useEffect, useMemo, useState } from "react";
import { Check, ArrowRight, Upload, FileText, Mic } from "lucide-react";
import { services as api, errorMessage } from "../../services";
import { PageHead, money } from "../../ui/ui";
import { taxOf, fmtRate } from "../../lib/config";
import { useSettings } from "../../lib/settings";

type Org = { id: string; name: string; cnpj: string | null };
type Svc = { id: string; name: string; unit: string; price_table: number; category?: string | null };
type Agent = { id: string; name: string; agent_type: string; commission_default: number; payment_handling: string; active: boolean };
type TaxId = { id: string; kind: string; value: string; address: string | null; is_primary: boolean };
type Doc = { id: string; file_name: string; kind: string };

const ANEXOS = ["Plano Diretor", "Playbook Comercial", "Plano de Marketing", "Financeiro Estratégico"];
const HANDL: Record<string, string> = { nota_fiscal: "Nota Fiscal", por_fora: "por fora", reembolso: "reembolso de despesas" };
const DOC_KIND_L: Record<string, string> = { cnpj_card: "Cartão CNPJ", contrato_social: "Contrato Social", plano_diretor: "Plano Diretor", socios: "Sócios", outro: "Documento" };
const MODALIDADES = ["Presencial", "Online", "Híbrido"];

// detecta o tipo de item p/ mostrar as especificidades certas
function itemKind(s?: Svc): "workshop" | "agent" | "automation" | "generic" {
  const t = ((s?.name || "") + " " + (s?.category || "")).toLowerCase();
  if (/workshop|treinamento|palestra|capacita/.test(t)) return "workshop";
  if (/agente|agent\b/.test(t)) return "agent";
  if (/automa|rotina|fluxo|integra/.test(t)) return "automation";
  return "generic";
}

export default function Propostas() {
  const { taxRate } = useSettings();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [svcs, setSvcs] = useState<Svc[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [orgQuery, setOrgQuery] = useState<string>("");
  const [taxIds, setTaxIds] = useState<TaxId[]>([]);
  const [billId, setBillId] = useState<string>("");
  const [agentId, setAgentId] = useState<string>("");
  const [vals, setVals] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [specs, setSpecs] = useState<Record<string, any>>({});
  const [items, setItems] = useState<string[]>([]);
  const [clientDocs, setClientDocs] = useState<Doc[]>([]);
  const [attDocs, setAttDocs] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [att, setAtt] = useState<Set<string>>(new Set(["Plano Diretor", "Playbook Comercial", "Financeiro Estratégico"]));
  const [currency, setCurrency] = useState<"BRL" | "USD">("BRL");
  const [fx, setFx] = useState<number>(0);
  const [special, setSpecial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  // contrato (Fase 3)
  const [contract, setContract] = useState<{ id: string; orgName: string } | null>(null);
  const [contractUrl, setContractUrl] = useState<string>("");
  const [signerClient, setSignerClient] = useState<string>("");
  const [signerName, setSignerName] = useState<string>("");
  const [sandbox, setSandbox] = useState(true);
  const [cbusy, setCbusy] = useState(false);
  const [cmsg, setCmsg] = useState("");
  const [listening, setListening] = useState<string>(""); // id do item sendo ditado
  // chat/voz com IA (Fase 4)
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatLog, setChatLog] = useState<{ role: "you" | "ai"; text: string }[]>([]);
  const [propNotes, setPropNotes] = useState<string[]>([]);

  // voz -> texto (Web Speech API nativa, grátis) ditando para a nota do item
  function dictate(id: string) {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setToast("Ditado por voz não suportado neste navegador (use o Chrome)."); setTimeout(() => setToast(""), 4000); return; }
    if (listening) return;
    const rec = new SR();
    rec.lang = "pt-BR"; rec.interimResults = false; rec.maxAlternatives = 1;
    setListening(id);
    rec.onresult = (e: any) => {
      const txt = e.results?.[0]?.[0]?.transcript || "";
      setNotes((prev) => ({ ...prev, [id]: (prev[id] ? prev[id] + " " : "") + txt }));
    };
    rec.onerror = () => { setListening(""); };
    rec.onend = () => setListening("");
    rec.start();
  }

  function dictateChat() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setToast("Ditado por voz não suportado (use o Chrome)."); setTimeout(() => setToast(""), 4000); return; }
    if (listening) return;
    const rec = new SR(); rec.lang = "pt-BR"; rec.interimResults = false;
    setListening("__chat__");
    rec.onresult = (e: any) => setChatInput((p) => (p ? p + " " : "") + (e.results?.[0]?.[0]?.transcript || ""));
    rec.onerror = () => setListening(""); rec.onend = () => setListening("");
    rec.start();
  }

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg || chatBusy) return;
    setChatBusy(true); setChatInput("");
    setChatLog((l) => [...l, { role: "you", text: msg }]);
    const context = { cliente: org?.name, itens: items.map((id) => svcs.find((x) => x.id === id)?.name).filter(Boolean), venda_especial: special };
    const r = await api.commerce.ai(msg, context);
    setChatBusy(false);
    if (!r.ok) { setChatLog((l) => [...l, { role: "ai", text: (r.offline ? "🔌 " : "⚠️ ") + (r.error || "erro") }]); return; }
    // aplica as ações sugeridas
    for (const a of r.actions || []) {
      if (a.type === "item_note" && a.item) {
        const hit = items.find((id) => (svcs.find((x) => x.id === id)?.name || "").toLowerCase().includes(String(a.item).toLowerCase()));
        if (hit) setNotes((prev) => ({ ...prev, [hit]: (prev[hit] ? prev[hit] + " · " : "") + (a.note || "") }));
      } else if (a.type === "proposal_note" && a.note) {
        setPropNotes((p) => [...p, a.note]);
      } else if (a.type === "set_special") {
        setSpecial(!!a.value);
      }
    }
    setChatLog((l) => [...l, { role: "ai", text: r.reply || "Feito." }]);
  }

  useEffect(() => {
    (async () => {
      const [o, s, a] = await Promise.all([
        api.identity.organizations.listForProposals(),
        api.catalog.services.listForProposals(),
        api.identity.connectors.list(),
      ]);
      const os = (o as unknown as Org[]) ?? [];
      const ss = (s as unknown as Svc[]) ?? [];
      const ags = ((a as unknown as Agent[]) ?? []).filter((x) => x.active);
      setOrgs(os); setSvcs(ss); setAgents(ags);
      if (os[0]) { setOrgId(os[0].id); setOrgQuery(os[0].name); }
      if (ags[0]) setAgentId(ags[0].id);
      const first3 = ss.slice(0, 3);
      setItems(first3.map((x) => x.id));
      setVals(Object.fromEntries(first3.map((x) => [x.id, Number(x.price_table)])));
    })();
    // cotação do dólar do dia
    fetch("https://economia.awesomeapi.com.br/last/USD-BRL")
      .then((r) => r.json()).then((d) => setFx(Number(d?.USDBRL?.bid) || 0)).catch(() => setFx(0));
  }, []);

  // ao trocar de cliente, carrega os CNPJs e os documentos reais do cliente
  useEffect(() => {
    if (!orgId) { setTaxIds([]); setBillId(""); setClientDocs([]); setAttDocs(new Set()); return; }
    api.crm.taxIds.listByOrg(orgId).then((t) => {
      const list = (t as unknown as TaxId[]) ?? [];
      setTaxIds(list);
      setBillId(list[0]?.id ?? "org");
    }).catch(() => { setTaxIds([]); setBillId("org"); });
    reloadDocs();
    setAttDocs(new Set());
  }, [orgId]);

  async function reloadDocs() {
    if (!orgId) return;
    try { setClientDocs(((await api.crm.documents.listByOrg(orgId)) as unknown as Doc[]) ?? []); }
    catch { setClientDocs([]); }
  }

  async function uploadAnexo(file: File) {
    if (!orgId) return;
    setUploading(true);
    try {
      const key = await api.storage.upload(orgId, file);
      const row = await api.crm.documents.add({ organization_id: orgId, kind: "outro", file_name: file.name, storage_path: key });
      const newId = (row as any)?.[0]?.id;
      await reloadDocs();
      if (newId) setAttDocs((p) => new Set(p).add(newId));
    } catch (e) { setToast("Erro no upload: " + errorMessage(e)); setTimeout(() => setToast(""), 5000); }
    setUploading(false);
  }

  const org = orgs.find((o) => o.id === orgId);
  const agent = agents.find((a) => a.id === agentId);
  const commissionPct = agent ? Number(agent.commission_default) : 0;
  const total = useMemo(() => items.reduce((s, id) => s + (vals[id] ?? 0), 0), [items, vals]);
  const commission = Math.round((total * commissionPct) / 100);
  const tax = special ? 0 : taxOf(total, taxRate);

  // opções de CNPJ (tax_ids ou o CNPJ do próprio cadastro)
  const cnpjOpts = taxIds.length ? taxIds : (org?.cnpj ? [{ id: "org", kind: "CNPJ", value: org.cnpj, address: null, is_primary: true }] : []);
  const bill = cnpjOpts.find((c) => c.id === billId) ?? cnpjOpts[0];

  // formatação por moeda
  const inUSD = currency === "USD" && fx > 0;
  const fmt = (v: number) => inUSD ? "US$ " + (v / fx).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : money(v);

  function pickOrg(q: string) {
    setOrgQuery(q);
    const hit = orgs.find((o) => o.name.toLowerCase() === q.trim().toLowerCase());
    if (hit) setOrgId(hit.id);
  }

  async function gerar() {
    if (!orgId) { setToast("Escolha um cliente."); setTimeout(() => setToast(""), 4000); return; }
    setBusy(true);
    try {
      const prop = await api.commerce.proposals.create({
        organization_id: orgId, connector_id: agentId || null, title: `Proposta — ${org?.name ?? ""}`.trim(),
        status: "sent", subtotal: total, commission_total: commission, special_sale: special, tax_rate: taxRate,
        currency, fx_rate: currency === "USD" ? fx : null,
        bill_to: bill?.value ?? null, bill_to_address: bill?.address ?? null,
        attachments: Object.fromEntries([...att].map((a) => [a, true])),
        attachment_doc_ids: [...attDocs],
      });
      const rows = items.map((id) => { const s = svcs.find((x) => x.id === id); return { proposal_id: (prop as any).id, organization_id: orgId, service_id: id, description: s?.name ?? "Item", qty: 1, unit_price: vals[id] ?? 0, notes: notes[id] || null, specifics: specs[id] || {} }; });
      await api.commerce.proposals.addItems(rows);
      setContract({ id: (prop as any).id, orgName: org?.name ?? "" });
      setSignerName(org?.name ?? "");
      setContractUrl(""); setCmsg("");
      setToast("Proposta gerada e enviada ✓");
    } catch (e) { setToast("Erro ao gerar: " + errorMessage(e)); }
    setBusy(false);
    setTimeout(() => setToast(""), 6000);
  }

  async function gerarContrato() {
    if (!contract) return;
    setCbusy(true); setCmsg("");
    const r = await api.commerce.proposals.generateContract(contract.id);
    setCbusy(false);
    if (!r.ok) { setCmsg("Erro ao gerar contrato: " + (r.error || "")); return; }
    setContractUrl(r.download_url || "");
    setCmsg("Contrato gerado ✓");
    if (r.download_url) window.open(r.download_url, "_blank");
  }

  async function enviarAssinatura() {
    if (!contract) return;
    if (!signerClient.trim()) { setCmsg("Informe o e-mail do cliente para assinatura."); return; }
    const signers = [
      { email: signerClient.trim(), name: signerName || contract.orgName, action: "SIGN" },
      { email: "comercial@crasto.ai", name: "Crasto.AI", action: "SIGN" },
    ];
    if (!sandbox && !confirm(`Enviar o contrato REAL para assinatura de:\n• ${signerClient}\n• comercial@crasto.ai\n\nIsto dispara e-mails de assinatura de verdade. Confirmar?`)) return;
    setCbusy(true); setCmsg("");
    const r = await api.commerce.proposals.sendAutentique({ proposal_id: contract.id, signers, sandbox, doc_name: `Contrato Crasto.AI × ${contract.orgName}` });
    setCbusy(false);
    if (!r.ok) { setCmsg("Erro no Autentique: " + (r.error || "")); return; }
    setCmsg(sandbox ? `Teste OK (sandbox) — nenhum e-mail real enviado. Doc ${r.autentique_id}.` : `Enviado para assinatura ✓${r.link ? " · link: " + r.link : ""}`);
  }

  return (
    <div className="proppage">
      <PageHead eyebrow="Painel Admin" title="Gerador de propostas" sub="Monte uma proposta personalizada com a espinha dorsal Crasto.AI." />
      <div className="propgrid">
        <div className="card">
          {/* Chat/voz com IA (Claude Max via ponte) */}
          <div style={{ marginBottom: 18, padding: 14, borderRadius: 12, background: "var(--crasto-bg-3)", border: "1px solid var(--crasto-border-soft)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--crasto-text-primary)" }}>Assistente da proposta</span>
              <span style={{ fontSize: 10.5, color: "var(--crasto-text-muted)", fontWeight: 500 }}>fale ou escreva — ex.: "anota que o site é cortesia"</span>
            </div>
            {chatLog.length > 0 && (
              <div style={{ maxHeight: 130, overflowY: "auto", marginBottom: 9, display: "grid", gap: 6 }}>
                {chatLog.map((m, i) => (
                  <div key={i} style={{ fontSize: 12.5, lineHeight: 1.45, padding: "6px 10px", borderRadius: 8, background: m.role === "you" ? "var(--crasto-navy-05)" : "var(--crasto-bg-2)", color: "var(--crasto-text-body)", justifySelf: m.role === "you" ? "end" : "start", maxWidth: "88%" }}>{m.text}</div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendChat()} placeholder={chatBusy ? "Pensando…" : "Dê uma instrução…"} disabled={chatBusy}
                style={{ flex: 1, fontSize: 13, padding: "8px 11px", border: "1px solid var(--crasto-border-soft)", borderRadius: 9, background: "var(--crasto-bg-2)", color: "var(--crasto-text-body)" }} />
              <button type="button" onClick={dictateChat} title="Falar (voz→texto)" aria-label="Falar" style={{ display: "grid", placeItems: "center", width: 36, borderRadius: 9, cursor: "pointer", border: "1px solid " + (listening === "__chat__" ? "var(--crasto-navy)" : "var(--crasto-border-soft)"), background: listening === "__chat__" ? "var(--crasto-navy-05)" : "var(--crasto-bg-2)", color: listening === "__chat__" ? "var(--crasto-navy)" : "var(--crasto-text-muted)" }}><Mic size={15} /></button>
              <button type="button" onClick={sendChat} disabled={chatBusy || !chatInput.trim()} className="crasto-btn crasto-btn--primary crasto-btn--sm"><span className="crasto-btn__label">Enviar</span></button>
            </div>
          </div>

          {propNotes.length > 0 && (
            <div className="note" style={{ marginBottom: 14 }}>
              <b>Observações da proposta:</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{propNotes.map((n, i) => <li key={i} style={{ fontSize: 12.5 }}>{n}</li>)}</ul>
            </div>
          )}

          <div className="pstep"><span className="stepn">1</span><h3>Cliente</h3></div>
          <label className="frow" style={{ marginBottom: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--crasto-text-body)" }}>Digite o nome ou CNPJ — busca no CRM</span>
            <input className="selorg" list="orglist" value={orgQuery} onChange={(e) => pickOrg(e.target.value)} placeholder="Comece a digitar…" autoComplete="off" />
            <datalist id="orglist">{orgs.map((o) => <option key={o.id} value={o.name}>{o.cnpj ? `CNPJ ${o.cnpj}` : ""}</option>)}</datalist>
          </label>
          {org && (
            <div className="crmcard">
              <div><div className="cn">{org.name}</div><div className="cc">{bill?.value ? `${bill.kind} ${bill.value}` : "Cliente do CRM"}</div></div>
              <span className="pill ok"><span className="d" />No CRM</span>
            </div>
          )}
          {cnpjOpts.length > 0 && (
            <label className="frow" style={{ marginTop: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--crasto-text-body)" }}>Faturar para o CNPJ</span>
              <select className="selorg" value={billId} onChange={(e) => setBillId(e.target.value)}>
                {cnpjOpts.map((c) => <option key={c.id} value={c.id}>{c.value}{c.is_primary ? " (principal)" : ""}</option>)}
              </select>
              {bill?.address && <span style={{ fontSize: 12, color: "var(--crasto-text-muted)", marginTop: 6 }}>📍 {bill.address}</span>}
            </label>
          )}

          <div className="pstep"><span className="stepn">2</span><h3>Serviços do catálogo</h3></div>
          {items.map((id) => {
            const s = svcs.find((x) => x.id === id);
            if (!s) return null;
            const kind = itemKind(s);
            const sp = specs[id] || {};
            const setSp = (patch: Record<string, any>) => setSpecs({ ...specs, [id]: { ...sp, ...patch } });
            const spInput = { fontSize: 12, padding: "6px 10px", border: "1px solid var(--crasto-border-soft)", borderRadius: 8, background: "var(--crasto-bg-3)", color: "var(--crasto-text-body)" } as const;
            return (
              <div key={id} style={{ borderBottom: "1px solid var(--crasto-border-soft)", padding: "11px 0" }}>
                <div className="propitem" style={{ border: 0, padding: 0 }}>
                  <div><div className="pn">{s.name}</div><div className="pt">{s.unit.replace("_", " ")} · tabela {fmt(s.price_table)}</div></div>
                  <div className="pinp"><span>{inUSD ? "US$" : "R$"}</span>
                    <input value={(vals[id] ?? 0).toLocaleString("pt-BR")} onChange={(e) => setVals({ ...vals, [id]: parseInt(e.target.value.replace(/\D/g, "")) || 0 })} />
                  </div>
                </div>
                {/* especificidades conforme o tipo do serviço */}
                {kind === "workshop" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <input type="number" min={1} value={sp.people ?? ""} onChange={(e) => setSp({ people: e.target.value })} placeholder="Nº de pessoas" style={{ ...spInput, width: 130 }} />
                    <select value={sp.modality ?? ""} onChange={(e) => setSp({ modality: e.target.value })} style={{ ...spInput, flex: 1, minWidth: 140 }}>
                      <option value="">Modalidade…</option>{MODALIDADES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
                {kind === "agent" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <input type="number" min={1} value={sp.agents ?? ""} onChange={(e) => setSp({ agents: e.target.value })} placeholder="Nº de agentes de IA" style={{ ...spInput, width: 160 }} />
                    <input value={sp.routines ?? ""} onChange={(e) => setSp({ routines: e.target.value })} placeholder="Rotinas automatizáveis (ex.: triagem, follow-up)" style={{ ...spInput, flex: 1, minWidth: 180 }} />
                  </div>
                )}
                {kind === "automation" && (
                  <input value={sp.routines ?? ""} onChange={(e) => setSp({ routines: e.target.value })} placeholder="Rotinas/fluxos a automatizar" style={{ ...spInput, marginTop: 8, width: "100%" }} />
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 7, alignItems: "stretch" }}>
                  <input value={notes[id] || ""} onChange={(e) => setNotes({ ...notes, [id]: e.target.value })} placeholder="+ nota deste item (entra no contrato / NF)" style={{ flex: 1, fontSize: 12, padding: "6px 10px", border: "1px dashed var(--crasto-border)", borderRadius: 8, background: "transparent", color: "var(--crasto-text-body)" }} />
                  <button type="button" onClick={() => dictate(id)} title="Ditar por voz (grátis)" aria-label="Ditar por voz" style={{ display: "grid", placeItems: "center", width: 34, borderRadius: 8, cursor: "pointer", border: "1px solid " + (listening === id ? "var(--crasto-navy)" : "var(--crasto-border-soft)"), background: listening === id ? "var(--crasto-navy-05)" : "var(--crasto-bg-3)", color: listening === id ? "var(--crasto-navy)" : "var(--crasto-text-muted)" }}>
                    <Mic size={14} className={listening === id ? "pulse" : ""} />
                  </button>
                </div>
              </div>
            );
          })}

          <div className="pstep"><span className="stepn">3</span><h3>Agente indicador</h3></div>
          {agents.length === 0 ? (
            <div className="crmcard"><div><div className="cn">Nenhum agente cadastrado</div><div className="cc">Cadastre em "Agentes indicadores" para atribuir comissão.</div></div></div>
          ) : (
            <>
              <label className="frow" style={{ marginBottom: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--crasto-text-body)" }}>Quem indicou este cliente</span>
                <select className="selorg" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.agent_type === "conector" ? "Conector" : "Indicador"} ({a.commission_default}%)</option>)}
                </select>
              </label>
              {agent && (
                <div className="crmcard">
                  <div><div className="cn">{agent.name}</div><div className="cc">Comissão {commissionPct}% · pagamento por {HANDL[agent.payment_handling] || agent.payment_handling}</div></div>
                  <span className={"pill " + (agent.agent_type === "conector" ? "info" : "ok")}><span className="d" />{agent.agent_type === "conector" ? "Conector" : "Indicador"}</span>
                </div>
              )}
            </>
          )}

          <div className="pstep"><span className="stepn">4</span><h3>Anexos</h3></div>
          {/* documentos reais do cliente (do CRM) */}
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--crasto-text-body)", margin: "2px 0 8px" }}>Documentos do cliente</div>
          {clientDocs.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--crasto-text-muted)", marginBottom: 10 }}>Nenhum documento no cadastro deste cliente. Envie um abaixo ou anexe pelo cadastro do cliente.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {clientDocs.map((d) => {
                const on = attDocs.has(d.id);
                return (
                  <button key={d.id} onClick={() => { const n = new Set(attDocs); on ? n.delete(d.id) : n.add(d.id); setAttDocs(n); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "6px 11px", borderRadius: 999, cursor: "pointer", border: on ? "1px solid var(--crasto-navy)" : "1px solid var(--crasto-border-soft)", background: on ? "var(--crasto-navy-05)" : "var(--crasto-bg-3)", color: on ? "var(--crasto-text-primary)" : "var(--crasto-text-body)", fontWeight: on ? 700 : 500 }}>
                    <FileText size={13} />{d.file_name}<span style={{ opacity: .6 }}>· {DOC_KIND_L[d.kind] || d.kind}</span>{on && <Check size={13} />}
                  </button>
                );
              })}
            </div>
          )}
          <label className="crasto-btn crasto-btn--secondary crasto-btn--sm" style={{ cursor: orgId ? "pointer" : "not-allowed", opacity: orgId ? 1 : .5 }}>
            <span className="crasto-btn__icon"><Upload size={14} /></span><span className="crasto-btn__label">{uploading ? "Enviando…" : "Enviar anexo"}</span>
            <input type="file" hidden disabled={!orgId || uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAnexo(f); e.target.value = ""; }} />
          </label>
          {/* peças estratégicas Crasto (opcionais) */}
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--crasto-text-body)", margin: "16px 0 8px" }}>Peças estratégicas Crasto</div>
          <div className="attgrid">
            {ANEXOS.map((a) => (
              <label key={a} className={"att" + (att.has(a) ? " on" : "")} onClick={() => { const n = new Set(att); n.has(a) ? n.delete(a) : n.add(a); setAtt(n); }}>
                <span className="cb"><Check size={11} style={{ opacity: att.has(a) ? 1 : 0 }} /></span>{a}
              </label>
            ))}
          </div>
        </div>

        <div className="card summary">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h3 style={{ margin: 0 }}>Resumo da proposta</h3>
            <div style={{ display: "inline-flex", border: "1px solid var(--crasto-border-soft)", borderRadius: 999, overflow: "hidden" }}>
              {(["BRL", "USD"] as const).map((c) => (
                <button key={c} onClick={() => setCurrency(c)} style={{ fontSize: 12, fontWeight: 700, padding: "5px 12px", border: 0, cursor: "pointer", background: currency === c ? "var(--crasto-navy)" : "transparent", color: currency === c ? "#fff" : "var(--crasto-text-muted)" }}>{c}</button>
              ))}
            </div>
          </div>
          <div className="csub">{inUSD ? `Câmbio do dia: R$ ${fx.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} / US$` : "Valores editáveis · base = preço de tabela"}</div>
          {currency === "USD" && fx === 0 && <div className="csub" style={{ color: "var(--crasto-danger)" }}>Cotação indisponível — usando BRL.</div>}
          {items.map((id) => {
            const s = svcs.find((x) => x.id === id);
            return <div className="sumrow" key={id}><span>{s?.name}</span><span className="tnum">{fmt(vals[id] ?? 0)}</span></div>;
          })}
          <div className="sumrow"><span>Subtotal (serviços)</span><span className="tnum">{fmt(total)}</span></div>
          <div className="sumrow"><span>Imposto ({fmtRate(taxRate)}%){special ? " — isento (venda especial)" : ""}</span><span className="tnum" style={{ color: special ? "var(--crasto-text-muted)" : "var(--crasto-danger)" }}>{fmt(tax)}</span></div>
          <div className="sumrow tot"><span>Total {special ? "(sem NF)" : "com imposto"}</span><span className="tnum">{fmt(total + tax)}</span></div>
          <div className="sumrow"><span>Comissão {agent?.agent_type === "conector" ? "conector" : "indicador"} ({commissionPct}%)</span><span className="tnum" style={{ color: "#B8863A" }}>{fmt(commission)}</span></div>
          <label className="frow specialbox" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, margin: "12px 0 4px", padding: "12px 14px", borderRadius: 12, background: special ? "var(--crasto-navy-05)" : "var(--crasto-bg-3)", border: special ? "1px solid var(--crasto-navy-20)" : "1px solid var(--crasto-border-soft)" }}>
            <input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} style={{ width: "auto", marginTop: 2 }} />
            <span style={{ margin: 0 }}><b>Venda especial</b> (sem Nota Fiscal) — faz todo o fluxo mas <b>não emite NF</b> e não aplica imposto. Ex.: vendas-teste, cortesias, permutas.</span>
          </label>
          <div className="paycheck">🟢 <b>IA se paga em ~28 dias</b><div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", marginTop: 4, fontWeight: 400 }}>Baseado no Plano Diretor: economia + receita projetada &gt; investimento em 30d.</div></div>
          <button className="crasto-btn crasto-btn--primary crasto-btn--md" style={{ width: "100%", marginTop: 14 }} disabled={busy} onClick={gerar}><span className="crasto-btn__label">{busy ? "Gerando…" : special ? "Gerar venda especial (sem NF)" : "Gerar proposta personalizada"}</span></button>

          {contract && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--crasto-border-soft)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--crasto-text-primary)", marginBottom: 2 }}>Contrato — {contract.orgName}</div>
              <div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", marginBottom: 10 }}>Gerado do molde jurídico (fidelidade máxima). Revise o .docx antes de enviar.</div>
              <button className="crasto-btn crasto-btn--secondary crasto-btn--md" style={{ width: "100%" }} disabled={cbusy} onClick={gerarContrato}>
                <span className="crasto-btn__icon"><FileText size={14} /></span><span className="crasto-btn__label">{cbusy ? "Processando…" : contractUrl ? "Baixar contrato (.docx)" : "Gerar contrato (.docx)"}</span>
              </button>
              {contractUrl && <a href={contractUrl} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 12, color: "#3E6FB8", marginTop: 6 }}>Abrir contrato gerado ↗</a>}

              <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
                <input value={signerClient} onChange={(e) => setSignerClient(e.target.value)} placeholder="E-mail do cliente (signatário)" style={{ fontSize: 13, padding: "8px 11px", border: "1px solid var(--crasto-border-soft)", borderRadius: 9, background: "var(--crasto-bg-3)", color: "var(--crasto-text-body)" }} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--crasto-text-body)" }}>
                  <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} style={{ width: "auto" }} />
                  Modo teste (sandbox) — não envia e-mail real de assinatura
                </label>
                <button className="crasto-btn crasto-btn--primary crasto-btn--md" style={{ width: "100%" }} disabled={cbusy} onClick={enviarAssinatura}>
                  <span className="crasto-btn__icon"><ArrowRight size={14} /></span><span className="crasto-btn__label">{cbusy ? "Enviando…" : sandbox ? "Testar envio (sandbox)" : "Enviar p/ assinatura (Autentique)"}</span>
                </button>
              </div>
              {cmsg && <div style={{ fontSize: 12, marginTop: 9, padding: "8px 11px", borderRadius: 9, background: "var(--crasto-navy-05)", color: "var(--crasto-text-primary)" }}>{cmsg}</div>}
            </div>
          )}
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
