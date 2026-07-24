// Seção "Agente do WhatsApp CRM" do detalhe do cliente (admin).
//
// Só faz UMA coisa: vincular QUAL agente do CRM atende este cliente — isso é config do
// CLIENTE, então mora aqui. A gestão de PESSOAS (quem acessa, papel, telas) saiu daqui em
// 24/07/2026 e passou a viver inteira em Permissões & Acessos: "pessoa é identidade, e
// identidade tem um lugar só". A lista antiga "Usuários do WhatsApp CRM · cada um define a
// própria senha" foi aposentada — era herança de quando o CRM tinha login próprio; hoje o
// login é o do Portal (SSO) e o membro é provisionado no primeiro acesso. Manter dois
// cadastros era a fábrica de "gente que existe só de um lado" (os bugs Neto/jhon).
import { useEffect, useState } from "react";
import { ExternalLink, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { services, errorMessage } from "../../services";
import type { CrmAccessOverview } from "../../services/crmAccess.service";
import { useT } from "../../lib/i18n";
import { Pill } from "../../ui/ui";

export function CrmAccessSection({ orgId, onToast }: { orgId: string; onToast: (m: string) => void }) {
  const tr = useT();
  const navigate = useNavigate();
  const [d, setD] = useState<CrmAccessOverview | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setD(await services.crmAccess.overview(orgId)); } catch (e) { onToast(errorMessage(e)); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orgId]);

  if (!d || !d.enabled) return null; // módulo não contratado → a seção não existe

  async function linkAgent(agentId: string | null) {
    setBusy(true);
    try { await services.crmAccess.linkAgent(orgId, agentId); onToast(tr("Agente vinculado.")); await load(); }
    catch (e) { onToast(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="sec-h" style={{ marginTop: 24 }}>
        <h2>{tr("Agente do WhatsApp CRM")}</h2>
        <Pill tone="ok">{d.module?.name}</Pill>
        {d.crm_url && <a className="crasto-btn crasto-btn--ghost crasto-btn--sm" href={d.crm_url} target="_blank" rel="noreferrer"><span className="crasto-btn__icon"><ExternalLink size={13} /></span><span className="crasto-btn__label">{tr("Abrir o CRM")}</span></a>}
      </div>

      {d.crm_error && <div className="formerr" style={{ marginBottom: 12 }}>{tr("Não foi possível falar com o CRM")}: {d.crm_error}</div>}

      <div className="addrow" style={{ flexWrap: "wrap" }}>
        <select
          value={d.agent_id ?? ""}
          disabled={busy || !d.agents.length}
          onChange={(e) => linkAgent(e.target.value || null)}
          style={{ minWidth: 240 }}
        >
          <option value="">{d.agents.length ? tr("Sem agente vinculado…") : tr("Nenhum agente criado no CRM")}</option>
          {d.agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.status ? ` · ${a.status}` : ""}</option>)}
        </select>
        <span className="mt" style={{ alignSelf: "center" }}>{tr("qual agente do CRM atende este cliente")}</span>
      </div>

      {/* Pessoas moram em Permissões & Acessos — daqui só o atalho, para não haver duas fontes. */}
      <div className="note" style={{ marginTop: 14 }}>
        <Users size={15} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>{tr("Quem da empresa acessa o CRM (e o que cada um vê) é definido em Permissões & Acessos.")}</span>
          <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={() => navigate(`/admin/console/permissoes?org=${orgId}`)}>
            <span className="crasto-btn__label">{tr("Gerenciar pessoas")}</span>
          </button>
        </div>
      </div>
    </>
  );
}
