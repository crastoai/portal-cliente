import { useEffect, useState } from "react";
import { Sparkles, Plus, Save } from "lucide-react";
import { services, errorMessage } from "../../services";
import { useT } from "../../lib/i18n";
import type { BaselineRow } from "../../services/psique.service";

// BASELINE DE ENTRADA (Cockpit · Meus Resultados) — o "antes" do cliente. O admin cola a
// transcrição da reunião / descrição e a Psiquê (DeepSeek) extrai os indicadores; ou lança à mão.
// Alimenta o antes×depois. Regra: só o que for real; sem número = "nao_informado" (nunca inventa).
const CAT: Record<string, { label: string; unidade: string }> = {
  tempo_resposta: { label: "Tempo de 1ª resposta", unidade: "s" },
  automacao: { label: "Atendido pela IA", unidade: "%" },
  novos_leads: { label: "Novos leads (mês)", unidade: "" },
  atendimentos: { label: "Conversas atendidas (mês)", unidade: "" },
  custo_atendimento: { label: "Custo de atendimento (mês)", unidade: "R$" },
  horas_equipe: { label: "Horas da equipe (mês)", unidade: "h" },
};
const STATUS = [
  { v: "informado", l: "Informado (com número)" },
  { v: "nao_tinha", l: "Não tinha" },
  { v: "nao_informado", l: "Não informado" },
  { v: "medido", l: "Medido (pré-IA)" },
];

export default function BaselineCard({ orgId }: { orgId: string }) {
  const t = useT();
  const [rows, setRows] = useState<BaselineRow[]>([]);
  const [texto, setTexto] = useState("");
  const [fonte, setFonte] = useState("reunião");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => services.psique.list(orgId).then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => setRows([]));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [orgId]);

  const extrair = async () => {
    if (texto.trim().length < 10) { setMsg(t("Cole a transcrição ou a descrição do “antes” do cliente.")); return; }
    setBusy(true); setMsg("");
    try {
      const r = await services.psique.extract(orgId, texto, fonte);
      if ((r as any)?.error) setMsg((r as any).error);
      else { setMsg(t("IA extraiu {n} indicador(es).", { n: r.metrics?.length ?? r.gravadas ?? 0 })); setTexto(""); load(); }
    } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(false); }
  };

  const setRow = (i: number, patch: Partial<BaselineRow>) => setRows((s) => s.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addRow = () => {
    const usados = new Set(rows.map((r) => r.metric));
    const livre = Object.keys(CAT).find((k) => !usados.has(k)) || "tempo_resposta";
    setRows((s) => [...s, { metric: livre, label: CAT[livre].label, valor_antes: null, unidade: CAT[livre].unidade, status: "informado", fonte }]);
  };
  const salvar = async () => {
    setBusy(true); setMsg("");
    try {
      const payload = rows.map((r) => ({ ...r, valor_antes: r.valor_antes === null || r.valor_antes === undefined || (r.valor_antes as any) === "" ? null : Number(r.valor_antes) }));
      const r = await services.psique.save(orgId, payload, "manual");
      if ((r as any)?.error) setMsg((r as any).error);
      else { setMsg(t("Baseline salvo ✓")); load(); }
    } catch (e) { setMsg(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="sec-h" style={{ marginTop: 0 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={17} /> {t("Baseline de Entrada")} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--crasto-text-muted)" }}>· {t("o “antes” do Meus Resultados")}</span></h2>
      </div>

      {/* Extração por IA (DeepSeek) a partir da transcrição/descrição */}
      <div style={{ marginBottom: 14 }}>
        <label className="infolab">{t("Cole a transcrição da reunião ou a descrição da situação do cliente ANTES da Crasto.AI")}</label>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} placeholder={t("Ex.: “Hoje demoram umas 2 horas pra responder no WhatsApp, tudo manual, sem IA. Recebem uns 40 leads por mês…”")}
          style={{ width: "100%", border: "1px solid var(--crasto-border)", borderRadius: "var(--crasto-radius-sm)", padding: "10px 12px", fontFamily: "inherit", fontSize: 13.5, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <input value={fonte} onChange={(e) => setFonte(e.target.value)} placeholder={t("fonte (ex.: reunião 12/07)")} style={{ border: "1px solid var(--crasto-border)", borderRadius: "var(--crasto-radius-sm)", padding: "8px 10px", fontSize: 13, width: 200 }} />
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={extrair}>
            <span className="crasto-btn__icon"><Sparkles size={14} /></span><span className="crasto-btn__label">{busy ? t("Extraindo…") : t("Extrair com IA (DeepSeek)")}</span>
          </button>
          {msg && <span style={{ fontSize: 12.5, color: "var(--crasto-text-muted)" }}>{msg}</span>}
        </div>
      </div>

      {/* Tabela editável do baseline vigente */}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr>
            <th>{t("Indicador")}</th><th style={{ textAlign: "right" }}>{t("Valor antes")}</th><th>{t("Un.")}</th><th>{t("Situação")}</th><th>{t("Fonte")}</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} style={{ color: "var(--crasto-text-muted)", padding: 12 }}>{t("Sem baseline ainda. Extraia da transcrição acima ou adicione à mão.")}</td></tr>
            ) : rows.map((r, i) => {
              const semNumero = r.status === "nao_tinha" || r.status === "nao_informado";
              return (
                <tr key={i}>
                  <td>
                    <select value={r.metric} onChange={(e) => setRow(i, { metric: e.target.value, label: CAT[e.target.value]?.label || e.target.value, unidade: CAT[e.target.value]?.unidade ?? r.unidade })}>
                      {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}><input type="number" step="0.01" value={semNumero ? "" : (r.valor_antes ?? "")} disabled={semNumero} onChange={(e) => setRow(i, { valor_antes: e.target.value === "" ? null : Number(e.target.value) })} style={{ width: 110, textAlign: "right" }} /></td>
                  <td style={{ color: "var(--crasto-text-muted)", fontSize: 12 }}>{r.unidade || "—"}</td>
                  <td>
                    <select value={r.status} onChange={(e) => setRow(i, { status: e.target.value, ...(e.target.value === "nao_tinha" || e.target.value === "nao_informado" ? { valor_antes: null } : {}) })}>
                      {STATUS.map((s) => <option key={s.v} value={s.v}>{t(s.l)}</option>)}
                    </select>
                  </td>
                  <td><input value={r.fonte || ""} onChange={(e) => setRow(i, { fonte: e.target.value })} placeholder={t("reunião / print / manual")} style={{ width: 160 }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={addRow}><span className="crasto-btn__icon"><Plus size={14} /></span><span className="crasto-btn__label">{t("Adicionar indicador")}</span></button>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy || rows.length === 0} onClick={salvar}><span className="crasto-btn__icon"><Save size={14} /></span><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar baseline")}</span></button>
      </div>
    </div>
  );
}
