import { ShieldCheck, Percent } from "lucide-react";
import Shell, { type NavItem } from "./Shell";

const NAV: NavItem[] = [
  { to: "/parceiro", end: true, icon: ShieldCheck, label: "Entregas & prazos" },
  { to: "/parceiro/comissoes", icon: Percent, label: "Comissões (20%)" },
];

export default function PartnerShell() {
  return <Shell nav={NAV} who="Viver de IA" sub="Parceiro · leitura" logoTone="linear-gradient(145deg,#123a6b,#0a2350)" />;
}
