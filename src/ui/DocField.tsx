import { useRef, useState } from "react";
import { Upload, Download, Trash2, FileText } from "lucide-react";
import { services } from "../services";
import { useT } from "../lib/i18n";

// Anexa um documento (R2) como fonte de uma skill/regra/conhecimento. Guarda a chave + nome.
export default function DocField({ path, name, onChange }: { path?: string; name?: string; onChange: (path: string, name: string) => void }) {
  const t = useT();
  const inp = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setErr("");
    try { const key = await services.storage.upload("console", file); onChange(key, file.name); }
    catch { setErr(t("Falha no upload.")); } finally { setBusy(false); if (inp.current) inp.current.value = ""; }
  }
  async function dl() { if (!path) return; const url = await services.storage.getUrl(path); if (url) window.open(url, "_blank", "noopener"); }
  async function remove() { if (path) { try { await services.storage.remove(path); } catch { /* segue */ } } onChange("", ""); }

  return (
    <div>
      {path ? (
        <div className="docchip">
          <FileText size={14} /><span className="nm">{name || t("documento")}</span>
          <button type="button" className="icobtn" onClick={dl} title={t("Baixar")}><Download size={13} /></button>
          <button type="button" className="icobtn rm" onClick={remove} title={t("Remover")}><Trash2 size={13} /></button>
        </div>
      ) : (
        <button type="button" className="crasto-btn crasto-btn--secondary crasto-btn--sm" disabled={busy} onClick={() => inp.current?.click()}>
          <span className="crasto-btn__icon"><Upload size={14} /></span><span className="crasto-btn__label">{busy ? t("Enviando…") : t("Anexar documento")}</span>
        </button>
      )}
      {err && <div className="mt" style={{ color: "var(--crasto-danger)" }}>{err}</div>}
      <input ref={inp} type="file" hidden onChange={pick} accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx" />
    </div>
  );
}
