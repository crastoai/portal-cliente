import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Send, Mic, MessageCircle, LifeBuoy } from "lucide-react";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings";

// JOY — assistente de suporte da Crasto.AI (canto inferior direito). CHAT interativo: a pessoa
// DIGITA ou FALA (voz do navegador, grátis) o que quiser e a JOY responde ensinando a usar o
// sistema. É de propósito SEM IA/API paga (custo zero): um motor de BUSCA LOCAL casa a pergunta
// livre com a base de conhecimento abaixo (por palavras/sinônimos) e devolve a melhor resposta;
// quando não sabe, encaminha ao humano. Pra "ensinar" mais coisas, é só ampliar o array KB.
type Kb = { id: string; q: string; keywords: string; a: string[] };

const KB: Kb[] = [
  { id: "geral", q: "O que dá pra fazer no sistema?", keywords: "o que é sistema portal começar iniciar visão geral menu módulos ajuda tour navegar",
    a: ["A Crasto.AI reúne seus módulos num portal só. No menu à esquerda: Vendas (CRM + WhatsApp), Marketing, Financeiro, Compras, Importação e RH. Módulos com cadeado ainda não foram contratados — clique pra conhecer.",
        "Me diga o que você quer fazer (ex.: “como distribuo leads?”, “como adiciono um usuário?”) que eu te ensino o caminho."] },
  { id: "crm", q: "Como uso o CRM / o funil de vendas?", keywords: "crm funil vendas pipeline kanban etapa coluna lead negócio card mover arrastar oportunidade prospecto",
    a: ["Vá em Vendas → CRM. Seus leads aparecem em colunas: Novo, Template enviado, Lead, Oportunidade, Convertido, Descartado.",
        "Arraste um card entre as colunas pra mudar a etapa, ou clique nele pra ver detalhes e conversar. No topo dá pra alternar entre visão de Cards e Lista, filtrar por etapa e buscar por nome."] },
  { id: "whats", q: "Como funciona o WhatsApp / as conversas?", keywords: "whatsapp conversa mensagem chat responder canal atendimento ia bot falar cliente inbox",
    a: ["Em Vendas → WhatsApp ficam as conversas dos seus leads. A IA responde sozinha 24h; você pode assumir uma conversa a qualquer momento pelo botão de assumir.",
        "Quando um lead esquenta (diz que quer comprar) ou a IA empaca, aparece a bandeirinha 📞 “Assumir e ligar” no card e um aviso no sininho — a primeira pessoa da equipe que assumir leva o lead."] },
  { id: "assumir", q: "Como assumo um lead pra mim?", keywords: "assumir pegar lead cliente meu posse dono responsável reservar puxar",
    a: ["Abra o lead (no CRM ou na conversa) e clique em “Assumir”. É atômico: o primeiro que assume vira o dono e ninguém mais mexe. Pra devolver pra fila, use “Liberar”.",
        "Leads com a bandeirinha 📞 estão na fila da equipe — clique em “Assumir e ligar” (no card ou na Minha Mesa) e ele é seu."] },
  { id: "distribuir", q: "Como distribuo os leads entre os vendedores?", keywords: "distribuir dividir repartir rateio leads vendedores equipe igual meio a meio balancear atribuir espalhar",
    a: ["No quadro de leads (Vendas → CRM), o dono vê o botão ✦ Distribuir no topo. Ele divide os contatos igualmente entre os vendedores escolhidos, equilibrando por segmento e cidade.",
        "Escolha de qual etapa distribuir (ex.: Template enviado) e quais vendedores entram no rateio, e confirme."] },
  { id: "ligar", q: "O que é a bandeirinha 📞 “Assumir e ligar”?", keywords: "bandeirinha ligar telefone azul card handoff humano quente empacou tarefa ligação sininho fila",
    a: ["É o handoff pra humano: quando o lead demonstra intenção de compra ou a IA não resolve, o sistema marca o card com 📞 e cria uma tarefa de ligação SEM dono, avisando no sininho.",
        "As vendedoras veem essa fila (no board e na Minha Mesa) e a primeira que clicar em “Assumir e ligar” leva o lead pra ligar. A IA segue respondendo até alguém assumir."] },
  { id: "tarefas", q: "Onde vejo minhas tarefas / a Minha Mesa?", keywords: "tarefas mesa minha mesa afazeres to-do pendências ligações lembrete follow-up agenda do dia sininho notificação",
    a: ["Em Vendas → Minhas Tarefas fica a sua central de trabalho (kanban A fazer / Em andamento / Aguardando / Encerrado). Ali chegam também as ligações da fila e os pedidos de aprovação da IA.",
        "O sininho no topo avisa quando cai algo novo pra você (tarefa, transferência ou um lead pra ligar)."] },
  { id: "importar", q: "Como importo meus contatos / uma lista?", keywords: "importar importação contatos lista planilha csv excel subir carregar base leads em massa",
    a: ["No Pipeline do CRM há o botão “Importar”: suba um CSV (ou cole), confira o mapeamento das colunas e o sistema cria os contatos e negócios já no funil.",
        "Dá pra pedir “✨ Analisar com IA” pra sugerir etapa e prioridade de cada linha antes de importar."] },
  { id: "usuarios", q: "Como adiciono um usuário e dou acesso?", keywords: "usuário usuários acesso acessos permissão permissões equipe colaborador funcionário vendedor vendedora vendedores rh adicionar convidar cadastrar liberar tela bloquear",
    a: ["Vá em RH → Gestão de Acessos. Adicione a pessoa e, pra quem não é dono, libere exatamente quais telas ela pode ver na aba Permissões.",
        "Ao adicionar, o acesso ao WhatsApp CRM já vem por padrão — o que controla o que cada um enxerga é a parte de Permissões."] },
  { id: "financeiro", q: "Onde vejo o financeiro e minhas cobranças?", keywords: "financeiro cobrança cobranças fatura faturas pagamento boleto pix mrr receber pagar plano mensalidade nota valor",
    a: ["O módulo Financeiro fica no menu de Módulos. Se estiver com cadeado, ainda não está contratado — clique pra conhecer/solicitar.",
        "Dúvida sobre uma cobrança específica: use “Falar no WhatsApp” ou “Abrir chamado” aqui embaixo que a gente resolve."] },
  { id: "unidades", q: "Como troco de empresa / CNPJ (unidades)?", keywords: "unidade unidades cnpj empresa empresas matriz filial trocar seletor multi adicionar outra",
    a: ["No topo, à direita, há o seletor de unidade (CNPJ). Clique pra alternar entre suas empresas ou ver “Todas as unidades”.",
        "Se você é o dono/admin, pode adicionar outra empresa ali mesmo, no botão “Adicionar empresa (CNPJ)”."] },
  { id: "conta", q: "Como troco minha senha ou ativo a verificação em 2 etapas?", keywords: "senha password conta perfil segurança 2fa dois fatores duas etapas login trocar alterar mudar esqueci redefinir dados cadastrais foto avatar",
    a: ["Clique no seu avatar (canto superior direito) → Configurações. Lá você edita seus dados, troca a foto, muda a senha e ativa a autenticação em duas etapas."] },
  { id: "cockpit", q: "O que é o Cockpit / a tela inicial?", keywords: "cockpit início inicio home dashboard resultados números kpi indicadores visão painel meus resultados",
    a: ["O Cockpit (tela inicial) resume seus resultados: leads, conversões, receita e os principais indicadores. Dá pra filtrar por período, agente e vendedor, e comparar vendedores entre si."] },
  { id: "humano", q: "Falar com uma pessoa da Crasto.AI", keywords: "humano pessoa alguém gente atendente suporte falar contato ajuda chamado ticket whatsapp reclamar problema urgente ninguém consigo conseguindo resolver",
    a: ["Claro! Use os botões aqui embaixo: “Falar no WhatsApp” pra resposta rápida, ou “Abrir chamado” pra registrar com detalhes e anexos. Nosso time responde em até 1 dia útil."] },
];

