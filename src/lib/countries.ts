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

// key = valor gravado no banco; label = o que o usuário vê.
// 2026-07-21: key inicial renomeada 'contato' → 'prospecto' (label já era "Prospecto").
// 2026-07-26: 'qualificado' → 'oportunidade' (migration 013 — alinhado ao banco). `dot` = cor do estágio no funil.
// 2026-08-12: 'cliente' → 'ganho' + adicionada 'perdido' (migration 046) — funil canônico
//   Prospecto → Lead → Oportunidade → Ganho → Perdido, alinhado ao kanban de deals do wacrm.
//   'perdido' é TERMINAL (closed-lost): fica FORA da trilha linear (use PIPELINE_STAGES); só se
//   chega nela pela ação "Marcar como Perdido" — nunca promovendo por índice.
export const STAGES = [
  { key: "prospecto", label: "Prospecto", tone: "mute", dot: "#8A8F98" },
  { key: "lead", label: "Lead", tone: "info", dot: "#2E6F9E" },
  { key: "oportunidade", label: "Oportunidade", tone: "warn", dot: "#BA7517" },
  { key: "ganho", label: "Ganho", tone: "ok", dot: "#1D9E75" },
  { key: "perdido", label: "Perdido", tone: "crit", dot: "#E24B4A" },
] as const;

export const WON_STAGE = "ganho";
export const LOST_STAGE = "perdido";
// Trilha LINEAR de progressão (sem o terminal Perdido). Use em TUDO que assume ordem/avanço:
// funil visual (stepper), botão "promover", cálculo de curIdx. STAGES (completo) só p/ enumerar
// (abas, contagens, chips, stageOf).
export const PIPELINE_STAGES = STAGES.filter((s) => s.key !== LOST_STAGE);

export const stageOf = (s?: string | null) => STAGES.find((x) => x.key === s) ?? STAGES[0];

// Temperatura MANUAL do lead (definida pelo vendedor; ≠ intent_signal, que é automático do Mapa).
export const TEMPS = [
  { key: "quente", label: "Quente", bg: "#FCE9E7", fg: "#B42318" },
  { key: "morno", label: "Morno", bg: "#FBEEDD", fg: "#8A5A12" },
  { key: "frio", label: "Frio", bg: "#E7F0FA", fg: "#1F5E8F" },
] as const;
export const tempOf = (k?: string | null) => TEMPS.find((x) => x.key === k) ?? null;
