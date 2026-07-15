import { useState } from "react";
import { MessageCircle, Search, Send, Grid3x3, Eye, Copy, ExternalLink, ShieldCheck, Briefcase } from "lucide-react";
import { services } from "../../services";
import { PageHead, Pill, Empty, useAsync } from "../../ui/ui";
import { useT } from "../../lib/i18n";

type Cred = { id: string; login: string | null; sso_enabled: boolean; vdi_module_id: string; access_url: string | null; client_module_id?: string };
type Mod = {
  id: string; status: string; vdi_module_id: string; label: string | null;
  vdi: { name: string; description: string | null; category: string | null } | null;
  external_url: string | null; cred: Cred | null;
};
type Svc = { id: string; status: string; name: string; description: string | null; category: string | null; unit: string | null };

async function fetchData(): Promise<{ mods: Mod[]; services: Svc[] }> {
  const [cms, creds, csvc] = await Promise.all([
    services.delivery.clientModules.listMine(),
    services.delivery.moduleCredentials.listMine().catch(() => [] as any[]),
    services.delivery.clientServices.listMine().catch(() => [] as any[]),
  ]);
  const ids = cms.map((r) => r.vdi_module_id);
  const vms = ids.length ? await services.catalog.vdiModules.listByIds(ids, "id,name,description,category,external_url") : [];
  const vmap = Object.fromEntries((vms as any[]).map((v) => [v.id, v]));
  // credencial é POR INSTÂNCIA (client_module_id).
  const cmap = Object.fromEntries((creds as any[]).map((c) => [c.client_module_id, c]));
  const mods: Mod[] = cms.map((r) => {
    const cred = (cmap[r.id] as Cred) ?? null;
    // Ordem: URL desta instância → WhatsApp CRM (a API resolve; é a mesma p/ todos) → template.
    const url = cred?.access_url || ((r as any).crm_url as string) || (vmap[r.vdi_module_id]?.external_url as string) || null;
    return { id: r.id, status: r.status, vdi_module_id: r.vdi_module_id, label: (r as any).label ?? null, vdi: (vmap[r.vdi_module_id] as Mod["vdi"]) ?? null, external_url: url, cred };
  });
  // Nome/descrição vêm desnormalizados na própria client_services (catalog.services é admin-only).
  const svcList: Svc[] = (csvc as any[]).map((c) => ({
    id: c.id, status: c.status, name: c.service_name || "Serviço", description: c.service_description ?? null, category: c.service_category ?? null, unit: c.service_unit ?? null,
  }));
  return { mods, services: svcList };
}

function icon(cat?: string | null) {
  const c = (cat || "").toLowerCase();
  if (c.includes("atend")) return <MessageCircle />;
  if (c.includes("market")) return <Send />;
  if (c.includes("vend")) return <Search />;
  return <Grid3x3 />;
}

