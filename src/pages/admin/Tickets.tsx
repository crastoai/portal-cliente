import { LifeBuoy, CheckCircle2 } from "lucide-react";
import { useT } from "../../lib/i18n";
import TicketQueue from "./TicketQueue";

export default function Tickets() {
  const t = useT();
  return (
    <TicketQueue cfg={{
      kind: "support",
      title: "Chamados & Suporte",
      sub: "Fila de tickets dos clientes.",
      icon: <LifeBuoy size={16} />,
      statusLabel: (s) => (({ open: t("Aberto"), in_progress: t("Em andamento"), resolved: t("Resolvido"), closed: t("Fechado") } as any)[s] || s),
      statusTone: (s) => (s === "resolved" || s === "closed" ? "ok" : s === "in_progress" ? "warn" : "info"),
      pendingLabel: (n) => t("{n} abertos", { n }),
      emptyText: "Nenhum chamado ainda.",
      actionTemplate: "resolved",
      actionLabel: "Avisar que foi resolvido",
      actionIcon: <CheckCircle2 size={14} />,
      actionableWhen: (s) => s !== "resolved" && s !== "closed",
      waText: (num) => `Olá! Aqui é da Crasto.AI 👋 Sobre seu chamado #${num}.`,
      okFlash: (sent, err) => sent ? t("Cliente avisado por e-mail ✓ Chamado resolvido.") : t("Chamado resolvido, mas e-mail não enviado: {e}", { e: err || "—" }),
    }} />
  );
}
