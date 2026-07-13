import { useState } from "react";
import { Plug, Settings2 } from "lucide-react";
import { services as api, errorMessage } from "../../services";
import { PageHead, Pill, useAsync, useToast, Field } from "../../ui/ui";
import { useT } from "../../lib/i18n";
import Modal from "../../ui/Modal";
import { fieldsFor, HINTS, SERVER_MANAGED, type IntegField } from "../../lib/integrations";

type Integ = { key: string; display_name: string; status: string };
type Status = Record<string, { status: string; has_secret: boolean; from_addr: string | null }>;

export default function Integracoes() {
  const t = useT();
  const { data, reload } = useAsync(async () => {
    const [list, st] = await Promise.all([
      api.automation.integrations.list(),
      api.automation.integrations.status().catch(() => ({} as Status)),
    ]);
    return { items: (list as unknown as Integ[]) ?? [], st: (st as Status) ?? {} };
  }, []);
  const items = data?.items ?? []; const st = data?.st ?? {};

  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState<Integ | null>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const toast = useToast();

  const tone = (s: string) => (s === "connected" ? "ok" : s === "error" ? "warn" : "mute");
  const label = (s: string) => (s === "connected" ? t("Conectado") : s === "error" ? t("Ação necessária") : t("Desconectado"));
  const fields = cur ? fieldsFor(cur.key) : [];
  const managed = cur ? SERVER_MANAGED[cur.key] : undefined; // env vars, se gerenciado no servidor
  const isSet = (f: IntegField) => (f.primary ? !!cfg?.primary_set : (cfg?.secrets_set ?? []).includes(f.key));

  async function openCfg(i: Integ) {
    setCur(i); setErr(""); setCfg(null); setVals({}); setOpen(true);
    try {
      const c = await api.automation.integrations.config(i.key);
      setCfg(c);
      const v: Record<string, string> = {};
      for (const f of fieldsFor(i.key)) {
        v[f.key] = f.kind === "text" ? (c?.meta?.[f.key] ?? "") : f.kind === "from" ? (c?.from_addr ?? "") : "";
      }
      setVals(v);
    } catch (e) { setErr(errorMessage(e)); }
  }
  function setV(k: string, val: string) { setVals((s) => ({ ...s, [k]: val })); }

  async function save() {
    if (!cur) return;
    setBusy(true); setErr("");
    const meta: Record<string, any> = {}; const secrets: Record<string, string> = {}; let from = ""; let secret = "";
    let primaryNow = false;
    for (const f of fields) {
      const val = (vals[f.key] ?? "").trim();
      if (f.kind === "text") meta[f.key] = val;
      else if (f.kind === "from") from = val;
      else if (f.primary) { if (val) { secret = val; primaryNow = true; } }
      else if (val) secrets[f.key] = val;
    }
    const connected = primaryNow || !!cfg?.primary_set;
    try {
      await api.automation.integrations.saveConfig({ key: cur.key, meta, from, secret, secrets, status: connected ? "connected" : "disconnected" });
      setOpen(false); reload(); toast.ok(t("{n} configurado ✓", { n: cur.display_name }));
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }
  async function disconnect() {
    if (!cur) return;
    setBusy(true); setErr("");
    try { await api.automation.integrations.saveConfig({ key: cur.key, status: "disconnected" }); setOpen(false); reload(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHead eyebrow="Painel Admin" title="Integrações & pagamentos" sub="Conecte as tecnologias que o portal usa. As chaves ficam no cofre — nunca no navegador." />
      <div className="assign">
        {items.map((i) => (
          <div className="arow" key={i.key}>
            <span className="ico" style={{ background: i.status === "connected" ? "#1F8A5B" : "var(--crasto-text-primary)" }}><Plug size={16} /></span>
            <span><span className="t">{i.display_name}</span><br /><span className="s">{i.key}{SERVER_MANAGED[i.key] ? t(" · gerenciado no servidor") : st[i.key]?.has_secret ? t(" · chave salva") : ""}</span></span>
            <Pill tone={tone(i.status)}>{label(i.status)}</Pill>
            <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" style={{ marginLeft: 10 }} onClick={() => openCfg(i)}>
              <span className="crasto-btn__icon"><Settings2 size={14} /></span><span className="crasto-btn__label">{t("Configurar")}</span>
            </button>
          </div>
        ))}
      </div>
      <div className="note" style={{ marginTop: 22 }}><span>{t("Gateway de pagamento: Banco Inter (Pix/boleto). Autentique para contratos. Resend para e-mails. Claude Max (ponte) para a IA da proposta.")}</span></div>

      <Modal title={cur ? t("Configurar · {n}", { n: cur.display_name }) : t("Configurar")} open={open} onClose={() => setOpen(false)} wide
        footer={managed
          ? <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Entendi")}</span></button>
          : <>
            {cfg?.primary_set && <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" disabled={busy} onClick={disconnect} style={{ marginRight: "auto" }}><span className="crasto-btn__label">{t("Desconectar")}</span></button>}
            <button className="crasto-btn crasto-btn--ghost crasto-btn--sm" onClick={() => setOpen(false)}><span className="crasto-btn__label">{t("Cancelar")}</span></button>
            <button className="crasto-btn crasto-btn--primary crasto-btn--sm" disabled={busy || !cfg} onClick={save}><span className="crasto-btn__label">{busy ? t("Salvando…") : t("Salvar & conectar")}</span></button>
          </>}>
        {err && <div className="formerr">{err}</div>}
        {managed ? (
          <div className="note"><span>
            <b style={{ color: "var(--crasto-text-primary)" }}>{t("Conectado — gerenciado no ambiente do servidor.")}</b><br />
            {t("As credenciais deste provedor ficam nos secrets do servidor (edge functions), conforme a arquitetura (segredo fora do banco e do navegador). Não são editáveis por aqui.")}
            <br /><br />{t("Variáveis de ambiente:")} <span className="tnum" style={{ fontFamily: "var(--crasto-font-mono, monospace)" }}>{managed.join(" · ")}</span>
            <br /><br />{t("Para trocar, atualize os secrets do servidor (Supabase → Edge Functions → Secrets).")}
          </span></div>
        ) : !cfg ? <div className="empty">{t("Carregando…")}</div> : (
          <>
            {cur && HINTS[cur.key] && <div className="note" style={{ marginBottom: 14 }}><span>{t(HINTS[cur.key])}</span></div>}
            {fields.map((f) => (
              <Field key={f.key} label={f.label + (f.kind === "secret" && f.primary && !isSet(f) ? " *" : "")}>
                <input
                  type={f.kind === "secret" ? "password" : "text"}
                  value={vals[f.key] ?? ""}
                  onChange={(e) => setV(f.key, e.target.value)}
                  placeholder={f.kind === "secret" ? (isSet(f) ? t("•••• salvo (deixe em branco p/ manter)") : (f.placeholder || t("cole o segredo"))) : (f.placeholder || "")}
                  autoComplete="off"
                />
              </Field>
            ))}
            <div className="note" style={{ marginTop: 4 }}><span>{t("Os segredos ficam no cofre e nunca voltam ao navegador — por isso aparecem mascarados. Deixe um segredo em branco para manter o que já está salvo.")}</span></div>
          </>
        )}
      </Modal>
      {toast.node}
    </div>
  );
}
