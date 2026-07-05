import { useEffect, useMemo, useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PageHead, money } from "../../ui/ui";

type Org = { id: string; name: string; cnpj: string | null };
type Svc = { id: string; name: string; unit: string; price_table: number };

const ANEXOS = ["Plano Diretor", "Playbook Comercial", "Plano de Marketing", "Financeiro Estratégico"];

export default function Propostas() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [svcs, setSvcs] = useState<Svc[]>([]);
  const [orgId, setOrgId] = useState<string>("");
  const [vals, setVals] = useState<Record<string, number>>({});
  const [items, setItems] = useState<string[]>([]);
  const [att, setAtt] = useState<Set<string>>(new Set(["Plano Diretor", "Playbook Comercial", "Financeiro Estratégico"]));

  useEffect(() => {
    (async () => {
      const [o, s] = await Promise.all([
        supabase.from("organizations").select("id,name,cnpj").order("name"),
        supabase.schema("catalog").from("services").select("id,name,unit,price_table").order("price_table", { ascending: false }),
      ]);
      const os = (o.data as Org[]) ?? [];
      const ss = (s.data as Svc[]) ?? [];
      setOrgs(os); setSvcs(ss);
      if (os[0]) setOrgId(os[0].id);
      const first3 = ss.slice(0, 3);
      setItems(first3.map((x) => x.id));
      setVals(Object.fromEntries(first3.map((x) => [x.id, Number(x.price_table)])));
    })();
  }, []);

  const org = orgs.find((o) => o.id === orgId);
  const total = useMemo(() => items.reduce((s, id) => s + (vals[id] ?? 0), 0), [items, vals]);
  const commission = Math.round(total * 0.2);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  async function gerar() {
    if (!orgId) { setToast("Escolha um cliente."); setTimeout(() => setToast(""), 4000); return; }
    setBusy(true);
    const { data: prop, error } = await supabase.schema("commerce").from("proposals")
      .insert({ organization_id: orgId, title: `Proposta — ${org?.name ?? ""}`.trim(), status: "sent", subtotal: total, commission_total: commission, attachments: Object.fromEntries([...att].map((a) => [a, true])) })
      .select("id").single();
    if (!error && prop) {
      const rows = items.map((id) => { const s = svcs.find((x) => x.id === id); return { proposal_id: (prop as any).id, organization_id: orgId, service_id: id, description: s?.name ?? "Item", qty: 1, unit_price: vals[id] ?? 0 }; });
      await supabase.schema("commerce").from("proposal_items").insert(rows);
    }
    setBusy(false);
    setToast(error ? "Erro ao gerar: " + error.message : "Proposta gerada e enviada ✓");
    setTimeout(() => setToast(""), 6000);
  }

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Gerador de propostas" sub="Monte uma proposta personalizada com a espinha dorsal Crasto.AI." />
      <div className="propgrid">
        <div className="card">
          <div className="pstep"><span className="stepn">1</span><h3>Cliente</h3></div>
          <label className="frow" style={{ marginBottom: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--crasto-text-body)" }}>Escolha no CRM (por nome / CNPJ)</span>
            <select className="selorg" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}{o.cnpj ? ` — ${o.cnpj}` : ""}</option>)}
            </select>
          </label>
          {org && (
            <div className="crmcard">
              <div><div className="cn">{org.name}</div><div className="cc">{org.cnpj ? `CNPJ ${org.cnpj}` : "Cliente do CRM"}</div></div>
              <span className="pill ok"><span className="d" />No CRM</span>
            </div>
          )}

          <div className="pstep"><span className="stepn">2</span><h3>Serviços do catálogo</h3></div>
          {items.map((id) => {
            const s = svcs.find((x) => x.id === id);
            if (!s) return null;
            return (
              <div className="propitem" key={id}>
                <div><div className="pn">{s.name}</div><div className="pt">{s.unit.replace("_", " ")} · tabela {money(s.price_table)}</div></div>
                <div className="pinp"><span>R$</span>
                  <input value={(vals[id] ?? 0).toLocaleString("pt-BR")} onChange={(e) => setVals({ ...vals, [id]: parseInt(e.target.value.replace(/\D/g, "")) || 0 })} />
                </div>
              </div>
            );
          })}

          <div className="pstep"><span className="stepn">3</span><h3>Agente conector (indicação)</h3></div>
          <div className="crmcard">
            <div><div className="cn">Viver de IA</div><div className="cc">Comissão 20% · pagamento por Nota Fiscal</div></div>
            <span className="pill info"><span className="d" />Conector</span>
          </div>

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
          <h3>Resumo da proposta</h3>
          <div className="csub">Valores editáveis · base = preço de tabela</div>
          {items.map((id) => {
            const s = svcs.find((x) => x.id === id);
            return <div className="sumrow" key={id}><span>{s?.name}</span><span className="tnum">{money(vals[id] ?? 0)}</span></div>;
          })}
          <div className="sumrow tot"><span>Total da proposta</span><span className="tnum">{money(total)}</span></div>
          <div className="sumrow"><span>Comissão conector (20%)</span><span className="tnum" style={{ color: "#B8863A" }}>{money(commission)}</span></div>
          <div className="paycheck">🟢 <b>IA se paga em ~28 dias</b><div style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", marginTop: 4, fontWeight: 400 }}>Baseado no Plano Diretor: economia + receita projetada &gt; investimento em 30d.</div></div>
          <button className="crasto-btn crasto-btn--primary crasto-btn--md" style={{ width: "100%", marginTop: 14 }} disabled={busy} onClick={gerar}><span className="crasto-btn__label">{busy ? "Gerando…" : "Gerar proposta personalizada"}</span></button>
          <button className="crasto-btn crasto-btn--secondary crasto-btn--md" style={{ width: "100%", marginTop: 8 }}><span className="crasto-btn__icon"><ArrowRight size={14} /></span><span className="crasto-btn__label">Enviar p/ assinatura (Autentique)</span></button>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
