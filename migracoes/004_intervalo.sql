-- ============================================================
-- MIGRAÇÃO 004 — O APONTAMENTO PASSA A TER INTERVALO
-- Villa Ninita · Poço da Panela · Rio Ave
--
-- POR QUE
--   Uma parede raramente nasce e termina no mesmo dia. Até aqui o
--   lançamento guardava uma data só, e com isso a RUP (m²/dia) saía
--   errada: uma parede levantada em três dias contava como um dia
--   de trabalho.
--
-- O QUE FAZ
--   Acrescenta 'data_inicio'. A coluna 'data' continua existindo e
--   continua sendo a data de REFERÊNCIA do lançamento — o dia em que
--   aquele percentual passou a valer, ou seja, o fim do intervalo.
--   É ela que ordena o histórico e decide qual é o apontamento mais
--   recente de cada peça; nada disso muda.
--
--     data_inicio  quando a equipe começou aquele trecho
--     data         quando terminou / em que dia foi medido
--
--   Tudo é aditivo. Os lançamentos que já existem recebem
--   data_inicio = data, que é o que eles sempre significaram:
--   um dia só.
--
-- COMO RODAR
--   Supabase > SQL Editor > New query > cole este arquivo > Run.
--   Deve aparecer "Success. No rows returned". Pode rodar de novo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. A data de início
-- ------------------------------------------------------------
alter table public.alvenaria_apontamentos
  add column if not exists data_inicio date;

-- lançamento antigo era de um dia só
update public.alvenaria_apontamentos
   set data_inicio = data
 where data_inicio is null;

alter table public.alvenaria_apontamentos
  alter column data_inicio set default current_date;

-- ------------------------------------------------------------
-- 2. O intervalo tem que fazer sentido
--
--    Nulo é aceito de propósito: se um dia entrar linha por outro
--    caminho sem o início, ela não é rejeitada — a tela trata nulo
--    como "mesmo dia".
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'alvenaria_apont_intervalo_valido'
  ) then
    alter table public.alvenaria_apontamentos
      add constraint alvenaria_apont_intervalo_valido
      check (data_inicio is null or data_inicio <= data);
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. A visão passa a entregar o intervalo inteiro
--
--    'create or replace' não serve: ele não deixa inserir coluna no
--    meio da lista. Visão não guarda dado, derrubar não custa nada.
-- ------------------------------------------------------------
drop view if exists public.alvenaria_atual;

create view public.alvenaria_atual
with (security_invoker = true) as
select distinct on (pavimento, parede, servico)
  pavimento, parede, servico, data_inicio, data, percentual,
  area_m2, metros_m, equipe, autor, criado_em
from public.alvenaria_apontamentos
where excluido_em is null
order by pavimento, parede, servico, data desc, criado_em desc;

-- ------------------------------------------------------------
-- 4. Índice para varrer período
--
--    A produção por equipe filtra por 'data' e abre os dias do
--    intervalo para calcular a RUP.
-- ------------------------------------------------------------
create index if not exists alvenaria_apont_periodo_idx
  on public.alvenaria_apontamentos (data, data_inicio)
  where excluido_em is null;
