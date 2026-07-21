// ============================================================================
// LeadDetalhe — ficha de PROSPECTO / LEAD / OPORTUNIDADE (stages != cliente).
// Renderiza o "Mapa de IA" que a pessoa preencheu no diagnóstico do site
// (crasto.ai/mapa → Edge Function mapa-submit → crm.mapa_submissions) + contato,
// perfil e histórico. A tela CRESCE conforme o stage avança:
//   prospecto   → diagnóstico + contato + perfil + histórico
//   lead        → idem + qualificação (histórico/notas)
//   oportunidade→ idem + atalho para gerar proposta (vira cliente ao ganhar)
// Ao virar cliente, o router manda para ClienteDetalhe (ficha completa).
// ============================================================================
import { useParams, useNavigate } from "react-router-dom";
import { Trash2, MapPin, MessageSquare, Phone, Clock, FileText, ArrowRight } from "lucide-react";
import { services as api } from "../../services";
import { PageHead, Empty, Pill, useAsync, useToast } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { STAGES, stageOf, countryOf } from "../../lib/countries";

// nomes das 8 dimensões + Passo 1 (espelha o REC do site /mapa)
const DIM_NAMES: Record<string, string> = {
  estrategia: "Estratégia & Direção", gestao: "Gestão & Processos", marca: "Marca & Posicionamento",
  comercial: "Comercial & Vendas", marketing: "Marketing & Aquisição", atendimento: "Atendimento & Relacionamento",
  tech: "Tecnologia & IA", financas: "Finanças & Indicadores",
};
const STEP1: Record<string, string> = {
  gestao: "Escolher o processo que mais trava e transformá-lo no primeiro fluxo assistido por IA.",
  comercial: "Ligar um assistente de IA no funil pra qualificar e responder todo lead na hora.",
  marketing: "Montar uma máquina de conteúdo com IA pra atrair cliente sem depender de indicação.",
  atendimento: "Colocar o atendimento no WhatsApp com IA pra ninguém ficar sem resposta.",
  tech: "Revisar o que você já testou de IA e reancorar num caso que se paga rápido.",
  financas: "Montar um painel simples dos seus números pra decidir com dado, não no achismo.",
};
const dimName = (k: string) => DIM_NAMES[k] || k;
const band = (s: number) => (s < 40 ? "crit" : s < 70 ? "warn" : "ok");
const BAND_COLOR: Record<string, { fg: string; bg: string; label: string }> = {
  crit: { fg: "#B42318", bg: "#FCE9E7", label: "Crítico" },
  warn: { fg: "#B54708", bg: "#FEF0E6", label: "Atenção" },
  ok: { fg: "#067647", bg: "#E7F6EE", label: "Saudável" },
};
function fmtDate(s?: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; }
}

