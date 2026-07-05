import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getTheme, toggleTheme, type Theme } from "../lib/theme";

export default function ThemeToggle() {
  const [t, setT] = useState<Theme>(getTheme());
  return (
    <button
      className="theme-toggle"
      title={t === "dark" ? "Mudar para claro" : "Mudar para escuro"}
      onClick={() => setT(toggleTheme())}
      aria-label="Alternar tema"
    >
      {t === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
