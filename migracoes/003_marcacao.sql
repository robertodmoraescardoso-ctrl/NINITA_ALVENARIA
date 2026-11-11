-- ============================================================
-- MIGRAÇÃO 003 — MARCAÇÃO COMO SERVIÇO PRÓPRIO
-- Villa Ninita · Poço da Panela · Rio Ave
--
-- O QUE FAZ
--   A alvenaria tem dois serviços que se medem em unidades
--   diferentes:
--
--     elevacao   subir a parede   — mede em m²
--     marcacao   a 1ª fiada       — mede em metro linear
--
--   Até aqui o apontamento só servia à elevação. Esta migração
--   acrescenta a coluna 'servico' e a quantidade em metros, e
--   refaz a visão alvenaria_atual para dar o último apontamento
--   de cada parede POR SERVIÇO.
--
--   Tudo é aditivo. Os apontamentos que já existem recebem
--   servico = 'elevacao', que é o que eles sempre foram.
--
-- COMO RODAR
--   Supabase > SQL Editor > New query > cole este arquivo > Run.
--   Deve aparecer "Success. No rows returned". Pode rodar de novo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Serviço e quantidade em metros
-- ------------------------------------------------------------
alter table public.alvenaria_apontamentos
  add column if not exists servico text not null default 'elevacao';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'alvenaria_apont_servico_valido'
  ) then
    alter table public.alvenaria_apontamentos
      add constraint alvenaria_apont_servico_valido
      check (servico in ('elevacao', 'marcacao'));
  end if;
end $$;

-- metro linear executado; fica nulo onde a parede não tem
-- comprimento levantado (shafts, semienterrado e academia)
alter table public.alvenaria_apontamentos
  add column if not exists metros_m numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'alvenaria_apont_metros_positivo'
  ) then
    alter table public.alvenaria_apontamentos
      add constraint alvenaria_apont_metros_positivo
      check (metros_m is null or metros_m >= 0);
  end if;
end $$;

create index if not exists alvenaria_apont_servico_idx
  on public.alvenaria_apontamentos (pavimento, parede, servico)
  where excluido_em is null;

-- ------------------------------------------------------------
-- 2. Situação atual passa a ser por serviço
--
--    Antes: um registro por parede. Agora: um por parede e
--    serviço, senão a marcação sobrescreveria a elevação.
-- ------------------------------------------------------------
create or replace view public.alvenaria_atual
with (security_invoker = true) as
select distinct on (pavimento, parede, servico)
  pavimento, parede, servico, data, percentual, area_m2, metros_m, equipe, autor, criado_em
from public.alvenaria_apontamentos
where excluido_em is null
order by pavimento, parede, servico, data desc, criado_em desc;

-- ------------------------------------------------------------
-- 3. Planejamento continua por parede, não por serviço
--
--    Responsável e prazo valem para a peça inteira. Se um dia for
--    preciso separar prazo de marcação e de elevação, é outra
--    migração — e aí alvenaria_plano ganha a mesma coluna.
-- ------------------------------------------------------------
