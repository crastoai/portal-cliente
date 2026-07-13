import { useState } from "react";
import { Cpu, KeyRound, DollarSign, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { services, errorMessage } from "../../services";
import { PageHead, Pill, Empty, useAsync, money } from "../../ui/ui";
import { useT } from "../../lib/i18n";

// Modelos LLM (SPEC 3.8) — catálogo + conexão REAL (chave no cofre) + custo + modelo padrão.
const PROVIDER = (p: string) => ({ anthropic: "Anthropic", openai: "OpenAI", google: "Google", elevenlabs: "ElevenLabs" } as any)[p] || p;

export default function ConsoleModelos() {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => (await services.analytics.admin.llmModels()) as any[], []);
  const models = data ?? [];
  const withKey = models.filter((m) => m.has_key).length;
  const costMonth = models.reduce((s, m) => s + Number(m.cost_month || 0), 0);
  const providers = new Set(models.map((m) => m.provider)).size;
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 5000); };

  async function setDefault(m: any) {
    setBusy(m.provider + m.model);
    try { await services.analytics.admin.setDefaultModel(m.provider, m.model); await reload(); flash(t("Modelo padrão atualizado ✓")); }
    catch (e) { flash(errorMessage(e)); } finally { setBusy(""); }
  }

  return (
    <div>
      <PageHead eyebrow="Console · IA 🔒" title="Modelos LLM"
        sub="O modelo que os agentes usam por padrão e o custo por provedor. A chave de cada provedor vive no cofre (APIs & Chaves)." />

      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="lab"><Cpu size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Modelos no catálogo")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : models.length}</div><div className="delta">{t("{n} provedores", { n: providers })}</div></div>
        <div className="kpi g"><div className="lab"><KeyRound size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Provedores com chave")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : withKey}</div><div className="delta">{t("chave salva no cofre")}</div></div>
        <div className="kpi"><div className="lab"><DollarSign size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Custo de IA (mês)")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(costMonth)}</div><div className="delta">{t("todos os modelos")}</div></div>
        <div className="kpi"><div className="lab"><Star size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Modelo padrão")}</div><div className="val" style={{ fontSize: 16 }}>{models.find((m) => m.is_default)?.label || "—"}</div><div className="delta">{t("dos agentes")}</div></div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>{t("Modelo")}</th><th>{t("Provedor")}</th><th>{t("Capacidades")}</th><th>{t("Chave no cofre")}</th><th style={{ textAlign: "right" }}>{t("Custo (mês)")}</th><th>{t("Padrão")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ color: "var(--crasto-text-muted)" }}>{t("Carregando…")}</td></tr>
              : models.length === 0 ? <tr><td colSpan={6}><Empty>{t("Nenhum modelo no catálogo.")}</Empty></td></tr>
                : models.map((m) => (
                  <tr key={m.provider + m.model}>
                    <td><div className="nm">{m.label}</div><div className="mt tnum">{m.model}</div></td>
                    <td>{PROVIDER(m.provider)}</td>
                    <td><div className="modchips">{(m.capabilities ?? []).map((cap: string, i: number) => <span className="chip" key={i}>{cap}</span>)}</div></td>
                    <td>{m.has_key
                      ? <Pill tone="ok">{t("chave configurada")}</Pill>
                      : <Link to="/admin/integracoes" className="linkbtn" title={t("Configurar em APIs & Chaves")}>{t("sem chave — configurar")}</Link>}</td>
                    <td className="tnum" style={{ textAlign: "right" }}>{Number(m.cost_month) > 0 ? money(Number(m.cost_month)) : "—"}</td>
                    <td>{m.is_default
                      ? <Pill tone="ok"><Star size={11} style={{ verticalAlign: -1, marginRight: 3 }} />{t("padrão")}</Pill>
                      : <button className="linkbtn" disabled={busy === m.provider + m.model} onClick={() => setDefault(m)}>{t("Definir padrão")}</button>}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        <Cpu size={15} />
        <div>{t("O modelo padrão é o que os agentes usam quando não há escolha específica. A conexão real com o provedor é verificada pelo motor de IA (no servidor) ao fazer a primeira chamada — não é um status simulado. O custo por modelo aparece quando o motor registrar o uso; a seleção de modelo por agente entra com o WhatsApp CRM.")}</div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