// Busca local (sem IA): normaliza (minúsculas, sem acento), tira palavras vazias e casa os termos
// da pergunta com as palavras-chave de cada item (match exato + parcial por substring).
const STOP = new Set("a o e de da do das dos que como onde qual quais pra para por com em no na nos nas um uma uns umas meu minha eu quero queria preciso gostaria ajuda me se sobre ser tem ter estou está isso essa esse esta este ao aos".split(/\s+/));
function toks(s: string): string[] {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
}
const KB_TOKS = KB.map((k) => new Set([...toks(k.q), ...toks(k.keywords)]));
function rank(query: string): { k: Kb; s: number }[] {
  const q = toks(query); if (!q.length) return [];
  return KB.map((k, i) => {
    const et = KB_TOKS[i]; let s = 0;
    for (const w of q) {
      let best = 0;
      for (const e of et) {
        if (e === w) { best = 1; break; }
        // Mesmo RADICAL (conjugação/plural): "distribuo"↔"distribuir", "senha"↔"senhas". Barato,
        // sem stemmer/IA — casa os 5 primeiros caracteres.
        if (Math.min(e.length, w.length) >= 5 && e.slice(0, 5) === w.slice(0, 5)) best = Math.max(best, 0.8);
        else if (Math.min(e.length, w.length) > 3 && (e.includes(w) || w.includes(e))) best = Math.max(best, 0.5);
      }
      s += best;
    }
    return { k, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
}

type Msg = { id: number; from: "joy" | "user"; text: string; chips?: string[] };
const CHIPS_INICIAIS = ["Como uso o CRM?", "Como distribuo leads?", "Como adiciono um usuário?", "Ver o financeiro"];

export default function JoyWidget() {
  const t = useT();
  const nav = useNavigate();
  const { supportWhatsapp } = useSettings();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [ouvindo, setOuvindo] = useState(false);
  // Posição arrastável do FAB (persistida). Guarda o canto {right,bottom} em px; null = usa o CSS padrão.
  const [fabPos, setFabPos] = useState<{ right: number; bottom: number } | null>(() => {
    try { const s = localStorage.getItem("joy.fabpos"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const dragRef = useRef<{ sx: number; sy: number; sr: number; sb: number; cur: { right: number; bottom: number } } | null>(null);
  const draggedRef = useRef(false);
  const idRef = useRef(0);
  const nextId = () => ++idRef.current;
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    { id: 0, from: "joy", text: "Oi! Eu sou a JOY 👋 Sua assistente aqui na Crasto.AI. Pode me perguntar qualquer coisa sobre o sistema — é só digitar ou falar no microfone. O que você quer fazer?", chips: CHIPS_INICIAIS },
  ]);
  const threadRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const speechOK = useMemo(() => typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition), []);

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, open]);

  function responder(pergunta: string) {
    const q = pergunta.trim(); if (!q) return;
    setInput("");
    setMsgs((m) => [...m, { id: nextId(), from: "user", text: q }]);
    const hits = rank(q);
    setTimeout(() => {
      if (hits.length && hits[0].s >= 1) {
        const top = hits[0].k;
        const related = hits.slice(1, 4).filter((h) => h.s >= 1).map((h) => h.k.q);
        setMsgs((m) => [...m, { id: nextId(), from: "joy", text: top.a.join("\n\n"), chips: related.length ? related : undefined }]);
      } else {
        setMsgs((m) => [...m, { id: nextId(), from: "joy", text: "Ainda não sei responder isso do jeito que você escreveu 😅. Tente reformular (ex.: “como distribuo leads?”) ou fale com um humano nos botões abaixo — respondemos rapidinho.", chips: CHIPS_INICIAIS }]);
      }
    }, 220);
  }

  function ouvir() {
    if (ouvindo) { try { recRef.current?.stop(); } catch { /* ok */ } setOuvindo(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.lang = "pt-BR"; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = (e: any) => { const txt = e.results?.[0]?.[0]?.transcript || ""; if (txt) responder(txt); };
    r.onerror = () => setOuvindo(false);
    r.onend = () => setOuvindo(false);
    recRef.current = r; setOuvindo(true);
    try { r.start(); } catch { setOuvindo(false); }
  }

  function humanoWhatsApp() {
    const digits = (supportWhatsapp || "").replace(/\D/g, "");
    const msg = encodeURIComponent(t("Olá! Sou cliente da Crasto.AI e preciso de ajuda com o meu portal."));
    if (digits) window.open(`https://wa.me/${digits}?text=${msg}`, "_blank", "noopener");
    else abrirChamado();
  }
  function abrirChamado() { setOpen(false); nav("/app/suporte"); }

  // --- Arraste do FAB (mouse/toque). Distingue clique de arraste por um limiar de 6px. ---
  function onFabPointerDown(e: React.PointerEvent) {
    if (open) return; // aberto, o botão é o X (fechar) — não arrasta
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const right = window.innerWidth - r.right;
    const bottom = window.innerHeight - r.bottom;
    dragRef.current = { sx: e.clientX, sy: e.clientY, sr: right, sb: bottom, cur: { right, bottom } };
    draggedRef.current = false;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ok */ }
  }
  function onFabPointerMove(e: React.PointerEvent) {
    const d = dragRef.current; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!draggedRef.current && Math.hypot(dx, dy) < 6) return;
    draggedRef.current = true;
    const size = (e.currentTarget as HTMLElement).offsetWidth || 58, m = 8;
    const right = Math.min(window.innerWidth - size - m, Math.max(m, d.sr - dx));
    const bottom = Math.min(window.innerHeight - size - m, Math.max(m, d.sb - dy));
    d.cur = { right, bottom };
    setFabPos({ right, bottom });
  }
  function onFabPointerUp(e: React.PointerEvent) {
    const d = dragRef.current; dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ok */ }
    if (draggedRef.current && d) {
      try { localStorage.setItem("joy.fabpos", JSON.stringify(d.cur)); } catch { /* ok */ }
    }
  }

  return (
    <>
      <button type="button" className={"joy-fab" + (open ? " joy-fab--open" : "")}
        style={fabPos ? { right: fabPos.right + "px", bottom: fabPos.bottom + "px", left: "auto", top: "auto" } : undefined}
        onPointerDown={onFabPointerDown} onPointerMove={onFabPointerMove} onPointerUp={onFabPointerUp}
        onClick={() => { if (draggedRef.current) { draggedRef.current = false; return; } setOpen((o) => !o); }}
        aria-label={open ? t("Fechar a JOY") : t("Abrir a JOY (ajuda)")} title={t("JOY · Assistente Crasto.AI · arraste para mover")}>
        {open ? <X size={22} /> : <img src="/crasto-monogram-navy.png" alt="JOY" className="joy-fab__mk" />}
        {!open && <span className="joy-fab__ping" aria-hidden="true" />}
      </button>

      {open && (
        <div className="joy-panel" role="dialog" aria-label="JOY"
          style={fabPos ? { bottom: (fabPos.bottom + 70) + "px" } : undefined}>
          <div className="joy-head">
            <span className="joy-head__av"><img src="/crasto-monogram-navy.png" alt="" /></span>
            <div className="joy-head__id"><b>{t("JOY")}</b><span>{t("Assistente Crasto.AI")}</span></div>
            <button type="button" className="joy-head__x" onClick={() => setOpen(false)} aria-label={t("Fechar")}><X size={18} /></button>
          </div>

          <div className="joy-body joy-thread" ref={threadRef}>
            {msgs.map((m) => (
              <div key={m.id} className="joy-row">
                <div className={"joy-msg joy-msg--" + m.from}>{t(m.text)}</div>
                {m.chips && m.chips.length > 0 && (
                  <div className="joy-chips">
                    {m.chips.map((c, i) => <button key={i} type="button" className="joy-chip" onClick={() => responder(c)}>{t(c)}</button>)}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form className="joy-inputbar" onSubmit={(e) => { e.preventDefault(); responder(input); }}>
            {speechOK && (
              <button type="button" className={"joy-mic" + (ouvindo ? " on" : "")} onClick={ouvir} title={ouvindo ? t("Parar de ouvir") : t("Falar")} aria-label={t("Falar")}>
                <Mic size={17} />
              </button>
            )}
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={ouvindo ? t("Ouvindo… fale sua dúvida") : t("Digite sua dúvida…")} />
            <button type="submit" className="joy-send" disabled={!input.trim()} title={t("Enviar")} aria-label={t("Enviar")}><Send size={16} /></button>
          </form>

          <div className="joy-foot">
            <button type="button" className="joy-cta joy-cta--wa" onClick={humanoWhatsApp}><MessageCircle size={16} /> {t("Falar no WhatsApp")}</button>
            <button type="button" className="joy-cta" onClick={abrirChamado}><LifeBuoy size={16} /> {t("Abrir chamado")}</button>
          </div>
        </div>
      )}
    </>
  );
}
