-- 030_ai_usage_deepseek_provider.sql
-- Permite provider='deepseek' (e 'elevenlabs') em finance.ai_usage.
--
-- Bug encontrado 2026-08-04: o sync de custo de IA falhava pro DeepSeek com
-- "new row for relation ai_usage violates check constraint ai_usage_provider_check".
-- A constraint só listava anthropic/openai/google/elevenlabs/other — DeepSeek (o LLM
-- que passamos a usar por-cliente pra cortar custo) era REJEITADO pelo banco, então
-- o custo dele nunca aparecia no financeiro. Aqui abrimos a lista.

alter table finance.ai_usage drop constraint if exists ai_usage_provider_check;
alter table finance.ai_usage add constraint ai_usage_provider_check
  check (provider is null or provider in ('anthropic','openai','google','deepseek','elevenlabs','other'));
