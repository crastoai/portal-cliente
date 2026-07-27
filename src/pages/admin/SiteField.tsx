// ============================================================================
// SiteField — campo vindo do DIAGNÓSTICO DO SITE, tratado como registro IMUTÁVEL.
// Mostra o valor atual travado (🔒) com botão "Editar". Ao editar, grava uma nova
// versão em crm.field_history: o valor novo fica em cima (com a data que VOCÊ inseriu)
// e o antigo desce pro histórico, em cinza/riscado com a data. Nada se perde.
// (Onda 4 do redesenho da ficha de Empresas · decisão Crasto 2026-07-27.)
// ============================================================================
import { useState } from "react";
import { Lock, Pencil, Check, X } from "lucide-react";
import { services as api } from "../../services";
import { useT } from "../../lib/i18n";

function fmtDT(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v); if (isNaN(+d)) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SiteField({ orgId, field, label, siteValue, history, onSaved }: {
  orgId: string; field: string; label: string; siteValue?: string | null;
  history: Record<string, any>[]; onSaved: () => void;
}) {
  const t = useT();
  const rows = history; // já vem ordenado desc por changed_at
  const current = (rows[0]?.new_value ?? siteValue ?? "") as string;
  const edited = rows.length > 0;
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);

  function start() { setV(current); setEditing(true); }
  async function save() {
    const nv = v.trim();
    if (nv === (current || "")) { setEditing(false); return; }
    setBusy(true);
    try {
      await api.crm.fieldHistory.add({ entity: "organization", entity_id: orgId, field, old_value: current || null, new_value: nv || null, source: "admin" });
      setEditing(false); onSaved();
    } catch { /* mantém em edição */ } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="infolab" style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {label}
        <span className="chip" style={{ fontSize: 9, padding: "1px 6px", background: "var(--crasto-site-bg, #EAF2FB)", borderColor: "var(--crasto-blue)", color: "var(--crasto-blue)" }}>{edited ? t("editado") : t("do site")}</span>
      </div>
      {editing ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
          <input className="inp" style={{ flex: 1 }} value={v} autoFocus disabled={busy} onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} />
          <button className="icobtn" title={t("Salvar")} disabled={busy} onClick={save}><Check size={14} /></button>
          <button className="icobtn" title={t("Cancelar")} onClick={() => setEditing(false)}><X size={14} /></button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="infoval" style={{ flex: 1, minWidth: 0 }}>{current || "—"}</div>
          <button className="icobtn" title={t("Editar (guarda o histórico)")} onClick={start}>{edited ? <Pencil size={13} /> : <Lock size={13} />}</button>
        </div>
      )}
      {/* histórico: valores antigos em cinza, com a data em que foram trocados */}
      {rows.length > 0 && (
        <div style={{ marginTop: 4, paddingLeft: 10, borderLeft: "2px solid var(--crasto-border-soft)", display: "flex", flexDirection: "column", gap: 2 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ fontSize: 11.5, color: "var(--crasto-text-faint)", opacity: 0.75 }}>
              <s style={{ textDecoration: "none" }}>{r.old_value || "—"}</s>
              <span style={{ marginLeft: 6, fontSize: 10.5 }}>{r.source === "admin" && r === rows[rows.length - 1] ? "🔒 " + t("do site") : "até"} {fmtDT(r.changed_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
