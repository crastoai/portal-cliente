// Wrapper do detalhe do CRM: escolhe a ficha certa pelo stage, de forma REATIVA.
//  ganho                                → ClienteDetalhe (ficha completa; o diagnóstico vira card+popup)
//  prospecto/lead/oportunidade/perdido  → LeadDetalhe (diagnóstico inline; Perdido = deal fechado-perdido, não é cliente)
// Quando o status muda dentro da ficha (onStageChange), o wrapper re-decide e troca
// a tela na hora — sem reload de página.
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { services as api } from "../../services";
import { useAsync, Loader } from "../../ui/ui";
import { WON_STAGE } from "../../lib/countries";
import ClienteDetalhe from "./ClienteDetalhe";
import LeadDetalhe from "./LeadDetalhe";

export default function CrmDetalhe() {
  const { id } = useParams();
  const { data, loading } = useAsync(() => api.identity.organizations.getById(id!), [id]);
  const [stage, setStage] = useState<string | null>(null);
  useEffect(() => { if (data) setStage((data as any).stage ?? "prospecto"); }, [data]);

  if (loading || stage === null) return <Loader />;
  return stage === WON_STAGE
    ? <ClienteDetalhe onStageChange={setStage} />
    : <LeadDetalhe onStageChange={setStage} />;
}
