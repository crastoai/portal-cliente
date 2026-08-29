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
// `ir` = para onde a resposta leva. A JOY nao descreve o caminho: ela ABRE a tela.
type Kb = { id: string; q: string; keywords: string; a: string[]; ir?: { to: string; label: string } };

const KB: Kb[] = [
  { id: "geral", q: "O que dá pra fazer no sistema?", keywords: "o que é sistema portal começar iniciar visão geral menu módulos ajuda tour navegar perdido não sei usar aprender",
    a: ["A Crasto.AI reúne seus módulos num portal só. No menu à esquerda: Vendas (Cockpit, CRM, WhatsApp, Minhas Tarefas, Contatos, Agendamentos, Configurações) e os Módulos (Financeiro, Marketing, Compras…). Item com cadeado é módulo ainda não contratado.",
        "Me diga o que você QUER FAZER (ex.: “importar meus contatos”, “mandar mensagem”, “adicionar um usuário”) que eu te levo até a tela."],
    ir: { to: "/app", label: "Abrir a tela inicial" } },
  { id: "importar", q: "Como importo meus contatos (planilha/CSV)?", keywords: "importar importação importacao contatos lista planilha csv excel subir carregar base leads em massa cadastrar vários varios inserir migrar trazer arquivo",
    a: ["Caminho: Vendas → CRM → botão “Importar”, no topo da tela.",
        "1) Envie o arquivo CSV ou cole as linhas · 2) confira o de-para das colunas (nome, telefone, empresa) · 3) escolha a etapa do funil e confirme. No Excel, use “Salvar como CSV”.",
        "Antes de confirmar dá pra clicar em “✨ Analisar com IA”, que sugere a etapa e a prioridade de cada linha. Telefone repetido não duplica: o sistema reaproveita o contato existente.",
        "Terminada a importação, os contatos aparecem em Vendas → Contatos e viram cards no funil."],
    ir: { to: "/app/crm/funil", label: "Abrir o CRM para importar" } },
  { id: "crm", q: "Como uso o CRM / o funil de vendas?", keywords: "crm funil vendas pipeline kanban etapa coluna lead negócio card mover arrastar oportunidade prospecto board quadro",
    a: ["Vá em Vendas → CRM. Os leads ficam em colunas por etapa (ex.: Novo, Template enviado, Lead, Oportunidade, Convertido, Descartado).",
        "Arraste o card entre as colunas pra mudar a etapa, ou clique nele pra ver detalhes e conversar. No topo dá pra alternar entre Cards e Lista, filtrar e buscar por nome, telefone ou cidade."],
    ir: { to: "/app/crm/funil", label: "Abrir o CRM" } },
  { id: "whats", q: "Como mando mensagem / uso o WhatsApp?", keywords: "whatsapp conversa mensagem chat responder canal atendimento ia bot falar cliente inbox enviar escrever texto áudio audio anexo foto arquivo",
    a: ["Em Vendas → WhatsApp ficam as conversas. Clique no contato e escreva no campo de baixo (dá pra mandar áudio, foto e arquivo). A IA responde sozinha 24h; você assume quando quiser no botão “Assumir”.",
        "Se a última mensagem do cliente tiver mais de 24h, o WhatsApp fecha a janela e só sai um TEMPLATE aprovado — o sistema já mostra o campo certo pra isso."],
    ir: { to: "/app/crm/conversas", label: "Abrir as conversas" } },
  { id: "template", q: "O que é a “janela de 24h” e o template?", keywords: "template janela 24h fechada reabrir aprovado meta primeira mensagem frio não consigo enviar bloqueado modelo recusou",
    a: ["É regra do WhatsApp, não nossa: passadas 24h da última mensagem do cliente, só dá pra reabrir com um TEMPLATE aprovado pela Meta. O sistema detecta e troca o campo de escrita pelo envio do template.",
        "Escreva a mensagem personalizada no campo indicado e clique em “Enviar template”. Se o número nunca trocou mensagem com você e parece telefone fixo, o sistema avisa — fixo quase nunca tem WhatsApp e cada falha piora a reputação do seu número."],
    ir: { to: "/app/crm/conversas", label: "Abrir as conversas" } },
  { id: "assumir", q: "Como assumo um lead pra mim?", keywords: "assumir pegar lead cliente meu posse dono responsável reservar puxar devolver liberar",
    a: ["Abra o lead (no CRM ou na conversa) e clique em “Assumir”. O primeiro que assume vira o dono e ninguém mais mexe; pra devolver à fila, use “Liberar”.",
        "Leads com a bandeirinha 📞 estão na fila da equipe — clique em “Assumir e ligar” (no card ou em Minhas Tarefas) e ele é seu."],
    ir: { to: "/app/crm/funil", label: "Abrir o CRM" } },
  { id: "distribuir", q: "Como distribuo os leads entre os vendedores?", keywords: "distribuir dividir repartir rateio leads vendedores equipe igual meio a meio balancear atribuir espalhar",
    a: ["No quadro de leads (Vendas → CRM), o dono vê o botão ✦ Distribuir no topo. Ele divide os contatos igualmente entre os vendedores escolhidos, equilibrando por segmento e cidade.",
        "Escolha de qual etapa distribuir e quem entra no rateio, e confirme."],
    ir: { to: "/app/crm/funil", label: "Abrir o CRM" } },
  { id: "ligar", q: "O que é a bandeirinha 📞 “Assumir e ligar”?", keywords: "bandeirinha ligar telefone azul card handoff humano quente empacou tarefa ligação fila",
    a: ["É o handoff pra humano: quando o lead demonstra intenção de compra ou a IA não resolve, o card ganha 📞 e nasce uma tarefa de ligação SEM dono, com aviso no sininho.",
        "A primeira pessoa que clicar em “Assumir e ligar” leva o lead. A IA continua respondendo até alguém assumir."],
    ir: { to: "/app/crm/tarefas", label: "Abrir Minhas Tarefas" } },
  { id: "tarefas", q: "Onde vejo minhas tarefas?", keywords: "tarefas mesa minha mesa afazeres to-do pendências ligações lembrete follow-up do dia kanban",
    a: ["Em Vendas → Minhas Tarefas fica a sua central (A fazer / Em andamento / Aguardando / Encerrado). Ali chegam as ligações da fila e os pedidos de aprovação da IA.",
        "O sininho no topo avisa quando cai algo novo pra você."],
    ir: { to: "/app/crm/tarefas", label: "Abrir Minhas Tarefas" } },
  { id: "contatos", q: "Onde ficam os meus contatos?", keywords: "contatos contato lista pessoas telefone número numero cadastro base agenda de contatos todos os contatos onde estao estão ficam vejo achar meus",
    a: ["Em Vendas → Contatos fica a lista completa. Clique num contato pra ver o histórico e abrir a conversa. Pra trazer uma lista de fora, use o “Importar” dentro do CRM."],
    ir: { to: "/app/crm/contatos", label: "Abrir Contatos" } },
  { id: "empresa_pesquisa", q: "Para que serve o bloco “O que é a empresa”?", keywords: "pesquisa empresa resumo quem é o lead informações informacoes cnpj razão social site gancho catálogo catalogo inteligência inteligencia painel direito perfil",
    a: ["No painel à direita da conversa, o bloco 🔎 “O que é a empresa” mostra o que a empresa faz, site, razão social, CNPJ, tempo de mercado e um gancho de venda — apurado do site dela e do CNPJ na Receita.",
        "Clique no ⟳ do bloco pra refazer a pesquisa. No rodapé aparece com o que foi apurado e o nível de confiança; quando o site não pôde ser lido, ele diz “não confirmado” em vez de chutar."],
    ir: { to: "/app/crm/conversas", label: "Abrir as conversas" } },
  { id: "agenda", q: "Como agendo uma reunião?", keywords: "agenda agendamento agendamentos agendar reunião reuniao compromisso calendário calendario marcar horário horario visita call encontro data",
    a: ["Em Vendas → Agendamentos você vê e cria compromissos ligados aos seus leads. Escolha data e horário e vincule ao contato — assim ninguém perde o combinado."],
    ir: { to: "/app/crm/agenda", label: "Abrir Agendamentos" } },
  { id: "usuarios", q: "Como adiciono um usuário e dou acesso?", keywords: "usuário usuários acesso acessos permissão permissões equipe colaborador funcionário vendedor vendedora vendedores rh adicionar convidar cadastrar liberar tela bloquear convite",
    a: ["Vá em RH → Gestão de Acessos. Adicione a pessoa (nome e e-mail) e, para quem não é dono, libere exatamente quais telas ela enxerga na aba Permissões.",
        "Ela recebe um link pra criar a própria senha. O acesso ao WhatsApp CRM já vem por padrão — o que controla o que cada um vê é a parte de Permissões."],
    ir: { to: "/app/usuarios", label: "Abrir Gestão de Acessos" } },
  { id: "dashboard", q: "Onde vejo os números das vendas?", keywords: "cockpit dashboard painel vendas vendi vendeu vendemos vendido faturei faturamento fechei quanto total mês mes período periodo números numeros métricas metricas resultados gráfico grafico taxa resposta conversão conversao receita indicadores relatório relatorio",
    a: ["Em Vendas → Cockpit estão os números do funil: leads por etapa, taxa de resposta, conversão e receita, com filtro por período e por vendedor.",
        "A tela inicial (Cockpit) traz o resumo do seu resultado e deixa comparar vendedores."],
    ir: { to: "/app/crm", label: "Abrir o Cockpit" } },
  { id: "config", q: "Como configuro o meu agente de IA?", keywords: "configurações configuracoes configurar agente ia personalidade tom voz mensagem saudação saudacao horário horario atendimento comportamento ajustar treinar prompt regras desligar pausar",
    a: ["Em Vendas → Configurações você ajusta o agente: identidade, saudação, horário de atendimento, quebra de mensagens e outros comportamentos. Vale para as próximas conversas.",
        "Mudança de personalidade ou de estratégia de negociação a gente faz junto — me chame nos botões aqui embaixo."],
    ir: { to: "/app/crm/config", label: "Abrir Configurações" } },
  { id: "financeiro", q: "Onde vejo o financeiro e minhas cobranças?", keywords: "financeiro cobrança cobranças fatura faturas pagamento boleto pix mrr receber pagar plano mensalidade nota valor segunda via",
    a: ["O Financeiro fica no menu de Módulos. Com cadeado, ainda não foi contratado — clique pra conhecer.",
        "Dúvida sobre uma cobrança específica: use “Falar no WhatsApp” ou “Abrir chamado” aqui embaixo."],
    ir: { to: "/app/financeiro", label: "Abrir o Financeiro" } },
  { id: "unidades", q: "Como troco de empresa / CNPJ?", keywords: "unidade unidades cnpj empresa empresas matriz filial trocar seletor multi adicionar outra",
    a: ["No topo, à direita, há o seletor de unidade (CNPJ): alterne entre suas empresas ou veja “Todas as unidades”. Sendo dono ou admin, dá pra adicionar outra empresa ali mesmo."] },
  { id: "conta", q: "Como troco minha senha ou ativo a verificação em 2 etapas?", keywords: "senha senhas password conta perfil segurança 2fa dois fatores duas etapas login trocar troco alterar altero mudar mudo mudei esqueci redefinir dados cadastrais foto avatar",
    a: ["Clique no seu avatar (canto superior direito) → Configurações. Lá você edita seus dados, troca a foto, muda a senha e ativa a autenticação em duas etapas."],
    ir: { to: "/app/perfil", label: "Abrir meu perfil" } },
  { id: "solucoes", q: "O que eu já contratei e o que posso contratar?", keywords: "minhas soluções solucoes solução contratado ativo produtos meus módulos catálogo catalogo o que tenho contratar novo",
    a: ["Em Minhas Soluções ficam os produtos contratados, com o status de cada um; o Catálogo mostra o que dá pra contratar a mais."],
    ir: { to: "/app/solucoes", label: "Abrir Minhas Soluções" } },
  { id: "implementacao", q: "Como acompanho a implantação do meu projeto?", keywords: "implementação implementacao implantação implantacao onboarding progresso andamento status entrega projeto quando fica pronto começar etapas",
    a: ["Enquanto a implantação não termina, aparece “Minha Implementação” no menu, com o progresso e as etapas. Ao chegar a 100% ela some — sinal de tudo entregue."],
    ir: { to: "/app/implementacao", label: "Abrir Minha Implementação" } },
  { id: "modulos", q: "O que é um módulo com cadeado?", keywords: "módulo modulo módulos cadeado bloqueado bloqueio indisponível indisponivel contratar ativar liberar comercial trancado fechado",
    a: ["Cadeado é módulo que a sua empresa ainda não contratou. Ao clicar, aparece o aviso pra falar com o seu representante comercial da Crasto.AI."],
    ir: { to: "/app/modulos", label: "Ver os módulos" } },
  { id: "notificacoes", q: "O que é o sininho de notificações?", keywords: "sininho sino notificação notificações notificacoes aviso avisos alerta novidade som badge topo bell contador",
    a: ["O sininho mostra novidades: chamados respondidos, tarefas novas, leads pra ligar e avisos do sistema. O número é o que você ainda não viu."],
    ir: { to: "/app/notificacoes", label: "Ver as notificações" } },
  { id: "tema", q: "Como troco o tema (claro/escuro) ou o idioma?", keywords: "tema claro escuro dark mode modo noturno idioma língua lingua português portugues inglês ingles trocar aparência aparencia cor",
    a: ["No topo, à direita, ficam os botões de tema e de idioma. No celular eles ficam dentro do menu do seu perfil (no avatar)."] },
  { id: "sair", q: "Como saio da minha conta?", keywords: "sair logout deslogar encerrar sessão sessao desconectar logoff fechar conta trocar usuário",
    a: ["Clique no seu avatar (canto superior direito) → Sair. Isso encerra a sua sessão com segurança."] },
  { id: "buscar", q: "Como encontro um lead ou contato específico?", keywords: "buscar procurar pesquisar encontrar achar filtro nome telefone lead contato localizar cidade segmento onde está sumiu",
    a: ["Use o campo de busca no topo do CRM (nome, telefone, cidade ou segmento) e os filtros de etapa e vendedor. Na visão Lista dá pra ordenar por qualquer coluna."],
    ir: { to: "/app/crm/funil", label: "Abrir o CRM" } },
  { id: "horas", q: "Como funciona o meu plano de horas de suporte?", keywords: "horas hora suporte plano saldo chamado consumo mensal contratar extra melhorias esgotou acabou",
    a: ["Você tem um plano de horas de suporte por mês. “Suporte do Agente” (manter no ar, corrigir erros) entra no plano; “Melhorias” são orçadas à parte. Se acabar, dá pra contratar extras ou aguardar o próximo mês."],
    ir: { to: "/app/suporte", label: "Abrir o Suporte" } },
  { id: "humano", q: "Falar com uma pessoa da Crasto.AI", keywords: "humano pessoa alguém gente atendente suporte falar contato ajuda chamado ticket whatsapp reclamar problema urgente ninguém consigo conseguindo resolver bug erro travou parou não funciona",
    a: ["Claro! Use os botões aqui embaixo: “Falar no WhatsApp” pra resposta rápida, ou “Abrir chamado” pra registrar com detalhes e anexos. Nosso time responde em até 1 dia útil."] },
];

