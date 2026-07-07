import { Rocket, Send } from "lucide-react";
import { useT } from "../../lib/i18n";
import TicketQueue from "./TicketQueue";

export default function Implantacoes() {
  const t = useT();
  return (
    <TicketQueue cfg={{
      kind: "implementation_request",
      title: "Solicitações de implantação",
      sub: "Módulos que os clientes pediram para a Crasto.AI implementar.",
      icon: <Rocket size={16} />,
      statusLabel: (s) => (({ open: t("Nova"), in_progress: t("Em atendimento"), resolved: t("Atendida"), closed: t("Cancelada") } as any)[s] || s),
      statusTone: (s) => (s === "resolved" ? "ok" : s === "in_progress" ? "warn" : s === "closed" ? "mute" : "info"),
      pendingLabel: (n) => t("{n} novas", { n }),
      emptyText: "Nenhuma solicitação de implantação ainda.",
      actionTemplate: "received",
      actionLabel: "Avisar que recebemos",
      actionIcon: <Send size={14} />,
      actionableWhen: (s) => s === "open",
      waText: () => `Olá! Aqui é da Crasto.AI 👋 Sobre sua solicitação de implantação.`,
      okFlash: (sent, err) => sent ? t("Cliente avisado por e-mail ✓ Solicitação em atendimento.") : t("Marcada em atendimento, mas e-mail não enviado: {e}", { e: err || "—" }),
    }} />
  );
}
