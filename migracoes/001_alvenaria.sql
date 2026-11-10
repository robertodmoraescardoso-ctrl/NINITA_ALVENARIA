-- ============================================================
-- MIGRAÇÃO 001 — ALVENARIA DE VEDAÇÃO
-- Villa Ninita · Poço da Panela · Rio Ave
--
-- O QUE FAZ
--   Cria as tabelas do zero, num projeto Supabase novo e só desta
--   obra. Não depende de nada do sistema de serviços.
--
--   alvenaria_equipes        as equipes e empreiteiros que executam
--   alvenaria_apontamentos   um registro por lançamento do apontador:
--                            parede, data, % executado, m², equipe e
--                            quem lançou. O histórico fica inteiro,
--                            nada é sobrescrito.
--   alvenaria_plano          responsável e prazo previsto de cada
--                            parede (um registro por parede)
--   alvenaria_atual          visão com o último apontamento de cada
--                            parede, que é o que o painel lê
--
--   O CATÁLOGO DAS PAREDES NÃO FICA AQUI. As 1.272 paredes, com área,
--   blocos e espessura, vêm das pranchas da Tecomat e moram no próprio
--   repositório, em assets/dados/, junto com as plantas: são projeto,
--   não obra, e mudam só quando sai revisão nova.
--
-- COMO RODAR
--   Supabase > SQL Editor > New query > cole este arquivo > Run.
--   Deve aparecer "Success. No rows returned". Pode rodar de novo.
--
-- DEPOIS DE RODAR
--   Cadastre em Authentication > Users quem vai apontar. Sem usuário
--   ninguém entra, e sem entrar ninguém grava.
-- ============================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ------------------------------------------------------------
-- 1. Equipes
--
--    É quem executa a parede: equipe própria, empreiteiro ou
--    pedreiro. Entra pela própria página, na aba Equipes.
-- ------------------------------------------------------------
create table if not exists public.alvenaria_equipes (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(trim(nome)) > 0),
  empresa        text not null default '',
  observacao     text not null default '',
  ativa          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  excluido_em    timestamptz                       -- exclusão lógica: nunca DELETE
);

-- o mesmo nome não se repete entre as equipes ativas
create unique index if not exists alvenaria_equipes_nome_unico
  on public.alvenaria_equipes (lower(trim(nome))) where excluido_em is null;

-- ------------------------------------------------------------
-- 2. Apontamentos (um por lançamento, nunca sobrescrito)
--
--    pavimento: TE, TP01..TP06, SEMI, ACAD, COB
--    parede:    PR001..PR124, SH001..SH065
--    Os dois juntos são a chave da peça no catálogo.
--
--    area_m2 fica nulo onde não há quantitativo de projeto
--    (semienterrado, academia, cobertura e os 6 shafts do térreo
--    cuja tabela não traz bloco de vedação). Nesses casos só o
--    percentual tem sentido.
--
--    A equipe é guardada pelo NOME, não por id: o nome é o que o
--    apontador digitou naquele dia, e renomear uma equipe depois
--    não pode reescrever a história do que foi medido.
-- ------------------------------------------------------------
create table if not exists public.alvenaria_apontamentos (
  id           uuid primary key default gen_random_uuid(),
  pavimento    text not null check (pavimento ~ '^[A-Z]{2,4}[0-9]{0,2}$'),
  parede       text not null check (parede ~ '^(PR|SH)[0-9]{3}$'),
  data         date not null,
  percentual   numeric not null check (percentual >= 0 and percentual <= 100),
  area_m2      numeric check (area_m2 is null or area_m2 >= 0),
  equipe       text not null default '',
  observacao   text not null default '',
  autor        text not null default '',          -- e-mail de quem lançou
  criado_em    timestamptz not null default now(),
  excluido_em  timestamptz
);

create index if not exists alvenaria_apont_peca_idx
  on public.alvenaria_apontamentos (pavimento, parede) where excluido_em is null;
