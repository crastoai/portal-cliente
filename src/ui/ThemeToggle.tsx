import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getTheme, toggleTheme, type Theme } from "../lib/theme";

export default function ThemeToggle() {
  const [t, setT] = useState<Theme>(getTheme());
  // Transição em CÍRCULO (View Transitions API) expandindo do ponto do clique — igual ao efeito
  // suave do Hostinger. Sem suporte OU com "reduzir movimento" → troca direta (sem animação).
  const onClick = (e: React.MouseEvent) => {
    const doToggle = () => setT(toggleTheme());
    const startVT = (document as any).startViewTransition?.bind(document);
    if (!startVT || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { doToggle(); return; }
    const x = e.clientX, y = e.clientY;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const root = document.documentElement;
    root.style.setProperty("--tt-x", `${x}px`);
    root.style.setProperty("--tt-y", `${y}px`);
    root.style.setProperty("--tt-r", `${r}px`);
    startVT(doToggle);
  };
  return (
    <button
      className="theme-toggle"
      title={t === "dark" ? "Mudar para claro" : "Mudar para escuro"}
      onClick={onClick}
      aria-label="Alternar tema"
    >
      {t === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
