// ============================================================================
// DiagnosticoMapa — render REUTILIZÁVEL do "Mapa de IA" que a pessoa preencheu no
// diagnóstico do site (crm.mapa_submissions). Usado INLINE na ficha de lead
// (LeadDetalhe) e dentro de um POPUP na ficha de cliente (DiagnosticoCard).
// Puramente apresentacional — recebe o objeto `diag` e desenha os blocos.
// ============================================================================
import { MapPin, MessageSquare } from "lucide-react";
import { useT } from "../../lib/i18n";

// nomes das 8 dimensões + Passo 1 (espelha o REC do site /mapa)
export const DIM_NAMES: Record<string, string> = {
  estrategia: "Estratégia & Direção", gestao: "Gestão & Processos", marca: "Marca & Posicionamento",
  comercial: "Comercial & Vendas", marketing: "Marketing & Aquisição", atendimento: "Atendimento & Relacionamento",
  tech: "Tecnologia & IA", financas: "Finanças & Indicadores",
};
export const STEP1: Record<string, string> = {
  gestao: "Escolher o processo que mais trava e transformá-lo no primeiro fluxo assistido por IA.",
  comercial: "Ligar um assistente de IA no funil pra qualificar e responder todo lead na hora.",
  marketing: "Montar uma máquina de conteúdo com IA pra atrair cliente sem depender de indicação.",
  atendimento: "Colocar o atendimento no WhatsApp com IA pra ninguém ficar sem resposta.",
  tech: "Revisar o que você já testou de IA e reancorar num caso que se paga rápido.",
  financas: "Montar um painel simples dos seus números pra decidir com dado, não no achismo.",
};
export const dimName = (k: string) => DIM_NAMES[k] || k;
export const band = (s: number) => (s < 40 ? "crit" : s < 70 ? "warn" : "ok");
export const BAND_COLOR: Record<string, { fg: string; bg: string; label: string }> = {
  crit: { fg: "#B42318", bg: "#FCE9E7", label: "Crítico" },
  warn: { fg: "#B54708", bg: "#FEF0E6", label: "Atenção" },
  ok: { fg: "#067647", bg: "#E7F6EE", label: "Saudável" },
};
export function fmtDate(s?: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; }
}

export default function DiagnosticoMapa({ diag }: { diag: any }) {
  const t = useT();
  if (!diag) return null;
  const scores: any[] = Array.isArray(diag.scores) ? diag.scores : [];
  const overall: number | null = diag.maturidade ?? null;
  const ondePaga: string[] = Array.isArray(diag.onde_paga) ? diag.onde_paga : [];
  const dores: string[] = Array.isArray(diag.dores) ? diag.dores : [];
  const humanDims = scores.filter((s) => s.payoff === false);
  const ovBand = overall != null ? BAND_COLOR[band(overall)] : null;

  return (
    <>
      {/* Cabeçalho do Mapa: maturidade + data */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <MapPin size={16} style={{ color: "var(--crasto-text-primary)" }} />
          <h3 style={{ margin: 0 }}>{t("Mapa de IA — diagnóstico do site")}</h3>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--crasto-text-muted)" }}>{fmtDate(diag.created_at)}</span>
        </div>
        {overall != null && ovBand && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
            <div style={{ width: 84, height: 84, borderRadius: "50%", background: `conic-gradient(${ovBand.fg} ${overall * 3.6}deg, var(--crasto-bg-3) 0deg)`, display: "grid", placeItems: "center", flexShrink: 0 }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--crasto-surface)", display: "grid", placeItems: "center" }}>
                <b style={{ fontSize: 22, color: "var(--crasto-text-primary)" }}>{overall}</b>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, color: "var(--crasto-text-primary)" }}>{t("Maturidade de gestão")}</div>
              <div className="mt" style={{ maxWidth: 260 }}>{t("média das 8 dimensões — quanto maior, mais pronta pra escalar com IA")}</div>
            </div>
          </div>
        )}
      </div>

      {/* Termômetro das 8 dimensões */}
      {scores.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 12px" }}>{t("Onde ele está — as 8 dimensões")}</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {scores.map((s) => {
              const b = BAND_COLOR[band(s.score)];
              return (
                <div key={s.key} style={{ display: "grid", gridTemplateColumns: "minmax(120px,1.4fr) 3fr auto", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "var(--crasto-text-body)" }}>{s.name || dimName(s.key)}</span>
                  <span style={{ height: 8, borderRadius: 999, background: "var(--crasto-bg-3)", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${s.score}%`, background: b.fg, borderRadius: 999 }} />
                  </span>
                  <span className="chip" style={{ background: b.bg, color: b.fg, minWidth: 66, textAlign: "center" }}>{t(b.label)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
        {ondePaga.length > 0 && (
          <div className="card">
            <h3 style={{ margin: "0 0 4px" }}>{t("Onde a IA se paga primeiro")}</h3>
            <div className="mt" style={{ marginBottom: 10 }}>{t("as frentes com mais a ganhar")}</div>
            <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              {ondePaga.map((k) => <li key={k} style={{ fontSize: 13.5, color: "var(--crasto-text-body)" }}><b style={{ color: "var(--crasto-text-primary)" }}>{dimName(k)}</b></li>)}
            </ol>
          </div>
        )}
        {humanDims.length > 0 && (
          <div className="card">
            <h3 style={{ margin: "0 0 4px" }}>{t("Onde a IA NÃO entra")}</h3>
            <div className="mt" style={{ marginBottom: 10 }}>{t("decisão de gente e clareza primeiro")}</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              {humanDims.map((s) => <li key={s.key} style={{ fontSize: 13.5, color: "var(--crasto-text-body)" }}>{s.name || dimName(s.key)}</li>)}
            </ul>
          </div>
        )}
      </div>

      {diag.passo1_key && STEP1[diag.passo1_key] && (
        <div className="card" style={{ marginBottom: 18, borderLeft: "3px solid var(--crasto-navy)" }}>
          <h3 style={{ margin: "0 0 6px" }}>{t("Passo 1 recomendado")}</h3>
          <p style={{ margin: 0, fontSize: 14, color: "var(--crasto-text-body)" }}>{STEP1[diag.passo1_key]}</p>
        </div>
      )}

      {(dores.length > 0 || diag.dor_outro || diag.gargalo) && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><MessageSquare size={16} style={{ color: "var(--crasto-text-primary)" }} /><h3 style={{ margin: 0 }}>{t("O que ele marcou")}</h3></div>
          {(dores.length > 0 || diag.dor_outro) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: diag.gargalo ? 12 : 0 }}>
              {dores.map((d, i) => <span key={i} className="chip" style={{ background: "var(--crasto-navy-05)", color: "var(--crasto-text-primary)" }}>{d}</span>)}
              {diag.dor_outro && <span className="chip" style={{ background: "var(--crasto-navy-05)", color: "var(--crasto-text-primary)" }}>{diag.dor_outro}</span>}
            </div>
          )}
          {diag.gargalo && (
            <blockquote style={{ margin: 0, padding: "10px 14px", background: "var(--crasto-bg-2)", borderRadius: 10, borderLeft: "3px solid var(--crasto-border-strong)", fontSize: 14, fontStyle: "italic", color: "var(--crasto-text-body)" }}>
              “{diag.gargalo}”
            </blockquote>
          )}
        </div>
      )}
    </>
  );
}
