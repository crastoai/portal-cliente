// Wrapper do detalhe do CRM: escolhe a ficha certa pelo stage.
//  cliente            → ClienteDetalhe (ficha completa de cliente, já existente)
//  prospecto/lead/oportunidade (qualificado) → LeadDetalhe (ficha do diagnóstico, cresce por stage)
import { useParams } from "react-router-dom";
import { services as api } from "../../services";
import { useAsync, Loader } from "../../ui/ui";
import ClienteDetalhe from "./ClienteDetalhe";
import LeadDetalhe from "./LeadDetalhe";

export default function CrmDetalhe() {
  const { id } = useParams();
  const { data, loading } = useAsync(() => api.identity.organizations.getById(id!), [id]);
  if (loading) return <Loader />;
  const stage = (data as any)?.stage ?? "prospecto";
  return stage === "cliente" ? <ClienteDetalhe /> : <LeadDetalhe />;
}
