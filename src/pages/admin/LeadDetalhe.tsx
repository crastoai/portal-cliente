// ============================================================================
// LeadDetalhe — ficha de PROSPECTO / LEAD / OPORTUNIDADE (stages != cliente).
// Mostra INLINE o "Mapa de IA" do diagnóstico do site (componente DiagnosticoMapa,
// reutilizado no popup da ficha de cliente) + contato, perfil e histórico.
// Ao avançar o status para "cliente", avisa o wrapper (onStageChange) que troca
// para a ficha completa de cliente (ClienteDetalhe).
// ============================================================================
import { useParams, useNavigate } from "react-router-dom";
import { Trash2, MapPin, Phone, Clock, FileText, ArrowRight } from "lucide-react";
import { services as api } from "../../services";
import { PageHead, Empty, Pill, useAsync, useToast } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { STAGES, stageOf, countryOf } from "../../lib/countries";
import DiagnosticoMapa, { fmtDate } from "./DiagnosticoMapa";

export default function LeadDetalhe({ onStageChange }: { onStageChange?: (s: string) => void }) {
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

  async function setStage(stage: string) {
    try {
      await api.identity.organizations.setStage(id!, stage);
      toast.ok(t("Movido para {s}", { s: t(stageOf(stage).label) }));
      onStageChange?.(stage);          // avisa o wrapper (troca p/ ficha de cliente se virar cliente)
      if (stage !== "cliente") reload();
    } catch { toast.err(t("Erro ao mover o stage.")); }
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

      {/* Mapa de IA (reutilizável) */}
      {diag && <DiagnosticoMapa diag={diag} />}

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
