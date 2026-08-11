import { useState, type ReactNode } from "react";
import { Play, Bell, Monitor, Volume2, Moon } from "lucide-react";
import { PageHead } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { getNotifPrefs, setNotifPrefs, playNotifSound, NOTIF_SOUNDS } from "../../lib/notifPrefs";

const timeStyle: React.CSSProperties = { fontSize: 13, padding: "6px 10px", background: "var(--crasto-surface)", border: "1px solid var(--crasto-border)", borderRadius: "var(--crasto-radius-sm)", color: "var(--crasto-text-primary)" };

// Configuração de NOTIFICAÇÕES (perfil → Notificações): liga/escolhe o som, volume e alertas do
// navegador. As preferências valem por navegador (localStorage); o sininho do topo toca o som.
export default function Notificacoes() {
  const t = useT();
  return (
    <>
      <PageHead title="Notificações" sub="Como e quando você é avisado — som, volume e alertas." />
      <NotifPrefsCard />
    </>
  );
}

// Conteúdo reutilizável (sem cabeçalho de página) — usado aqui e na aba "Permissões de notificação"
// da tela Configurações.
function Sw({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      style={{ width: 44, height: 24, borderRadius: 999, border: 0, cursor: disabled ? "not-allowed" : "pointer", padding: 2, flex: "0 0 auto",
        opacity: disabled ? 0.45 : 1, background: on ? "linear-gradient(135deg,#6E9CE8,#2E6F9E)" : "var(--crasto-border)", transition: "background .15s" }}>
      <span style={{ display: "block", width: 20, height: 20, borderRadius: 999, background: "#fff", transform: on ? "translateX(20px)" : "translateX(0)", transition: "transform .15s" }} />
    </button>
  );
}
function Sec({ icon, title, desc, control, children }: { icon: ReactNode; title: string; desc?: string; control?: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ padding: "16px 0", borderTop: "1px solid var(--crasto-border-hairline)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", gap: 11, minWidth: 0 }}>
          <span style={{ color: "var(--crasto-blue)", flex: "0 0 auto", marginTop: 1 }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
            {desc && <div className="mt" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>}
          </div>
        </div>
        {control && <div style={{ flex: "0 0 auto" }}>{control}</div>}
      </div>
      {children && <div style={{ marginLeft: 33, marginTop: 12 }}>{children}</div>}
    </div>
  );
}

export function NotifPrefsCard() {
  const t = useT();
  const [p, setP] = useState(getNotifPrefs());
  const upd = (patch: Partial<ReturnType<typeof getNotifPrefs>>) => setP(setNotifPrefs(patch));
  const [perm, setPerm] = useState<string>(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const off = !p.enabled;

  async function toggleDesktop(on: boolean) {
    if (on && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      try { const r = await Notification.requestPermission(); setPerm(r); if (r !== "granted") { upd({ desktop: false }); return; } }
      catch { return; }
    }
    upd({ desktop: on });
  }

  return (
    <div className="card" style={{ maxWidth: 680, padding: "4px 20px 16px" }}>
      <Sec icon={<Bell size={17} />} title={t("Ativar notificações")}
        desc={t("Som e alertas de novos avisos neste navegador. Desligue para silenciar tudo.")}
        control={<Sw on={p.enabled} onChange={(v) => upd({ enabled: v })} />} />

      <Sec icon={<Monitor size={17} />} title={t("Alertas do navegador (desktop)")}
        desc={perm === "denied" ? t("Bloqueado — libere nas permissões do navegador (cadeado ao lado da URL).") : perm === "unsupported" ? t("Este navegador não suporta alertas de desktop.") : t("Um pop-up do sistema quando chega um aviso, mesmo com a aba em segundo plano.")}
        control={<Sw on={p.desktop && perm === "granted"} disabled={off || perm === "denied" || perm === "unsupported"} onChange={toggleDesktop} />} />

      <Sec icon={<Volume2 size={17} />} title={t("Som")} desc={t("O som que o sininho toca a cada novo aviso.")}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", opacity: off ? 0.5 : 1 }}>
          {NOTIF_SOUNDS.map((s) => (
            <button key={s.v} type="button" disabled={off}
              className={"crasto-btn crasto-btn--sm " + (p.sound === s.v ? "crasto-btn--primary" : "crasto-btn--secondary")}
              onClick={() => { upd({ sound: s.v }); if (s.v !== "none") playNotifSound(s.v); }}>
              <span className="crasto-btn__label">{t(s.label)}</span>
            </button>
          ))}
          <button type="button" className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => playNotifSound(p.sound === "none" ? "chime" : p.sound)} disabled={off || p.sound === "none"}>
            <span className="crasto-btn__icon"><Play size={13} /></span><span className="crasto-btn__label">{t("Testar")}</span>
          </button>
        </div>
        <div style={{ marginTop: 14, opacity: off ? 0.5 : 1 }}>
          <div className="mt" style={{ fontSize: 12.5, marginBottom: 6 }}>{t("Volume")}: {Math.round(p.volume * 100)}%</div>
          <input type="range" min={0} max={1} step={0.05} value={p.volume} disabled={off} onChange={(e) => upd({ volume: Number(e.target.value) })} style={{ width: 280, maxWidth: "100%", accentColor: "var(--crasto-navy)" }} />
        </div>
      </Sec>

      <Sec icon={<Moon size={17} />} title={t("Não perturbe")} desc={t("Silencia o som e os alertas neste intervalo (ex.: fora do expediente).")}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", opacity: off ? 0.5 : 1 }}>
          <span className="mt" style={{ fontSize: 13 }}>{t("De")}</span>
          <input type="time" value={p.quietFrom || ""} disabled={off} onChange={(e) => upd({ quietFrom: e.target.value || null })} style={timeStyle} />
          <span className="mt" style={{ fontSize: 13 }}>{t("até")}</span>
          <input type="time" value={p.quietTo || ""} disabled={off} onChange={(e) => upd({ quietTo: e.target.value || null })} style={timeStyle} />
          {(p.quietFrom || p.quietTo) && <button type="button" className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => upd({ quietFrom: null, quietTo: null })}><span className="crasto-btn__label">{t("Limpar")}</span></button>}
        </div>
      </Sec>

      <div className="mt" style={{ fontSize: 11.5, marginTop: 14, lineHeight: 1.5, borderTop: "1px solid var(--crasto-border-hairline)", paddingTop: 12 }}>
        {t("As preferências valem neste navegador/dispositivo. Avisos por e-mail e por tipo de evento entram numa próxima etapa.")}
      </div>
    </div>
  );
}
