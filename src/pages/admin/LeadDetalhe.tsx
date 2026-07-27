// ============================================================================
// LeadDetalhe — ficha de PROSPECTO / LEAD / OPORTUNIDADE (stages != cliente).
// Mostra INLINE o "Mapa de IA" do diagnóstico do site (componente DiagnosticoMapa,
// reutilizado no popup da ficha de cliente) + contato, perfil e histórico.
// Ao avançar o status para "cliente", avisa o wrapper (onStageChange) que troca
// para a ficha completa de cliente (ClienteDetalhe).
// ============================================================================
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Trash2, MapPin, Phone, Clock, FileText, ArrowRight } from "lucide-react";
import { services as api } from "../../services";
import { PageHead, Empty, Pill, useAsync, useToast, initials, prettyName } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { STAGES, stageOf, countryOf, TEMPS } from "../../lib/countries";
import DiagnosticoMapa, { fmtDate } from "./DiagnosticoMapa";
import EmpresaExtra from "./EmpresaExtra";

export default function LeadDetalhe({ onStageChange }: { onStageChange?: (s: string) => void }) {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const toast = useToast();

  const { data, loading, reload } = useAsync(async () => {
    const [org, diag, people, phones, acts, proposals] = await Promise.all([
      api.identity.organizations.getById(id!),
      api.analytics.admin.diagnostic<any>(id!).catch(() => null),
      api.crm.people.listByOrg(id!).catch(() => []),
      api.crm.phones.listByOrg(id!).catch(() => []),
      api.crm.activities.listByOrg(id!).catch(() => []),
      api.commerce.proposals.listByOrg(id!).catch(() => []),
    ]);
    return { org, diag, people: (people as any[]) ?? [], phones: (phones as any[]) ?? [], acts: (acts as any[]) ?? [], proposals: (proposals as any[]) ?? [] };
  }, [id]);

  if (loading) return <><PageHead eyebrow="CRM" title="Detalhe" /><Empty>Carregando…</Empty></>;
  if (!data?.org) return <><PageHead eyebrow="CRM" title="Detalhe" /><Empty>Não encontrado.</Empty></>;

  const org = data.org as any;
  const diag = data.diag as any | null;
  const st = stageOf(org.stage);
  const co = countryOf(org.country);
  // REGRA DE ESTÁGIO (decisão Crasto 2026-07-27): prospecto/lead são manuais; OPORTUNIDADE
  // só existe com proposta gerada; CLIENTE só com proposta ganha (assinada+paga). Não se
  // "pula" para esses estágios na mão — eles são consequência. O estágio atual sempre pode voltar.
  const proposals = (data.proposals as any[]) ?? [];
  const hasProposal = proposals.length > 0;
  const hasWon = proposals.some((p) => p.status === "accepted");
  const curIdx = STAGES.findIndex((x) => x.key === org.stage);
  function stageLock(key: string): string | null {
    if (key === org.stage || key === "prospecto" || key === "lead") return null;
    if (key === "oportunidade" && !hasProposal) return t("Vira oportunidade quando há uma proposta gerada (você gera no Gerador de propostas).");
    if (key === "cliente" && !hasWon) return t("Vira cliente quando a proposta é ganha — assinada e paga.");
    return null;
  }

  async function setStage(stage: string) {
    try {
      await api.identity.organizations.setStage(id!, stage);
      toast.ok(t("Movido para {s}", { s: t(stageOf(stage).label) }));
      onStageChange?.(stage);          // avisa o wrapper (troca p/ ficha de cliente se virar cliente)
      if (stage !== "cliente") reload();
    } catch { toast.err(t("Erro ao mover o stage.")); }
  }
  async function setTemp(v: string) {
    const next = org.lead_temperature === v ? null : v;   // clicar de novo remove
    try { await api.identity.organizations.update(id!, { lead_temperature: next }); reload(); }
    catch { toast.err(t("Erro ao salvar a temperatura.")); }
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
        sub={[diag?.segmento, org.source === "mapa_site" ? t("origem: diagnóstico do site") : null].filter(Boolean).join("  ·  ") || co.name}
        right={<button className="crasto-btn crasto-btn--destructive crasto-btn--sm" onClick={del}><span className="crasto-btn__icon"><Trash2 size={14} /></span><span className="crasto-btn__label">{t("Excluir")}</span></button>}
      />

      {/* pipeline */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {STAGES.map((s, i) => {
          const isCur = i === curIdx, isPast = i < curIdx;
          const lock = isCur ? null : (isPast ? t("Já demonstrou interesse — não retorna a esta etapa.") : stageLock(s.key));
          const cls = "stagetab" + (isCur ? " on stage-glow" : " stage-dim") + (lock ? " stage-locked" : "");
          return (
            <button key={s.key} className={cls} title={lock || undefined} disabled={!!lock || isCur}
              onClick={() => { if (!lock && !isCur) setStage(s.key); }}><span className="dot" style={{ background: s.dot }} />{t(s.label)}</button>
          );
        })}
        {org.intent_signal && <span className="chip" style={{ marginLeft: 4, background: org.intent_signal === "alto" ? "#FCE9E7" : "var(--crasto-bg-3)", color: org.intent_signal === "alto" ? "#B42318" : "var(--crasto-text-body)" }}>{t("Intenção")}: {t(org.intent_signal)}</span>}
        <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 12, color: "var(--crasto-text-muted)" }}>{t("Status atual:")} <b style={{ color: "var(--crasto-text-primary)" }}>{t(st.label)}</b></span>
      </div>

      {/* Temperatura do lead (manual) — progressivo: só no estágio lead */}
      {org.stage === "lead" && (
        <div className="card" style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, color: "var(--crasto-text-primary)" }}>{t("Temperatura do lead")}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {TEMPS.map((tp) => (
              <button key={tp.key} className={"tempbtn" + (org.lead_temperature === tp.key ? " on" : "")}
                style={org.lead_temperature === tp.key ? { background: tp.bg, color: tp.fg, borderColor: tp.fg } : {}}
                onClick={() => setTemp(tp.key)}>{t(tp.label)}</button>
            ))}
          </div>
          <span className="mt" style={{ fontSize: 12 }}>{t("Definida por você — separada do sinal automático do Mapa.")}</span>
        </div>
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
          {data.people.map((p) => { const nm = prettyName(p.full_name); return (
            <div className="crmrow" key={p.id}>
              <div className="logo">{initials(nm)}</div>
              <div><div className="nm">{nm}{p.is_primary && <span className="chip" style={{ marginLeft: 6 }}>{t("principal")}</span>}</div>
                <div style={{ color: "var(--crasto-text-primary)", fontSize: 13.5 }}>{[p.role, p.email].filter(Boolean).join("  ·  ") || "—"}</div></div>
            </div>
          ); })}
          {data.phones.map((ph) => (
            <div className="crmrow" key={ph.id}>
              <Phone size={16} style={{ color: "var(--crasto-text-muted)" }} />
              <div><div className="nm tnum">{ph.country_code} {ph.number}</div><div className="mt">{ph.label}</div></div>
            </div>
          ))}
        </>
      )}

      {/* Cadastro & relação (tipo/NF/oculto + papéis/indicador + origem interno) */}
      <EmpresaExtra orgId={id!} org={org} onSaved={reload} flash={(m) => toast.ok(m)} />

      {!diag && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><MapPin size={16} style={{ color: "var(--crasto-text-primary)" }} /><h3 style={{ margin: 0 }}>{t("Sem diagnóstico do site ainda")}</h3></div>
          <p className="mt" style={{ marginTop: 8 }}>{t("Este contato ainda não preencheu o Mapa de IA em crasto.ai/mapa. Os dados abaixo são o cadastro manual do CRM.")}</p>
        </div>
      )}

      {/* Mapa de IA (reutilizável) */}
      {diag && <DiagnosticoMapa diag={diag} />}

      {/* Oportunidade → campos da negociação (progressivo) + gerar proposta */}
      {org.stage === "oportunidade" && (
        <div className="card" style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><FileText size={16} style={{ color: "var(--crasto-text-primary)" }} /><h3 style={{ margin: 0 }}>{t("Oportunidade")}</h3></div>
          <DealEditor orgId={id!} org={org} t={t} toast={toast} onSaved={reload} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 14, borderTop: "1px solid var(--crasto-border-soft)", paddingTop: 12 }}>
            <div style={{ flex: 1, minWidth: 220 }} className="mt">{t("Gere a proposta no Gerador; ao marcar como ganha, o contato vira cliente.")}</div>
            <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => nav("/admin/propostas")}><span className="crasto-btn__label">{t("Ir ao Gerador de propostas")}</span><span className="crasto-btn__icon"><ArrowRight size={14} /></span></button>
          </div>
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

