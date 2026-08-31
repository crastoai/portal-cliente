// "Acessar como" a partir de uma ORGANIZAÇÃO (atalho) — padrão ÚNICO de ver o sistema pelos
// olhos do cliente.
//
// POR QUE ESTE ARQUIVO EXISTE: havia dois jeitos de "ver como cliente" e um deles era falso. O
// preview (lib/preview.ts) só mandava um header `X-Preview-Org` que APENAS a API do Portal
// entende — o WhatsApp CRM é outro backend, que olha só o JWT, então o iframe continuava
// recebendo a identidade do admin e mostrando os dados da Crasto.AI. Trocar de identidade de
// verdade (impersonação) é o único mecanismo que funciona em TODOS os sistemas de uma vez,
// porque não exige que ninguém saiba que existe impersonação.
//
// A impersonação existente é por USUÁRIO (`startImpersonation`). Aqui o ponto de partida é a
// ORGANIZAÇÃO: resolvemos quem daquela empresa vamos acessar. Como quase toda org tem MAIS DE UM
// dono (El Shadai, Connect e SR Brasil têm 2 cada), escolher sozinho seria chutar — então
// perguntamos. Com uma pessoa só, não há o que perguntar: entra direto.
import { useEffect, useState } from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { services, errorMessage } from "../services";
import { startImpersonation } from "../lib/impersonation";
import { useT } from "../lib/i18n";
import Modal from "./Modal";

type U = { id: string; full_name: string | null; email: string | null; role: string; last_login: string | null };
type Pessoa = { id: string; nome: string; email: string; dono: boolean; ultimo: string | null };

/** "há 2 dias" / "nunca acessou" — ajuda a escolher quem realmente usa o sistema. */
function desdeUltimoAcesso(iso: string | null, t: (s: string) => string): string {
  if (!iso) return t("nunca acessou");
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return t("acessou hoje");
  if (dias === 1) return t("acessou ontem");
  if (dias < 30) return `${t("acessou há")} ${dias} ${t("dias")}`;
  return `${t("último acesso em")} ${new Date(iso).toLocaleDateString("pt-BR")}`;
}

/**
 * Ordem: donos primeiro, depois quem acessou mais recentemente. O primeiro da lista é a aposta
 * mais provável (dono ativo), e é ele que entra direto quando só existe uma pessoa.
 */
function ordenar(us: U[]): Pessoa[] {
  return us
    .map((u) => ({
      id: u.id,
      nome: u.full_name || u.email || "—",
      email: u.email || "",
      dono: u.role === "client_owner",
      ultimo: u.last_login,
    }))
    .sort((a, b) => {
      if (a.dono !== b.dono) return a.dono ? -1 : 1;
      const ta = a.ultimo ? new Date(a.ultimo).getTime() : 0;
      const tb = b.ultimo ? new Date(b.ultimo).getTime() : 0;
      if (ta !== tb) return tb - ta;
      return a.nome.localeCompare(b.nome);
    });
}

/**
 * Modal de escolha. Abre já carregando; com UMA pessoa elegível dispara a impersonação sozinho
 * (o modal vira só um "Abrindo…"), com várias mostra a lista, e sem ninguém explica o porquê e
 * manda para a tela onde se cria o acesso.
 */
export default function AcessarComoModal({ orgId, orgName, open, onClose, onIrParaPermissoes }: {
  orgId: string;
  orgName: string;
  open: boolean;
  onClose: () => void;
  onIrParaPermissoes: () => void;
}) {
  const t = useT();
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState<string | null>(null);

  async function entrar(p: Pessoa) {
    if (entrando) return;
    setEntrando(p.id); setErro("");
    // startImpersonation troca a sessão e recarrega em /app — não há retorno em caso de sucesso.
    try { await startImpersonation({ id: p.id, name: p.nome, email: p.email }); }
    catch (e) { setErro(errorMessage(e)); setEntrando(null); }
  }

  useEffect(() => {
    if (!open) { setPessoas(null); setErro(""); setEntrando(null); return; }
    let vivo = true;
    (async () => {
      try {
        // Mesma fonte da tela de Permissões (admin_access_list): já vem só com quem tem perfil no
        // Portal e sem os admins da Crasto — exatamente o conjunto que pode ser impersonado.
        const d = (await services.analytics.admin.accessList()) as any;
        const org = (d?.clients || []).find((c: any) => c.organization_id === orgId);
        const lista = ordenar((org?.users || []) as U[]);
        if (!vivo) return;
        setPessoas(lista);
        if (lista.length === 1) entrar(lista[0]); // sem ambiguidade: não faz sentido perguntar
      } catch (e) { if (vivo) setErro(errorMessage(e)); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgId]);

  const carregando = pessoas === null && !erro;
  const entrandoDireto = !!entrando && pessoas?.length === 1;

  return (
    <Modal title={t("Acessar como") + " · " + orgName} open={open} onClose={onClose}>
      {erro && (
        <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 9, fontSize: 13.5,
          border: "1px solid #F3C2C2", background: "#FDF2F2", color: "#9B1C1C" }}>{erro}</div>
      )}

      {carregando || entrandoDireto ? (
        <div style={{ padding: "18px 4px", color: "var(--crasto-text-muted)", fontSize: 14 }}>
          {entrandoDireto ? t("Abrindo o sistema como esta pessoa…") : t("Carregando as pessoas desta empresa…")}
        </div>
      ) : pessoas && pessoas.length === 0 ? (
        <div>
          <p style={{ margin: "0 0 14px", color: "var(--crasto-text-muted)", fontSize: 14, lineHeight: 1.55 }}>
            {t("Esta empresa ainda não tem ninguém com acesso ao Portal. Crie o acesso de um responsável para poder entrar como ele.")}
          </p>
          <button className="crasto-btn crasto-btn--primary crasto-btn--sm" onClick={onIrParaPermissoes}>
            <span className="crasto-btn__icon"><ShieldCheck size={14} /></span>
            <span className="crasto-btn__label">{t("Gerenciar permissões & acessos")}</span>
          </button>
        </div>
      ) : (
        <div>
          <p style={{ margin: "0 0 14px", color: "var(--crasto-text-muted)", fontSize: 13.5, lineHeight: 1.55 }}>
            {t("Você vai entrar no sistema como esta pessoa, exatamente como ela vê — incluindo o WhatsApp dela. A ação fica registrada e você volta a ser você em um clique.")}
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {pessoas!.map((p) => (
              <button key={p.id} onClick={() => entrar(p)} disabled={!!entrando}
                style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "11px 13px",
                  border: "1px solid var(--crasto-border)", borderRadius: 10, background: "var(--crasto-surface)",
                  cursor: entrando ? "wait" : "pointer", opacity: entrando && entrando !== p.id ? 0.5 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {p.nome}
                    {p.dono && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
                        background: "var(--crasto-navy)", color: "#fff", verticalAlign: "middle" }}>{t("dono")}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--crasto-text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.email} · {desdeUltimoAcesso(p.ultimo, t)}
                  </div>
                </div>
                <ArrowRight size={15} style={{ opacity: 0.6, flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
