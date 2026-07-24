import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { useIdleGuard } from "./lib/idle";
import IdleModal from "./ui/IdleModal";
import Splash from "./ui/Splash";
import { preview } from "./lib/preview";
import Login from "./pages/Login";
import ResetRequest from "./pages/ResetRequest";
import NewPassword from "./pages/NewPassword";
import ClientShell from "./layout/ClientShell";
import AdminShell from "./layout/AdminShell";
import PartnerShell from "./layout/PartnerShell";

import Inicio from "./pages/client/Inicio";
import Modulos from "./pages/client/Modulos";
import Implementacao from "./pages/client/Implementacao";
import Catalogo from "./pages/client/Catalogo";
import Financeiro from "./pages/client/Financeiro";
import Usuarios from "./pages/client/Usuarios";
import Suporte from "./pages/client/Suporte";
import CrmEmbed from "./pages/client/CrmEmbed";
import ModuleEmbed from "./pages/client/ModuleEmbed";
import Perfil from "./pages/Perfil";

import VisaoGeral from "./pages/admin/VisaoGeral";
import Clientes from "./pages/admin/Clientes";
import CrmDetalhe from "./pages/admin/CrmDetalhe";
import Propostas from "./pages/admin/Propostas";
import Servicos from "./pages/admin/Servicos";
import Conectores from "./pages/admin/Conectores";
import CatalogoModulos from "./pages/admin/CatalogoModulos";
import Custos from "./pages/admin/Custos";
import Receita from "./pages/admin/Receita";
import Integracoes from "./pages/admin/Integracoes";
import ContasPagar from "./pages/admin/ContasPagar";
import ContasReceber from "./pages/admin/ContasReceber";
import CustosOperacionais from "./pages/admin/CustosOperacionais";
import CustoIA from "./pages/admin/CustoIA";
import FinanceiroAdmin from "./pages/admin/Financeiro";
import ConsoleHealthCheck from "./pages/admin/ConsoleHealthCheck";
import ConsoleAuditoria from "./pages/admin/ConsoleAuditoria";
import ConsoleModelos from "./pages/admin/ConsoleModelos";
import ConsolePermissoes from "./pages/admin/ConsolePermissoes";
import ConsoleMemorias from "./pages/admin/ConsoleMemorias";
import ConsoleRegras from "./pages/admin/ConsoleRegras";
import ConsoleSkills from "./pages/admin/ConsoleSkills";
import Tickets from "./pages/admin/Tickets";
import Implantacoes from "./pages/admin/Implantacoes";

import Entregas from "./pages/partner/Entregas";
import Comissoes from "./pages/partner/Comissoes";

function homeFor(role?: string) {
  if (role === "crasto_admin") return "/admin";
  if (role === "connector") return "/parceiro";
  return "/app";
}

export default function App() {
  const { session, profile, loading, signOut } = useAuth();
  const isAdmin = !!session && profile?.role === "crasto_admin";
  // Segurança: "Ver como cliente" é só para admin — qualquer outro papel (ou sem sessão) limpa o preview.
  useEffect(() => { if (!isAdmin) preview.clear(); }, [isAdmin]);
  // Sessão não fica aberta para sempre: 10 min parado → pergunta; 30s sem resposta → sai.
  const idle = useIdleGuard(!!session, (motivo) => { void signOut(motivo); });
  if (loading || (session && !profile)) {
    return <Splash />;
  }
  const aviso = idle.avisando && !!session ? (
    <IdleModal restante={idle.restante} onContinuar={idle.continuar} onSair={() => void signOut("escolha")} />
  ) : null;
  const home = homeFor(profile?.role);
  const mustChange = (session?.user?.user_metadata as any)?.must_change_password === true;

  // Bloqueio de segurança: senha temporária (admin) → obriga o cliente a definir a própria.
  if (session && mustChange) {
    return (
      <Routes>
        <Route path="/nova-senha" element={<NewPassword />} />
        <Route path="*" element={<Navigate to="/nova-senha" replace />} />
      </Routes>
    );
  }

  return (
    <>
      {aviso}
      <Routes>
      <Route path="/login" element={session ? <Navigate to={home} replace /> : <Login />} />
      {/* Fluxo de senha — sempre acessível (a sessão de recuperação cai em /nova-senha) */}
      <Route path="/redefinir" element={<ResetRequest />} />
      <Route path="/nova-senha" element={<NewPassword />} />

      {session && (
        <>
          {/* WhatsApp CRM embarcado = TELA CHEIA (fora da casca do Portal): a sidebar do
              Portal some, aparece a do CRM, e no topo a faixa "Voltar ao Portal". */}
          <Route path="/app/crm" element={<CrmEmbed />} />
          {/* Qualquer outro módulo embarcado (hoje apps do Lovable) — mesma tela cheia.
              :id é o client_module_id, ou seja, a INSTÂNCIA daquele cliente. */}
          <Route path="/app/m/:id" element={<ModuleEmbed />} />
          <Route path="/app" element={<ClientShell />}>
            <Route index element={<Inicio />} />
            <Route path="modulos" element={<Modulos />} />
            <Route path="implementacao" element={<Implementacao />} />
            <Route path="solucoes" element={<Catalogo />} />
            <Route path="financeiro" element={<Financeiro />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="suporte" element={<Suporte />} />
            <Route path="perfil" element={<Perfil />} />
          </Route>

          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<VisaoGeral />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="cliente/:id" element={<CrmDetalhe />} />
            <Route path="propostas" element={<Propostas />} />
            <Route path="servicos" element={<Servicos />} />
            <Route path="conectores" element={<Conectores />} />
            <Route path="catalogo" element={<CatalogoModulos />} />
            <Route path="custos" element={<Custos />} />
            <Route path="receita" element={<Receita />} />
            <Route path="integracoes" element={<Integracoes />} />
            <Route path="contas-pagar" element={<ContasPagar />} />
            <Route path="contas-receber" element={<ContasReceber />} />
            <Route path="custos-operacionais" element={<CustosOperacionais />} />
            <Route path="financeiro" element={<FinanceiroAdmin />} />
            <Route path="custo-ia" element={<CustoIA />} />
            {/* Console · IA (admin) — camada operacional dos agentes */}
            <Route path="console/health" element={<ConsoleHealthCheck />} />
            <Route path="console/memorias" element={<ConsoleMemorias />} />
            <Route path="console/regras" element={<ConsoleRegras />} />
            <Route path="console/permissoes" element={<ConsolePermissoes />} />
            <Route path="console/auditoria" element={<ConsoleAuditoria />} />
            <Route path="console/modelos" element={<ConsoleModelos />} />
            <Route path="console/skills" element={<ConsoleSkills />} />
            <Route path="tickets" element={<Tickets />} />
            <Route path="implantacoes" element={<Implantacoes />} />
            <Route path="perfil" element={<Perfil />} />
          </Route>

          <Route path="/parceiro" element={<PartnerShell />}>
            <Route index element={<Entregas />} />
            <Route path="comissoes" element={<Comissoes />} />
          </Route>
        </>
      )}

      <Route path="*" element={<Navigate to={session ? home : "/login"} replace />} />
      </Routes>
    </>
  );
}
