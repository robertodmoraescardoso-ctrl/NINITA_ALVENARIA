-- ============================================================
-- 006 — Estoque de blocos
--
-- Um estoque só, central, da obra. Dois tipos de movimento,
-- sempre em PALLETS INTEIROS:
--
--   entrada   material que chegou (recebimento)
--   contagem  contagem física do almoxarifado: diz quanto HAVIA
--             naquele dia; é ela que revela o consumo a mais
--
-- A saída não é lançada: o consumo de projeto vem dos
-- apontamentos de elevação (blocos de projeto × % levantado).
--
-- blocos_por_pallet é gravado em cada linha (cópia da tabela do
-- almoxarifado naquele dia): se o fornecedor mudar o pallet, o
-- histórico não muda de valor.
--
-- Sem DELETE: exclusão lógica por excluido_em, como no resto.
-- ============================================================

create table if not exists public.alvenaria_estoque (
  id                 uuid primary key default gen_random_uuid(),
  tipo               text not null check (tipo in ('entrada', 'contagem')),
  data               date not null default current_date,
  sku                text not null,
  pallets            integer not null check (pallets >= 0),
  blocos_por_pallet  integer not null check (blocos_por_pallet > 0),
  blocos             integer generated always as (pallets * blocos_por_pallet) stored,
  observacao         text not null default '',
  autor              text not null default '',
  criado_em          timestamptz not null default now(),
  excluido_em        timestamptz
);

comment on table public.alvenaria_estoque is
  'Movimentos do estoque central de blocos: entrada (recebimento) e contagem (física). Saída vem dos apontamentos de elevação.';

create index if not exists alvenaria_estoque_sku_data
  on public.alvenaria_estoque (sku, data) where excluido_em is null;

alter table public.alvenaria_estoque enable row level security;

drop policy if exists "logados leem alvenaria_estoque"    on public.alvenaria_estoque;
drop policy if exists "logados gravam alvenaria_estoque"  on public.alvenaria_estoque;
drop policy if exists "logados alteram alvenaria_estoque" on public.alvenaria_estoque;

create policy "logados leem alvenaria_estoque"
  on public.alvenaria_estoque for select to authenticated using (true);
create policy "logados gravam alvenaria_estoque"
  on public.alvenaria_estoque for insert to authenticated
  with check (public.alvenaria_pode_gravar());
create policy "logados alteram alvenaria_estoque"
  on public.alvenaria_estoque for update to authenticated
  using (public.alvenaria_pode_gravar())
  with check (public.alvenaria_pode_gravar());
-- sem política de DELETE de propósito: exclusão é sempre lógica (excluido_em)
