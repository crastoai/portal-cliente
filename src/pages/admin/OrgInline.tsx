// ============================================================================
// OrgInline — campo dos "Dados da empresa" que edita INLINE e salva sozinho
// (input no blur, select na troca) via PATCH /identity/org/:id. Compartilhado
// entre a ficha de cliente e a de lead (onda 7: unificação lead⇄cliente).
// ============================================================================
import { useState, useEffect } from "react";
import { services as api, errorMessage } from "../../services";
import { useT } from "../../lib/i18n";

export default function OrgInline({ orgId, field, value, type = "text", options, placeholder, flash, reloadOnSave, reload }: {
  orgId: string; field: string; value: any; type?: "text" | "date" | "select";
  options?: { v: string; l: string }[]; placeholder?: string; flash: (m: string) => void;
  reloadOnSave?: boolean; reload?: () => void;
}) {
  const tr = useT();
  const [v, setV] = useState<string>(value ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setV(value ?? ""); }, [value]);
  async function save(next: string) {
    if ((value ?? "") === (next ?? "")) return;   // nada mudou → não bate no banco
    setSaving(true);
    try {
      await api.identity.organizations.update(orgId, { [field]: next === "" ? null : next });
      flash(tr("Salvo ✓"));
      if (reloadOnSave) reload?.();
    } catch (e) { setV(value ?? ""); flash(tr("Erro ao salvar:") + " " + errorMessage(e)); }
    finally { setSaving(false); }
  }
  if (type === "select") return (
    <select className="inp" style={{ width: "100%" }} value={v} disabled={saving} onChange={(e) => { setV(e.target.value); save(e.target.value); }}>
      {(options ?? []).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
  return <input className="inp" style={{ width: "100%" }} type={type} value={v} placeholder={placeholder} disabled={saving} onChange={(e) => setV(e.target.value)} onBlur={() => save(v)} />;
}
