// Registros legais internacionais — Grupo × N registros × país.
// Cada país tem um tipo de registro fiscal com formato próprio (validação + máscara).
export type RegType = {
  code: string;      // reg_type gravado no banco
  label: string;     // rótulo do registro (CNPJ, EIN…)
  country: string;   // ISO-2
  countryName: string;
  placeholder: string;
  br?: boolean;      // campos BR-específicos (inscrições, regime)
  validate: (v: string) => boolean;
  format: (v: string) => string; // máscara de exibição
};

const digits = (v: string) => (v || "").replace(/\D/g, "");
const alnum = (v: string) => (v || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

export const REG_TYPES: Record<string, RegType> = {
  cnpj: {
    code: "cnpj", label: "CNPJ", country: "BR", countryName: "Brasil", placeholder: "00.000.000/0000-00", br: true,
    validate: (v) => digits(v).length === 14,
    format: (v) => { const d = digits(v).slice(0, 14); return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, "$1.$2.$3/$4-$5").replace(/[.\/-]+$/, ""); },
  },
  ein: {
    code: "ein", label: "EIN", country: "US", countryName: "Estados Unidos", placeholder: "00-0000000",
    validate: (v) => digits(v).length === 9,
    format: (v) => { const d = digits(v).slice(0, 9); return d.replace(/^(\d{2})(\d{0,7}).*/, (_m, a, b) => (b ? `${a}-${b}` : a)); },
  },
  nif: {
    code: "nif", label: "NIF", country: "PT", countryName: "Portugal", placeholder: "000000000",
    validate: (v) => digits(v).length === 9, format: (v) => digits(v).slice(0, 9),
  },
  bn: {
    code: "bn", label: "BN", country: "CA", countryName: "Canadá", placeholder: "000000000RC0001",
    validate: (v) => /^\d{9}([A-Z]{2}\d{4})?$/.test(alnum(v)), format: (v) => alnum(v).slice(0, 15),
  },
  rfc: {
    code: "rfc", label: "RFC", country: "MX", countryName: "México", placeholder: "XAXX010101000",
    validate: (v) => /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(alnum(v)), format: (v) => alnum(v).slice(0, 13),
  },
  hojin: {
    code: "hojin", label: "Hōjin Bangō", country: "JP", countryName: "Japão", placeholder: "0000000000000",
    validate: (v) => digits(v).length === 13, format: (v) => digits(v).slice(0, 13),
  },
  other: {
    code: "other", label: "Registro", country: "", countryName: "Outro", placeholder: "",
    validate: (v) => (v || "").trim().length > 0, format: (v) => v,
  },
};

export const COUNTRIES = [
  { code: "BR", name: "Brasil", reg: "cnpj" },
  { code: "US", name: "Estados Unidos", reg: "ein" },
  { code: "PT", name: "Portugal", reg: "nif" },
  { code: "CA", name: "Canadá", reg: "bn" },
  { code: "MX", name: "México", reg: "rfc" },
  { code: "JP", name: "Japão", reg: "hojin" },
  { code: "OT", name: "Outro país", reg: "other" },
];

export const regTypeFor = (country: string) => COUNTRIES.find((c) => c.code === country)?.reg ?? "other";
export const reg = (regType?: string): RegType => REG_TYPES[regType || "cnpj"] ?? REG_TYPES.other;
export const countryName = (code?: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code ?? "—";
