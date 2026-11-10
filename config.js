/* ============================================================
   CONFIGURAÇÃO DO SUPABASE
   Único arquivo que muda se o projeto Supabase for trocado.

   SUPABASE_URL
     Só o endereço do projeto, no formato https://<ref>.supabase.co
     SEM /rest/v1/ no final — com esse sufixo a conexão falha.
     Onde achar: Supabase > Project Settings > Data API > Project URL.

   SUPABASE_CHAVE
     A chave publicável (Publishable key), que começa com
     sb_publishable_. Ela pode ficar no site: quem protege os dados
     é o login e as regras de acesso (RLS) do banco.
     NUNCA cole aqui a chave secret (sb_secret_...) nem a service_role:
     elas dão acesso total ao banco e o site recusa as duas.

   Este projeto Supabase é só da alvenaria. O site de serviços tem
   o dele, separado, com outros usuários.
   ============================================================ */
export const SUPABASE_URL   = "COLE AQUI A URL DO PROJETO";
export const SUPABASE_CHAVE = "COLE AQUI A PUBLISHABLE KEY";
