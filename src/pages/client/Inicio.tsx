import { useEffect, useState } from "react";
import { MessageCircle, Search, Send } from "lucide-react";
import { services } from "../../services";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";

type Health = { status: "green" | "amber" | "red"; message: string | null };
type Impl = { overall_progress: number; due_date: string | null; status: string };
type Mod = { id: string; status: string; vdi: { name: string; description: string | null; category: string | null } | null };

const ICONS: Record<string, JSX.Element> = {
  default: <Search />, whatsapp: <MessageCircle />, marketing: <Send />,
};

export default function Inicio() {
  const { profile } = useAuth();
  const t = useT();
  const [health, setHealth] = useState<Health | null>(null);
  const [impl, setImpl] = useState<Impl | null>(null);
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [h, i, cm] = await Promise.all([
        services.delivery.systemHealth.getMine(),
        services.delivery.implementations.getMine(),
        services.delivery.clientModules.listMine(),
      ]);
      const rows = cm ?? [];
      const ids = rows.map((r) => r.vdi_module_id);
      let vmap: Record<string, Mod["vdi"]> = {};
      if (ids.length) {
        const vm = await services.catalog.vdiModules.listByIds(ids, "id,name,description,category");
        vmap = Object.fromEntries((vm as { id: string }[]).map((v) => [v.id, v as unknown as Mod["vdi"]]));
      }
      setHealth((h as unknown as Health) ?? null);
      setImpl((i as unknown as Impl) ?? null);
      setMods(rows.map((r) => ({ id: r.id, status: r.status, vdi: vmap[r.vdi_module_id] ?? null })));
      setLoading(false);
    })();
  }, []);

  const lit = health?.status ?? "green";
  const firstName = (profile?.full_name || "").split(" ")[0] || "";
  const daysLeft = impl?.due_date
    ? Math.max(0, Math.ceil((new Date(impl.due_date).getTime() - Date.now()) / 86400000))
    : null;

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
        <div className="kpi g"><div className="lab">{t("Implantação")}</div><div className="val">{impl?.overall_progress ?? 0}<small>%</small></div><div className="delta">{impl?.status === "delivered" ? t("Entregue") : t("Em andamento")}</div></div>
        <div className="kpi"><div className="lab">{t("Soluções ativas")}</div><div className="val">{mods.filter(m => m.status === "active").length}<small> / {mods.length}</small></div><div className="delta">{t("no seu plano")}</div></div>
        <div className="kpi"><div className="lab">{t("Prazo de entrega")}</div><div className="val" style={{ fontSize: 22 }}>{daysLeft != null ? t("{n} dias", { n: daysLeft }) : "—"}</div><div className="delta">{t("SLA de 30 dias")}</div></div>
        <div className="kpi"><div className="lab">{t("Suporte")}</div><div className="val" style={{ fontSize: 22 }}>{t("Ativo")}</div><div className="delta">{t("WhatsApp & portal")}</div></div>
      </div>

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
                  <h3>{m.vdi?.name || t("Módulo")}</h3>
                  <p>{m.vdi?.description || t("Solução de IA da Crasto.AI.")}</p>
                  <div className="foot">
                    <span className={"pill " + st}><span className="d" />{stl}</span>
                    <button className="crasto-btn crasto-btn--primary crasto-btn--sm"><span className="crasto-btn__label">{t("Acessar")}</span></button>
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
