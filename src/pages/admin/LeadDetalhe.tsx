// ============================================================================
// LeadDetalhe — ficha de PROSPECTO / LEAD / OPORTUNIDADE / PERDIDO (stages != ganho).
// Mostra INLINE o "Mapa de IA" do diagnóstico do site (componente DiagnosticoMapa,
// reutilizado no popup da ficha de cliente) + contato, perfil e histórico.
// Ao avançar o status para "ganho", avisa o wrapper (onStageChange) que troca
// para a ficha completa de cliente (ClienteDetalhe). "Perdido" é terminal e fica
// FORA da trilha linear — vira ação separada "Marcar como Perdido" / "Reabrir".
// ============================================================================
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Trash2, MapPin, Phone, Clock, FileText, ArrowRight, Building2, HeartHandshake } from "lucide-react";
import { services as api } from "../../services";
import { PageHead, Empty, Pill, useAsync, useToast, initials, prettyName, money, Field } from "../../ui/ui";
import Modal from "../../ui/Modal";
import { useT } from "../../lib/i18n";
import { PIPELINE_STAGES, WON_STAGE, LOST_STAGE, stageOf, countryOf, TEMPS, COUNTRIES } from "../../lib/countries";
import DiagnosticoMapa, { fmtDate } from "./DiagnosticoMapa";
import EmpresaExtra from "./EmpresaExtra";
import PessoasEditor from "./PessoasEditor";
import SiteField from "./SiteField";
import OrgInline from "./OrgInline";
import ServicosDeal from "./ServicosDeal";

