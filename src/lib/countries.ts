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

export const STAGES = [
  { key: "contato", label: "Contato", tone: "mute" },
  { key: "lead", label: "Lead", tone: "info" },
  { key: "qualificado", label: "Qualificado", tone: "warn" },
  { key: "cliente", label: "Cliente", tone: "ok" },
] as const;

export const stageOf = (s?: string | null) => STAGES.find((x) => x.key === s) ?? STAGES[0];
