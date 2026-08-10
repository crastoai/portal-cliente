// Escopo de UNIDADE (CNPJ) — "Unidades dentro da empresa" (multi-CNPJ).
// A empresa (1 login/org) pode ter várias unidades (CNPJs). Este contexto carrega as
// unidades do cliente e a unidade ATIVA escolhida no seletor da topbar; o CrmEmbed lê a
// unidade ativa e escopa quais agentes aparecem. Provido na ClientShell (envolve topbar +
// conteúdo). `unitId = null` = "Todas as unidades".
import { createContext, useContext } from "react";

export type Unit = { id: string; name: string; cnpj: string | null; is_primary: boolean; status: string };

type Ctx = { units: Unit[]; unitId: string | null; setUnitId: (id: string | null) => void };

export const UnitScopeContext = createContext<Ctx>({ units: [], unitId: null, setUnitId: () => {} });
export const useUnitScope = () => useContext(UnitScopeContext);