export default function LeadDetalhe({ onStageChange }: { onStageChange?: (s: string) => void }) {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const toast = useToast();
  // Doação / pró-bono (Fatia 3): modal p/ transformar em Ganho com lucro R$0 + valor-equivalente doado.
  const [donOpen, setDonOpen] = useState(false);
  const [donValue, setDonValue] = useState("");
  const [donNote, setDonNote] = useState("");
  const [donBusy, setDonBusy] = useState(false);

  const { data, loading, reload } = useAsync(async () => {
    const [org, diag, people, phones, acts, proposals, fhist] = await Promise.all([
      api.identity.organizations.getById(id!),
      api.analytics.admin.diagnostic<any>(id!).catch(() => null),
      api.crm.people.listByOrg(id!).catch(() => []),
      api.crm.phones.listByOrg(id!).catch(() => []),
      api.crm.activities.listByOrg(id!).catch(() => []),
      api.commerce.proposals.listByOrg(id!).catch(() => []),
      api.crm.fieldHistory.list("organization", id!).catch(() => []),
    ]);
    return { org, diag, people: (people as any[]) ?? [], phones: (phones as any[]) ?? [], acts: (acts as any[]) ?? [], proposals: (proposals as any[]) ?? [], fhist: (fhist as any[]) ?? [] };
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
  const curIdx = PIPELINE_STAGES.findIndex((x) => x.key === org.stage);
  const isLost = org.stage === LOST_STAGE;
  const histOf = (f: string) => ((data.fhist as any[]) ?? []).filter((r) => r.field === f);
  function stageLock(key: string): string | null {
    if (key === org.stage || key === "prospecto" || key === "lead") return null;
    if (key === "oportunidade" && !hasProposal) return t("Vira oportunidade quando há uma proposta gerada (você gera no Gerador de propostas).");
    if (key === WON_STAGE && !hasWon) return t("Vira cliente quando a proposta é ganha — assinada e paga.");
    return null;
  }

  async function setStage(stage: string) {
    try {
      await api.identity.organizations.setStage(id!, stage);
      toast.ok(t("Movido para {s}", { s: t(stageOf(stage).label) }));
      onStageChange?.(stage);          // avisa o wrapper (troca p/ ficha de cliente se virar Ganho)
      if (stage !== WON_STAGE) reload();
    } catch { toast.err(t("Erro ao mover o stage.")); }
  }
  // Perdido (closed-lost) é TERMINAL e fora da trilha: ação explícita, de qualquer etapa ativa.
  // Motivo opcional vira uma atividade no CRM (sem coluna nova no banco).
  async function marcarPerdido() {
    const motivo = window.prompt(t("Motivo da perda (opcional):"), "");
    if (motivo === null) return;                    // cancelou o prompt
    try {
      await api.identity.organizations.setStage(id!, LOST_STAGE);
      if (motivo.trim()) { try { await api.crm.activities.add({ organization_id: id, type: "note", title: t("Perdido"), description: motivo.trim() }); } catch { /* nota é best-effort */ } }
      toast.ok(t("Movido para {s}", { s: t(stageOf(LOST_STAGE).label) }));
      onStageChange?.(LOST_STAGE); reload();
    } catch { toast.err(t("Erro ao mover o stage.")); }
  }
  // Reabrir uma empresa perdida: volta p/ Oportunidade se já houve proposta, senão p/ Lead.
  async function reabrir() {
    const back = hasProposal ? "oportunidade" : "lead";
    try {
      await api.identity.organizations.setStage(id!, back);
      toast.ok(t("Movido para {s}", { s: t(stageOf(back).label) }));
      onStageChange?.(back); reload();
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
  // Abre o modal de doação — pré-soma o valor-equivalente dos serviços já anexados (do Catálogo, editável).
  async function openDonation() {
    try {
      const [rows, cat] = await Promise.all([
        api.delivery.clientServices.listByOrg(id!).catch(() => []),
        api.catalog.services.list().catch(() => []),
      ]);
      const list = (rows as any[]) ?? []; const catl = (cat as any[]) ?? [];
      const sum = list.reduce((s, r) => s + Number(catl.find((c: any) => c.id === r.service_id)?.price_table ?? 0), 0);
      const names = list.map((r) => r.service_name).filter(Boolean).join(" + ");
      setDonValue(sum > 0 ? String(sum) : "");
      setDonNote(names || org.deal_product || "");
    } catch { setDonValue(""); setDonNote(""); }
    setDonOpen(true);
  }
  // Confirma a doação: vira Ganho com lucro R$0, registra o valor-equivalente e marca os serviços como entregues.
  async function confirmDonation() {
    setDonBusy(true);
    const nowISO = new Date().toISOString();
    const val = donValue === "" ? null : Number(donValue);
    try {
      await api.identity.organizations.update(id!, {
        is_donation: true, donation_value: val, donation_note: donNote || null,
        donated_at: nowISO, deal_value: val, convertido_em: nowISO,
      });
      // marca os serviços de interesse/proposta como CONTRATADOS (entregues) — best effort
      try {
        const rows = (await api.delivery.clientServices.listByOrg(id!)) as any[];
        await Promise.all((rows ?? []).map((r) => api.delivery.clientServices.update(r.id, { situacao: "contratado" })));
      } catch { /* não bloqueia */ }
      await api.identity.organizations.setStage(id!, WON_STAGE);
      try { await api.crm.activities.add({ organization_id: id, type: "note", title: t("Doação registrada"), description: (donNote ? donNote + " · " : "") + (val != null ? money(val) : "") }); } catch { /* rastro é best-effort */ }
      toast.ok(t("Doação registrada — Ganho pró-bono ✓"));
      setDonOpen(false);
      onStageChange?.(WON_STAGE);
    } catch { toast.err(t("Erro ao registrar a doação.")); }
    setDonBusy(false);
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

      {/* pipeline (trilha linear — Perdido é terminal e fica fora dela) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {PIPELINE_STAGES.map((s, i) => {
          const isCur = i === curIdx, isPast = i < curIdx;
          const lock = isCur ? null : (isPast ? t("Já demonstrou interesse — não retorna a esta etapa.") : stageLock(s.key));
          const cls = "stagetab" + (isCur ? " on stage-glow" : " stage-dim") + ((lock || isLost) ? " stage-locked" : "");
          return (
            <button key={s.key} className={cls} title={lock || undefined} disabled={!!lock || isCur || isLost}
              onClick={() => { if (!lock && !isCur && !isLost) setStage(s.key); }}><span className="dot" style={{ background: s.dot }} />{t(s.label)}</button>
          );
        })}
        {isLost ? (
          <>
            <span className="pill crit" style={{ marginLeft: 4 }}><span className="d" />{t("Perdido")}</span>
            <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={reabrir}><span className="crasto-btn__label">{t("Reabrir")}</span></button>
          </>
        ) : (
          <>
            <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={marcarPerdido} title={t("Marcar como Perdido")}><span className="crasto-btn__label" style={{ color: "#B42318" }}>{t("Marcar como Perdido")}</span></button>
            <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={openDonation} title={t("Registrar como doação (Ganho pró-bono, lucro R$0)")}><span className="crasto-btn__icon"><HeartHandshake size={14} /></span><span className="crasto-btn__label" style={{ color: "#0F7B6C" }}>{t("Marcar como Doação")}</span></button>
          </>
        )}
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

      {/* Dados da empresa — editável inline (mesmo cartão da ficha de cliente) */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}><Building2 size={16} style={{ color: "var(--crasto-text-primary)" }} /><h3 style={{ margin: 0 }}>{t("Dados da empresa")}</h3><span className="mt" style={{ fontSize: 11.5 }}>{t("clique e edite — salva sozinho")}</span></div>
        <div className="infogrid">
          <div><div className="infolab">{t("Nome / Razão")}</div><OrgInline orgId={id!} field="name" value={org.name} placeholder={t("Nome da empresa")} flash={(m) => toast.ok(m)} reloadOnSave reload={reload} /></div>
          <div><div className="infolab">{t("País")}</div><OrgInline orgId={id!} field="country" value={org.country} type="select" options={COUNTRIES.map((c) => ({ v: c.code, l: `${c.flag} ${c.name}` }))} flash={(m) => toast.ok(m)} reloadOnSave reload={reload} /></div>
          <div><div className="infolab">{co.idLabel}</div><OrgInline orgId={id!} field="tax_id" value={org.tax_id} placeholder="—" flash={(m) => toast.ok(m)} /></div>
          <div><div className="infolab">{t("Fundação")}</div><OrgInline orgId={id!} field="founded_on" value={org.founded_on ? String(org.founded_on).slice(0, 10) : ""} type="date" flash={(m) => toast.ok(m)} /></div>
          <div><div className="infolab">{t("Dono / Presidente")}</div><OrgInline orgId={id!} field="owner_name" value={org.owner_name} placeholder="—" flash={(m) => toast.ok(m)} /></div>
          <div><div className="infolab">{t("Website")}</div><OrgInline orgId={id!} field="website" value={org.website} placeholder="https://…" flash={(m) => toast.ok(m)} /></div>
        </div>
        <div style={{ marginTop: 12 }}><div className="infolab">{t("Observações")}</div><OrgInline orgId={id!} field="notes" value={org.notes} placeholder={t("nota interna sobre a empresa")} flash={(m) => toast.ok(m)} /></div>
      </div>

      {/* Perfil — veio do site (imutável); o cadeado edita e guarda o histórico */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}><FileText size={16} style={{ color: "var(--crasto-text-primary)" }} /><h3 style={{ margin: 0 }}>{t("Perfil")}</h3><span className="mt" style={{ fontSize: 11.5 }}>{t("veio do site · clique no 🔒 p/ editar — guarda o histórico")}</span></div>
        <div className="infogrid">
          <div><SiteField orgId={id!} field="segmento" label={t("Segmento")} siteValue={diag?.segmento} history={histOf("segmento")} onSaved={reload} /></div>
          <div><SiteField orgId={id!} field="faturamento" label={t("Faturamento")} siteValue={diag?.faturamento} history={histOf("faturamento")} onSaved={reload} /></div>
          <div><SiteField orgId={id!} field="tempo" label={t("Tempo de operação")} siteValue={diag?.tempo} history={histOf("tempo")} onSaved={reload} /></div>
          <div><SiteField orgId={id!} field="cargo" label={t("Cargo")} siteValue={diag?.cargo} history={histOf("cargo")} onSaved={reload} /></div>
          <div><SiteField orgId={id!} field="email" label={t("E-mail")} siteValue={diag?.email} history={histOf("email")} onSaved={reload} /></div>
          <div><div className="infolab">{t("País")}</div><div className="infoval">{co.flag} {co.name}</div></div>
        </div>
      </div>

      {/* Contatos — persona/CRM completo (mesmo componente da ficha de cliente) */}
      <div className="sec-h" style={{ marginTop: 4 }}><h2>{t("Contatos da empresa")}</h2><Pill tone="mute">{t("persona · familiares · consultável")}</Pill></div>
      <PessoasEditor orgId={id!} />

      {/* Serviços de interesse — o que ele quer contratar (liga ao Catálogo → vira proposta → Oportunidade) */}
      <div className="sec-h" style={{ marginTop: 20 }}><h2>{t("Serviços de interesse")}</h2><Pill tone="mute">{t("o que ele quer contratar · alimenta a proposta")}</Pill></div>
      <ServicosDeal orgId={id!} defaultSituacao="interesse" onDone={() => { onStageChange?.("oportunidade"); reload(); }} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        <div className="mt" style={{ flex: 1, minWidth: 220 }}>{t("Monte a proposta com esses serviços no Gerador. Ao existir proposta, a empresa pode virar Oportunidade.")}</div>
        <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => nav("/admin/propostas")}><span className="crasto-btn__label">{t("Ir ao Gerador de propostas")}</span><span className="crasto-btn__icon"><ArrowRight size={14} /></span></button>
      </div>

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

      {/* Modal — registrar doação (Ganho pró-bono) */}
      <Modal title={t("Registrar doação (Ganho pró-bono)")} open={donOpen} onClose={() => setDonOpen(false)}
        footer={<>
          <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setDonOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={donBusy} onClick={confirmDonation}><span className="crasto-btn__icon"><HeartHandshake size={14} /></span><span className="crasto-btn__label">{donBusy ? t("Registrando…") : t("Registrar doação")}</span></button>
        </>}>
        <div className="alert" style={{ marginBottom: 12, background: "#E7F4F1", color: "#0F5F54", border: "1px solid #BFE3DC" }}>
          {t("Isto move a empresa para GANHO como doação: lucro/receita = R$0, mas guardamos o valor-equivalente do serviço doado para o relatório de impacto social do ano.")}
        </div>
        <Field label={t("Valor-equivalente doado (R$)")}>
          <input type="number" min="0" step="0.01" value={donValue} onChange={(e) => setDonValue(e.target.value)} placeholder={t("ex.: 4000")} />
        </Field>
        <div className="mt" style={{ fontSize: 11.5, marginTop: 2, marginBottom: 10 }}>{t("Pré-somado dos serviços do Catálogo anexados (ex.: site + funil). Ajuste se precisar.")}</div>
        <Field label={t("O que foi doado (descrição)")}>
          <input value={donNote} onChange={(e) => setDonNote(e.target.value)} placeholder={t("ex.: Website + estratégia de funil de arrecadação")} />
        </Field>
        <div className="mt" style={{ fontSize: 11, marginTop: 8 }}>{t("Fiscal: doação de serviços normalmente NÃO gera dedução automática — registre aqui para a conversa com o contador.")}</div>
      </Modal>
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
