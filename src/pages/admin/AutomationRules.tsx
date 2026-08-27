// ============================================================================
// AutomationRules — central de automações configuráveis (B4).
// Cada regra (aniversário de contato, aniversário de contrato) tem: liga/desliga,
// canais (sininho/e-mail/WhatsApp) e a mensagem (com {contato} {empresa} {anos}).
// O motor (cron diário) dispara conforme a configuração.
// ============================================================================
import { useState, useEffect } from "react";
import { Sparkles, Bell, Mail, Smartphone, Save } from "lucide-react";
import { services as api } from "../../services";
import { useAsync, useToast } from "../../ui/ui";
import { useT } from "../../lib/i18n";

const CHANNELS = [["sininho", "Sininho", Bell], ["email", "E-mail", Mail], ["whatsapp", "WhatsApp", Smartphone]] as const;
type Rule = { rule_type: string; name: string; enabled: boolean; channels: string[]; template: string; config: any };

export default function AutomationRules() {
  const t = useT();
  const toast = useToast();
  const { data, loading, reload } = useAsync(async () => ((await api.automation.rules.list().catch(() => [])) as Rule[]) ?? [], []);
  const [draft, setDraft] = useState<Record<string, Rule>>({});
  useEffect(() => { if (data) { const m: Record<string, Rule> = {}; data.forEach((r) => (m[r.rule_type] = { ...r, channels: r.channels || [] })); setDraft(m); } }, [data]);

  function patch(rt: string, p: Partial<Rule>) { setDraft((d) => ({ ...d, [rt]: { ...d[rt], ...p } })); }
  function toggleCh(rt: string, k: string) { const cur = draft[rt].channels || []; patch(rt, { channels: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] }); }
  async function save(rt: string) {
    const r = draft[rt];
    try { await api.automation.rules.save({ rule_type: rt, enabled: r.enabled, channels: r.channels, template: r.template }); toast.ok(t("Automação salva ✓")); reload(); }
    catch { toast.err(t("Erro ao salvar.")); }
  }

  const rules = Object.values(draft);

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      {toast.node}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <Sparkles size={16} style={{ color: "var(--crasto-text-primary)" }} />
        <h3 style={{ margin: 0 }}>{t("Automações")}</h3>
        <span className="mt" style={{ fontSize: 11.5 }}>{t("disparos automáticos — ligue e configure os canais e a mensagem")}</span>
      </div>

      {loading ? <div className="mt" style={{ padding: "6px 2px" }}>{t("Carregando…")}</div> : rules.length === 0 ? (
        <div className="mt" style={{ padding: "6px 2px" }}>{t("Sem automações.")}</div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
          {rules.map((r) => (
            <div key={r.rule_type} style={{ padding: 12, border: "1px solid var(--crasto-border-soft)", borderRadius: "var(--crasto-radius-md)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!r.enabled} onChange={(e) => patch(r.rule_type, { enabled: e.target.checked })} />
                  <b style={{ color: "var(--crasto-text-primary)" }}>{r.name}</b>
                </label>
                <span className="chip" style={{ background: r.enabled ? "#E1F5EE" : "var(--crasto-bg-2)", color: r.enabled ? "#085041" : "var(--crasto-text-muted)" }}>{r.enabled ? t("Ligada") : t("Desligada")}</span>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  {CHANNELS.map(([k, label, Icon]) => (
                    <button key={k} type="button" onClick={() => toggleCh(r.rule_type, k)} className="chip"
                      style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid " + ((r.channels || []).includes(k) ? "transparent" : "var(--crasto-border-soft)"), background: (r.channels || []).includes(k) ? "var(--crasto-navy-05, #EEF2FB)" : "transparent", color: "var(--crasto-text-body)" }}>
                      <Icon size={13} />{t(label)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="infolab" style={{ fontSize: 11.5, color: "var(--crasto-text-muted)", marginBottom: 4 }}>{t("Mensagem")} <span style={{ opacity: 0.7 }}>· {"{contato} {empresa} {anos}"}</span></div>
                <textarea className="inp" style={{ width: "100%", minHeight: 54, resize: "vertical" }} value={r.template || ""} onChange={(e) => patch(r.rule_type, { template: e.target.value })} />
              </div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => save(r.rule_type)}><span className="crasto-btn__icon"><Save size={14} /></span><span className="crasto-btn__label">{t("Salvar")}</span></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
