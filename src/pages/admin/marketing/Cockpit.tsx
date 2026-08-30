import { useEffect, useState } from "react";
import { mktApi } from "../../../lib/mktApi";
import { MktModal } from "./_ui";

// Cockpit de Marketing — NATIVO no portal, ligado à marketing-api (banco `marketing`).
// Paridade com o protótipo aprovado (classes .mkt-root em styles/marketing.css).
// Funil leads/conversas/vendas/receita vem do CRM (Portal) — marcado como tal.

const nf = new Intl.NumberFormat("pt-BR");
const num = (v: any) => (v == null ? "—" : nf.format(Number(v)));
const kfmt = (v: any) => {
  const n = Number(v) || 0;
  return n >= 1000 ? { v: (n / 1000).toFixed(1).replace(".", ","), u: "k" } : { v: String(n), u: "" };
};
const br = (v: any) => (v == null ? "—" : "R$ " + nf.format(Number(v)));
const dec = (v: any) => (v == null ? "—" : String(v).replace(".", ","));

type Kpis = any;
type Resp = { north_star: any; action_today: string; kpis: Kpis; cost_center: any[] };

export default function MarketingCockpit() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drill, setDrill] = useState<{ title: string; rows: any[] } | null>(null);

  useEffect(() => {
    mktApi.get<Resp>("/marketing/cockpit").then(setData).catch((e) => setErr(e.message || "erro"));
  }, []);

  async function openDrill(key: string, title: string) {
    try {
      const rows = await mktApi.get<any[]>("/marketing/cockpit/drill/" + key);
      setDrill({ title, rows: rows || [] });
    } catch (e: any) { setDrill({ title, rows: [] }); }
  }

  const Kpi = ({ label, value, unit, kdrill, kkey }: any) => (
    <div className="kpi" onClick={kkey ? () => openDrill(kkey, label) : undefined}>
      <div className="kl">{label}</div>
      <div className="kv">{value}{unit ? <span className="ku">{unit}</span> : null}</div>
    </div>
  );

  if (err) return <div className="mkt-root"><div className="eyebrow">Marketing</div><h1 className="page-title">Cockpit de Marketing</h1><div className="cock-note">Não foi possível carregar os dados agora. Tente novamente em instantes.</div></div>;
  if (!data) return <div className="mkt-root"><div className="eyebrow">Marketing</div><h1 className="page-title">Cockpit de Marketing</h1><div className="cock-note">Carregando…</div></div>;

  const k = data.kpis || {}, ns = data.north_star || {}, ads = k.ads || {}, cc = data.cost_center || [];
  const reach = kfmt(k.reach), views = kfmt(k.views);
  const subtotal = cc.reduce((s, t) => s + (Number(t.cost_month) || 0), 0);
  const nsClass = ns.status === "green" ? "green" : ns.status === "red" ? "red" : "yellow";

  // Funil — larguras AUTOMÁTICAS a partir dos números reais. Zerado ⇒ barra vazia
  // (0 à esquerda). Nada de largura fixa/fictícia. Leads/Conversas/Vendas vêm do CRM.
  const crm = k.from_crm || {};
  const asNum = (x: any) => (x == null || isNaN(Number(x)) ? null : Number(x));
  const fpub = asNum(k.published) || 0, freach = asNum(k.reach) || 0;
  const fleads = asNum(crm.leads), fconv = asNum(crm.conversations ?? crm.conversas), fsales = asNum(crm.sales ?? crm.vendas);
  const fmax = Math.max(fpub, freach, fleads || 0, fconv || 0, fsales || 0, 1);
  const fpct = (v: number | null) => (v && v > 0 ? Math.min(100, Math.max(8, Math.round((v / fmax) * 100))) : 0);
  const FnRow = ({ lbl, v, sub, crmSrc, win }: any) => (
    <div className={"fn-row" + (win ? " win" : "")}>
      <div className="fn-lbl">{lbl}</div>
      <div className="fn-track">
        {v && v > 0
          ? <div className="fn-bar" style={{ width: fpct(v) + "%" }}><b>{v >= 1000 ? kfmt(v).v + kfmt(v).u : num(v)}</b></div>
          : <span className="fn-zero">{crmSrc ? "—" : "0"}</span>}
      </div>
      <div className={"fn-sub" + (crmSrc ? " mono" : "")}>{sub}</div>
    </div>
  );

  return (
    <div className="mkt-root">
      <div className="eyebrow">Marketing</div>
      <h1 className="page-title">Cockpit de Marketing</h1>
      <p className="page-sub">Todos os indicadores de marketing consolidados num só lugar.</p>

      {/* North Star */}
      <div className="ns-hero">
        <div className="ns-main">
          <div className="ns-lbl">Estrela-guia · {ns.metric || "Leads do mês"}</div>
          <div className="ns-val">{num(ns.value)} <span className="ns-of">/ meta {num(ns.goal)}</span></div>
          <div className={"ns-bar " + nsClass}><i style={{ width: (ns.pct != null ? Math.min(100, ns.pct) : 0) + "%" }} /></div>
          <div className={"ns-status " + nsClass}>{ns.value == null ? "Meta de " + num(ns.goal) + " leads no mês" : (ns.pct + "% da meta")}</div>
        </div>
        <div className="ns-side">
          <div className="ns-mini"><span>ROI</span><b>{dec(ads.roi)}×</b></div>
          <div className="ns-mini"><span>Custo por lead</span><b>{br(ads.cpl)}</b></div>
        </div>
      </div>

      {/* Ação de hoje */}
      <div className="today-action">
        <div className="ta-ic">⚡</div>
        <div className="ta-body">
          <div className="ta-lbl">A ação de hoje</div>
          <div className="ta-txt">{data.action_today}</div>
        </div>
      </div>

      {/* Funil do post à venda */}
      <div className="cock-group">💵 <span>Do post à venda</span></div>
      <div className="funnel">
        <FnRow lbl="📣 Publicados" v={fpub} sub="posts/mês" />
        <FnRow lbl="👁 Alcance" v={freach} sub="pessoas" />
        <FnRow lbl="💬 Leads" v={fleads} sub="via CRM" crmSrc />
        <FnRow lbl="🗣 Conversas" v={fconv} sub="via CRM" crmSrc />
        <FnRow lbl="🏆 Vendas" v={fsales} sub="via CRM" crmSrc win />
      </div>
      <div className="funnel-foot">
        <div className="ff-kpi"><span>Receita atribuída</span><b className="mono">— <span style={{ fontSize: 12, color: "var(--muted)" }}>(CRM)</span></b></div>
        <div className="ff-kpi"><span>Investimento (ads)</span><b className="mono">{br(ads.invest)}</b></div>
        <div className="ff-kpi hl"><span>ROI do tráfego</span><b className="mono">{dec(ads.roi)}×</b></div>
      </div>

      {/* Vídeos Virais */}
      <div className="cock-group">🎬 <span>Vídeos Virais</span></div>
      <div className="kpi-grid">
        <Kpi label="Alcance (30d)" value={reach.v} unit={reach.u} kdrill kkey="reach" />
        <Kpi label="Views de vídeo" value={views.v} unit={views.u} kdrill kkey="views" />
        <Kpi label="Engajamento" value={dec(k.engagement)} unit="%" kdrill kkey="engagement" />
        <Kpi label="Retenção 3s (Reels)" value={dec(k.retention3s)} unit="%" kdrill kkey="retention3s" />
        <Kpi label="Salvamentos (7d)" value={num(k.saves)} kdrill kkey="saves" />
        <Kpi label="Publicados" value={num(k.published)} kdrill kkey="published" />
      </div>

      {/* Agendamento & Automação */}
      <div className="cock-group">🗓 <span>Agendamento & Automação</span></div>
      <div className="kpi-grid">
        <Kpi label="Posts agendados" value={num(k.scheduled)} kdrill kkey="scheduled" />
        <Kpi label="Aguardando aprovação" value={num(k.awaiting)} kdrill kkey="awaiting" />
        <Kpi label="Taxa de aprovação" value={num(k.approval_rate)} unit="%" kdrill kkey="published" />
        <Kpi label="Leads via comentário→DM" value={num(k.dm_leads)} kdrill kkey="dm_leads" />
      </div>

      {/* Mídia Paga */}
      <div className="cock-group">💸 <span>Mídia Paga (Tráfego Pago)</span> <span className="roy-chip">🎯 Roy</span></div>
      <div className="kpi-grid">
        <Kpi label="Investimento" value={br(ads.invest)} kdrill kkey="ads" />
        <Kpi label="ROAS" value={dec(ads.roas)} unit="×" kdrill kkey="ads" />
        <Kpi label="CPL" value={br(ads.cpl)} kdrill kkey="ads" />
        <Kpi label="CPM" value={br(ads.cpm)} kdrill kkey="ads" />
        <Kpi label="CTR" value={dec(ads.ctr)} unit="%" kdrill kkey="ads" />
        <Kpi label="Conversões" value={num(ads.conversions)} kdrill kkey="ads" />
      </div>

      {/* Centro de Custo */}
      <div className="cock-group">💰 <span>Centro de Custo de Marketing</span></div>
      <div className="cc-wrap">
        <div className="cc-tools">
          <div className="cc-row cc-head"><span>Ferramenta</span><span>Tipo</span><span>Custo/mês</span></div>
          {cc.length ? cc.map((t, i) => (
            <div className="cc-row" key={i}>
              <span className="cc-n">{t.name}{t.role ? <span className="cc-role"> · {t.role}</span> : null}</span>
              <span className={"cc-tag " + (t.billing === "free" || t.billing === "included" ? "free" : "paid")}>{t.billing || "pago"}</span>
              <span className="cc-c mono">{br(t.cost_month)}</span>
            </div>
          )) : <div className="cc-row"><span className="cc-n" style={{ color: "var(--muted)" }}>sem ferramentas cadastradas</span><span /><span /></div>}
        </div>
        <div className="cc-summary">
          <div className="cc-s-row"><span>Ferramentas (assinaturas)</span><b className="mono">{br(subtotal)}</b></div>
          <div className="cc-s-row"><span>Mídia paga (anúncios)</span><b className="mono">{br(ads.invest)}</b></div>
          <div className="cc-s-row tot"><span>Custo total do marketing</span><b className="mono">{br(subtotal + (Number(ads.invest) || 0))}</b></div>
        </div>
      </div>

      <div className="cock-note">📊 Consolida Vídeos Virais, Agendamento & Automação e Mídia Paga num só lugar. O funil de leads a vendas vem do seu CRM.</div>

      {/* Drill-down real — via MktModal (createPortal no body: sempre centralizado + backdrop opaco) */}
      {drill && (
        <MktModal title={`${drill.title} · ${drill.rows.length} ${drill.rows.length === 1 ? "item" : "itens"}`} onClose={() => setDrill(null)}>
          {drill.rows.length
            ? drill.rows.map((r, i) => (
                <div key={i} style={{ padding: "8px 4px", borderBottom: "1px solid var(--border)", fontSize: 13, fontFamily: "var(--font-mono)" }}>{JSON.stringify(r)}</div>
              ))
            : <div style={{ color: "var(--muted)", padding: 12 }}>Sem itens ainda.</div>}
        </MktModal>
      )}
    </div>
  );
}
