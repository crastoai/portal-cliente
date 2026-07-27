// ============================================================================
// ServicosDeal — serviços do negócio ligados ao CATÁLOGO DE SERVIÇOS, que evoluem
// no funil: INTERESSE (lead) → PROPOSTA → CONTRATADO (cliente). Fonte única
// (delivery.client_services). Cada linha guarda: serviço do catálogo + período +
// quem assume o custo de IA + modalidade + especificações. Compartilhado por
// lead e cliente (o `defaultSituacao` muda o que é criado). Decisão Crasto 2026-07-27.
// ============================================================================
import { useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { services as api } from "../../services";
import { useAsync, Empty } from "../../ui/ui";
import { useT } from "../../lib/i18n";

const SITUACAO = [["interesse", "Interesse"], ["proposta", "Na proposta"], ["contratado", "Contratado"]];
const CUSTO = [["", "—"], ["absorvido", "Crasto absorve"], ["byo_cliente", "Cliente assume (BYO)"]];

export default function ServicosDeal({ orgId, defaultSituacao = "interesse" }: { orgId: string; defaultSituacao?: string }) {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => {
    const [rows, cat] = await Promise.all([
      api.delivery.clientServices.listByOrg(orgId).catch(() => []),
      api.catalog.services.listClientFacing().catch(() => []),
    ]);
    return { rows: (rows as any[]) ?? [], cat: (cat as any[]) ?? [] };
  }, [orgId]);

  const rows = data?.rows ?? [];
  const cat = data?.cat ?? [];
  const [pick, setPick] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  const available = cat.filter((s) => !q || `${s.name} ${s.category || ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  async function add() {
    const svc = cat.find((s) => s.id === pick);
    if (!svc) { flash(t("Escolha um serviço do catálogo.")); return; }
    setBusy(true);
    try {
      await api.delivery.clientServices.attach(orgId, { id: svc.id, name: svc.name, description: svc.description, category: svc.category, unit: svc.unit }, { situacao: defaultSituacao });
      setPick(""); setQ(""); await reload(); flash(t("Serviço adicionado ✓"));
    } catch { flash(t("Erro ao adicionar.")); } finally { setBusy(false); }
  }
  async function up(id: string, patch: Record<string, any>) { try { await api.delivery.clientServices.update(id, patch); flash(t("Salvo ✓")); } catch { flash(t("Erro ao salvar.")); } }
  async function upReload(id: string, patch: Record<string, any>) { await up(id, patch); await reload(); }
  async function del(id: string) { if (!confirm(t("Remover este serviço?"))) return; await api.delivery.clientServices.detach(id); await reload(); }

  const chipTone = (s: string) => (s === "contratado" ? "var(--crasto-success)" : s === "proposta" ? "var(--crasto-blue)" : "var(--crasto-text-muted)");

  return (
    <div>
      {/* adicionar do catálogo */}
      <div className="catsearch" style={{ marginBottom: 8 }}>
        <Search size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar serviço no catálogo…")} />
      </div>
      <div className="addrow" style={{ marginBottom: 12 }}>
        <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
          <option value="">{t("Escolha um serviço…")}</option>
          {available.map((s) => <option key={s.id} value={s.id}>{s.name}{s.category ? ` · ${s.category}` : ""}</option>)}
        </select>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={add}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{defaultSituacao === "interesse" ? t("Adicionar interesse") : t("Adicionar serviço")}</span></button>
      </div>

      {loading ? <Empty>Carregando…</Empty> : rows.length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{t("Nenhum serviço ainda — escolha do catálogo acima o que ele quer.")}</div> : rows.map((r) => (
        <div className="card" style={{ marginBottom: 10, padding: 14 }} key={r.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: chipTone(r.situacao || "interesse"), flex: "none" }} />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div className="nm" style={{ fontWeight: 700 }}>{r.service_name || t("Serviço")}</div>
              <div className="mt">{[r.service_category, r.service_unit].filter(Boolean).join(" · ")}</div>
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
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
