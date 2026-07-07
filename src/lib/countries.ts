export type Country = { code: string; name: string; flag: string; idLabel: string; idType: string; ddi: string };

export const COUNTRIES: Country[] = [
  { code: "BR", name: "Brasil", flag: "🇧🇷", idLabel: "CNPJ", idType: "CNPJ", ddi: "+55" },
  { code: "US", name: "Estados Unidos", flag: "🇺🇸", idLabel: "EIN", idType: "EIN", ddi: "+1" },
  { code: "PT", name: "Portugal", flag: "🇵🇹", idLabel: "NIPC", idType: "NIPC", ddi: "+351" },
  { code: "ES", name: "Espanha", flag: "🇪🇸", idLabel: "CIF / NIF", idType: "CIF", ddi: "+34" },
  { code: "MX", name: "México", flag: "🇲🇽", idLabel: "RFC", idType: "RFC", ddi: "+52" },
  { code: "CL", name: "Chile", flag: "🇨🇱", idLabel: "RUT", idType: "RUT", ddi: "+56" },
  { code: "AR", name: "Argentina", flag: "🇦🇷", idLabel: "CUIT", idType: "CUIT", ddi: "+54" },
  { code: "JP", name: "Japão", flag: "🇯🇵", idLabel: "Corporate Number", idType: "HOJIN", ddi: "+81" },
];

export const countryOf = (code?: string | null) => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
export const DDIS = COUNTRIES.map((c) => c.ddi).filter((v, i, a) => a.indexOf(v) === i);

/** Códigos de discagem (DDI) para o seletor de WhatsApp — lista ampla, ordenada por uso. */
export const DIAL_CODES: { ddi: string; flag: string; name: string }[] = [
  { ddi: "+55", flag: "🇧🇷", name: "Brasil" },
  { ddi: "+1", flag: "🇺🇸", name: "EUA / Canadá" },
  { ddi: "+351", flag: "🇵🇹", name: "Portugal" },
  { ddi: "+34", flag: "🇪🇸", name: "Espanha" },
  { ddi: "+52", flag: "🇲🇽", name: "México" },
  { ddi: "+54", flag: "🇦🇷", name: "Argentina" },
  { ddi: "+56", flag: "🇨🇱", name: "Chile" },
  { ddi: "+57", flag: "🇨🇴", name: "Colômbia" },
  { ddi: "+51", flag: "🇵🇪", name: "Peru" },
  { ddi: "+598", flag: "🇺🇾", name: "Uruguai" },
  { ddi: "+595", flag: "🇵🇾", name: "Paraguai" },
  { ddi: "+591", flag: "🇧🇴", name: "Bolívia" },
  { ddi: "+593", flag: "🇪🇨", name: "Equador" },
  { ddi: "+58", flag: "🇻🇪", name: "Venezuela" },
  { ddi: "+44", flag: "🇬🇧", name: "Reino Unido" },
  { ddi: "+33", flag: "🇫🇷", name: "França" },
  { ddi: "+49", flag: "🇩🇪", name: "Alemanha" },
  { ddi: "+39", flag: "🇮🇹", name: "Itália" },
  { ddi: "+41", flag: "🇨🇭", name: "Suíça" },
  { ddi: "+31", flag: "🇳🇱", name: "Holanda" },
  { ddi: "+353", flag: "🇮🇪", name: "Irlanda" },
  { ddi: "+61", flag: "🇦🇺", name: "Austrália" },
  { ddi: "+64", flag: "🇳🇿", name: "Nova Zelândia" },
  { ddi: "+81", flag: "🇯🇵", name: "Japão" },
  { ddi: "+86", flag: "🇨🇳", name: "China" },
  { ddi: "+82", flag: "🇰🇷", name: "Coreia do Sul" },
  { ddi: "+91", flag: "🇮🇳", name: "Índia" },
  { ddi: "+971", flag: "🇦🇪", name: "Emirados Árabes" },
  { ddi: "+972", flag: "🇮🇱", name: "Israel" },
  { ddi: "+27", flag: "🇿🇦", name: "África do Sul" },
  { ddi: "+244", flag: "🇦🇴", name: "Angola" },
  { ddi: "+258", flag: "🇲🇿", name: "Moçambique" },
];

export const STAGES = [
  { key: "contato", label: "Contato", tone: "mute" },
  { key: "lead", label: "Lead", tone: "info" },
  { key: "qualificado", label: "Qualificado", tone: "warn" },
  { key: "cliente", label: "Cliente", tone: "ok" },
] as const;

export const stageOf = (s?: string | null) => STAGES.find((x) => x.key === s) ?? STAGES[0];
