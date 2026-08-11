-- 042: Regime tributário da empresa (ficha RH / custo de colaborador · Fatia 3).
-- Muda o custo do empregador (Simples não paga INSS patronal 20% + Sistema S na folha; Presumido/Real
-- pagam). Padrão 'simples' (caso do microempresário). Valores: 'simples' | 'presumido' | 'real'.
-- Só o dono/presidente edita (gating no controller). Aditivo e reversível.
alter table public.organizations add column if not exists tax_regime text not null default 'simples';

-- DOWN: alter table public.organizations drop column if exists tax_regime;
