// ============================================================================
// Middle-end do Hub.Crasto.AI — camada de aplicação/serviço por bounded context.
//
// REGRA: nenhuma tela (src/pages/**) deve importar `supabase` diretamente.
// Toda leitura/escrita passa por estes serviços — este é o ÚNICO ponto onde o
// transporte (Supabase hoje; microserviço Go/C# amanhã — "poliglota nas bordas")
// pode ser trocado sem tocar na UI. Ver Blueprint (seção DDD & Camadas).
//
//   import { services } from "../../services";
//   const orgs = await services.identity.organizations.listBrief();
// ============================================================================
export { ServiceError, errorMessage } from "./core/result";
export * from "./core/types";

import { identity } from "./identity.service";
import { crm } from "./crm.service";
import { catalog } from "./catalog.service";
import { delivery } from "./delivery.service";
import { commerce } from "./commerce.service";
import { support } from "./support.service";
import { billing } from "./billing.service";
import { automation } from "./automation.service";
import { storage } from "./storage.service";
import { analytics } from "./analytics.service";
import { finance } from "./finance.service";
import { crmAccess } from "./crmAccess.service";

export const services = {
  identity, crm, catalog, delivery, commerce, support, billing, automation, storage, analytics, finance, crmAccess,
};

// Re-export nomeado para quem preferir importar um contexto só.
export { identity, crm, catalog, delivery, commerce, support, billing, automation, storage, analytics, finance, crmAccess };
