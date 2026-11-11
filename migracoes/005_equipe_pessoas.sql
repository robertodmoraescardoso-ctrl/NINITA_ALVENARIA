-- ============================================================
-- MIGRAÇÃO 005 — A EQUIPE PASSA A TER PROFISSIONAIS E SERVENTES
-- Villa Ninita · Poço da Panela · Rio Ave
--
-- POR QUE
--   "Equipe Severino" não diz quem estava no andar. Quem mede
--   precisa saber a composição: quantos profissionais e quantos
--   serventes, porque é disso que sai a produtividade por homem e
--   é assim que o empreiteiro cobra.
--
-- O QUE FAZ
--   A coluna 'nome' passa a guardar os PROFISSIONAIS, separados
--   por ponto e vírgula — "Matias; Severino". Ela continua sendo a
--   identidade da equipe: é por esse texto que o apontamento se
--   liga a quem executou, e por isso não muda de nome nem de tipo.
--
--   'serventes' é nova e guarda os serventes na mesma forma.
--
--     nome       "Matias; Severino"     os profissionais
--     serventes  "João; Pedro"          os serventes
--
--   'empresa' continua existindo e guarda o que já estava lá, mas
--   saiu da tela: o cadastro agora tem dois campos, não três. Se um
--   dia o empreiteiro voltar a importar, é só mostrar de novo — a
--   coluna nunca foi apagada.
--
--   Tudo é aditivo. As equipes que já existem continuam válidas,
--   com um profissional só e nenhum servente.
--
-- COMO RODAR
--   Supabase > SQL Editor > New query > cole este arquivo > Run.
--   Deve aparecer "Success. No rows returned". Pode rodar de novo.
-- ============================================================

alter table public.alvenaria_equipes
  add column if not exists serventes text not null default '';

comment on column public.alvenaria_equipes.nome is
  'Profissionais da equipe, separados por ponto e vírgula. É a identidade da equipe: alvenaria_apontamentos.equipe guarda este texto.';
comment on column public.alvenaria_equipes.serventes is
  'Serventes da equipe, separados por ponto e vírgula. Pode ficar vazio.';
comment on column public.alvenaria_equipes.empresa is
  'Empreiteiro. Fora da tela desde a migração 005; mantida para não perder o que já foi gravado.';
