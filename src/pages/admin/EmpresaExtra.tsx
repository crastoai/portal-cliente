// ============================================================================
// Bloco compartilhado do cadastro de EMPRESA (usado em ClienteDetalhe e LeadDetalhe):
//  • Dados extras: tipo de empresa, emite NF, cliente oculto (auditoria)
//  • Papéis (tags) + ativação de Indicador (agente conector) com escolha de recompensa
//  • Origem & indicação (INTERNO, owner-only, editável pelo admin) — crm.org_referral
// ============================================================================
import { useEffect, useState } from "react";
import { Tag, Lock, ClipboardList } from "lucide-react";
import { services as api } from "../../services";
import { Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";

const PAPEIS = [
  { k: "fornecedor", l: "Fornecedor" },
  { k: "prestador_servico", l: "Prestador de serviço" },
  { k: "representante_comercial", l: "Representante comercial" },
  { k: "indicador", l: "Indicador" },
  { k: "colaborador", l: "Colaborador" },
];
const dtLocal = (v: any) => (v ? String(v).slice(0, 16) : "");

export default function EmpresaExtra({ orgId, org, onSaved, flash }: { orgId: string; org: any; onSaved: () => void; flash: (m: string) => void }) {
  const t = useT();
  const [tipo, setTipo] = useState(org.tipo_empresa || "");
  const [nf, setNf] = useState<string>(org.emite_nf === true ? "sim" : org.emite_nf === false ? "nao" : "");
  const [oculto, setOculto] = useState<boolean>(!!org.cliente_oculto);
  const [papeis, setPapeis] = useState<string[]>(Array.isArray(org.papeis) ? org.papeis : []);
  const [ref, setRef] = useState<any>({});
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [reward, setReward] = useState<string>("desconto_fatura");
  const [comissao, setComissao] = useState<string>("10");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.identity.organizations.referral(orgId).then((r) => setRef(r || {}));
    api.identity.organizations.listBrief().then((l) => setOrgs((l as any) || [])).catch(() => {});
    api.identity.connectors.list().then((cs: any) => {
      const mine = (cs || []).find((c: any) => c.organization_id === orgId);
      if (mine) { if (mine.reward_type) setReward(mine.reward_type); if (mine.commission_default != null) setComissao(String(mine.commission_default)); }
    }).catch(() => {});
  }, [orgId]);

  const toggle = (k: string) => setPapeis((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const setR = (k: string, v: any) => setRef((r: any) => ({ ...r, [k]: v }));
  const isIndic = papeis.includes("indicador");

  async function save() {
    setBusy(true);
    try {
      await api.identity.organizations.update(orgId, { tipo_empresa: tipo || null, emite_nf: nf === "sim" ? true : nf === "nao" ? false : null, cliente_oculto: oculto, papeis });
      await api.identity.organizations.saveReferral(orgId, {
        origem_canal: ref.origem_canal || null, indicado_por: ref.indicado_por || null, indicado_em: ref.indicado_em || null,
        comissao_tipo: ref.comissao_tipo || null, comissao_percent: ref.comissao_percent === "" || ref.comissao_percent == null ? null : Number(ref.comissao_percent),
        comissao_status: ref.comissao_status || null, captado_por: ref.captado_por || null,
        primeiro_contato_em: ref.primeiro_contato_em || null, obs: ref.obs || null,
      });
      if (isIndic) {
        const cs: any = await api.identity.connectors.list();
        const mine = (cs || []).find((c: any) => c.organization_id === orgId);
        if (mine) await api.identity.connectors.update(mine.id, { reward_type: reward, commission_default: Number(comissao) || 0, active: true });
        else await api.identity.connectors.create({ name: org.name, agent_type: "indicador", organization_id: orgId, reward_type: reward, commission_default: Number(comissao) || 0, active: true });
      }
      flash(t("Cadastro atualizado ✓")); onSaved();
    } catch (e: any) { flash(t("Erro ao salvar:") + " " + (e?.message || "")); }
    setBusy(false);
  }

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><ClipboardList size={16} style={{ color: "var(--crasto-text-primary)" }} /><h3 style={{ margin: 0 }}>{t("Cadastro & relação")}</h3></div>

      {/* Dados extras */}
      <div className="grid2">
        <Field label="Tipo de empresa"><input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="MEI, ME, LTDA, S.A…" /></Field>
        <Field label="Emite nota fiscal?"><select value={nf} onChange={(e) => setNf(e.target.value)}><option value="">{t("Não definido")}</option><option value="sim">{t("Sim")}</option><option value="nao">{t("Não")}</option></select></Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        <button type="button" className={"sw" + (oculto ? " on" : "")} onClick={() => setOculto((v) => !v)} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{t("Cliente oculto (auditoria)")}</span>
        <span className="mt" style={{ fontSize: 11.5 }}>{t("percorre a jornada p/ testar a experiência — fora do BI real")}</span>
      </label>

      {/* Papéis */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--crasto-border-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><Tag size={15} style={{ color: "var(--crasto-text-primary)" }} /><b style={{ fontSize: 13 }}>{t("Papéis")}</b><span className="mt" style={{ fontSize: 11.5 }}>{t("além do estágio do funil")}</span></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PAPEIS.map((p) => { const on = papeis.includes(p.k); return (
            <button key={p.k} type="button" className="chip" onClick={() => toggle(p.k)}
              style={{ cursor: "pointer", border: "1px solid " + (on ? "transparent" : "var(--crasto-border-soft)"), background: on ? "#EEEDFE" : "transparent", color: on ? "#26215C" : "var(--crasto-text-body)" }}>{t(p.l)}</button>
          ); })}
        </div>
        {isIndic && (
          <div style={{ marginTop: 12, background: "var(--crasto-bg-2)", borderRadius: "var(--crasto-radius-md)", padding: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>{t("Como o indicador recebe a comissão?")}</div>
            <div className="grid2">
              <Field label="Recompensa"><select value={reward} onChange={(e) => setReward(e.target.value)}><option value="desconto_fatura">{t("Desconto na fatura")}</option><option value="dinheiro">{t("Em dinheiro")}</option></select></Field>
              <Field label="Comissão (% recorrente do MRR indicado)"><input type="number" min="0" max="100" value={comissao} onChange={(e) => setComissao(e.target.value)} /></Field>
            </div>
            <div className="mt" style={{ fontSize: 11.5, marginTop: 4 }}>{t("Vira agente conector (aparece em Agentes indicadores).")}</div>
          </div>
        )}
      </div>

      {/* Origem & indicação (interno) */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--crasto-border-soft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><Lock size={15} style={{ color: "var(--crasto-blue)" }} /><b style={{ fontSize: 13 }}>{t("Origem & indicação")}</b><span className="chip" style={{ background: "var(--crasto-navy-05)", color: "var(--crasto-text-primary)" }}>{t("interno · cliente nunca vê")}</span></div>
        <div className="grid2">
          <Field label="Canal / origem"><input value={ref.origem_canal || ""} onChange={(e) => setR("origem_canal", e.target.value)} placeholder={t("internet, indicação, fornecedor, evento…")} /></Field>
          <Field label="Indicado por"><select value={ref.indicado_por || ""} onChange={(e) => setR("indicado_por", e.target.value || null)}><option value="">{t("— ninguém —")}</option>{orgs.filter((o) => o.id !== orgId).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
        </div>
        <div className="grid2">
          <Field label="Indicado em"><input type="datetime-local" value={dtLocal(ref.indicado_em)} onChange={(e) => setR("indicado_em", e.target.value || null)} /></Field>
          <Field label="1º contato em"><input type="datetime-local" value={dtLocal(ref.primeiro_contato_em)} onChange={(e) => setR("primeiro_contato_em", e.target.value || null)} /></Field>
        </div>
        <div className="grid2">
          <Field label="Comissão da indicação (%)"><input type="number" min="0" max="100" value={ref.comissao_percent ?? ""} onChange={(e) => setR("comissao_percent", e.target.value)} /></Field>
          <Field label="Status da comissão"><select value={ref.comissao_status || ""} onChange={(e) => setR("comissao_status", e.target.value || null)}><option value="">{t("—")}</option><option value="sem_comissao">{t("Sem comissão")}</option><option value="pendente">{t("Pendente")}</option><option value="paga">{t("Paga")}</option></select></Field>
        </div>
        <div className="grid2">
          <Field label="Tipo de comissão"><select value={ref.comissao_tipo || ""} onChange={(e) => setR("comissao_tipo", e.target.value || null)}><option value="">{t("—")}</option><option value="desconto_fatura">{t("Desconto na fatura")}</option><option value="dinheiro">{t("Em dinheiro")}</option></select></Field>
          <Field label="Quem captou"><input value={ref.captado_por || ""} onChange={(e) => setR("captado_por", e.target.value)} placeholder={t("ex.: Julie (SDR)")} /></Field>
        </div>
        <Field label="Observação"><input value={ref.obs || ""} onChange={(e) => setR("obs", e.target.value)} placeholder={t("nota interna sobre a origem/indicação")} /></Field>
      </div>

      <div style={{ marginTop: 14 }}>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={save}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar cadastro & relação")}</span></button>
      </div>
    </div>
  );
}
