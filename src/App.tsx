import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { useIdleGuard, ultimaAtividade } from "./lib/idle";
import { services } from "./services";
import IdleModal from "./ui/IdleModal";
import Splash from "./ui/Splash";
import { preview } from "./lib/preview";
import Login from "./pages/Login";
import TwoFactorChallenge from "./pages/TwoFactorChallenge";
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
import Notificacoes from "./pages/client/Notificacoes";
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
import AdminCrm from "./pages/admin/AdminCrm";

import Entregas from "./pages/partner/Entregas";
import Comissoes from "./pages/partner/Comissoes";

function homeFor(role?: string) {
  if (role === "crasto_admin") return "/admin";
  if (role === "connector") return "/parceiro";
  return "/app";
}

export default function App() {
  const { session, profile, loading, mfaPending, mfaChecked, signOut } = useAuth();
  const isAdmin = !!session && profile?.role === "crasto_admin";
  // Segurança: "Ver como cliente" é só para admin — qualquer outro papel (ou sem sessão) limpa o preview.
  useEffect(() => { if (!isAdmin) preview.clear(); }, [isAdmin]);
  // Sessão não fica aberta para sempre: 30 min parado → pergunta; 30s sem resposta → sai.
  const idle = useIdleGuard(!!session, (motivo) => { void signOut(motivo); });
  // HEARTBEAT de ATIVIDADE REAL (relógio de ponto — lado Portal): logado, a cada 60s manda um ping SE
  // houve interação (mouse/teclado/scroll) nos últimos 90s. O backend carimba delivery.user_sessions →
  // conta trabalho ativo no Portal (que o merge une com o do WhatsApp CRM). Best-effort.
  useEffect(() => {
    if (!session) return;
    const bater = () => {
      const ult = ultimaAtividade();
      if (ult && Date.now() - ult < 90_000) services.delivery.userSession.heartbeat().catch(() => {});
    };
    bater();
    const iv = setInterval(bater, 60_000);
    return () => clearInterval(iv);
  }, [!!session]);
  // Espera o check do AAL do 2FA antes de decidir (evita piscar o app antes da tela de código).
  if (loading || (session && !profile) || (session && !mfaChecked)) {
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

  // 2FA: o usuário tem verificação em duas etapas ativa e ainda não passou o código nesta sessão →
  // segura tudo na tela de código (per-usuário; quem não ativou nunca cai aqui).
  if (session && mfaPending) {
    return <TwoFactorChallenge />;
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
          {/* Módulo embarcado (apps do Lovable) — tela cheia. :id = client_module_id (a instância). */}
          <Route path="/app/m/:id" element={<ModuleEmbed />} />
          <Route path="/app" element={<ClientShell />}>
            <Route index element={<Inicio />} />
            {/* WhatsApp CRM embarcado DENTRO da casca do Portal (sidebar + topbar do Portal ficam
                visíveis). As SEÇÕES do wacrm (Conversas/Dashboard/…/Config) são sub-itens da sidebar
                do Portal → viram /app/crm/<seção>; a raiz /app/crm = Conversas. O seletor de agente
                fica no topo do módulo; o iframe (sem a sidebar própria do wacrm) preenche o .canvas. */}
            <Route path="crm" element={<CrmEmbed />} />
            <Route path="crm/:section" element={<CrmEmbed />} />
            <Route path="modulos" element={<Modulos />} />
            <Route path="implementacao" element={<Implementacao />} />
            <Route path="solucoes" element={<Catalogo />} />
            <Route path="financeiro" element={<Financeiro />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="suporte" element={<Suporte />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="notificacoes" element={<Notificacoes />} />
          </Route>

          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<VisaoGeral />} />
            <Route path="crm" element={<AdminCrm />} />
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
