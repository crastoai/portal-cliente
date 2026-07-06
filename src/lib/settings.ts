// Parâmetros de negócio REAIS, vindos do banco (finance.settings via RPC).
// Nada fictício: imposto e % de comissão são a fonte única do banco.
// Os valores abaixo só são usados como fallback se a rede falhar (espelham o banco).
import { useEffect, useState } from "react";
import { services } from "../services";

export type BusinessSettings = { taxRate: number; commissionIndicador: number; commissionConector: number; supportWhatsapp: string; supportEmail: string };

const FALLBACK: BusinessSettings = { taxRate: 8.68, commissionIndicador: 20, commissionConector: 5, supportWhatsapp: "", supportEmail: "" };

let cache: BusinessSettings | null = null;
let inflight: Promise<BusinessSettings> | null = null;

export async function loadSettings(): Promise<BusinessSettings> {
  if (cache) return cache;
  if (!inflight) {
    inflight = services.analytics.settings
      .business<Record<string, string>>()
      .then((r) => {
        cache = {
          taxRate: Number(r?.tax_rate ?? FALLBACK.taxRate),
          commissionIndicador: Number(r?.commission_indicador ?? FALLBACK.commissionIndicador),
          commissionConector: Number(r?.commission_conector ?? FALLBACK.commissionConector),
          supportWhatsapp: r?.support_whatsapp ?? "",
          supportEmail: r?.support_email ?? "",
        };
        return cache;
      })
      .catch(() => FALLBACK);
  }
  return inflight;
}

/** Hook: devolve os parâmetros de negócio do banco (com fallback enquanto carrega). */
export function useSettings(): BusinessSettings {
  const [s, setS] = useState<BusinessSettings>(cache ?? FALLBACK);
  useEffect(() => { loadSettings().then(setS); }, []);
  return s;
}
