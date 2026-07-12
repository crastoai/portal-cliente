import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
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
import Perfil from "./pages/Perfil";

import VisaoGeral from "./pages/admin/VisaoGeral";
import Clientes from "./pages/admin/Clientes";
import ClienteDetalhe from "./pages/admin/ClienteDetalhe";
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
  const { session, profile, loading } = useAuth();
  const isAdmin = !!session && profile?.role === "crasto_admin";
  // Segurança: "Ver como cliente" é só para admin — qualquer outro papel (ou sem sessão) limpa o preview.
  useEffect(() => { if (!isAdmin) preview.clear(); }, [isAdmin]);
  if (loading || (session && !profile)) {
    return <div style={{ padding: 40, color: "var(--crasto-text-muted)" }}>Carregando…</div>;
  }
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
    <Routes>
      <Route path="/login" element={session ? <Navigate to={home} replace /> : <Login />} />
      {/* Fluxo de senha — sempre acessível (a sessão de recuperação cai em /nova-senha) */}
      <Route path="/redefinir" element={<ResetRequest />} />
      <Route path="/nova-senha" element={<NewPassword />} />

      {session && (
        <>
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
            <Route path="cliente/:id" element={<ClienteDetalhe />} />
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
  );
}
