import { useEffect, useState } from "react";
import { KeyRound, Check, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { socialAdmin, INTEG_GROUPS, type IntegItem, type IntegList } from "../../lib/socialAdmin";
import { Pill } from "../../ui/ui";
import { useT } from "../../lib/i18n";

/**
 * INTEGRAÇÕES do Social Media (chaves BYO deste cliente). Fala DIRETO com o social-api
 * (serviço/banco próprios); o Portal nunca guarda a chave — só a máscara. Aparece no detalhe
 * do cliente somente quando o módulo Social Media está contratado.
 */
export default function SocialIntegracoes({ orgId }: { orgId: string }) {
  const t = useT();
  const [data, setData] = useState<IntegList | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    setLoading(true); setErr("");
    try { setData(await socialAdmin.list(orgId)); }
    catch (e: any) { setErr(e?.message || t("Não foi possível carregar as integrações.")); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(name: string) {
    const value = (draft[name] || "").trim();
    if (!value) return;
    setBusy(name);
    try {
      await socialAdmin.set(orgId, name, value);
      setDraft((d) => ({ ...d, [name]: "" }));
      setOk(name); setTimeout(() => setOk(""), 1500);
      await load();
    } catch (e: any) { setErr(e?.message || t("Erro ao salvar a chave.")); }
    finally { setBusy(""); }
  }
  async function remove(name: string, label: string) {
    if (!confirm(t('Remover a chave "{n}" deste cliente?', { n: label }))) return;
    setBusy(name);
    try { await socialAdmin.remove(orgId, name); await load(); }
    catch (e: any) { setErr(e?.message || t("Erro ao remover a chave.")); }
    finally { setBusy(""); }
  }

  const groups = (data?.items || []).reduce<Record<string, IntegItem[]>>((acc, it) => {
    (acc[it.group] = acc[it.group] || []).push(it); return acc;
  }, {});
  const order = ["texto", "imagem", "video", "publicacao", "pesquisa", "stock"];

  return (
    <div style={{ marginTop: 12 }}>
      <div className="note" style={{ marginBottom: 14 }}>
        <ShieldCheck size={16} />
        <span>{t("As chaves são de CADA cliente e ficam cifradas no cofre do Social Media. Aqui só aparece a máscara — o valor nunca volta.")}</span>
      </div>

      {loading ? (
        <div className="mt" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 2px" }}>
          <Loader2 size={15} className="spin" /> {t("Carregando integrações…")}
        </div>
      ) : err ? (
        <div className="mt" style={{ padding: "6px 2px", color: "var(--crasto-danger)" }}>{err}</div>
      ) : (
        order.filter((g) => groups[g]?.length).map((g) => (
          <div key={g} style={{ marginBottom: 18 }}>
            <div className="sec-h" style={{ marginBottom: 8 }}>
              <h3 style={{ fontSize: 14, margin: 0, color: "var(--crasto-text-muted)", fontWeight: 600 }}>{t(INTEG_GROUPS[g as IntegItem["group"]])}</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {groups[g].map((it) => (
                <div key={it.name} style={{ border: "1px solid var(--crasto-border-soft)", borderRadius: 12, padding: "12px 14px", background: "var(--crasto-surface)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <KeyRound size={15} style={{ color: "var(--crasto-text-muted)" }} />
                    <b style={{ fontSize: 13.5 }}>{it.label}</b>
                    {it.configured
                      ? <Pill tone="ok">{t("Configurada")}</Pill>
                      : <Pill tone="mute">{t("Não configurada")}</Pill>}
                    {it.configured && it.masked && (
                      <span style={{ fontFamily: "var(--crasto-font-mono)", fontSize: 12, color: "var(--crasto-text-muted)" }}>{it.masked}</span>
                    )}
                  </div>
                  {it.help && <div className="mt" style={{ marginTop: 6, fontSize: 12.5, color: "var(--crasto-text-muted)" }}>{it.help}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder={it.configured ? t("Trocar a chave…") : t("Colar a chave…")}
                      value={draft[it.name] || ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [it.name]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") save(it.name); }}
                      style={{ flex: 1, minWidth: 220 }}
                    />
                    <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy === it.name || !(draft[it.name] || "").trim()} onClick={() => save(it.name)}>
                      {ok === it.name ? <Check size={14} /> : busy === it.name ? <Loader2 size={14} className="spin" /> : null}
                      <span className="crasto-btn__label">{ok === it.name ? t("Salva") : t("Salvar")}</span>
                    </button>
                    {it.configured && (
                      <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy === it.name} title={t("Remover")} onClick={() => remove(it.name, it.label)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