// Editor dos campos da oportunidade (progressivo — só aparece no estágio oportunidade).
function DealEditor({ orgId, org, t, toast, onSaved }: { orgId: string; org: any; t: (s: string, p?: any) => string; toast: any; onSaved: () => void }) {
  const [v, setV] = useState({
    deal_value: org.deal_value ?? "",
    deal_probability: org.deal_probability ?? "",
    deal_expected_close: org.deal_expected_close ? String(org.deal_expected_close).slice(0, 10) : "",
    deal_product: org.deal_product ?? "",
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api.identity.organizations.update(orgId, {
        deal_value: v.deal_value === "" ? null : Number(v.deal_value),
        deal_probability: v.deal_probability === "" ? null : Number(v.deal_probability),
        deal_expected_close: v.deal_expected_close || null,
        deal_product: v.deal_product || null,
      });
      toast.ok(t("Oportunidade salva"));
      onSaved();
    } catch { toast.err(t("Erro ao salvar a oportunidade.")); }
    setBusy(false);
  }
  return (
    <>
      <div className="infogrid">
        <div>
          <div className="infolab">{t("Valor da proposta (R$)")}</div>
          <input className="inp" type="number" min="0" step="0.01" value={v.deal_value} onChange={(e) => setV({ ...v, deal_value: e.target.value })} placeholder="0,00" />
        </div>
        <div>
          <div className="infolab">{t("Probabilidade (%)")}</div>
          <input className="inp" type="number" min="0" max="100" value={v.deal_probability} onChange={(e) => setV({ ...v, deal_probability: e.target.value })} placeholder="0–100" />
        </div>
        <div>
          <div className="infolab">{t("Data prevista de fechamento")}</div>
          <input className="inp" type="date" value={v.deal_expected_close} onChange={(e) => setV({ ...v, deal_expected_close: e.target.value })} />
        </div>
        <div>
          <div className="infolab">{t("Produto / serviço")}</div>
          <input className="inp" value={v.deal_product} onChange={(e) => setV({ ...v, deal_product: e.target.value })} placeholder={t("Ex.: Implantação WhatsApp CRM")} />
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={save}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar oportunidade")}</span></button>
      </div>
    </>
  );
}
