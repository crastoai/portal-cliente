export type Theme = "light" | "dark";
const KEY = "crasto-theme";

export function getTheme(): Theme {
  return (localStorage.getItem(KEY) as Theme) || "light"; // light é o padrão do sistema
}
export function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(KEY, t);
}
export function initTheme() {
  applyTheme(getTheme());
}
export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
