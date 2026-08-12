// Gera o "Pix Copia-e-Cola" (BR Code / payload EMV estático) para uma parcela — SEM gateway.
// Espec.: EMVCo + Manual BCB do Pix. Determinístico e 100% local (nada sai da máquina do cliente).
// Reconciliação é manual (o dono baixa na aba Cobrança). Chave/beneficiário vêm de finance.settings.

// TLV: cada campo = ID(2) + LEN(2, zero-pad) + VALUE. LEN = nº de chars do VALUE (ASCII → 1 char = 1 byte).
function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

// CRC16-CCITT (FALSE): poly 0x1021, init 0xFFFF, sem reflexão, XORout 0x0000. Sobre a string inteira + "6304".
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Nome/cidade do BR Code só aceitam ASCII (sem acento). Não mexe na CHAVE (ex.: e-mail é case-sensitive).
const ascii = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "").trim();

export type PixInput = { key: string; name: string; city?: string; amount?: number; txid?: string };

/** Monta o payload "Copia-e-Cola" do Pix. `amount` em reais (ex.: 700 → "700.00"). */
export function pixBRCode({ key, name, city, amount, txid }: PixInput): string {
  const chave = (key || "").trim();
  if (!chave) return "";
  const nome = (ascii(name).toUpperCase().slice(0, 25)) || "RECEBEDOR";
  const cidade = (ascii(city || "SAO PAULO").toUpperCase().slice(0, 15)) || "SAO PAULO";
  const ref = ((txid || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 25)) || "***";
  const mai = tlv("00", "br.gov.bcb.pix") + tlv("01", chave); // Merchant Account Info · Pix
  let payload =
    tlv("00", "01") + // Payload Format Indicator
    tlv("01", "12") + // Point of Initiation: 12 = uso único (cobrança com valor)
    tlv("26", mai) +
    tlv("52", "0000") + // Merchant Category Code
    tlv("53", "986") + // moeda: BRL
    (amount && amount > 0 ? tlv("54", amount.toFixed(2)) : "") +
    tlv("58", "BR") + // país
    tlv("59", nome) + // beneficiário
    tlv("60", cidade) + // cidade
    tlv("62", tlv("05", ref)); // Additional Data · Reference Label (txid p/ conciliação)
  payload += "6304"; // CRC16 (ID+LEN) — o valor entra na conta
  return payload + crc16(payload);
}
