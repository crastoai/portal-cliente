import { useState } from "react";
import { X } from "lucide-react";
import { useT } from "../lib/i18n";
import { useUnitScope } from "../lib/unitScope";

// Modal de cadastro de EMPRESA (CNPJ) — compartilhado pelo seletor de unidades da topbar e por
// "Dados da empresa" (Perfil). Grava em business_units (via createUnit do UnitScope), então o que
// se cadastra aqui aparece no seletor, nos detalhes do cliente (admin) e no Perfil — uma fonte só.
export default function AddCompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const t = useT();
  const { createUnit } = useUnitScope();
  const [f, setF] = useState({ name: "", cnpj: "", legal_name: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function salvar() {
    const name = f.name.trim();
    if (!name) { setErr(t("Informe o nome da empresa")); return; }
    setSaving(true); setErr(null);
    const r = await createUnit({ name, cnpj: f.cnpj.trim() || null, legal_name: f.legal_name.trim() || null });
    setSaving(false);
    if (r.error) { setErr(r.error); return; }
    onCreated?.();
    onClose();
  }

  return (
    <div className="umodal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="umodal" role="dialog" aria-modal="true">
        <div className="umodal-head">
          <h4>{t("Adicionar empresa")}</h4>
          <button type="button" className="umodal-x" onClick={onClose} aria-label={t("Fechar")}><X size={16} /></button>
        </div>
        <p className="umodal-sub">{t("Cadastre outro CNPJ da sua empresa. Ele passa a aparecer no seletor de unidades, nos detalhes do cliente e em Dados da empresa.")}</p>
        <div className="umodal-field">
          <label>{t("Nome da empresa/unidade")} *</label>
          <input value={f.name} autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("Ex.: Filial São Paulo")} />
        </div>
        <div className="umodal-field">
          <label>{t("CNPJ")}</label>
          <input value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
        </div>
        <div className="umodal-field">
          <label>{t("Razão social")}</label>
          <input value={f.legal_name} onChange={(e) => setF({ ...f, legal_name: e.target.value })} placeholder={t("Razão social (opcional)")} />
        </div>
        {err && <div className="umodal-err">{err}</div>}
        <div className="umodal-actions">
          <button type="button" className="umodal-btn ghost" onClick={onClose} disabled={saving}>{t("Cancelar")}</button>
          <button type="button" className="umodal-btn primary" onClick={salvar} disabled={saving}>{saving ? t("Salvando…") : t("Adicionar")}</button>
        </div>
      </div>
    </div>
  );
}
