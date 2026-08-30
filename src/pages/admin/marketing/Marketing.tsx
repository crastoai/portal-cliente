import { useParams } from "react-router-dom";
import MarketingCockpit from "./Cockpit";
import BrandKit from "./BrandKit";

// Shell do módulo Marketing (NATIVO no portal). Espelha o padrão do Financeiro:
// um componente + :secao decide a sub-tela. Raiz = Cockpit. As demais telas
// (Brand Kit, Vídeos Virais, Imagens, Calendário, Automação, Mídia Paga) são
// ligadas ao back uma a uma (tela por tela) — por enquanto placeholder.
export default function Marketing() {
  const { secao } = useParams();
  switch (secao) {
    case undefined:
    case "":
    case "cockpit":
      return <MarketingCockpit />;
    case "brand-kit":
      return <BrandKit />;
    default:
      return (
        <div className="mkt-root">
          <div className="eyebrow">Marketing</div>
          <h1 className="page-title">{titulo(secao)}</h1>
          <p className="page-sub">Esta tela está sendo ligada ao back — em construção.</p>
          <div className="cock-note">Em breve, ligada ao banco `marketing` (mesma pilha da Cockpit).</div>
        </div>
      );
  }
}

function titulo(s?: string) {
  const m: Record<string, string> = {
    "brand-kit": "Brand Kit", videos: "Vídeos Virais", cortes: "Cortes",
    avatar: "Meus Avatares/Clone", roteiros: "Gerador de Roteiros", imagens: "Imagens & Carrossel",
    calendario: "Calendário de Marketing", automacao: "Agendamento & Automação", "midia-paga": "Mídia Paga (Tráfego Pago)",
  };
  return (s && m[s]) || "Marketing";
}