export default function Modulos() {
  const t = useT();
  const { data, loading } = useAsync(fetchData, []);
  const mods = data?.mods ?? [];
  const svcs = data?.services ?? [];
  const [revealed, setRevealed] = useState<Record<string, { login: string | null; pw: string }>>({});
  const [busy, setBusy] = useState<string>("");
  const [copied, setCopied] = useState<string>("");

  async function reveal(cred: Cred) {
    setBusy(cred.id);
    const pw = await services.analytics.client.revealModuleSecret<string>(cred.id);
    setRevealed((r) => ({ ...r, [cred.id]: { login: cred.login, pw: pw ?? "—" } }));
    setBusy("");
  }
  function copy(text: string, tag: string) {
    navigator.clipboard?.writeText(text);
    setCopied(tag); setTimeout(() => setCopied(""), 1500);
  }
  const unitLabel = (u: string | null) => {
    const map: Record<string, string> = { mensal: t("Mensal"), projeto: t("Projeto"), hora: t("Por hora"), setup_unico: t("Setup único") };
    return u ? (map[u] || u) : "";
  };
  const svcLabel = (s: string) => (s === "delivered" ? t("Concluído") : s === "in_progress" ? t("Em execução") : s === "scheduled" ? t("Agendado") : t("Ativo"));
  const svcTone = (s: string) => (s === "scheduled" ? "warn" : s === "in_progress" ? "info" : "ok") as "warn" | "info" | "ok";

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Minhas Soluções" sub="Suas soluções e como entrar em cada uma — tudo aqui." />
      {loading ? <Empty>Carregando…</Empty> : (mods.length === 0 && svcs.length === 0) ? (
        <Empty><p><strong>{t("Nenhuma solução ativa ainda.")}</strong> {t("Assim que a Crasto.AI liberar suas soluções, elas aparecem aqui com o acesso.")}</p></Empty>
      ) : mods.length > 0 && (
        <div className="mods">
          {mods.map((m) => {
            const implementing = m.status === "implementing" || m.status === "pending";
            const active = m.status === "active";
            const st = active ? "ok" : implementing ? "warn" : "info";
            const stl = active ? t("Ativo") : implementing ? t("Em configuração") : m.status;
            const cred = m.cred;
            const shown = cred ? revealed[cred.id] : undefined;
            return (
              <div className="mod" key={m.id}>
                <div className="cover"><div className="glow" />{icon(m.vdi?.category)}</div>
                <div className="body">
                  <h3>{m.label || m.vdi?.name || t("Solução")}</h3>
                  <p>{m.label ? (m.vdi?.name || "") : (m.vdi?.description || t("Solução de IA da Crasto.AI."))}</p>

                  {implementing ? (
                    <div className="foot">
                      <Pill tone="warn">{t("Em configuração")}</Pill>
                      <span className="mt">{t("disponível em breve")}</span>
                    </div>
                  ) : (
                    <>
                      <div className="foot">
                        <Pill tone={st}>{stl}</Pill>
                        <button
                          className="crasto-btn crasto-btn--primary crasto-btn--sm"
                          disabled={!m.external_url}
                          title={m.external_url ? t("Abrir a solução") : t("Link em configuração")}
                          onClick={() => m.external_url && window.open(m.external_url, "_blank", "noopener")}
                        >
                          <span className="crasto-btn__icon"><ExternalLink size={14} /></span>
                          <span className="crasto-btn__label">{t("Acessar")}</span>
                        </button>
                      </div>

                      {cred && cred.sso_enabled && (
                        <div className="mt" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, color: "var(--crasto-success)" }}>
                          <ShieldCheck size={14} /> {t("Entra direto, sem precisar de senha.")}
                        </div>
                      )}

                      {cred && !cred.sso_enabled && cred.login && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--crasto-border-soft)" }}>
                          {shown ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: "var(--crasto-text-muted)", minWidth: 46 }}>{t("Login")}</span>
                                <b style={{ color: "var(--crasto-text-primary)" }}>{shown.login || "—"}</b>
                                <button className="icobtn" title={t("Copiar")} style={{ marginLeft: "auto" }} onClick={() => copy(shown.login || "", `l${cred.id}`)}><Copy size={13} /></button>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: "var(--crasto-text-muted)", minWidth: 46 }}>{t("Senha")}</span>
                                <b style={{ color: "var(--crasto-text-primary)", fontFamily: "var(--crasto-font-mono)" }}>{shown.pw}</b>
                                <button className="icobtn" title={t("Copiar")} style={{ marginLeft: "auto" }} onClick={() => copy(shown.pw, `p${cred.id}`)}><Copy size={13} /></button>
                              </div>
                              {(copied === `l${cred.id}` || copied === `p${cred.id}`) && <span style={{ fontSize: 11.5, color: "var(--crasto-success)" }}>{t("Copiado ✓")}</span>}
                            </div>
                          ) : (
                            <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy === cred.id} onClick={() => reveal(cred)}>
                              <span className="crasto-btn__icon"><Eye size={14} /></span>
                              <span className="crasto-btn__label">{busy === cred.id ? t("Abrindo…") : t("Ver login e senha")}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {svcs.length > 0 && (
        <>
          <div className="sec-h" style={{ marginTop: mods.length > 0 ? 26 : 0 }}><h2>{t("Meus serviços")}</h2><Pill tone="mute">{t("prestados pela Crasto.AI")}</Pill></div>
          {svcs.map((s) => (
            <div className="svcrow" key={s.id}>
              <span className="svcico"><Briefcase size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="nm">{s.name}</div>
                <div className="mt">{s.description || s.category || t("Serviço da Crasto.AI.")}</div>
              </div>
              {s.unit && <span className="chip">{unitLabel(s.unit)}</span>}
              <Pill tone={svcTone(s.status)}>{svcLabel(s.status)}</Pill>
            </div>
          ))}
        </>
      )}

      <div className="note" style={{ marginTop: 20 }}>
        <ShieldCheck size={16} />
        <span>{t("Suas senhas ficam protegidas e só aparecem quando você clica em \"Ver login e senha\". O botão Acessar abre a solução direto.")}</span>
      </div>
    </div>
  );
}
