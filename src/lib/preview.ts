// "Ver como cliente" (preview/impersonação leve) — o admin continua logado como admin
// (RLS admin lê qualquer org), mas o portal do cliente é escopado à org escolhida.
// Um cliente real nunca ativa isto; e mesmo que ativasse, o RLS já o prende à própria org.
const KEY = "crasto_preview";
let _orgId: string | null = null;
let _orgName = "";
const subs = new Set<() => void>();

try {
  const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
  if (s && s.id) { _orgId = s.id; _orgName = s.name || ""; }
} catch { /* ignore */ }

function persist() {
  try {
    if (_orgId) sessionStorage.setItem(KEY, JSON.stringify({ id: _orgId, name: _orgName }));
    else sessionStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export const preview = {
  orgId: () => _orgId,
  orgName: () => _orgName,
  active: () => !!_orgId,
  set(id: string, name = "") { _orgId = id; _orgName = name; persist(); subs.forEach((f) => f()); },
  clear() { _orgId = null; _orgName = ""; persist(); subs.forEach((f) => f()); },
  subscribe(f: () => void) { subs.add(f); return () => subs.delete(f); },
};

/** Usado pela camada de serviço para escopar as leituras "mine" à org em preview. */
export const previewOrgId = () => _orgId;
