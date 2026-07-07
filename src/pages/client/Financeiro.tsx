import { useState } from "react";
import { FileText, QrCode, Copy, Check, MessageCircle, AlertTriangle, Clock } from "lucide-react";
import { services } from "../../services";
import { useAuth } from "../../lib/auth";
import { PageHead, Pill, Empty, useAsync, money } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { useSettings } from "../../lib/settings";
import { summarizeFaturas, isOverdue, type Fatura } from "../../lib/faturas";

type Org = { name: string; plan: string | null };

export default function Financeiro() {
  const { profile } = useAuth();
  const t = useT();
  const cfg = useSettings();
  const [copied, setCopied] = useState(false);
  const { data, loading } = useAsync(async () => {
    const [inv, org] = await Promise.all([
      services.billing.invoices.listMine(),
      profile?.organization_id ? services.identity.organizations.getById(profile.organization_id) : Promise.resolve(null),
    ]);
    return { inv: (inv as unknown as Fatura[]) ?? [], org: (org as unknown as Org) ?? null };
  }, [profile?.organization_id]);

  const inv = data?.inv ?? [];
  const org = data?.org ?? null;
  const sum = summarizeFaturas(inv);
  const next = sum.next;
  const tone = (i: Fatura) => (i.status === "paid" ? "ok" : isOverdue(i) ? "crit" : i.status === "canceled" ? "mute" : "warn");
  const label = (i: Fatura) => (i.status === "paid" ? t("Paga") : isOverdue(i) ? t("Vencida") : i.status === "canceled" ? t("Cancelada") : t("Em aberto"));

  const waDigits = (cfg.supportWhatsapp || "").replace(/\D/g, "");
  function openWhatsApp() {
    if (!waDigits) return;
    const msg = encodeURIComponent(t("Olá! Quero acertar minha fatura da Crasto.AI.") + (next ? " " + t("Fatura de {v} com vencimento em {d}.", { v: money(next.amount), d: next.due_date ? new Date(next.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—" }) : ""));
    window.open(`https://wa.me/${waDigits}?text=${msg}`, "_blank", "noopener");
  }
  function copyPix() {
    if (!cfg.pixKey) return;
    navigator.clipboard?.writeText(cfg.pixKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Financeiro" sub="Seu plano, faturas e formas de pagamento." />
      {loading ? <Empty>Carregando…</Empty> : (
        <>
          {sum.overdue.length > 0 && (
            <div className="finalert">
              <AlertTriangle size={18} />
              <div><strong>{t("{n} fatura(s) em atraso", { n: sum.overdue.length })}</strong> — {money(sum.overdueTotal)}. {t("Regularize para manter suas soluções ativas.")}</div>
            </div>
          )}

          <div className="grid2" style={{ marginBottom: 18 }}>
            <div className="herocard">
              <div className="lab">{t("Plano atual")}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: "8px 0 2px" }}>{org?.plan || "—"}</div>
              <div style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>{org?.name}</div>
            </div>
            <div className="card">
              <h3>{t("Próxima cobrança")}</h3>
              <div className="csub">{next?.due_date ? t("Vence em {d}", { d: new Date(next.due_date + "T00:00:00").toLocaleDateString("pt-BR") }) : t("Sem cobranças em aberto")}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: isOverdue(next ?? ({} as Fatura)) ? "#C0362C" : "var(--crasto-text-primary)" }} className="tnum">{next ? money(next.amount) : money(0)}</div>
              {next && sum.daysToNext != null && <div className="csub" style={{ marginTop: 8 }}><Clock size={12} style={{ verticalAlign: -1, marginRight: 4 }} />{sum.daysToNext < 0 ? t("Vencida há {n} dia(s)", { n: Math.abs(sum.daysToNext) }) : sum.daysToNext === 0 ? t("Vence hoje") : t("Vence em {n} dia(s)", { n: sum.daysToNext })}</div>}
            </div>
          </div>

          {/* Formas de pagamento */}
          <div className="paycard">
            <div className="pay-h">
              <h3>{t("Pagar sua fatura")}</h3>
              <span className="soon"><Clock size={12} />{t("Em breve")}</span>
            </div>
            <div className="pay-methods">
              <button className="paymethod" disabled title={t("Disponível quando integrarmos o banco Inter")}>
                <FileText size={18} /><span>{t("Emitir boleto")}</span>
              </button>
              <button className="paymethod" disabled title={t("Disponível quando integrarmos o banco Inter")}>
                <QrCode size={18} /><span>{t("Pagar com Pix")}</span>
              </button>
            </div>
            <p className="pay-note">{t("Boleto e Pix automáticos chegam com a integração ao banco Inter. Enquanto isso, pague pelos canais abaixo:")}</p>

            <div className="pay-now">
              {cfg.pixKey ? (
                <div className="pixbox">
                  <div className="pixlab">{t("Chave Pix da Crasto.AI")}</div>
                  <div className="pixrow">
                    <code>{cfg.pixKey}</code>
                    <button className="crasto-btn crasto-btn--secondary crasto-btn--sm" onClick={copyPix}>
                      <span className="crasto-btn__icon">{copied ? <Check size={13} /> : <Copy size={13} />}</span>
                      <span className="crasto-btn__label">{copied ? t("Copiado") : t("Copiar")}</span>
                    </button>
                  </div>
                  {cfg.pixBeneficiary && <div className="pixben">{t("Favorecido")}: {cfg.pixBeneficiary}</div>}
                </div>
              ) : (
                <div className="pixbox"><div className="pixlab">{t("Chave Pix")}</div><div className="csub">{t("Fale com a Crasto no WhatsApp para receber os dados de pagamento.")}</div></div>
              )}
              {waDigits && (
                <button className="crasto-btn crasto-btn--primary crasto-btn--sm wa-btn" onClick={openWhatsApp}>
                  <span className="crasto-btn__icon"><MessageCircle size={15} /></span>
                  <span className="crasto-btn__label">{t("Falar com a Crasto")}</span>
                </button>
              )}
            </div>
          </div>

          {/* Histórico de faturas */}
          <div className="sec-h" style={{ marginTop: 22 }}><h2>{t("Suas faturas")}</h2></div>
          {inv.length === 0 ? (
            <Empty><p><strong>{t("Nenhuma fatura ainda.")}</strong> {t("Assim que houver cobranças do seu contrato, elas aparecem aqui.")}</p></Empty>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>{t("Fatura")}</th><th>{t("Vencimento")}</th><th>{t("Valor")}</th><th>{t("Status")}</th></tr></thead>
                <tbody>
                  {inv.map((i) => (
                    <tr key={i.id}>
                      <td>{i.description || "—"}</td>
                      <td>{i.due_date ? new Date(i.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="tnum">{money(i.amount)}</td>
                      <td><Pill tone={tone(i) as any}>{label(i)}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
