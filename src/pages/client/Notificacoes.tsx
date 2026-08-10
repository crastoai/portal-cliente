import { useState } from "react";
import { Play } from "lucide-react";
import { PageHead } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import { getNotifPrefs, setNotifPrefs, playNotifSound, NOTIF_SOUNDS } from "../../lib/notifPrefs";

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
export function NotifPrefsCard() {
  const t = useT();
  const [p, setP] = useState(getNotifPrefs());
  const upd = (patch: Partial<ReturnType<typeof getNotifPrefs>>) => setP(setNotifPrefs(patch));

  return (
      <div className="card" style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 20, padding: 20 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{t("Som de notificação")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {NOTIF_SOUNDS.map((s) => (
              <button key={s.v} type="button"
                className={"crasto-btn crasto-btn--sm " + (p.sound === s.v ? "crasto-btn--primary" : "crasto-btn--secondary")}
                onClick={() => { upd({ sound: s.v }); if (s.v !== "none") playNotifSound(s.v); }}>
                <span className="crasto-btn__label">{t(s.label)}</span>
              </button>
            ))}
            <button type="button" className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => playNotifSound()} disabled={p.sound === "none"}>
              <span className="crasto-btn__icon"><Play size={13} /></span><span className="crasto-btn__label">{t("Testar")}</span>
            </button>
          </div>
        </div>

        <label style={{ display: "block" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{t("Volume")}: {Math.round(p.volume * 100)}%</div>
          <input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => upd({ volume: Number(e.target.value) })} style={{ width: 280, accentColor: "var(--crasto-navy)" }} />
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={p.desktop} onChange={async (e) => {
            const on = e.target.checked;
            if (on && "Notification" in window && Notification.permission !== "granted") {
              try { const r = await Notification.requestPermission(); if (r !== "granted") return; } catch { return; }
            }
            upd({ desktop: on });
          }} />
          <span>{t("Mostrar notificações do navegador (desktop)")}</span>
        </label>

        <div className="mt" style={{ fontSize: 12.5 }}>{t("As preferências valem neste navegador. O sininho no topo toca o som escolhido a cada novo aviso.")}</div>
      </div>
  );
}