export default function LeadDetalhe() {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const toast = useToast();

  const { data, loading, reload } = useAsync(async () => {
    const [org, diag, people, phones, acts] = await Promise.all([
      api.identity.organizations.getById(id!),
      api.analytics.admin.diagnostic<any>(id!).catch(() => null),
      api.crm.people.listByOrg(id!).catch(() => []),
      api.crm.phones.listByOrg(id!).catch(() => []),
      api.crm.activities.listByOrg(id!).catch(() => []),
    ]);
    return { org, diag, people: (people as any[]) ?? [], phones: (phones as any[]) ?? [], acts: (acts as any[]) ?? [] };
  }, [id]);

  if (loading) return <><PageHead eyebrow="CRM" title="Detalhe" /><Empty>Carregando…</Empty></>;
  if (!data?.org) return <><PageHead eyebrow="CRM" title="Detalhe" /><Empty>Não encontrado.</Empty></>;

  const org = data.org as any;
  const diag = data.diag as any | null;
  const st = stageOf(org.stage);
  const co = countryOf(org.country);
  const scores: any[] = Array.isArray(diag?.scores) ? diag.scores : [];
  const overall: number | null = diag?.maturidade ?? null;
  const ondePaga: string[] = Array.isArray(diag?.onde_paga) ? diag.onde_paga : [];
  const dores: string[] = Array.isArray(diag?.dores) ? diag.dores : [];
  const humanDims = scores.filter((s) => s.payoff === false);
  const ovBand = overall != null ? BAND_COLOR[band(overall)] : null;

  async function setStage(stage: string) {
    try { await api.identity.organizations.setStage(id!, stage); reload(); toast.ok(t("Movido para {s}", { s: t(stageOf(stage).label) })); }
    catch { toast.err(t("Erro ao mover o stage.")); }
  }
  async function del() {
    if (!confirm(t("Apagar \"{n}\" e todos os dados? Não dá pra desfazer.", { n: org.name }))) return;
    const r = await api.identity.clients.remove(id!);
    if (r.ok) nav("/admin/clientes", { replace: true });
    else toast.err(t("Erro ao apagar:") + " " + (r.error || ""));
  }

  return (
    <div>
      {toast.node}
      <PageHead
        eyebrow={`CRM · ${t(st.label)}`}
        title={org.name}
        sub={[diag?.segmento, org.source === "mapa_site" ? t("origem: diagnóstico do site") : null].filter(Boolean).join("  ·  ") || (co.name)}
        right={<button className="crasto-btn crasto-btn--destructive crasto-btn--sm" onClick={del}><span className="crasto-btn__icon"><Trash2 size={14} /></span><span className="crasto-btn__label">{t("Excluir")}</span></button>}
      />

      {/* pipeline */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {STAGES.map((s) => <button key={s.key} className={"stagetab" + (org.stage === s.key ? " on" : "")} onClick={() => setStage(s.key)}>{t(s.label)}</button>)}
        {org.intent_signal && <span className="chip" style={{ marginLeft: 4, background: org.intent_signal === "alto" ? "#FCE9E7" : "var(--crasto-bg-3)", color: org.intent_signal === "alto" ? "#B42318" : "var(--crasto-text-body)" }}>{t("Intenção")}: {t(org.intent_signal)}</span>}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--crasto-text-muted)" }}>{t("Status atual:")} <b style={{ color: "var(--crasto-text-primary)" }}>{t(st.label)}</b></span>
      </div>

      {!diag && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><MapPin size={16} style={{ color: "var(--crasto-text-primary)" }} /><h3 style={{ margin: 0 }}>{t("Sem diagnóstico do site ainda")}</h3></div>
          <p className="mt" style={{ marginTop: 8 }}>{t("Este contato ainda não preencheu o Mapa de IA em crasto.ai/mapa. Os dados abaixo são o cadastro manual do CRM.")}</p>
        </div>
      )}

      {diag && (
        <>
          {/* Cabeçalho do Mapa: maturidade + data */}
          <div className="card" style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <MapPin size={16} style={{ color: "var(--crasto-text-primary)" }} />
              <h3 style={{ margin: 0 }}>{t("Mapa de IA — diagnóstico do site")}</h3>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--crasto-text-muted)" }}>{fmtDate(diag.created_at)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 12, flexWrap: "wrap" }}>
              {overall != null && ovBand && (
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
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
            {/* Onde a IA se paga */}
            {ondePaga.length > 0 && (
              <div className="card">
                <h3 style={{ margin: "0 0 4px" }}>{t("Onde a IA se paga primeiro")}</h3>
                <div className="mt" style={{ marginBottom: 10 }}>{t("as frentes com mais a ganhar")}</div>
                <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                  {ondePaga.map((k) => <li key={k} style={{ fontSize: 13.5, color: "var(--crasto-text-body)" }}><b style={{ color: "var(--crasto-text-primary)" }}>{dimName(k)}</b></li>)}
                </ol>
              </div>
            )}
            {/* Onde a IA NÃO entra */}
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

          {/* Passo 1 */}
          {diag.passo1_key && STEP1[diag.passo1_key] && (
            <div className="card" style={{ marginBottom: 18, borderLeft: "3px solid var(--crasto-navy)" }}>
              <h3 style={{ margin: "0 0 6px" }}>{t("Passo 1 recomendado")}</h3>
              <p style={{ margin: 0, fontSize: 14, color: "var(--crasto-text-body)" }}>{STEP1[diag.passo1_key]}</p>
            </div>
          )}

          {/* Dores + gargalo */}
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
      )}

      {/* Perfil */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><FileText size={16} style={{ color: "var(--crasto-text-primary)" }} /><h3 style={{ margin: 0 }}>{t("Perfil")}</h3></div>
        <div className="infogrid">
          <div><div className="infolab">{t("Segmento")}</div><div className="infoval">{diag?.segmento || "—"}</div></div>
          <div><div className="infolab">{t("Faturamento")}</div><div className="infoval">{diag?.faturamento || "—"}</div></div>
          <div><div className="infolab">{t("Tempo de operação")}</div><div className="infoval">{diag?.tempo || "—"}</div></div>
          <div><div className="infolab">{t("Cargo")}</div><div className="infoval">{diag?.cargo || "—"}</div></div>
          <div><div className="infolab">{t("E-mail")}</div><div className="infoval">{diag?.email || "—"}</div></div>
          <div><div className="infolab">{t("País")}</div><div className="infoval">{co.flag} {co.name}</div></div>
        </div>
      </div>

      {/* Contato */}
      <div className="sec-h" style={{ marginTop: 4 }}><h2>{t("Contato")}</h2><Pill tone="mute">{t("pessoas & telefones")}</Pill></div>
      {data.people.length === 0 && data.phones.length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{t("Nenhum contato cadastrado.")}</div> : (
        <>
          {data.people.map((p) => (
            <div className="crmrow" key={p.id}>
              <div className="logo">{(p.full_name || "?").slice(0, 2).toUpperCase()}</div>
              <div><div className="nm">{p.full_name}{p.is_primary && <span className="chip" style={{ marginLeft: 6 }}>{t("principal")}</span>}</div><div className="mt">{[p.role, p.email].filter(Boolean).join(" · ") || "—"}</div></div>
            </div>
          ))}
          {data.phones.map((ph) => (
            <div className="crmrow" key={ph.id}>
              <Phone size={16} style={{ color: "var(--crasto-text-muted)" }} />
              <div><div className="nm tnum">{ph.country_code} {ph.number}</div><div className="mt">{ph.label}</div></div>
            </div>
          ))}
        </>
      )}

      {/* Oportunidade → gerar proposta */}
      {org.stage === "qualificado" && (
        <div className="card" style={{ marginTop: 18, background: "var(--crasto-navy-04)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700, color: "var(--crasto-text-primary)" }}>{t("Pronto para proposta")}</div>
            <div className="mt">{t("Gere a proposta no Gerador; ao marcar como ganha, o contato vira cliente.")}</div>
          </div>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => nav("/admin/propostas")}><span className="crasto-btn__label">{t("Ir ao Gerador de propostas")}</span><span className="crasto-btn__icon"><ArrowRight size={14} /></span></button>
        </div>
      )}

      {/* Histórico */}
      <div className="sec-h" style={{ marginTop: 22 }}><h2>{t("Histórico")}</h2><Pill tone="mute">{t("atividades")}</Pill></div>
      {data.acts.length === 0 ? <div className="mt" style={{ padding: "4px 2px" }}>{t("Sem atividades ainda.")}</div> : (
        <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
          {data.acts.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 10 }}>
              <Clock size={15} style={{ color: "var(--crasto-text-muted)", marginTop: 3, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, color: "var(--crasto-text-primary)", fontSize: 13.5 }}>{a.title} <span style={{ fontWeight: 400, color: "var(--crasto-text-faint)", fontSize: 12 }}>· {fmtDate(a.occurred_at)}</span></div>
                {a.description && <div className="mt" style={{ fontSize: 13 }}>{a.description}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
