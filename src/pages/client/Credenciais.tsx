import { useState } from "react";
import { Eye, Copy, ShieldCheck } from "lucide-react";
import { services } from "../../services";
import { PageHead, Empty, useAsync } from "../../ui/ui";

type Cred = { id: string; label: string | null; login: string | null; sso_enabled: boolean };

export default function Credenciais() {
  const { data, loading } = useAsync(
    async () => (await services.delivery.moduleCredentials.listMine()) as unknown as Cred[],
    []
  );
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const creds = data ?? [];

  async function reveal(id: string) {
    if (revealed[id]) { const n = { ...revealed }; delete n[id]; setRevealed(n); return; }
    const secret = await services.analytics.client.revealModuleSecret<string>(id);
    setRevealed({ ...revealed, [id]: secret ?? "—" });
  }

  return (
    <div>
      <PageHead eyebrow="Portal do Cliente" title="Credenciais de acesso" sub="Login de cada solução contratada." />
      <div className="note">
        <ShieldCheck size={17} />
        <span><b>Dois jeitos de entrar:</b> o botão <b>Acessar</b> te leva já logado (SSO) — ou clique no olho para <b>ver sua senha</b>. As senhas ficam <b>criptografadas</b> e só aparecem quando você revela.</span>
      </div>
      {loading ? <Empty>Carregando…</Empty> : creds.length === 0 ? <Empty>Nenhuma credencial disponível ainda.</Empty> : (
        <div className="tbl-wrap">
          {creds.map((c) => (
            <div className="cred-row" key={c.id}>
              <div className="mnm"><span className="ico" style={{ background: "#1FA855" }}><ShieldCheck size={15} /></span>{c.label}</div>
              <div className="secret"><span>{c.login}</span></div>
              <div className={"secret" + (revealed[c.id] ? " shown" : "")}><span className="mask">{revealed[c.id] ?? "••••••••••"}</span></div>
              <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
                <button className="icobtn" title="Revelar" onClick={() => reveal(c.id)}><Eye size={14} /></button>
                <button className="icobtn" title="Copiar" onClick={() => revealed[c.id] && navigator.clipboard?.writeText(revealed[c.id])}><Copy size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
