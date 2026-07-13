import { Cpu, Plug, DollarSign, Star } from "lucide-react";
import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync, money } from "../../ui/ui";
import { useT } from "../../lib/i18n";

// Modelos LLM (SPEC 3.8) — catálogo de provedores/modelos + conexão + custo por modelo.
const CONN: Record<string, { label: string; tone: "ok" | "warn" | "crit" | "mute" }> = {
  connected: { label: "conectado", tone: "ok" },
  disconnected: { label: "sem chave", tone: "mute" },
  error: { label: "erro", tone: "crit" },
  unknown: { label: "não configurado", tone: "mute" },
};
const PROVIDER = (p: string) => ({ anthropic: "Anthropic", openai: "OpenAI", google: "Google", elevenlabs: "ElevenLabs" } as any)[p] || p;

export default function ConsoleModelos() {
  const t = useT();
  const { data, loading } = useAsync(async () => (await services.analytics.admin.llmModels()) as any[], []);
  const models = data ?? [];
  const connected = models.filter((m) => m.connection === "connected").length;
  const costMonth = models.reduce((s, m) => s + Number(m.cost_month || 0), 0);
  const providers = new Set(models.map((m) => m.provider)).size;

  return (
    <div>
      <PageHead eyebrow="Console · IA 🔒" title="Modelos LLM" sub="Provedores e modelos disponíveis, conexão e custo. A seleção por agente entra com o WhatsApp CRM." />

      <div className="kpis" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="lab"><Cpu size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Modelos no catálogo")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : models.length}</div><div className="delta">{t("{n} provedores", { n: providers })}</div></div>
        <div className="kpi g"><div className="lab"><Plug size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Provedores conectados")}</div><div className="val tnum" style={{ fontSize: 22 }}>{loading ? "—" : connected}</div><div className="delta">{t("com chave no cofre")}</div></div>
        <div className="kpi"><div className="lab"><DollarSign size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Custo de IA (mês)")}</div><div className="val tnum" style={{ fontSize: 22 }}>{money(costMonth)}</div><div className="delta">{t("todos os modelos")}</div></div>
        <div className="kpi"><div className="lab"><Star size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{t("Modelo padrão")}</div><div className="val" style={{ fontSize: 16 }}>{models.find((m) => m.is_default)?.label || "—"}</div><div className="delta">{t("dos agentes")}</div></div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>{t("Modelo")}</th><th>{t("Provedor")}</th><th>{t("Capacidades")}</th><th>{t("Conexão")}</th><th style={{ textAlign: "right" }}>{t("Custo (mês)")}</th><th>{t("Padrão")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ color: "var(--crasto-text-muted)" }}>{t("Carregando…")}</td></tr>
              : models.length === 0 ? <tr><td colSpan={6}><Empty>{t("Nenhum modelo no catálogo.")}</Empty></td></tr>
                : models.map((m) => { const c = CONN[m.connection] || CONN.unknown; return (
                  <tr key={m.provider + m.model}>
                    <td><div className="nm">{m.label}</div><div className="mt tnum">{m.model}</div></td>
                    <td>{PROVIDER(m.provider)}</td>
                    <td><div className="modchips">{(m.capabilities ?? []).map((cap: string, i: number) => <span className="chip" key={i}>{cap}</span>)}</div></td>
                    <td><Pill tone={c.tone as any}>{t(c.label)}</Pill></td>
                    <td className="tnum" style={{ textAlign: "right" }}>{Number(m.cost_month) > 0 ? money(Number(m.cost_month)) : "—"}</td>
                    <td>{m.is_default ? <Pill tone="ok">{t("padrão")}</Pill> : ""}</td>
                  </tr>
                ); })}
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 14 }}>
        <Cpu size={15} />
        <div>{t("A chave de cada provedor vive no cofre (APIs & Chaves). O custo por modelo aparece quando o pipeline de IA registrar o uso; a seleção de modelo por agente entra com o WhatsApp CRM.")}</div>
      </div>
    </div>
  );
}
