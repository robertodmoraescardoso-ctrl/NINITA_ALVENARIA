-- ============================================================
-- 007 — Estoque: envio para o andar, devolução, quebra e avulsos
--
-- Por que: com só entrada e contagem, o material que o guincho já
-- levou para o andar (e ainda não virou parede) aparecia como
-- consumido, inflando o "% acima do projeto". E contar só pallets
-- inteiros deixava de fora o pallet aberto de cada SKU.
--
-- Tipos de movimento:
--   entrada    chegou na obra                      (+ almoxarifado)
--   envio      almoxarifado → pavimento/apartamento (− almox, + andar)
--   devolucao  sobra do andar volta                 (+ almox, − andar)
--   quebra     perda/avaria no almoxarifado         (− almox)
--   contagem   contagem física do ALMOXARIFADO: acerta o saldo
--
-- avulsos = blocos soltos além dos pallets inteiros (pallet aberto).
-- A tabela ainda não tem lançamentos reais (criada hoje), então a
-- coluna gerada blocos pode ser refeita sem perda.
-- ============================================================

alter table public.alvenaria_estoque
  add column if not exists avulsos integer not null default 0 check (avulsos >= 0),
  add column if not exists pavimento text not null default '',
  add column if not exists apartamento text not null default '';

alter table public.alvenaria_estoque drop constraint if exists alvenaria_estoque_tipo_check;
alter table public.alvenaria_estoque add constraint alvenaria_estoque_tipo_check
  check (tipo in ('entrada', 'envio', 'devolucao', 'quebra', 'contagem'));

-- envio e devolução precisam dizer de/para qual pavimento
alter table public.alvenaria_estoque drop constraint if exists alvenaria_estoque_destino;
alter table public.alvenaria_estoque add constraint alvenaria_estoque_destino
  check (tipo not in ('envio', 'devolucao') or pavimento <> '');

alter table public.alvenaria_estoque drop column if exists blocos;
alter table public.alvenaria_estoque
  add column blocos integer generated always as (pallets * blocos_por_pallet + avulsos) stored;

comment on column public.alvenaria_estoque.avulsos is 'Blocos soltos além dos pallets inteiros.';
comment on column public.alvenaria_estoque.pavimento is 'Envio/devolução: pavimento de destino/origem (TE, TP01...).';
comment on column public.alvenaria_estoque.apartamento is 'Envio/devolução: apartamento (01A...) ou vazio = andar inteiro.';
