// Preferências de NOTIFICAÇÃO do usuário (som on/off, som escolhido, volume, desktop).
// Guardadas em localStorage (por navegador). Os sons são SINTETIZADOS via Web Audio — sem
// arquivos externos (CSP-safe) e sem depender de rede.
export type NotifSound = "chime" | "ding" | "pop" | "marimba" | "none";
export type NotifPrefs = { enabled: boolean; sound: NotifSound; volume: number; desktop: boolean; quietFrom: string | null; quietTo: string | null };

const KEY = "crasto_notif_prefs";
const DEFAULT: NotifPrefs = { enabled: true, sound: "chime", volume: 0.5, desktop: false, quietFrom: null, quietTo: null };

/** Está dentro do horário silencioso (Não perturbe)? Suporta intervalo que atravessa a meia-noite. */
export function emHorarioSilencioso(p: NotifPrefs = getNotifPrefs()): boolean {
  if (!p.quietFrom || !p.quietTo) return false;
  const [fh, fm] = p.quietFrom.split(":").map(Number);
  const [th, tm] = p.quietTo.split(":").map(Number);
  if ([fh, fm, th, tm].some((n) => Number.isNaN(n))) return false;
  const now = new Date(); const cur = now.getHours() * 60 + now.getMinutes();
  const f = fh * 60 + fm, t = th * 60 + tm;
  return f <= t ? cur >= f && cur < t : cur >= f || cur < t;
}
/** Pode disparar notificação de DESKTOP agora? (master ligado + desktop on + fora do silêncio + permitido) */
export function podeNotificarDesktop(): boolean {
  const p = getNotifPrefs();
  return p.enabled && p.desktop && !emHorarioSilencioso(p) && "Notification" in window && Notification.permission === "granted";
}

export function getNotifPrefs(): NotifPrefs {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULT; }
}
export function setNotifPrefs(p: Partial<NotifPrefs>): NotifPrefs {
  const next = { ...getNotifPrefs(), ...p };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage cheio */ }
  return next;
}

// ── Sons sintetizados ───────────────────────────────────────────────────────
let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try { return (ctx ||= new (window.AudioContext || (window as any).webkitAudioContext)()); } catch { return null; }
}
function tone(c: AudioContext, freq: number, start: number, dur: number, vol: number, type: OscillatorType = "sine") {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
const SOUNDS: Record<Exclude<NotifSound, "none">, (c: AudioContext, v: number) => void> = {
  chime: (c, v) => { tone(c, 880, 0, 0.18, v); tone(c, 1320, 0.12, 0.22, v); },
  ding: (c, v) => { tone(c, 1046, 0, 0.32, v, "triangle"); },
  pop: (c, v) => { tone(c, 660, 0, 0.09, v, "square"); },
  marimba: (c, v) => { tone(c, 587, 0, 0.14, v); tone(c, 784, 0.1, 0.14, v); tone(c, 988, 0.2, 0.2, v); },
};

/** Toca o som de notificação (ou um som específico p/ o preview). Respeita on/off e volume. */
export function playNotifSound(force?: NotifSound): void {
  const p = getNotifPrefs();
  // Preview (force) sempre toca; aviso real respeita master on/off + horário silencioso.
  if (!force && (!p.enabled || emHorarioSilencioso(p))) return;
  const s = force ?? p.sound;
  if (s === "none") return;
  const c = ac(); if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  try { SOUNDS[s]?.(c, Math.max(0, Math.min(1, p.volume))); } catch { /* ignore */ }
}

export const NOTIF_SOUNDS: { v: NotifSound; label: string }[] = [
  { v: "chime", label: "Chime" }, { v: "ding", label: "Ding" }, { v: "pop", label: "Pop" },
  { v: "marimba", label: "Marimba" }, { v: "none", label: "Sem som" },
];
