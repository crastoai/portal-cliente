import { useEffect, useState } from "react";
import Modal from "./Modal";
import { money } from "./ui";
import { useSettings } from "../lib/settings";
import { pixBRCode } from "../lib/pix";
import { useT } from "../lib/i18n";
import QRCode from "qrcode";
import type { Fatura } from "../lib/faturas";

// Modal "Pagar via Pix" reutilizável (Cockpit + página Financeiro). BR Code + QR gerados 100%
// local a partir da chave/beneficiário reais (finance.settings). Reconciliação manual (aba Cobrança).
const brData = (s?: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "—");

export default function PixPayModal({ fatura, onClose }: { fatura: Fatura | null; onClose: () => void }) {
  const t = useT();
  const settings = useSettings();
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);
  const code = fatura && settings.pixKey
    ? pixBRCode({ key: settings.pixKey, name: settings.pixBeneficiary, amount: Number(fatura.amount || 0), txid: fatura.id })
    : "";
  useEffect(() => {
    setCopied(false);
    if (!code) { setSvg(""); return; }
    let live = true;
    QRCode.toString(code, { type: "svg", margin: 1, width: 220, errorCorrectionLevel: "M" })
      .then((s) => { if (live) setSvg(s); })
      .catch(() => { if (live) setSvg(""); });
    return () => { live = false; };
  }, [code]);
  const copy = () => { if (code) navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); }).catch(() => {}); };

  return (
    <Modal title={t("Pagar via Pix")} open={!!fatura} onClose={onClose}>
      {fatura && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div><div style={{ fontSize: 12, color: "var(--crasto-text-muted)" }}>{fatura.description || t("Parcela")}</div><div className="tnum" style={{ fontSize: 22, fontWeight: 700 }}>{money(Number(fatura.amount || 0))}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ fontSize: 12, color: "var(--crasto-text-muted)" }}>{t("Vencimento")}</div><div style={{ fontWeight: 600 }}>{brData(fatura.due_date)}</div></div>
          </div>
          {!settings.pixKey ? (
            <div className="scopeempty">{t("Chave Pix ainda não configurada. Fale com o suporte.")}</div>
          ) : (<>
            {svg && <div style={{ alignSelf: "center", background: "#fff", padding: 10, borderRadius: 12, width: 200, height: 200 }} dangerouslySetInnerHTML={{ __html: svg }} />}
            <div>
              <div style={{ fontSize: 12, color: "var(--crasto-text-muted)", marginBottom: 4 }}>{t("Pix Copia-e-Cola")}</div>
              <div style={{ fontFamily: "monospace", fontSize: 11.5, wordBreak: "break-all", background: "var(--crasto-bg-2)", border: "1px solid var(--crasto-border)", borderRadius: 8, padding: "8px 10px", maxHeight: 96, overflowY: "auto" }}>{code}</div>
              <button className="crasto-btn crasto-btn--primary crasto-btn--sm" style={{ marginTop: 8 }} onClick={copy}><span className="crasto-btn__label">{copied ? t("Copiado ✓") : t("Copiar código")}</span></button>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--crasto-text-body)", lineHeight: 1.5 }}>
              <b>{t("Beneficiário:")}</b> {settings.pixBeneficiary || "—"}<br />
              <b>{t("Como pagar:")}</b> {t("abra o app do seu banco → Pix → pagar com QR Code ou Copia-e-Cola → confira o valor e confirme.")}
            </div>
            <div className="scopeempty" style={{ fontSize: 12 }}>{t("Depois de pagar, seu comprovante é conferido pela Crasto.AI e a parcela é baixada.")}</div>
          </>)}
        </div>
      )}
    </Modal>
  );
}
