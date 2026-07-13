import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home, LayoutGrid, Activity, Sparkles, Wallet, Users, LifeBuoy, Eye, IdCard } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useAsync } from "../ui/ui";
import { services } from "../services";
import { preview } from "../lib/preview";
import { useT } from "../lib/i18n";
import { CLIENT_SCREENS, allowedScreens } from "../lib/screens";
import Shell, { type NavItem } from "./Shell";

const SCREEN_ICON: Record<string, any> = {
  inicio: Home, modulos: LayoutGrid, implementacao: Activity, solucoes: Sparkles,
  financeiro: Wallet, usuarios: Users, perfil: IdCard, suporte: LifeBuoy,
};

export default function ClientShell() {
  const { profile } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [pv, setPv] = useState({ active: preview.active(), name: preview.orgName() });
  useEffect(() => preview.subscribe(() => setPv({ active: preview.active(), name: preview.orgName() })), []);

  // "Minha Implementação" só aparece enquanto a implantação não terminou (< 100%).
  const { data: impl } = useAsync(() => services.delivery.implementations.getMine(), [pv.active]);
  const implDone = impl ? (((impl as any).overall_progress ?? 0) >= 100 || (impl as any).status === "delivered") : false;

  // Permissão POR TELA: o menu mostra só as telas que este usuário pode ver (dono = todas).
  const { data: myScreens } = useAsync(() => services.identity.access.myScreens(), [pv.active]);
  const allowed = allowedScreens(myScreens as string[] | null);

  // Guarda de rota: se cair numa tela sem permissão, volta ao Início.
  useEffect(() => {
    if (!myScreens) return;
    const scr = CLIENT_SCREENS.find((s) => (s.to === "/app" ? location.pathname === "/app" : location.pathname.startsWith(s.to)));
    if (scr && !allowed.has(scr.key)) navigate("/app", { replace: true });
  }, [location.pathname, myScreens]); // eslint-disable-line react-hooks/exhaustive-deps

  const nav: NavItem[] = CLIENT_SCREENS
    .filter((s) => allowed.has(s.key))
    .filter((s) => s.key !== "implementacao" || !implDone)
    .map((s) => ({ to: s.to, end: s.key === "inicio", icon: SCREEN_ICON[s.key], label: s.label }));

  function exitPreview() {
    const oid = preview.orgId();
    preview.clear();
    navigate(oid ? `/admin/cliente/${oid}` : "/admin/clientes");
  }

  return (
    <>
      <Shell nav={nav} who={pv.active ? pv.name : (profile?.full_name || "Cliente")} sub={pv.active ? t("Visualização (admin)") : "Portal do Cliente"} logoTone="linear-gradient(145deg,#1F8A5B,#0d5c3a)" />
      {pv.active && (
        <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", zIndex: 9999, display: "flex", alignItems: "center", gap: 12, background: "var(--crasto-text-primary)", color: "#fff", padding: "10px 8px 10px 16px", borderRadius: 999, boxShadow: "0 10px 34px rgba(1,14,38,.34)", fontSize: 13.5, maxWidth: "92vw" }}>
          <Eye size={15} style={{ flex: "none" }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("Visualizando como")} <b>{pv.name}</b></span>
          <button onClick={exitPreview} style={{ flex: "none", background: "rgba(255,255,255,.16)", color: "#fff", border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{t("Sair da visualização")}</button>
        </div>
      )}
    </>
  );
}
