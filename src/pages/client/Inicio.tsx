import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Search, Send, Wallet, ArrowRight, AlertTriangle, Clock } from "lucide-react";
import { services } from "../../services";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { money } from "../../ui/ui";
import { summarizeFaturas, type Fatura, type FaturaSummary } from "../../lib/faturas";

type Health = { status: "green" | "amber" | "red"; message: string | null };
type Impl = { overall_progress: number; due_date: string | null; status: string };
type Mod = { id: string; status: string; url: string | null; rollout_progress: number; label: string | null; vdi: { name: string; description: string | null; category: string | null } | null };

const ICONS: Record<string, JSX.Element> = {
  default: <Search />, whatsapp: <MessageCircle />, marketing: <Send />,
};

export default function Inicio() {
  const { profile } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [health, setHealth] = useState<Health | null>(null);
  const [impl, setImpl] = useState<Impl | null>(null);
  const [mods, setMods] = useState<Mod[]>([]);
  const [fin, setFin] = useState<FaturaSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [h, i, cm, creds, inv] = await Promise.all([
        services.delivery.systemHealth.getMine(),
        services.delivery.implementations.getMine(),
        services.delivery.clientModules.listMine(),
        services.delivery.moduleCredentials.listMine().catch(() => [] as any[]),
        services.billing.invoices.listMine().catch(() => [] as any[]),
      ]);
      setFin(summarizeFaturas((inv as unknown as Fatura[]) ?? []));
      const rows = cm ?? [];
      const ids = rows.map((r) => r.vdi_module_id);
      let vmap: Record<string, any> = {};
      if (ids.length) {
        const vm = await services.catalog.vdiModules.listByIds(ids, "id,name,description,category,external_url");
        vmap = Object.fromEntries((vm as { id: string }[]).map((v) => [v.id, v]));
      }
      const cmap = Object.fromEntries((creds as any[]).map((c) => [c.client_module_id, c]));
      setHealth((h as unknown as Health) ?? null);
      setImpl((i as unknown as Impl) ?? null);
      setMods(rows.map((r) => {
        const cred = cmap[r.id]; // acesso por instância
        const url = cred?.access_url || vmap[r.vdi_module_id]?.external_url || null;
        return { id: r.id, status: r.status, url, rollout_progress: (r as any).rollout_progress ?? 0, label: (r as any).label ?? null, vdi: (vmap[r.vdi_module_id] as Mod["vdi"]) ?? null };
      }));
      setLoading(false);
    })();
  }, []);

  const lit = health?.status ?? "green";
  const firstName = (profile?.full_name || "").split(" ")[0] || "";
  const daysLeft = impl?.due_date
    ? Math.max(0, Math.ceil((new Date(impl.due_date).getTime() - Date.now()) / 86400000))
    : null;
  const overall = mods.length ? Math.round(mods.reduce((s, m) => s + (m.rollout_progress || 0), 0) / mods.length) : (impl?.overall_progress ?? 0);

  return (
    <div>
      <div className="phead">
        <div className="ey">{t("Portal do Cliente")}</div>
        <h1>{firstName ? t("Olá, {n} 👋", { n: firstName }) : t("Olá 👋")}</h1>
        <div className="sub">{t("Aqui está o resumo do que a sua IA fez por você.")}</div>
      </div>

      {/* Farol */}
      <div className="farol">
        <div className="lights">
          <span className={"fl red" + (lit === "red" ? " on" : "")} />
          <span className={"fl amber" + (lit === "amber" ? " on" : "")} />
          <span className={"fl green" + (lit === "green" ? " on" : "")} />
        </div>
        <div className="txt">
          <div className="h">
            {lit === "green" ? t("Sistema no ar") : lit === "amber" ? t("Ajuste em andamento") : t("Atenção necessária")}
            <span className={"pill " + (lit === "green" ? "ok" : lit === "amber" ? "warn" : "info")}>
              <span className="d" />{lit === "green" ? t("Operando") : lit === "amber" ? t("Corrigindo") : t("Suporte atuando")}
            </span>
          </div>
          <div className="s">{health?.message || t("Tudo funcionando normalmente.")}</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpis">
        <div className="kpi g"><div className="lab">{t("Implantação")}</div><div className="val">{overall}<small>%</small></div><div className="delta">{overall >= 100 ? t("Entregue") : t("Em andamento")}</div></div>
        <div className="kpi"><div className="lab">{t("Soluções ativas")}</div><div className="val">{mods.filter(m => m.status === "active").length}<small> / {mods.length}</small></div><div className="delta">{t("no seu plano")}</div></div>
        <div className="kpi"><div className="lab">{t("Prazo de entrega")}</div><div className="val" style={{ fontSize: 22 }}>{daysLeft != null ? t("{n} dias", { n: daysLeft }) : "—"}</div><div className="delta">{t("SLA de 30 dias")}</div></div>
        <div className="kpi"><div className="lab">{t("Suporte")}</div><div className="val" style={{ fontSize: 22 }}>{t("Ativo")}</div><div className="delta">{t("WhatsApp & portal")}</div></div>
      </div>

      {/* Seu contrato — health-check financeiro */}
      {fin && (
        <>
          <div className="sec-h"><h2>{t("Seu contrato")}</h2></div>
          <div className={"finhealth fh-" + fin.status}>
            <div className="fh-lead">
              <span className="fh-ico">{fin.status === "red" ? <AlertTriangle size={18} /> : <Wallet size={18} />}</span>
              <div className="fh-txt">
                <div className="fh-title">{fin.status === "red" ? t("Você tem fatura em atraso") : fin.status === "amber" ? t("Fatura vencendo em breve") : t("Faturas em dia")}</div>
                <div className="fh-sub">
                  {fin.status === "red" ? t("{n} fatura(s) em atraso — {v}", { n: fin.overdue.length, v: money(fin.overdueTotal) })
                    : fin.next ? t("Próxima: {v} · vence em {d}", { v: money(fin.next.amount), d: fin.next.due_date ? new Date(fin.next.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—" })
                    : t("Nenhuma fatura em aberto no momento.")}
                </div>
              </div>
              <button className="crasto-btn crasto-btn--primary crasto-btn--sm fh-cta" onClick={() => navigate("/app/financeiro")}>
                <span className="crasto-btn__label">{t("Ver faturas e pagar")}</span>
                <span className="crasto-btn__icon"><ArrowRight size={14} /></span>
              </button>
            </div>
            <div className="fh-tiles">
              <div className="fh-tile"><span className="l">{t("Em aberto")}</span><b className="tnum">{money(fin.openTotal)}</b><small>{t("{n} fatura(s)", { n: fin.open.length })}</small></div>
              <div className="fh-tile"><span className="l">{t("Próximo vencimento")}</span><b className="tnum">{fin.next?.due_date ? new Date(fin.next.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</b><small>{fin.daysToNext == null ? "—" : fin.daysToNext < 0 ? t("vencida") : fin.daysToNext === 0 ? t("hoje") : t("em {n} dia(s)", { n: fin.daysToNext })}</small></div>
              <div className={"fh-tile" + (fin.overdue.length ? " is-red" : "")}><span className="l">{t("Em atraso")}</span><b className="tnum">{money(fin.overdueTotal)}</b><small>{t("{n} fatura(s)", { n: fin.overdue.length })}</small></div>
              <div className="fh-tile fh-soon"><span className="l">{t("Pagamento")}</span><b>{t("Boleto · Pix")}</b><small><Clock size={11} style={{ verticalAlign: -1 }} /> {t("Em breve")}</small></div>
            </div>
          </div>
        </>
      )}

      {/* Módulos */}
      <div className="sec-h"><h2>{t("Minhas soluções")}</h2></div>
      {loading ? (
        <div className="empty">{t("Carregando…")}</div>
      ) : mods.length === 0 ? (
        <div className="empty"><p><strong>{t("Nenhuma solução ativa ainda.")}</strong> {t("Assim que a Crasto.AI liberar suas soluções, elas aparecem aqui.")}</p></div>
      ) : (
        <div className="mods">
          {mods.map((m) => {
            const cat = (m.vdi?.category || "").toLowerCase();
            const icon = cat.includes("atend") ? ICONS.whatsapp : cat.includes("market") ? ICONS.marketing : ICONS.default;
            const st = m.status === "active" ? "ok" : m.status === "implementing" ? "warn" : "info";
            const stl = m.status === "active" ? t("Ativo") : m.status === "implementing" ? t("Em implementação") : m.status;
            return (
              <div className="mod" key={m.id}>
                <div className="cover"><div className="glow" />{icon}</div>
                <div className="body">
                  <h3>{m.label || m.vdi?.name || t("Módulo")}</h3>
                  <p>{m.vdi?.description || t("Solução de IA da Crasto.AI.")}</p>
                  <div className="foot">
                    <span className={"pill " + st}><span className="d" />{stl}</span>
                    <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={!m.url} title={m.url ? t("Abrir a solução") : t("Link em configuração")} onClick={() => m.url && window.open(m.url, "_blank", "noopener")}><span className="crasto-btn__label">{t("Acessar")}</span></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