create index if not exists alvenaria_apont_data_idx
  on public.alvenaria_apontamentos (data) where excluido_em is null;
create index if not exists alvenaria_apont_equipe_idx
  on public.alvenaria_apontamentos (equipe) where excluido_em is null;

-- ------------------------------------------------------------
-- 3. Planejamento (um registro por parede)
-- ------------------------------------------------------------
create table if not exists public.alvenaria_plano (
  id             uuid primary key default gen_random_uuid(),
  pavimento      text not null check (pavimento ~ '^[A-Z]{2,4}[0-9]{0,2}$'),
  parede         text not null check (parede ~ '^(PR|SH)[0-9]{3}$'),
  responsavel    text not null default '',
  inicio         date,
  fim            date,
  observacao     text not null default '',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  excluido_em    timestamptz,
  constraint alvenaria_plano_prazo_coerente
    check (inicio is null or fim is null or fim >= inicio)
);

create unique index if not exists alvenaria_plano_peca_unico
  on public.alvenaria_plano (pavimento, parede) where excluido_em is null;
create index if not exists alvenaria_plano_fim_idx
  on public.alvenaria_plano (fim) where excluido_em is null;

-- ------------------------------------------------------------
-- 4. Situação atual: o último apontamento de cada parede
--
--    security_invoker faz a visão respeitar o RLS da tabela de
--    baixo, em vez de rodar com os poderes de quem a criou.
-- ------------------------------------------------------------
create or replace view public.alvenaria_atual
with (security_invoker = true) as
select distinct on (pavimento, parede)
  pavimento, parede, data, percentual, area_m2, equipe, autor, criado_em
from public.alvenaria_apontamentos
where excluido_em is null
order by pavimento, parede, data desc, criado_em desc;

-- ------------------------------------------------------------
-- 5. Acesso: só usuários logados
-- ------------------------------------------------------------
alter table public.alvenaria_equipes       enable row level security;
alter table public.alvenaria_apontamentos  enable row level security;
alter table public.alvenaria_plano         enable row level security;

drop policy if exists "logados leem alvenaria_equipes"    on public.alvenaria_equipes;
drop policy if exists "logados gravam alvenaria_equipes"  on public.alvenaria_equipes;
drop policy if exists "logados alteram alvenaria_equipes" on public.alvenaria_equipes;
create policy "logados leem alvenaria_equipes"    on public.alvenaria_equipes for select to authenticated using (true);
create policy "logados gravam alvenaria_equipes"  on public.alvenaria_equipes for insert to authenticated with check (true);
create policy "logados alteram alvenaria_equipes" on public.alvenaria_equipes for update to authenticated using (true) with check (true);

drop policy if exists "logados leem alvenaria_apontamentos"    on public.alvenaria_apontamentos;
drop policy if exists "logados gravam alvenaria_apontamentos"  on public.alvenaria_apontamentos;
drop policy if exists "logados alteram alvenaria_apontamentos" on public.alvenaria_apontamentos;
create policy "logados leem alvenaria_apontamentos"    on public.alvenaria_apontamentos for select to authenticated using (true);
create policy "logados gravam alvenaria_apontamentos"  on public.alvenaria_apontamentos for insert to authenticated with check (true);
create policy "logados alteram alvenaria_apontamentos" on public.alvenaria_apontamentos for update to authenticated using (true) with check (true);

drop policy if exists "logados leem alvenaria_plano"    on public.alvenaria_plano;
drop policy if exists "logados gravam alvenaria_plano"  on public.alvenaria_plano;
drop policy if exists "logados alteram alvenaria_plano" on public.alvenaria_plano;
create policy "logados leem alvenaria_plano"    on public.alvenaria_plano for select to authenticated using (true);
create policy "logados gravam alvenaria_plano"  on public.alvenaria_plano for insert to authenticated with check (true);
create policy "logados alteram alvenaria_plano" on public.alvenaria_plano for update to authenticated using (true) with check (true);
-- sem política de DELETE de propósito: exclusão é sempre lógica (excluido_em)
