import { useEffect, useMemo, useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { services as api, errorMessage } from "../../services";
import { PageHead, money } from "../../ui/ui";
import { taxOf, fmtRate } from "../../lib/config";
import { useSettings } from "../../lib/settings";

type Org = { id: string; name: string; cnpj: string | null };
type Svc = { id: string; name: string; unit: string; price_table: number };
type Agent = { id: string; name: string; agent_type: string; commission_default: number; payment_handling: string; active: boolean };
type TaxId = { id: string; kind: string; value: string; address: string | null; is_primary: boolean };

const ANEXOS = ["Plano Diretor", "Playbook Comercial", "Plano de Marketing", "Financeiro Estratégico"];
const HANDL: Record<string, string> = { nota_fiscal: "Nota Fiscal", por_fora: "por fora", reembolso: "reembolso de despesas" };

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
  const [items, setItems] = useState<string[]>([]);
  const [att, setAtt] = useState<Set<string>>(new Set(["Plano Diretor", "Playbook Comercial", "Financeiro Estratégico"]));
  const [currency, setCurrency] = useState<"BRL" | "USD">("BRL");
  const [fx, setFx] = useState<number>(0);
  const [special, setSpecial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

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

  // ao trocar de cliente, carrega os CNPJs
  useEffect(() => {
    if (!orgId) { setTaxIds([]); setBillId(""); return; }
    api.crm.taxIds.listByOrg(orgId).then((t) => {
      const list = (t as unknown as TaxId[]) ?? [];
      setTaxIds(list);
      setBillId(list[0]?.id ?? "org");
    }).catch(() => { setTaxIds([]); setBillId("org"); });
  }, [orgId]);

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
      });
      const rows = items.map((id) => { const s = svcs.find((x) => x.id === id); return { proposal_id: (prop as any).id, organization_id: orgId, service_id: id, description: s?.name ?? "Item", qty: 1, unit_price: vals[id] ?? 0, notes: notes[id] || null }; });
      await api.commerce.proposals.addItems(rows);
      setToast("Proposta gerada e enviada ✓");
    } catch (e) { setToast("Erro ao gerar: " + errorMessage(e)); }
    setBusy(false);
    setTimeout(() => setToast(""), 6000);
  }

  return (
    <div className="proppage">
      <PageHead eyebrow="Painel Admin" title="Gerador de propostas" sub="Monte uma proposta personalizada com a espinha dorsal Crasto.AI." />
      <div className="propgrid">
        <div className="card">
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
            return (
              <div key={id} style={{ borderBottom: "1px solid var(--crasto-border-soft)", padding: "11px 0" }}>
                <div className="propitem" style={{ border: 0, padding: 0 }}>
                  <div><div className="pn">{s.name}</div><div className="pt">{s.unit.replace("_", " ")} · tabela {fmt(s.price_table)}</div></div>
                  <div className="pinp"><span>{inUSD ? "US$" : "R$"}</span>
                    <input value={(vals[id] ?? 0).toLocaleString("pt-BR")} onChange={(e) => setVals({ ...vals, [id]: parseInt(e.target.value.replace(/\D/g, "")) || 0 })} />
                  </div>
                </div>
                <input value={notes[id] || ""} onChange={(e) => setNotes({ ...notes, [id]: e.target.value })} placeholder="+ nota deste item (entra no contrato / NF)" style={{ marginTop: 7, width: "100%", fontSize: 12, padding: "6px 10px", border: "1px dashed var(--crasto-border)", borderRadius: 8, background: "transparent", color: "var(--crasto-text-body)" }} />
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

          <div className="pstep"><span className="stepn">4</span><h3>Anexos estratégicos</h3></div>
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
          <button className="crasto-btn crasto-btn--secondary crasto-btn--md" style={{ width: "100%", marginTop: 8 }}><span className="crasto-btn__icon"><ArrowRight size={14} /></span><span className="crasto-btn__label">Enviar p/ assinatura (Autentique)</span></button>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
