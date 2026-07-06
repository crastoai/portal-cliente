// ============================================================================
// Dicionário de traduções. Chave = texto em PT (origem). Só EN e ES precisam ficar.
// Faltou uma chave? O useT() cai no PT automaticamente. Adicione conforme converte telas.
// ============================================================================
import type { Lang } from "./i18n";

export const DICT: Record<string, Partial<Record<Lang, string>>> = {
  // ---- Comuns ----
  "Carregando…": { en: "Loading…", es: "Cargando…" },
  "Sair": { en: "Sign out", es: "Salir" },
  "Abrir menu": { en: "Open menu", es: "Abrir menú" },
  "Fechar menu": { en: "Close menu", es: "Cerrar menú" },
  "Salvar": { en: "Save", es: "Guardar" },
  "Cancelar": { en: "Cancel", es: "Cancelar" },
  "Adicionar": { en: "Add", es: "Añadir" },
  "Excluir": { en: "Delete", es: "Eliminar" },
  "Editar": { en: "Edit", es: "Editar" },
  "Enviar": { en: "Send", es: "Enviar" },

  // ---- Login ----
  "Entrar": { en: "Sign in", es: "Entrar" },
  "Entrando…": { en: "Signing in…", es: "Entrando…" },
  "E-mail": { en: "Email", es: "Correo" },
  "Senha": { en: "Password", es: "Contraseña" },
  "voce@empresa.com": { en: "you@company.com", es: "tu@empresa.com" },
  "Mostrar senha": { en: "Show password", es: "Mostrar contraseña" },
  "Ocultar senha": { en: "Hide password", es: "Ocultar contraseña" },
  "Esqueci minha senha": { en: "Forgot my password", es: "Olvidé mi contraseña" },
  "Use as credenciais que a Crasto.AI enviou para você.": { en: "Use the credentials Crasto.AI sent you.", es: "Usa las credenciales que Crasto.AI te envió." },
  "E-mail ou senha inválidos. Verifique e tente novamente.": { en: "Invalid email or password. Please check and try again.", es: "Correo o contraseña inválidos. Verifica e inténtalo de nuevo." },
  "O seu hub de Inteligência Artificial, num só lugar.": { en: "Your Artificial Intelligence hub, all in one place.", es: "Tu hub de Inteligencia Artificial, todo en un solo lugar." },
  "Acompanhe seus módulos, resultados e a implantação da sua IA — em tempo real, com total transparência.": { en: "Track your modules, results and your AI rollout — in real time, with full transparency.", es: "Sigue tus módulos, resultados y la implementación de tu IA — en tiempo real, con total transparencia." },
  "Portal do Cliente · acesso seguro": { en: "Client Portal · secure access", es: "Portal del Cliente · acceso seguro" },

  // ---- Shell / navegação (Admin) ----
  "Operação": { en: "Operations", es: "Operación" },
  "Financeiro & Parceiros": { en: "Finance & Partners", es: "Finanzas y Socios" },
  "Visão geral": { en: "Overview", es: "Visión general" },
  "Clientes": { en: "Clients", es: "Clientes" },
  "Catálogo de módulos": { en: "Module catalog", es: "Catálogo de módulos" },
  "Gerador de propostas": { en: "Proposal generator", es: "Generador de propuestas" },
  "Serviços & preços": { en: "Services & pricing", es: "Servicios y precios" },
  "Agentes indicadores": { en: "Referral agents", es: "Agentes de referencia" },
  "Custos & Despesas": { en: "Costs & Expenses", es: "Costos y Gastos" },
  "Receita & churn": { en: "Revenue & churn", es: "Ingresos y churn" },
  "Integrações": { en: "Integrations", es: "Integraciones" },
  "Super-admin (RLS)": { en: "Super-admin (RLS)", es: "Super-admin (RLS)" },

  // ---- Shell / navegação (Cliente) ----
  "Início": { en: "Home", es: "Inicio" },
  "Minhas Soluções": { en: "My Solutions", es: "Mis Soluciones" },
  "Minha Implementação": { en: "My Implementation", es: "Mi Implementación" },
  "Soluções disponíveis": { en: "Available solutions", es: "Soluciones disponibles" },
  "Financeiro": { en: "Billing", es: "Finanzas" },
  "Usuários & Equipe": { en: "Users & Team", es: "Usuarios y Equipo" },
  "Suporte & Ajuda": { en: "Support & Help", es: "Soporte y Ayuda" },
  "Cliente": { en: "Client", es: "Cliente" },
  "Portal do Cliente": { en: "Client Portal", es: "Portal del Cliente" },

  // ---- Shell / navegação (Parceiro) ----
  "Entregas & prazos": { en: "Deliveries & deadlines", es: "Entregas y plazos" },
  "Comissões (20%)": { en: "Commissions (20%)", es: "Comisiones (20%)" },
  "Viver de IA": { en: "Viver de IA", es: "Viver de IA" },
  "Parceiro · leitura": { en: "Partner · read-only", es: "Socio · lectura" },
};
