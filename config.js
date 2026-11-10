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

   BANCO COMPARTILHADO COM O SITE DE SERVIÇOS
     Este é o mesmo projeto Supabase do NINITA_SERVI-OS. Os dois
     sites são separados em tudo o mais — repositório, endereço,
     visual e chaves de aparelho — mas dividem o banco e o login,
     porque o plano gratuito do Supabase permite só dois projetos
     por conta e as duas vagas já estavam ocupadas.

     Na prática isso é bom para a obra: quem aponta usa um único
     usuário nos dois sistemas. As tabelas da alvenaria têm o
     prefixo alvenaria_ e não encostam nas dos serviços.
   ============================================================ */
export const SUPABASE_URL   = "https://mouphzazqsikbeibgqyh.supabase.co";
export const SUPABASE_CHAVE = "sb_publishable_gmsv9MVlXotqi4Z1cdam4Q_SqQJkNVW";