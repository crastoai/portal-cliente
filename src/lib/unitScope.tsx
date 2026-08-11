// Escopo de UNIDADE (CNPJ) — "Unidades dentro da empresa" (multi-CNPJ).
// A empresa (1 login/org) pode ter várias unidades (CNPJs). Este contexto carrega as
// unidades do cliente e a unidade ATIVA escolhida no seletor da topbar; o CrmEmbed lê a
// unidade ativa e escopa quais agentes aparecem. Provido na ClientShell (envolve topbar +
// conteúdo). `unitId = null` = "Todas as unidades".
//
// O seletor aparece SEMPRE (mesmo com 1 CNPJ) — mostra a matriz e permite ADICIONAR outra
// empresa (CNPJ) ali mesmo. `canManage` (dono/admin) libera o "+ Adicionar empresa";
// `createUnit` grava no wacrm (fonte das unidades) e `reload` reatualiza a lista.
import { createContext, useContext } from "react";

export type Unit = { id: string; name: string; cnpj: string | null; legal_name?: string | null; is_primary: boolean; status: string };

type Ctx = {
  units: Unit[];
  unitId: string | null;
  setUnitId: (id: string | null) => void;
  canManage: boolean;
  createUnit: (d: { name: string; cnpj?: string | null; legal_name?: string | null }) => Promise<{ error?: string; unit?: Unit }>;
  reload: () => void;
};

export const UnitScopeContext = createContext<Ctx>({
  units: [], unitId: null, setUnitId: () => {},
  canManage: false, createUnit: async () => ({ error: "indisponível" }), reload: () => {},
});
export const useUnitScope = () => useContext(UnitScopeContext);
