-- ============================================================
-- 008 — Pedidos de blocos (kanban de reposição)
--
-- Um registro por SKU de cada pedido feito ao fornecedor, em
-- pallets. O pedido não é "baixado" à mão: o sistema considera
-- atendido o que entrar como recebimento (alvenaria_estoque, tipo
-- entrada) do mesmo SKU a partir da data do pedido, na ordem dos
-- pedidos. O que sobra é o "em aberto".
--
--   status  pedido     pedido feito, aguardando
--           transito   fornecedor confirmou saída / está a caminho
--
-- Sem DELETE: cancelar um pedido é exclusão lógica (excluido_em).
-- ============================================================

create table if not exists public.alvenaria_pedidos (
  id                 uuid primary key default gen_random_uuid(),
  data               date not null default current_date,
  sku                text not null,
  pallets            integer not null check (pallets > 0),
  blocos_por_pallet  integer not null check (blocos_por_pallet > 0),
  status             text not null default 'pedido' check (status in ('pedido', 'transito')),
  previsao           date,
  observacao         text not null default '',
  autor              text not null default '',
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  excluido_em        timestamptz
);

comment on table public.alvenaria_pedidos is
  'Pedidos de blocos ao fornecedor, por SKU, em pallets. Atendimento calculado pelos recebimentos (alvenaria_estoque).';

create index if not exists alvenaria_pedidos_sku_data
  on public.alvenaria_pedidos (sku, data) where excluido_em is null;

alter table public.alvenaria_pedidos enable row level security;

drop policy if exists "logados leem alvenaria_pedidos"    on public.alvenaria_pedidos;
drop policy if exists "logados gravam alvenaria_pedidos"  on public.alvenaria_pedidos;
drop policy if exists "logados alteram alvenaria_pedidos" on public.alvenaria_pedidos;

create policy "logados leem alvenaria_pedidos"
  on public.alvenaria_pedidos for select to authenticated using (true);
create policy "logados gravam alvenaria_pedidos"
  on public.alvenaria_pedidos for insert to authenticated
  with check (public.alvenaria_pode_gravar());
create policy "logados alteram alvenaria_pedidos"
  on public.alvenaria_pedidos for update to authenticated
  using (public.alvenaria_pode_gravar())
  with check (public.alvenaria_pode_gravar());
-- sem política de DELETE de propósito: exclusão é sempre lógica (excluido_em)
