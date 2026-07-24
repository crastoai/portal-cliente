import { useState } from "react";
import { MessageCircle, Send, Paperclip } from "lucide-react";
import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";

const STATUSES = ["open", "in_progress", "resolved", "closed"];

export type QueueConfig = {
  kind: "support" | "implementation_request";
  title: string;
  sub: string;
  icon: React.ReactNode;
  statusLabel: (s: string) => string;
  statusTone: (s: string) => string;
  /** rótulo do selo de "pendentes" (status open) */
  pendingLabel: (n: number) => string;
  emptyText: string;
  /** ação principal: quando o status permite avisar o cliente */
  actionTemplate: "resolved" | "received";
  actionLabel: string;
  actionIcon: React.ReactNode;
  actionableWhen: (status: string) => boolean;
  waText: (num: string) => string;
  okFlash: (emailSent: boolean, err?: string) => string;
};

export default function TicketQueue({ cfg }: { cfg: QueueConfig }) {
  const t = useT();
  const { data, loading, reload } = useAsync(async () => {
    const [tk, orgs] = await Promise.all([
      services.support.tickets.listAll(cfg.kind),
      services.identity.organizations.listForProposals(),
    ]);
    const ids = Array.from(new Set((tk as any[]).map((x) => x.organization_id).filter(Boolean)));
    const phones = await services.crm.phones.listByOrgs(ids as string[]).catch(() => [] as any[]);
    return { items: (tk as any[]) ?? [], orgs: (orgs as any[]) ?? [], phones: (phones as any[]) ?? [] };
  }, [cfg.kind]);

  const items = data?.items ?? [];
  const orgs = data?.orgs ?? [];
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name || "—";
  const waMap: Record<string, string> = {};
  for (const p of (data?.phones ?? []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary))) {
    if (!waMap[p.organization_id]) waMap[p.organization_id] = `${p.country_code || ""}${p.number || ""}`.replace(/\D/g, "");
  }

  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [statusF, setStatusF] = useState(""); // "" = todos
  const [clientF, setClientF] = useState(""); // "" = todos
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 7000); };

  async function setStatus(id: string, status: string) { setBusy(id); await services.support.tickets.setStatus(id, status); await reload(); setBusy(""); }
  async function notify(id: string) {
    setBusy(id);
    const r = await services.support.tickets.notify(id, cfg.actionTemplate);
    await reload(); setBusy("");
    flash(r.ok ? cfg.okFlash(!!r.email_sent, r.email_error) : t("Erro:") + " " + (r.error || "—"));
  }

  // clientes que TÊM itens nessa fila (para o filtro) + contagem
  const clientCounts: Record<string, number> = {};
  items.forEach((i) => { clientCounts[i.organization_id] = (clientCounts[i.organization_id] || 0) + 1; });
  const clientsWithItems = Object.keys(clientCounts).map((id) => ({ id, name: orgName(id), n: clientCounts[id] })).sort((a, b) => a.name.localeCompare(b.name, "pt"));
  const statusCounts: Record<string, number> = {};
  items.forEach((i) => { statusCounts[i.status] = (statusCounts[i.status] || 0) + 1; });

  const q = query.trim().toLowerCase();
  const filtered = items.filter((i) =>
    (!statusF || i.status === statusF) &&
    (!clientF || i.organization_id === clientF) &&
    (!q || `${orgName(i.organization_id)} ${i.subject || ""} ${i.description || ""}`.toLowerCase().includes(q))
  );
  const novas = items.filter((x) => x.status === "open").length;

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title={cfg.title} sub={cfg.sub}
        right={novas > 0 ? <Pill tone="warn">{cfg.pendingLabel(novas)}</Pill> : undefined} />

      {/* Canal de suporte configurável — o número/e-mail que o cliente vê em "Suporte & Ajuda".
          Vale para TODOS os clientes (é o suporte da Crasto.AI/Julie). Só na fila de suporte. */}
      {cfg.kind === "support" && <SupportChannelConfig />}

      {loading ? <Empty>Carregando…</Empty> : items.length === 0 ? <Empty>{t(cfg.emptyText)}</Empty> : (
        <>
          <div className="catsearch">
            <span style={{ display: "grid", placeItems: "center" }}>{cfg.icon}</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Buscar por cliente, assunto ou descrição…")} />
            <span className="mt" style={{ whiteSpace: "nowrap" }}>{t("{n} de {total}", { n: filtered.length, total: items.length })}</span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div className="cattabs" style={{ margin: "12px 0 4px", flex: 1 }}>
              <button className={"cattab" + (!statusF ? " is-active" : "")} onClick={() => setStatusF("")}>{t("Todos")}<span className="cnt">{items.length}</span></button>
              {STATUSES.filter((s) => statusCounts[s]).map((s) => (
                <button key={s} className={"cattab" + (statusF === s ? " is-active" : "")} onClick={() => setStatusF(s)}>{cfg.statusLabel(s)}<span className="cnt">{statusCounts[s]}</span></button>
              ))}
            </div>
            <select className="selorg" value={clientF} onChange={(e) => setClientF(e.target.value)} style={{ width: 220, flex: "none" }}>
              <option value="">{t("Todos os clientes")}</option>
              {clientsWithItems.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.n})</option>)}
            </select>
          </div>

          {filtered.length === 0 ? <Empty>{t("Nada encontrado com esses filtros.")}</Empty> : filtered.map((it) => {
            const wa = waMap[it.organization_id];
            const canAct = cfg.actionableWhen(it.status);
            const waHref = `https://wa.me/${wa}?text=${encodeURIComponent(cfg.waText(String(it.id).slice(0, 8).toUpperCase()))}`;
            return (
              <div className="card" style={{ marginBottom: 12 }} key={it.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Pill tone={cfg.statusTone(it.status) as any}>{cfg.statusLabel(it.status)}</Pill>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div className="nm" style={{ fontWeight: 700 }}>{cfg.kind === "support" ? it.subject : orgName(it.organization_id)}</div>
                    <div className="mt">{cfg.kind === "support" ? orgName(it.organization_id) + " · " : ""}{new Date(it.created_at).toLocaleString("pt-BR")}</div>
                  </div>
                  <select value={it.status} disabled={busy === it.id} onChange={(e) => setStatus(it.id, e.target.value)} className="selorg" style={{ width: 160 }}>
                    {STATUSES.map((s) => <option key={s} value={s}>{cfg.statusLabel(s)}</option>)}
                  </select>
                </div>
                {it.description && <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--crasto-border-soft)", fontSize: 13, color: "var(--crasto-text-body)", whiteSpace: "pre-wrap" }}>{it.description}</div>}
                {Array.isArray(it.attachments) && it.attachments.length > 0 && (
                  <div className="attlist" style={{ marginTop: 10 }}>
                    {it.attachments.map((a: any, i: number) => (
                      <button className="attchip" style={{ cursor: "pointer" }} key={i} type="button" title={t("Abrir anexo")}
                        onClick={async () => { const u = await services.storage.getUrl(a.key); if (u) window.open(u, "_blank", "noopener"); }}>
                        <span className="attchip-ic"><Paperclip size={13} /></span>
                        <span className="attchip-n">{a.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                  {wa
                    ? <a className="crasto-btn crasto-btn--ghost crasto-btn--sm" href={waHref} target="_blank" rel="noopener"><span className="crasto-btn__icon"><MessageCircle size={14} /></span><span className="crasto-btn__label">{t("Falar no WhatsApp")}</span></a>
                    : <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled title={t("Cliente sem telefone no CRM")}><span className="crasto-btn__icon"><MessageCircle size={14} /></span><span className="crasto-btn__label">{t("Falar no WhatsApp")}</span></button>}
                  {canAct
                    ? <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy === it.id} onClick={() => notify(it.id)}><span className="crasto-btn__icon">{cfg.actionIcon}</span><span className="crasto-btn__label">{t(cfg.actionLabel)}</span></button>
                    : <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy === it.id} onClick={() => notify(it.id)}><span className="crasto-btn__icon"><Send size={14} /></span><span className="crasto-btn__label">{t("Reenviar aviso")}</span></button>}
                </div>
              </div>
            );
          })}
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// Editor do canal de suporte (WhatsApp + e-mail) — grava em finance.settings via RPC admin.
// É o mesmo número que o cliente vê em "Suporte & Ajuda" (para todos os clientes).
function SupportChannelConfig() {
  const t = useT();
  const { data } = useAsync(() => services.analytics.settings.business<Record<string, string>>(), []);
  const [wa, setWa] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState("");
  const waVal = wa ?? data?.support_whatsapp ?? "";
  const emailVal = email ?? data?.support_email ?? "";
  const preview = waVal.replace(/\D/g, "");
  async function save() {
    setBusy(true);
    try {
      await services.analytics.settings.setBusiness("support_whatsapp", preview);
      await services.analytics.settings.setBusiness("support_email", emailVal.trim());
      setOk(t("Canal de suporte atualizado ✓")); setTimeout(() => setOk(""), 5000);
    } catch { setOk(t("Erro ao salvar.")); setTimeout(() => setOk(""), 5000); } finally { setBusy(false); }
  }
  return (
    <div className="card" style={{ padding: 16, marginBottom: 18 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <MessageCircle size={15} /> {t("Canal de suporte (o que o cliente vê em Suporte & Ajuda)")}
      </div>
      <div className="mt" style={{ fontSize: 12, marginBottom: 12 }}>{t("Vale para todos os clientes. Se um dia trocar de número, ajuste aqui.")}</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px" }}>
          <Field label={t("WhatsApp do suporte")}><input value={waVal} onChange={(e) => setWa(e.target.value)} placeholder="5511913685973" /></Field>
          <div className="mt" style={{ fontSize: 11.5, marginTop: 4 }}>{t("Formato DDI+DDD+número (ex.: 5511913685973).")} {preview && <>· <a href={`https://wa.me/${preview}`} target="_blank" rel="noopener">wa.me/{preview}</a></>}</div>
        </div>
        <div style={{ flex: "1 1 240px" }}>
          <Field label={t("E-mail de suporte")}><input value={emailVal} onChange={(e) => setEmail(e.target.value)} placeholder="support@crasto.ai" /></Field>
        </div>
        <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy} onClick={save} style={{ flex: "none" }}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar canal")}</span></button>
        {ok && <span style={{ color: "var(--crasto-success)", fontSize: 12.5, alignSelf: "center" }}>{ok}</span>}
      </div>
    </div>
  );
}
