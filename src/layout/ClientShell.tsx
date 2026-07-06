import { Home, LayoutGrid, Activity, Sparkles, Wallet, Users, LifeBuoy } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useAsync } from "../ui/ui";
import { services } from "../services";
import Shell, { type NavItem } from "./Shell";

export default function ClientShell() {
  const { profile } = useAuth();
  // "Minha Implementação" só aparece enquanto a implantação não terminou (< 100%).
  const { data: impl } = useAsync(() => services.delivery.implementations.getMine(), []);
  const implDone = impl ? (((impl as any).overall_progress ?? 0) >= 100 || (impl as any).status === "delivered") : false;

  const nav: NavItem[] = [
    { to: "/app", end: true, icon: Home, label: "Início" },
    { to: "/app/modulos", icon: LayoutGrid, label: "Minhas Soluções" },
    ...(!implDone ? [{ to: "/app/implementacao", icon: Activity, label: "Minha Implementação" }] : []),
    { to: "/app/solucoes", icon: Sparkles, label: "Soluções disponíveis" },
    { to: "/app/financeiro", icon: Wallet, label: "Financeiro" },
    { to: "/app/usuarios", icon: Users, label: "Usuários & Equipe" },
    { to: "/app/suporte", icon: LifeBuoy, label: "Suporte & Ajuda" },
  ];

  return <Shell nav={nav} who={profile?.full_name || "Cliente"} sub="Portal do Cliente" logoTone="linear-gradient(145deg,#1F8A5B,#0d5c3a)" />;
}
