// ============================================================================
// CONTABILIDADE — módulo NOVO (irmão do Financeiro), 2026-08-28.
// Decisão do Crasto: módulo separado (não sub-aba do Financeiro), pois é outra
// persona (contador + dono-escriturário) e outro rigor (competência, plano de
// contas, partidas dobradas, período fechado). SSOT: LÊ os mesmos dados do
// Financeiro (finance.transactions/accounts/operational_costs) — NÃO duplica.
// Por ora é o SCAFFOLD do trilho: mostra a visão + as fases. Conteúdo entra depois.
// ============================================================================
import { PageHead } from "../../ui/ui";

const PHASES = [
  {
    n: 1, tag: "Próxima", tone: "next",
    title: "DRE gerencial por competência",
    desc: "Sem digitar nada novo: lê a receita reconhecida e os custos por competência que a Tesouraria e o A Receber já registram, e monta a Demonstração do Resultado (receita → custos → despesas → resultado).",
    itens: ["Receita por competência", "Custos e despesas por grupo", "Resultado do período", "Comparativo mês a mês"],
  },
  {
    n: 2, tag: "Depois", tone: "later",
    title: "Plano de contas + lançamentos",
    desc: "Cada movimento ganha uma conta contábil (plano de contas). Nasce o Razão e o Livro Diário — a espinha da escrituração, alimentada automaticamente pelo Financeiro.",
    itens: ["Plano de contas", "Classificação por conta", "Razão / Diário", "Partidas dobradas"],
  },
  {
    n: 3, tag: "Meta", tone: "goal",
    title: "Livro Caixa / ECD + fechamento + assinatura",
    desc: "O formal: fechamento com período travado e trilha imutável, Livro Caixa (Simples) ou ECD (Presumido/Real). A empresa escritura; o contador revisa e assina (contabilidade assistida).",
    itens: ["Fechamento do período", "Livro Caixa / ECD", "Balancete e balanço", "Assinatura do contador (CRC)"],
  },
];

export default function Contabilidade() {
  return (
    <div className="contab">
      <style>{CSS}</style>
      <PageHead
        eyebrow="Financeiro & Contabilidade"
        title="Contabilidade"
        sub="Contabilidade assistida — a empresa faz a própria escrituração; o contador revisa e assina."
      />

      <div className="contab-hero">
        <div className="contab-hero-badge">🚧 Em construção · alimentando o trilho</div>
        <h2>Tire a empresa da caixa-preta contábil.</h2>
        <p>
          Muita empresa terceiriza a contabilidade e nunca vê os próprios livros, o DRE ou o balanço.
          Este módulo traz isso para dentro: os números <b>já existem no Financeiro</b> (Tesouraria, A Pagar, A Receber) —
          aqui eles são organizados no <b>regime de competência</b>, num <b>plano de contas</b>, virando
          <b> DRE, Razão e Livros</b>. No fim, o contador só <b>revisa e assina</b>.
        </p>
        <div className="contab-note">
          <b>Uma fonte de verdade.</b> A Contabilidade <b>lê</b> os mesmos dados do Financeiro — não redigita, não duplica.
          Financeiro = caixa (tenho dinheiro?); Contabilidade = competência (qual o resultado e o patrimônio?).
        </div>
      </div>

      <div className="contab-sech"><h3>O trilho — como este módulo cresce</h3></div>
      <div className="contab-grid">
        {PHASES.map((p) => (
          <div key={p.n} className={"contab-card " + p.tone}>
            <div className="contab-card-top">
              <span className="contab-num">{p.n}</span>
              <span className={"contab-tag " + p.tone}>{p.tag}</span>
            </div>
            <h4>{p.title}</h4>
            <p>{p.desc}</p>
            <ul>{p.itens.map((it) => <li key={it}>{it}</li>)}</ul>
          </div>
        ))}
      </div>

      <div className="contab-foot">
        Enquadramento importa no escopo: <b>Simples Nacional</b> costuma exigir só <b>Livro Caixa</b> (começamos leve);
        <b> Lucro Presumido/Real</b> pedem escrituração completa (ECD). A responsabilidade legal pela escrituração e
        pela assinatura é sempre de um <b>contador com CRC</b> — o módulo é a ferramenta que prepara tudo.
      </div>
    </div>
  );
}

const CSS = `
.contab{--navy:#0B1830;--blue:var(--crasto-blue,#6E9CE8);--blue-ink:var(--crasto-blue,#2E5BB0);--line:var(--crasto-border-soft,#EDEFF3);--line2:var(--crasto-border,#E4E7EC);--muted:var(--crasto-text-muted,#6B7280);--muted2:var(--crasto-text-faint,#9AA3AF);--card:var(--crasto-surface,#fff);--hover:var(--crasto-surface-2,#F6F7F9);--txt:var(--crasto-text-primary,#0B1220);--info-bg:rgba(110,156,232,.13);--shadow:0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.06);color:var(--txt)}
.contab-hero{background:linear-gradient(180deg,#0B1830,#010E26);color:#fff;border-radius:18px;padding:26px 28px;margin:6px 0 22px;box-shadow:0 10px 30px rgba(1,14,38,.18)}
.contab-hero-badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.03em;background:rgba(255,255,255,.12);color:#DCE7FB;padding:5px 11px;border-radius:20px;margin-bottom:14px}
.contab-hero h2{font-size:22px;font-weight:800;letter-spacing:-.01em;margin:0 0 10px}
.contab-hero p{font-size:13.5px;line-height:1.6;color:#C7D4EC;max-width:760px;margin:0}
.contab-hero p b{color:#fff}
.contab-note{margin-top:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-left:3px solid var(--blue);border-radius:12px;padding:12px 15px;font-size:12.5px;line-height:1.55;color:#D6E0F2}
.contab-note b{color:#fff}
.contab-sech{margin:20px 0 12px}
.contab-sech h3{font-size:16px;font-weight:800;color:var(--txt)}
.contab-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.contab-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;box-shadow:var(--shadow)}
.contab-card.next{border-color:var(--blue);box-shadow:0 0 0 1px var(--blue),var(--shadow)}
.contab-card-top{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.contab-num{width:28px;height:28px;border-radius:9px;background:var(--navy);color:#fff;font-weight:800;font-size:14px;display:inline-flex;align-items:center;justify-content:center}
.contab-tag{font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:4px 9px;border-radius:20px}
.contab-tag.next{background:var(--info-bg);color:var(--blue-ink)}
.contab-tag.later{background:var(--hover);color:var(--muted)}
.contab-tag.goal{background:rgba(224,128,31,.14);color:#B45309}
.contab-card h4{font-size:14.5px;font-weight:800;color:var(--txt);margin:0 0 7px}
.contab-card p{font-size:12.5px;line-height:1.55;color:var(--muted);margin:0 0 12px}
.contab-card ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.contab-card li{font-size:12px;color:var(--txt);padding-left:18px;position:relative}
.contab-card li::before{content:"";position:absolute;left:2px;top:6px;width:6px;height:6px;border-radius:50%;background:var(--blue)}
.contab-foot{margin-top:18px;background:var(--info-bg);border:1px solid var(--line2);border-radius:12px;padding:13px 15px;font-size:12px;line-height:1.55;color:var(--muted)}
.contab-foot b{color:var(--txt)}
@media(max-width:960px){.contab-grid{grid-template-columns:1fr}}
`;
