-- ============================================================
-- MIGRAÇÃO 002 — PERFIS DE ACESSO
-- Villa Ninita · Poço da Panela · Rio Ave
--
-- O QUE FAZ
--   Separa quem lança de quem só acompanha.
--
--   alvenaria_perfis    um registro por pessoa, com o papel:
--                         admin      lança e gerencia os perfis
--                         apontador  lança (aponta, planeja, equipes)
--                         gestor     só lê: vê tudo, não grava nada
--
--   alvenaria_papel()   função que devolve o papel de quem está
--                       logado, usada pelas regras de acesso (RLS)
--
--   Depois disso, gravar em alvenaria_apontamentos, _plano e
--   _equipes passa a exigir papel diferente de 'gestor'. A leitura
--   continua liberada para qualquer usuário logado.
--
-- QUEM NÃO ESTÁ NA TABELA
--   Entra como 'apontador'. Isso é de propósito: assim ninguém
--   perde acesso no momento em que esta migração roda, e não há
--   risco de todo mundo — você inclusive — ficar trancado do lado
--   de fora. Para restringir alguém, cadastre a pessoa como
--   'gestor' na tela Equipes > Quem tem acesso.
--
-- O PRIMEIRO ADMIN
--   Enquanto a tabela estiver vazia, qualquer usuário logado pode
--   criar perfis. Assim que o primeiro for criado, só quem é admin
--   mexe nela. Então a PRIMEIRA coisa a fazer depois de rodar isto
--   é se cadastrar como 'admin'.
--
-- COMO RODAR
--   Supabase > SQL Editor > New query > cole este arquivo > Run.
--   Deve aparecer "Success. No rows returned". Pode rodar de novo.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Perfis
--
--    A chave é o e-mail, que é o que o Supabase Auth usa no login.
--    Guardamos o e-mail e não o id do usuário de propósito: assim
--    dá para deixar o perfil pronto antes de a pessoa aceitar o
--    convite e existir em auth.users.
-- ------------------------------------------------------------
create table if not exists public.alvenaria_perfis (
  id             uuid primary key default gen_random_uuid(),
  email          text not null check (position('@' in email) > 1),
  nome           text not null default '',
  papel          text not null default 'apontador'
                 check (papel in ('admin', 'apontador', 'gestor')),
  ativo          boolean not null default true,
  observacao     text not null default '',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  excluido_em    timestamptz                      -- exclusão lógica: nunca DELETE
);

create unique index if not exists alvenaria_perfis_email_unico
  on public.alvenaria_perfis (lower(trim(email))) where excluido_em is null;

-- ------------------------------------------------------------
-- 2. Papel de quem está logado
--
--    security definer para a função poder ler a tabela sem passar
--    pelas regras de acesso dela — senão a política que chama a
--    função entraria em recursão.
-- ------------------------------------------------------------
create or replace function public.alvenaria_papel()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.papel
       from public.alvenaria_perfis p
      where lower(trim(p.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        and p.excluido_em is null
        and p.ativo
      limit 1),
    'apontador')
$$;

revoke all on function public.alvenaria_papel() from public;
grant execute on function public.alvenaria_papel() to authenticated;

create or replace function public.alvenaria_pode_gravar()
returns boolean
language sql
stable
as $$ select public.alvenaria_papel() <> 'gestor' $$;

revoke all on function public.alvenaria_pode_gravar() from public;
grant execute on function public.alvenaria_pode_gravar() to authenticated;

-- ------------------------------------------------------------
-- 3. Acesso à própria tabela de perfis
--
--    Todo mundo logado lê (a página precisa saber o próprio papel).
--    Escrever é só para admin — com uma exceção de arranque:
--    enquanto não existir nenhum perfil, qualquer logado pode criar
--    o primeiro, senão ninguém conseguiria virar admin.
-- ------------------------------------------------------------
alter table public.alvenaria_perfis enable row level security;

drop policy if exists "logados leem alvenaria_perfis"    on public.alvenaria_perfis;
drop policy if exists "admin grava alvenaria_perfis"     on public.alvenaria_perfis;
drop policy if exists "admin altera alvenaria_perfis"    on public.alvenaria_perfis;

create policy "logados leem alvenaria_perfis"
  on public.alvenaria_perfis for select to authenticated using (true);

create policy "admin grava alvenaria_perfis"
  on public.alvenaria_perfis for insert to authenticated
  with check (
    public.alvenaria_papel() = 'admin'
    or not exists (select 1 from public.alvenaria_perfis where excluido_em is null)
  );

create policy "admin altera alvenaria_perfis"
  on public.alvenaria_perfis for update to authenticated
  using (public.alvenaria_papel() = 'admin')
  with check (public.alvenaria_papel() = 'admin');

-- ------------------------------------------------------------
-- 4. Gravação nas tabelas da obra passa a depender do papel
--
--    A leitura continua aberta a qualquer logado: o gestor precisa
--    ver tudo. O que muda é só insert e update.
-- ------------------------------------------------------------
drop policy if exists "logados gravam alvenaria_apontamentos"  on public.alvenaria_apontamentos;
drop policy if exists "logados alteram alvenaria_apontamentos" on public.alvenaria_apontamentos;
create policy "logados gravam alvenaria_apontamentos"  on public.alvenaria_apontamentos
  for insert to authenticated with check (public.alvenaria_pode_gravar());
create policy "logados alteram alvenaria_apontamentos" on public.alvenaria_apontamentos
  for update to authenticated using (public.alvenaria_pode_gravar())
  with check (public.alvenaria_pode_gravar());

drop policy if exists "logados gravam alvenaria_plano"  on public.alvenaria_plano;
drop policy if exists "logados alteram alvenaria_plano" on public.alvenaria_plano;
create policy "logados gravam alvenaria_plano"  on public.alvenaria_plano
  for insert to authenticated with check (public.alvenaria_pode_gravar());
create policy "logados alteram alvenaria_plano" on public.alvenaria_plano
  for update to authenticated using (public.alvenaria_pode_gravar())
  with check (public.alvenaria_pode_gravar());

drop policy if exists "logados gravam alvenaria_equipes"  on public.alvenaria_equipes;
drop policy if exists "logados alteram alvenaria_equipes" on public.alvenaria_equipes;
create policy "logados gravam alvenaria_equipes"  on public.alvenaria_equipes
  for insert to authenticated with check (public.alvenaria_pode_gravar());
create policy "logados alteram alvenaria_equipes" on public.alvenaria_equipes
  for update to authenticated using (public.alvenaria_pode_gravar())
  with check (public.alvenaria_pode_gravar());
-- sem política de DELETE de propósito: exclusão é sempre lógica (excluido_em)