// Busca local (sem IA): normaliza (minúsculas, sem acento), tira palavras vazias e casa os termos
// da pergunta com as palavras-chave de cada item (match exato + parcial por substring).
const STOP = new Set("a o e de da do das dos que como onde qual quais pra para por com em no na nos nas um uma uns umas meu minha eu quero queria preciso gostaria ajuda me se sobre ser tem ter estou está isso essa esse esta este ao aos".split(/\s+/));
function toks(s: string): string[] {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
}
const KB_TOKS = KB.map((k) => new Set([...toks(k.q), ...toks(k.keywords)]));
// Tokens do TÍTULO do tema. Empate no score era decidido pela ordem do array (o tema que
// estivesse escrito primeiro no arquivo vencia) — foi assim que "como mudo minha senha" caiu em
// "Gestão de Acessos" e "quanto vendi esse mês" caiu em "Contatos". Casar com o título vale mais.
const KB_Q_TOKS = KB.map((k) => new Set(toks(k.q)));
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
      if (best > 0 && KB_Q_TOKS[i].has(w)) s += 0.25; // bateu no título do tema: sinal mais forte
    }
    return { k, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
}

type Msg = { id: number; from: "joy" | "user"; text: string; chips?: string[]; ir?: { to: string; label: string } };
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
  // A pessoa pode OCULTAR a JOY (fica só a abinha "JOY" na borda p/ reabrir). Persistido.
  const [hidden, setHidden] = useState<boolean>(() => { try { return localStorage.getItem("joy.hidden") === "1"; } catch { return false; } });
  const idRef = useRef(0);
  const nextId = () => ++idRef.current;
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    { id: 0, from: "joy", text: "Oi! Eu sou a JOY 👋 Sua assistente aqui na Crasto.AI. Pode me perguntar qualquer coisa sobre o sistema — é só digitar ou falar no microfone. O que você quer fazer?", chips: CHIPS_INICIAIS },
  ]);
  const threadRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const speechOK = useMemo(() => typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition), []);

  useEffect(() => { threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, open]);

  // Palavras de SOCORRO: "travou", "não funciona", "deu erro"... Quem escreve isso não quer um
  // passeio pelo menu — quer alguém. Antes, "o sistema travou" casava com a palavra "sistema" e a
  // JOY respondia o tour de boas-vindas. Isso vai na frente do ranqueamento, de propósito.
  const SOCORRO = /(travou|travando|nao funciona|não funciona|nao abre|não abre|deu erro|deu pau|bugou|com bug|quebrou|parou de|urgente|reclama)/i;

  function responder(pergunta: string) {
    const q = pergunta.trim(); if (!q) return;
    setInput("");
    setMsgs((m) => [...m, { id: nextId(), from: "user", text: q }]);
    const hits = SOCORRO.test(q.normalize("NFC")) ? [{ k: KB.find((x) => x.id === "humano")!, s: 99 }] : rank(q);
    setTimeout(() => {
      if (hits.length && hits[0].s >= 1) {
        const top = hits[0].k;
        const related = hits.slice(1, 4).filter((h) => h.s >= 1).map((h) => h.k.q);
        setMsgs((m) => [...m, { id: nextId(), from: "joy", text: top.a.join("\n\n"), chips: related.length ? related : undefined, ir: top.ir }]);
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

  function ocultarJoy() { setOpen(false); setHidden(true); try { localStorage.setItem("joy.hidden", "1"); } catch { /* ok */ } }
  // Clicar na abinha "JOY" ABRE a conversa. Antes ela só devolvia o botão redondo à tela: a pessoa
  // clicava em "JOY", nada acontecia (na cabeça dela) e precisava caçar e clicar de novo no botão.
  // Quem clica em JOY quer falar com a JOY.
  function reabrirJoy() { setHidden(false); setOpen(true); try { localStorage.setItem("joy.hidden", "0"); } catch { /* ok */ } }

  // --- Arraste do FAB (mouse/toque). Distingue clique de arraste por um limiar de 6px. ---
  //
  // ⚠️ Os handlers ficam NO BOTÃO, não no <div> em volta. Estavam no div e o `setPointerCapture`
  // capturava o ponteiro NELE: com a captura ativa, o navegador entrega o `click` no ELEMENTO QUE
  // CAPTUROU (o div) em vez do botão — e o `onClick` do botão nunca rodava. Resultado: clicar na
  // JOY não abria nada. Captura e clique têm de ser no MESMO elemento.
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
      {!hidden && (
        <div className="joy-fab-wrap"
          style={fabPos ? { right: fabPos.right + "px", bottom: fabPos.bottom + "px", left: "auto", top: "auto" } : undefined}>
          <button type="button" className={"joy-fab" + (open ? " joy-fab--open" : "")}
            onPointerDown={onFabPointerDown} onPointerMove={onFabPointerMove} onPointerUp={onFabPointerUp}
            onClick={() => { if (draggedRef.current) { draggedRef.current = false; return; } setOpen((o) => !o); }}
            aria-label={open ? t("Fechar a JOY") : t("Abrir a JOY (ajuda)")} title={t("JOY · Assistente Crasto.AI · arraste para mover")}>
            {open ? <X size={22} /> : <img src="/crasto-monogram-navy.png" alt="JOY" className="joy-fab__mk" />}
            {!open && <span className="joy-fab__ping" aria-hidden="true" />}
          </button>
          {!open && (
            <button type="button" className="joy-fab-x"
              onClick={ocultarJoy} aria-label={t("Ocultar a JOY")} title={t("Ocultar a JOY (reabre na aba lateral)")}><X size={12} /></button>
          )}
        </div>
      )}

      {hidden && (
        <button type="button" className="joy-reopen" onClick={reabrirJoy}
          aria-label={t("Abrir a JOY (ajuda)")} title={t("Abrir a JOY")}>
          <img src="/crasto-monogram-navy.png" alt="" className="joy-reopen__mk" />
          <span>{t("JOY")}</span>
        </button>
      )}

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
                {m.ir && (
                  <div className="joy-chips">
                    <button type="button" className="joy-chip joy-chip--go"
                      onClick={() => { setOpen(false); nav(m.ir!.to); }}>➜ {t(m.ir.label)}</button>
                  </div>
                )}
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
