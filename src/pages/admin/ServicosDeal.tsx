// ============================================================================
// ServicosDeal — serviços do negócio ligados ao CATÁLOGO DE SERVIÇOS, que evoluem
// no funil: INTERESSE (lead) → PROPOSTA → CONTRATADO (cliente). Fonte única
// (delivery.client_services). Cada linha guarda: serviço do catálogo + período +
// quem assume o custo de IA + modalidade + especificações. Compartilhado por
// lead e cliente (o `defaultSituacao` muda o que é criado). Decisão Crasto 2026-07-27.
// ============================================================================
import { useState } from "react";
import { Plus, Trash2, Search, FileText, ChevronDown } from "lucide-react";
import { services as api } from "../../services";
import { useAsync, Empty, money } from "../../ui/ui";
import { useT } from "../../lib/i18n";

const SITUACAO = [["interesse", "Interesse"], ["proposta", "Na proposta"], ["contratado", "Contratado"]];
const CUSTO = [["", "—"], ["absorvido", "Crasto absorve"], ["byo_cliente", "Cliente assume (BYO)"]];

export default function ServicosDeal({ orgId, defaultSituacao = "interesse", onDone }: { orgId: string; defaultSituacao?: string; onDone?: () => void }) {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => {
    const [rows, cat] = await Promise.all([
      api.delivery.clientServices.listByOrg(orgId).catch(() => []),
      api.catalog.services.list().catch(() => []),  // admin: traz price_table p/ a proposta
    ]);
    return { rows: (rows as any[]) ?? [], cat: (cat as any[]) ?? [] };
  }, [orgId]);

  const rows = data?.rows ?? [];
  const cat = data?.cat ?? [];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  const available = cat.filter((s) => !s.internal && (!q || `${s.name} ${s.category || ""}`.toLowerCase().includes(q.trim().toLowerCase())));

  async function addDirect(svc: any) {
    setBusy(true);
    try {
      await api.delivery.clientServices.attach(orgId, { id: svc.id, name: svc.name, description: svc.description, category: svc.category, unit: svc.unit }, { situacao: defaultSituacao });
      setQ(""); setOpen(false); await reload(); flash(t("Serviço adicionado ✓"));
    } catch { flash(t("Erro ao adicionar.")); } finally { setBusy(false); }
  }
  async function up(id: string, patch: Record<string, any>) { try { await api.delivery.clientServices.update(id, patch); flash(t("Salvo ✓")); } catch { flash(t("Erro ao salvar.")); } }
  async function upReload(id: string, patch: Record<string, any>) { await up(id, patch); await reload(); }
  async function del(id: string) { if (!confirm(t("Remover este serviço?"))) return; await api.delivery.clientServices.detach(id); await reload(); }

  const interesses = rows.filter((r) => (r.situacao || "interesse") === "interesse");
  // GATILHO (onda B): cria a v1 da proposta com os serviços de interesse, marca-os como
  // 'proposta' e move a empresa para OPORTUNIDADE. Crasto refina os valores no Gerador.
  async function gerarProposta() {
    if (!interesses.length) { flash(t("Marque ao menos um serviço de interesse.")); return; }
    if (!confirm(t("Gerar a v1 da proposta com {n} serviço(s) e mover a empresa para Oportunidade?", { n: interesses.length }))) return;
    setBusy(true);
    try {
      const items = interesses.map((r) => {
        const c = cat.find((x) => x.id === r.service_id);
        return { service_id: r.service_id || null, description: r.service_name || c?.name || t("Serviço"), unit_price: Number(c?.price_table ?? 0), qty: 1 };
      });
      const subtotal = items.reduce((s, i) => s + i.unit_price, 0);
      const prop: any = await api.commerce.proposals.create({ organization_id: orgId, title: t("Proposta — serviços de interesse"), subtotal, status: "draft" });
      if (!prop?.id) throw new Error("no proposal");
      await api.commerce.proposals.addItems(items.map((i) => ({ proposal_id: prop.id, organization_id: orgId, service_id: i.service_id, description: i.description, qty: 1, unit_price: i.unit_price })));
      await Promise.all(interesses.map((r) => api.delivery.clientServices.update(r.id, { situacao: "proposta" })));
      await api.identity.organizations.setStage(orgId, "oportunidade");
      flash(t("Proposta criada · empresa movida para Oportunidade ✓"));
      await reload();
      onDone?.();
    } catch { flash(t("Erro ao gerar a proposta.")); } finally { setBusy(false); }
  }

  const chipTone = (s: string) => (s === "contratado" ? "var(--crasto-success)" : s === "proposta" ? "var(--crasto-blue)" : "var(--crasto-text-muted)");

  return (
    <div>
      {/* adicionar do catálogo — combobox: digita e filtra, ou clica na seta pra ver todos; clique no item adiciona */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <div className="catsearch" style={{ margin: 0 }}>
          <Search size={16} />
          <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 160)}
            placeholder={t("Digite para buscar no catálogo (ex.: Google Workspace) ou clique na seta…")} />
          <button type="button" className="icobtn" onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }} title={t("Ver serviços do catálogo")}><ChevronDown size={16} /></button>
        </div>
        {open && (
          <div style={{ position: "absolute", zIndex: 30, left: 0, right: 0, marginTop: 4, background: "var(--crasto-surface)", border: "1px solid var(--crasto-border)", borderRadius: 12, boxShadow: "0 14px 34px rgba(0,0,0,.14)", maxHeight: 300, overflowY: "auto" }}>
            {available.length === 0 ? <div className="mt" style={{ padding: "11px 13px" }}>{q ? t("Nada encontrado para “{q}”.", { q }) : t("Catálogo vazio.")}</div> : available.slice(0, 40).map((s) => (
              <button key={s.id} type="button" disabled={busy} onMouseDown={(e) => { e.preventDefault(); addDirect(s); }}
                style={{ display: "flex", width: "100%", textAlign: "left", gap: 8, alignItems: "center", padding: "9px 12px", background: "none", border: "none", borderTop: "1px solid var(--crasto-border-soft)", cursor: "pointer", color: "var(--crasto-text-primary)" }}>
                <Plus size={13} style={{ color: "var(--crasto-blue)", flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ fontWeight: 600 }}>{s.name}</span>{s.category ? <span className="mt" style={{ marginLeft: 6 }}>· {s.category}</span> : null}</span>
                {s.price_table != null && <span className="tnum mt" style={{ fontSize: 12, flex: "none" }}>{money(s.price_table)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{t("Nenhum serviço ainda — escolha do catálogo acima o que ele quer.")}</div> : rows.map((r) => (
        <div className="card" style={{ marginBottom: 10, padding: 14 }} key={r.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: chipTone(r.situacao || "interesse"), flex: "none" }} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <input defaultValue={r.service_name || ""} onBlur={(e) => up(r.id, { service_name: e.target.value })} placeholder={t("Nome do serviço (customize p/ este cliente)")} title={t("Customizável por cliente/lead")} className="inp" style={{ fontWeight: 700, padding: "6px 8px" }} />
              <div className="mt" style={{ marginTop: 2 }}>{[r.service_category, r.service_unit].filter(Boolean).join(" · ")}</div>
            </div>
            <select defaultValue={r.situacao || "interesse"} onChange={(e) => upReload(r.id, { situacao: e.target.value })} className="selorg" style={{ width: 150 }}>
              {SITUACAO.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
            <button className="icobtn rm" title={t("Remover")} onClick={() => del(r.id)}><Trash2 size={14} /></button>
          </div>
          <div className="grid2" style={{ marginTop: 10 }}>
            <label className="frow"><span>{t("Período")}</span><input defaultValue={r.periodo || ""} onBlur={(e) => up(r.id, { periodo: e.target.value })} placeholder={t("ex.: 6 meses, 12 meses")} /></label>
            <label className="frow"><span>{t("Quem assume o custo de IA")}</span><select defaultValue={r.cost_allocation || ""} onChange={(e) => up(r.id, { cost_allocation: e.target.value })}>{CUSTO.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></label>
            <label className="frow"><span>{t("Modalidade")}</span><input defaultValue={r.modalidade || ""} onBlur={(e) => up(r.id, { modalidade: e.target.value })} placeholder={t("Serviço (Crasto opera) / Híbrido / Cliente opera")} /></label>
            <label className="frow"><span>{t("Especificações")}</span><input defaultValue={r.especificacoes || ""} onBlur={(e) => up(r.id, { especificacoes: e.target.value })} placeholder={t("detalhes do serviço p/ este cliente")} /></label>
          </div>
        </div>
      ))}
      {defaultSituacao === "interesse" && interesses.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--crasto-border-soft)", paddingTop: 12 }}>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={gerarProposta}><span className="crasto-btn__icon"><FileText size={14} /></span><span className="crasto-btn__label">{busy ? t("Gerando…") : t("Gerar proposta destes interesses → Oportunidade")}</span></button>
          <span className="mt" style={{ fontSize: 11.5 }}>{t("Cria a v1 da proposta e move a empresa para Oportunidade. Você refina os valores no Gerador.")}</span>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
