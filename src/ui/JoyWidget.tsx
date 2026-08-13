import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Search, MessageCircle, LifeBuoy, ChevronRight, ArrowLeft } from "lucide-react";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";

// JOY — assistente de suporte da Crasto.AI. Agente "de bolso" no canto inferior direito. É de
// propósito SEM IA/API (custo zero): responde por uma base de dúvidas (FAQ) local com busca por
// palavra-chave e, quando não resolve, encaminha ao humano (WhatsApp ou chamado). Assim o cliente
// tira dúvida do sistema na hora, e o time só entra quando precisa de gente. Conteúdo é editável
// aqui embaixo (FAQ) — cresce sem tocar em backend.
type Faq = { id: string; q: string; keywords: string; a: string[] };

const FAQ: Faq[] = [
  { id: "crm", q: "Como uso o CRM (Vendas)?", keywords: "crm vendas funil lead negócio pipeline kanban card",
    a: ["No menu Vendas → CRM você vê o funil dos seus leads em colunas (Novo, Template enviado, Lead, Oportunidade, Convertido, Descartado).",
        "Arraste um card entre as colunas para mudar a etapa, ou clique nele para ver os detalhes e conversar. Dá pra alternar entre visão de Cards e Lista no topo do quadro."] },
  { id: "whats", q: "Como funciona o WhatsApp?", keywords: "whatsapp conversa mensagem chat responder canal ia agente",
    a: ["Em Vendas → WhatsApp ficam as conversas dos seus leads. A IA responde sozinha, e você pode assumir uma conversa a qualquer momento pelo botão de assumir.",
        "Quando um lead esquenta (diz que quer) ou a IA empaca, aparece a bandeirinha 📞 “Assumir e ligar” no card e um aviso no sininho — a primeira pessoa da equipe que assumir leva o lead."] },
  { id: "distribuir", q: "Como distribuo os leads entre os vendedores?", keywords: "distribuir leads vendedor equipe rateio dividir repartir",
    a: ["No quadro de leads (Vendas → CRM), o dono vê o botão ✦ Distribuir no topo. Ele divide os contatos igualmente entre os vendedores escolhidos, equilibrando por segmento e cidade.",
        "Você escolhe de qual etapa distribuir (ex.: Template enviado) e quais vendedores entram no rateio."] },
  { id: "usuarios", q: "Como adiciono um usuário / dou acesso?", keywords: "usuário acesso permissão equipe colaborador rh adicionar convidar tela",
    a: ["Vá em RH → Gestão de Acessos. Lá você adiciona pessoas e, para quem não é dono, libera exatamente quais telas cada um pode ver (Permissões).",
        "Ao adicionar, o acesso ao WhatsApp CRM já vem por padrão; o que controla as telas é a parte de Permissões."] },
  { id: "financeiro", q: "Onde vejo o financeiro e minhas cobranças?", keywords: "financeiro cobrança fatura pagamento boleto pix mrr receber plano",
    a: ["O módulo Financeiro fica no menu de Módulos. Se ele estiver com cadeado, é porque ainda não está contratado — clique nele para conhecer/solicitar.",
        "Dúvidas sobre uma cobrança específica: use “Falar com um humano” aqui embaixo."] },
  { id: "conta", q: "Como troco minha senha ou ativo a verificação em 2 etapas?", keywords: "senha segurança 2fa dois fatores login perfil conta dados cadastrais",
    a: ["Clique no seu avatar (canto superior direito) → Configurações. Lá você edita seus dados, troca a senha e ativa a autenticação em duas etapas."] },
];

export default function JoyWidget() {
  const t = useT();
  const nav = useNavigate();
  const { supportWhatsapp } = useSettings();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Faq | null>(null);
  const [q, setQ] = useState("");

  const lista = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return FAQ;
    return FAQ.filter((f) => (f.q + " " + f.keywords).toLowerCase().includes(s));
  }, [q]);

  function humanoWhatsApp() {
    const digits = (supportWhatsapp || "").replace(/\D/g, "");
    const msg = encodeURIComponent(t("Olá! Sou cliente da Crasto.AI e preciso de ajuda com o meu portal."));
    if (digits) window.open(`https://wa.me/${digits}?text=${msg}`, "_blank", "noopener");
    else abrirChamado();
  }
  function abrirChamado() { setOpen(false); nav("/app/suporte"); }

  return (
    <>
      <button
        type="button"
        className={"joy-fab" + (open ? " joy-fab--open" : "")}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? t("Fechar a JOY") : t("Abrir a JOY (ajuda)")}
        title={t("JOY · Assistente Crasto.AI")}
      >
        {open ? <X size={22} /> : <img src="/crasto-monogram-white.png" alt="JOY" className="joy-fab__mk" />}
        {!open && <span className="joy-fab__ping" aria-hidden="true" />}
      </button>

      {open && (
        <div className="joy-panel" role="dialog" aria-label="JOY">
          <div className="joy-head">
            <span className="joy-head__av"><img src="/crasto-monogram-white.png" alt="" /></span>
            <div className="joy-head__id">
              <b>{t("JOY")}</b>
              <span>{t("Assistente Crasto.AI")}</span>
            </div>
            <button type="button" className="joy-head__x" onClick={() => setOpen(false)} aria-label={t("Fechar")}><X size={18} /></button>
          </div>

          <div className="joy-body">
            {!sel ? (
              <>
                <div className="joy-hi">{t("Oi! Eu sou a JOY 👋 Como posso te ajudar? Escolha um assunto ou busque sua dúvida.")}</div>
                <div className="joy-search">
                  <Search size={15} />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Buscar dúvida…")} />
                </div>
                <div className="joy-list">
                  {lista.map((f) => (
                    <button key={f.id} type="button" className="joy-topic" onClick={() => setSel(f)}>
                      <span>{t(f.q)}</span><ChevronRight size={15} />
                    </button>
                  ))}
                  {lista.length === 0 && <div className="joy-empty">{t("Não achei nada com isso. Fale com um humano abaixo. 👇")}</div>}
                </div>
              </>
            ) : (
              <>
                <button type="button" className="joy-back" onClick={() => setSel(null)}><ArrowLeft size={15} /> {t("Voltar")}</button>
                <div className="joy-ans-q">{t(sel.q)}</div>
                {sel.a.map((p, i) => <p key={i} className="joy-ans-p">{t(p)}</p>)}
                <div className="joy-ans-foot">{t("Resolveu? Se precisar de gente, é só chamar abaixo.")}</div>
              </>
            )}
          </div>

          <div className="joy-foot">
            <button type="button" className="joy-cta joy-cta--wa" onClick={humanoWhatsApp}><MessageCircle size={16} /> {t("Falar no WhatsApp")}</button>
            <button type="button" className="joy-cta" onClick={abrirChamado}><LifeBuoy size={16} /> {t("Abrir chamado")}</button>
          </div>
        </div>
      )}
    </>
  );
}
