import { SUPABASE_URL, SUPABASE_CHAVE } from "../../../config.js";

/* ------------------------------------------------------------
   NUVEM — conexão, login e gravação da alvenaria

   Projeto Supabase próprio desta obra: banco, usuários e chaves
   só da alvenaria. As chaves de aparelho ficam com prefixo alv_
   para não colidir com outro sistema no mesmo navegador.
   ------------------------------------------------------------ */

export let sb = null;
export let usuario = null;

export function cfgLocal(nome, padrao){
  try { return localStorage.getItem("alv_" + nome) || padrao; } catch(e){ return padrao; }
}
export function guardarCfgLocal(nome, valor){
  try { localStorage.setItem("alv_" + nome, valor); } catch(e){}
}

export const URL_SB   = cfgLocal("url", SUPABASE_URL);
export const CHAVE_SB = cfgLocal("chave", SUPABASE_CHAVE);

function ehServiceRole(k){
  const partes = String(k || "").trim().split(".");
  if(partes.length !== 3) return false;
  try {
    const carga = JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")));
    return carga && carga.role === "service_role";
  } catch(e){ return false; }
}

/* Mesmas checagens do sistema de serviços: a chave secreta e a
   service_role dão acesso total ao banco e nunca ficam num site. */
export function problemaConfig(url, chave){
  const u = String(url || "").trim();
  const k = String(chave || "").trim();
  if(!u || u.indexOf("COLE") === 0)
    return "Falta a URL do projeto Supabase (formato https://<ref>.supabase.co).";
  if(/\/rest\/v1/i.test(u))
    return "A URL não pode terminar em /rest/v1/. Use só https://<ref>.supabase.co.";
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(u))
    return "A URL \"" + u + "\" não está no formato https://<ref>.supabase.co.";
  if(/^sb_secret_/.test(k) || ehServiceRole(k))
    return "Essa é a chave secreta, que só pode ser usada em servidor. Use a Publishable key.";
  if(!k)
    return "Falta a chave publicável (Publishable key, começa com sb_publishable_).";
  if(!(/^sb_publishable_.{20,}$/.test(k) || (/^eyJ/.test(k) && k.length > 40)))
    return "A chave não está no formato esperado: deve começar com sb_publishable_.";
  return "";
}

export function conectar(){
  if(!window.supabase) throw new Error("A biblioteca do Supabase não carregou.");
  sb = window.supabase.createClient(String(URL_SB).trim(), String(CHAVE_SB).trim(), {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}

export async function sessaoAtual(){
  const r = await sb.auth.getSession();
  usuario = (r.data && r.data.session && r.data.session.user) || null;
  return usuario;
}

export async function entrar(email, senha){
  const r = await sb.auth.signInWithPassword({ email: email, password: senha });
  if(r.error) throw r.error;
  guardarCfgLocal("email", email);
  usuario = r.data.user;
  return usuario;
}

export async function sair(){
  try { await sb.auth.signOut(); } catch(e){}
  usuario = null;
}

/* ---------- leitura ---------- */

/* último apontamento de cada parede (visão alvenaria_atual) */
export async function lerSituacao(){
  const r = await sb.from("alvenaria_atual").select("*");
  if(r.error) throw r.error;
  return r.data || [];
}

export async function lerPlano(){
  const r = await sb.from("alvenaria_plano").select("*").is("excluido_em", null);
  if(r.error) throw r.error;
  return r.data || [];
}

export async function lerHistorico(pavimento, parede){
  const r = await sb.from("alvenaria_apontamentos")
    .select("*")
    .eq("pavimento", pavimento).eq("parede", parede)
    .is("excluido_em", null)
    .order("data", { ascending:false })
    .order("criado_em", { ascending:false });
  if(r.error) throw r.error;
  return r.data || [];
}

export async function lerApontamentos(){
  const r = await sb.from("alvenaria_apontamentos")
    .select("pavimento,parede,data,percentual,area_m2,equipe,autor")
    .is("excluido_em", null)
    .order("data", { ascending:false });
  if(r.error) throw r.error;
  return r.data || [];
}

/* ---------- equipes ---------- */

export async function lerEquipes(){
  const r = await sb.from("alvenaria_equipes")
    .select("id,nome,empresa,observacao,ativa")
    .is("excluido_em", null)
    .order("nome");
  if(r.error) throw r.error;
  return r.data || [];
}

export async function gravarEquipe(e){
  if(e.id){
    const r = await sb.from("alvenaria_equipes").update({
      nome: e.nome, empresa: e.empresa || "", observacao: e.observacao || "",
      ativa: e.ativa !== false, atualizado_em: new Date().toISOString()
    }).eq("id", e.id).select().single();
    if(r.error) throw r.error;
    return r.data;
  }
  const r = await sb.from("alvenaria_equipes").insert({
    nome: e.nome, empresa: e.empresa || "", observacao: e.observacao || ""
  }).select().single();
  if(r.error) throw r.error;
  return r.data;
}

/* exclusão lógica: a equipe some da lista, mas os apontamentos
   que ela já assinou continuam dizendo o nome dela */
export async function apagarEquipe(id){
  const r = await sb.from("alvenaria_equipes")
    .update({ excluido_em: new Date().toISOString() })
    .eq("id", id);
  if(r.error) throw r.error;
}

/* ---------- gravação ---------- */

export async function gravarApontamento(ap){
  const r = await sb.from("alvenaria_apontamentos").insert({
    pavimento : ap.pavimento,
    parede    : ap.parede,
    data      : ap.data,
    percentual: ap.percentual,
    area_m2   : (ap.area_m2 === null || ap.area_m2 === undefined) ? null : ap.area_m2,
    equipe    : ap.equipe || "",
    observacao: ap.observacao || "",
    autor     : (usuario && usuario.email) || ""
  }).select().single();
  if(r.error) throw r.error;
  return r.data;
}

/* Sem upsert: o índice único é parcial (where excluido_em is null)
   e o ON CONFLICT do PostgREST não sabe lidar com isso. */
export async function gravarPlano(p){
  if(p.id){
    const r = await sb.from("alvenaria_plano").update({
      responsavel  : p.responsavel || "",
      inicio       : p.inicio || null,
      fim          : p.fim || null,
      observacao   : p.observacao || "",
      atualizado_em: new Date().toISOString()
    }).eq("id", p.id).select().single();
    if(r.error) throw r.error;
    return r.data;
  }
  const r = await sb.from("alvenaria_plano").insert({
    pavimento  : p.pavimento,
    parede     : p.parede,
    responsavel: p.responsavel || "",
    inicio     : p.inicio || null,
    fim        : p.fim || null,
    observacao : p.observacao || ""
  }).select().single();
  if(r.error) throw r.error;
  return r.data;
}
