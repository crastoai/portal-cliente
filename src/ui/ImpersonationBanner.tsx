import { useEffect, useState } from "react";
import { ShieldAlert, LogOut } from "lucide-react";
import { impersonationState, stopImpersonation } from "../lib/impersonation";

// Faixa fixa no topo enquanto o admin está "acessando como" outra pessoa (auditoria). Fica visível
// em QUALQUER tela (independe do papel/rota, pois lê o localStorage, não o estado de auth). O botão
// "Sair" restaura a sessão do admin. Enquanto ativa, marca `body.impersonating` — o CSS (portal.css)
// empurra topbar + sidebar + conteúdo 40px p/ baixo, de modo que a faixa fique ACIMA do menu (sem
// cobri-lo), e o admin continue enxergando o menu mesmo inspecionando o cliente.
const BAR_H = 40;

export default function ImpersonationBanner() {
  const [st] = useState(impersonationState());
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    if (!st) return;
    document.body.classList.add("impersonating");
    return () => { document.body.classList.remove("impersonating"); };
  }, [st]);

  if (!st) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed", top: 0, left: 0, right: 0, height: BAR_H, zIndex: 99999,
        display: "flex", alignItems: "center", gap: 12, padding: "0 14px",
        background: "linear-gradient(90deg,#B45309,#D97706)", color: "#fff",
        fontSize: 13.5, boxShadow: "0 2px 10px rgba(0,0,0,.25)",
      }}
    >
      <ShieldAlert size={17} style={{ flex: "0 0 auto" }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        Auditoria — você está acessando como <b>{st.target.name}</b>
        <span style={{ opacity: 0.9 }}> · {st.target.email}</span>. Todas as ações ficam registradas.
      </span>
      <button
        type="button"
        onClick={async () => { setSaindo(true); try { await stopImpersonation(); } catch { setSaindo(false); } }}
        disabled={saindo}
        style={{
          flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(255,255,255,.18)", color: "#fff", border: "1px solid rgba(255,255,255,.55)",
          borderRadius: 8, padding: "5px 12px", fontSize: 13, fontWeight: 600,
          cursor: saindo ? "default" : "pointer", opacity: saindo ? 0.6 : 1,
        }}
      >
        <LogOut size={14} /> {saindo ? "Saindo…" : "Sair da conta"}
      </button>
    </div>
  );
}
