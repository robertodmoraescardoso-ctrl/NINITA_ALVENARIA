/* ------------------------------------------------------------
   MODELO — o catálogo do projeto e o estado em memória

   O catálogo vem de assets/dados/alvenaria-catalogo.json e das
   plantas em assets/dados/alvenaria-plantas.json. Os dois saem
   das pranchas da Tecomat e são versionados no git: mudam só
   quando sai revisão nova. O que a obra produz (apontamento,
   responsável, prazo) mora no Supabase.
   ------------------------------------------------------------ */

export const est = {
  /* catálogo */
  skus: [], pavimentos: [], paredes: [], porId: {}, porPavimento: {},
  plantas: {}, pavPorCodigo: {},
  /* o que veio do banco */
  situacao: {},      /* "PAV__PRxxx" -> último apontamento */
  plano: {},         /* "PAV__PRxxx" -> {id, responsavel, inicio, fim} */
  equipes: [],       /* [{id, nome, empresa, observacao, ativa}] */
  perfis: [],        /* [{id, email, nome, papel, ativo}] */
  papel: "apontador",/* papel de quem está logado: admin, apontador ou gestor */
  meuEmail: "",
  /* tela */
  pav: "TE", aba: "mapa", vista: "planta", zoom: 3, plantaDe: null, inverter: true,
  filtro: "todas", busca: "", aberta: null,
  /* seleção em lote, só no mosaico. Zera ao trocar de pavimento:
     apontar em peça que não está na tela é pedido de engano. */
  selecionando: false, selecao: {}, loteAberto: false,
  periodoDe: "", periodoAte: "",
  servico: "elevacao",   /* elevacao (levante, m²) ou marcacao (1ª fiada, m) */
  conectado: false, podeGravar: false, aviso: ""
};

export const AVISOS = {
  x: ["Contém bloco cortado (XVAR), sem comprimento definido em projeto. A área prevista está subestimada e o % sai otimista.", "!"],
  g: ["Contém o código CER-VER-9X19X1, que não existe na legenda do projeto. Pendente de confirmação com a Tecomat.", "?"],
  z: ["A tabela de projeto não traz bloco de vedação: não há área para medir. Aponte apenas concluída ou não.", "0"],
  e: ["Pendente de verificação do engenheiro de estruturas (nota de prancha).", "E"]
};

export const ROTULO = {
  ok: "Concluída", andamento: "Em execução", atraso: "Fora do prazo",
  zero: "Não iniciada", semquant: "Sem quantitativo"
};

/* ------------------------------------------------------------
   Os dois serviços da alvenaria

   Medem-se em unidades diferentes, e é isso que separa tudo o
   que vem abaixo: elevação sai do quantitativo de blocos das
   elevações da Tecomat, marcação sai do comprimento levantado na
   planilha de cotação.
   ------------------------------------------------------------ */
export const SERVICOS = {
  elevacao: { nome: "Levante",  unidade: "m²", campo: "area",   rotuloExec: "Levante executado" },
  marcacao: { nome: "Marcação", unidade: "m",  campo: "linear", rotuloExec: "Marcação executada" }
};
export function servicoAtual(){ return SERVICOS[est.servico] ? est.servico : "elevacao"; }
export function unidade(s){ return SERVICOS[s || servicoAtual()].unidade; }
export function nomeServico(s){ return SERVICOS[s || servicoAtual()].nome; }

export async function carregarCatalogo(){
  const [cat, pl] = await Promise.all([
    fetch("assets/dados/alvenaria-catalogo.json").then(function(r){
      if(!r.ok) throw new Error("catálogo (HTTP " + r.status + ")"); return r.json(); }),
    fetch("assets/dados/alvenaria-plantas.json").then(function(r){
      if(!r.ok) throw new Error("plantas (HTTP " + r.status + ")"); return r.json(); })
  ]);

  est.skus = cat.skus;
  est.pavimentos = cat.pavimentos;
  est.plantas = pl;
  est.paredes = [];
  est.porId = {};
  est.porPavimento = {};
  est.pavPorCodigo = {};

  /* Só paredes PR. O projeto também numera os shafts (SH), mas eles
     ficam fora do controle de alvenaria desta obra: saem aqui, na
     carga, e com isso somem do mapa, da planta, dos totais, do lote
     e dos painéis de uma vez. O JSON continua com eles. */
  const ehParede = function(c){ return /^PR/i.test(String(c || "")); };

  for(const p of cat.pavimentos){
    est.pavPorCodigo[p.c] = p;
    const lista = [];
    const jogo = cat.jogos[p.jogo];
    if(jogo){
      for(const w of jogo){
        if(!ehParede(w.c)) continue;
        lista.push({ id: p.c + "__" + w.c, pav: p.c, codigo: w.c, tipo: w.t,
                     espessura: w.e, area: w.a, linear: w.l, blocos: w.n, sku: w.b,
                     avisos: w.f || "", prancha: w.p });
      }
    } else {
      for(const item of (cat.pendentes[p.jogo] || [])){
        const c = typeof item === "string" ? item : item.c;
        const l = typeof item === "string" ? null : item.l;
        if(!ehParede(c)) continue;
        lista.push({ id: p.c + "__" + c, pav: p.c, codigo: c, tipo: c[0] === "S" ? "s" : "p",
                     espessura: null, area: null, linear: l, blocos: null, sku: null,
                     avisos: "", prancha: null });
      }
    }
    est.porPavimento[p.c] = lista;
    for(const w of lista){ est.paredes.push(w); est.porId[w.id] = w; }
  }
  return est;
}

/* ---------- regras ---------- */

export function hojeISO(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

/* ------------------------------------------------------------
   Intervalo de execução

   O apontamento cobre de data_inicio até data. Quem lançou num dia
   só manda as duas iguais; lançamento antigo pode vir sem início, e
   aí vale a própria data.
   ------------------------------------------------------------ */
export function inicioDe(a){
  return (a && (a.data_inicio || a.data)) ? String(a.data_inicio || a.data) : "";
}

/* quantos dias corridos o intervalo cobre, contando as duas pontas */
export function diasDoIntervalo(ini, fim){
  if(!ini || !fim) return ini || fim ? 1 : 0;
  const a = Date.parse(ini + "T00:00:00Z"), b = Date.parse(fim + "T00:00:00Z");
  if(isNaN(a) || isNaN(b) || b < a) return 1;
  return Math.round((b - a) / 86400000) + 1;
}

/* marca num conjunto cada dia do intervalo, para que dois
   lançamentos que se sobrepõem não contem o mesmo dia duas vezes */
const LIMITE_DIAS = 400;   /* trava contra data digitada errada */
export function marcarDias(destino, ini, fim){
  if(!ini && !fim) return;
  const de = ini || fim, ate = fim || ini;
  const n = Math.min(diasDoIntervalo(de, ate), LIMITE_DIAS);
  const t = Date.parse(de + "T00:00:00Z");
  if(isNaN(t)){ destino[ate] = true; return; }
  for(let i = 0; i < n; i++){
    destino[new Date(t + i * 86400000).toISOString().slice(0,10)] = true;
  }
}

/* "05/11 a 07/11" quando o intervalo tem mais de um dia */
export function periodoCurto(ini, fim){
  const a = ini || fim, b = fim || ini;
  if(!a && !b) return "—";
  return a === b ? dataCurta(b) : dataCurta(a) + " a " + dataCurta(b);
}

/* quanto a peça tem de previsto no serviço: m² no levante,
   metro linear na marcação */
export function previsto(w, s){
  const campo = SERVICOS[s || servicoAtual()].campo;
  const v = w[campo];
  return typeof v === "number" ? v : null;
}
export function temPrevisto(w, s){
  const v = previsto(w, s);
  return typeof v === "number" && v > 0;
}
/* mantido com o nome antigo porque o material e o mosaico falam
   especificamente de área, não do serviço em foco */
export function temArea(w){ return typeof w.area === "number" && w.area > 0; }

export function chaveSituacao(w, s){ return w.id + "__" + (s || servicoAtual()); }

export function percentual(w, s){
  const reg = est.situacao[chaveSituacao(w, s)];
  if(!reg) return 0;
  const n = Number(reg.percentual);
  return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
}

/* quantidade executada na unidade do serviço */
export function executado(w, s){
  const base = previsto(w, s);
  if(!(typeof base === "number" && base > 0)) return 0;
  return Math.round(base * percentual(w, s)) / 100;
}
/* atalho antigo, só para o que fala de m² */
export function m2Executado(w){
  return temArea(w) ? Math.round(w.area * percentual(w, "elevacao")) / 100 : 0;
}

export function status(w, s){
  const p = percentual(w, s);
  if(p >= 100) return "ok";
  if(!temPrevisto(w, s)) return "semquant";
  const pl = est.plano[w.id];
  if(pl && pl.fim && pl.fim < hojeISO()) return "atraso";
  if(p > 0) return "andamento";
  return "zero";
}

export function chavePlanta(pavCodigo){
  const p = est.pavPorCodigo[pavCodigo];
  return p ? p.jogo : null;
}

/* paredes do pavimento em foco que passam pelo filtro e pela busca */
export function visiveis(){
  const lista = est.porPavimento[est.pav] || [];
  const q = est.busca.trim().toUpperCase();
  return lista.filter(function(w){
    if(q && w.codigo.indexOf(q) === -1) return false;
    if(est.filtro === "todas") return true;
    if(est.filtro === "avisos") return !!w.avisos;
    if(est.filtro === "minhas"){
      const pl = est.plano[w.id];
      return !!(pl && pl.responsavel && meuNome() &&
                pl.responsavel.toLowerCase() === meuNome().toLowerCase());
    }
    return status(w) === est.filtro;
  });
}

let _meuNome = "";
export function meuNome(){ return _meuNome; }
export function definirMeuNome(n){ _meuNome = n || ""; }

/* ---------- seleção em lote ---------- */

export function selecionadas(){
  const fora = [];
  for(const id in est.selecao){ if(est.selecao[id] && est.porId[id]) fora.push(est.porId[id]); }
  return fora.sort(function(a,b){ return a.codigo.localeCompare(b.codigo, "pt-BR"); });
}
export function quantasSelecionadas(){
  let n = 0;
  for(const id in est.selecao){ if(est.selecao[id]) n++; }
  return n;
}
export function alternarSelecao(id){
  if(est.selecao[id]) delete est.selecao[id]; else est.selecao[id] = true;
}
export function limparSelecao(){ est.selecao = {}; }

/* soma o material das peças escolhidas, separando as que não têm
   quantitativo de projeto — elas não entram na conta e precisam
   aparecer como ressalva, não sumir */
/* metro linear da seleção, para a marcação */
export function linearDe(paredes){
  let total = 0, falta = 0, sem = 0;
  for(const w of paredes){
    if(!temPrevisto(w, "marcacao")){ sem++; continue; }
    total += w.linear;
    falta += w.linear * Math.max(0, 100 - percentual(w, "marcacao")) / 100;
  }
  return { total: total, falta: falta, sem: sem };
}

export function materialDe(paredes){
  const previsto = {}, restante = {};
  let area = 0, semQuant = 0;
  for(const w of paredes){
    if(!w.sku){ semQuant++; continue; }
    /* material é do levante: bloco é o que sobe a parede */
    const falta = Math.max(0, 100 - percentual(w, "elevacao")) / 100;
    if(temArea(w)) area += w.area;
    for(const k in w.sku){
      previsto[k] = (previsto[k] || 0) + w.sku[k];
      restante[k] = (restante[k] || 0) + w.sku[k] * falta;
    }
  }
  return { previsto: previsto, restante: restante, area: area, semQuant: semQuant };
}

/* Quantitativo de material de um pavimento: o que a aba Material
   mostra e o que a planilha exporta saem desta mesma conta, para
   as duas nunca discordarem. Previsto é o de projeto; assentado é
   estimado (previsto × % de levante apontado em cada parede). */
export function quantitativoMaterial(pav){
  const todas = est.porPavimento[pav] || [];
  const lista = todas.filter(function(w){ return w.sku; });
  const previsto = {}, assentado = {};
  for(const w of lista){
    const f = percentual(w, "elevacao") / 100;
    for(const k in w.sku){
      previsto[k] = (previsto[k] || 0) + w.sku[k];
      assentado[k] = (assentado[k] || 0) + w.sku[k] * f;
    }
  }
  const ordem = Object.keys(previsto).map(Number).sort(function(a,b){ return a-b; });
  const ehBloco = function(i){ return String(est.skus[i]).indexOf("TELA") !== 0; };
  return {
    pav: pav, nome: (est.pavPorCodigo[pav] || {}).n || pav, pecas: lista.length,
    ordem: ordem, previsto: previsto, assentado: assentado,
    blocos: ordem.filter(ehBloco), telas: ordem.filter(function(i){ return !ehBloco(i); }),
    linear: linearDe(todas)
  };
}

/* ------------------------------------------------------------
   Produção por equipe num período

   O apontamento guarda o percentual ACUMULADO da parede naquela
   data, não o que foi feito no dia. Somar area_m2 direto conta a
   mesma parede duas vezes: 50% e depois 100% viraria 1,5 parede.

   Aqui cada lançamento rende o INCREMENTO sobre o lançamento
   anterior da mesma peça, e esse incremento é creditado à equipe
   que assinou o lançamento mais novo — que é quem levantou aquele
   pedaço de parede.

   OS DIAS vêm do intervalo, não da data do lançamento. Uma parede
   levantada de segunda a quarta conta três dias, e dois lançamentos
   que pegam o mesmo dia não o contam duas vezes. É isso que faz o
   m²/dia ser RUP de verdade e não produção por lançamento.

   O PERÍODO (de/até) filtra pela data de referência — o dia em que
   o avanço foi medido. Um trecho que começou antes do período entra
   inteiro se terminou dentro dele: o avanço é creditado na medição,
   não rateado dia a dia.
   ------------------------------------------------------------ */
export function producaoPorEquipe(apontamentos, de, ate, servico){
  const alvo = servico || servicoAtual();
  const emMetros = alvo === "marcacao";
  const porPeca = {};
  for(const a of apontamentos){
    if((a.servico || "elevacao") !== alvo) continue;
    const id = a.pavimento + "__" + a.parede;
    (porPeca[id] || (porPeca[id] = [])).push(a);
  }

  const equipes = {};
  let m2Total = 0, semAreaTotal = 0;
  const diasTotais = {};

  for(const id in porPeca){
    const lista = porPeca[id].slice().sort(function(x,y){
      const d = String(x.data).localeCompare(String(y.data));
      return d !== 0 ? d : String(x.criado_em || "").localeCompare(String(y.criado_em || ""));
    });
    let areaAnterior = 0, pctAnterior = 0;
    for(const a of lista){
      /* a quantidade é m² no levante e metro linear na marcação */
      const bruto = emMetros ? a.metros_m : a.area_m2;
      const area = (bruto === null || bruto === undefined) ? null : Number(bruto);
      const pct = Number(a.percentual) || 0;
      const incArea = area === null ? 0 : Math.max(0, area - areaAnterior);
      const incPct = Math.max(0, pct - pctAnterior);
      if(area !== null) areaAnterior = area;
      pctAnterior = pct;

      if(de && String(a.data) < de) continue;
      if(ate && String(a.data) > ate) continue;
      if(incArea <= 0 && incPct <= 0) continue;   /* correção ou repetição */

      const nome = (a.equipe || "").trim() || "sem equipe";
      const g = equipes[nome] || (equipes[nome] = { m2:0, dias:{}, pecas:{}, lancamentos:0, semArea:0 });
      g.m2 += incArea;
      g.lancamentos++;
      /* todos os dias do intervalo, sem contar duas vezes o dia em
         que dois lançamentos se encontram */
      marcarDias(g.dias, inicioDe(a), a.data);
      marcarDias(diasTotais, inicioDe(a), a.data);
      g.pecas[id] = true;
      if(area === null){ g.semArea++; semAreaTotal++; }
      m2Total += incArea;
    }
  }
  return { equipes: equipes, m2Total: m2Total, semAreaTotal: semAreaTotal,
           diasTotais: Object.keys(diasTotais).length };
}

/* nomes para a lista suspensa de "quem executou" */
export function nomesDeEquipe(){
  return est.equipes.filter(function(e){ return e.ativa !== false; })
                    .map(function(e){ return e.nome; });
}

/* ------------------------------------------------------------
   Quem está na equipe

   Profissionais e serventes vão num campo de texto só, separados
   por ponto e vírgula, porque é como o apontador escreve no papel:
   "Matias; Severino". O texto dos profissionais É a identidade da
   equipe — o apontamento guarda esse mesmo texto.
   ------------------------------------------------------------ */
export function listaDePessoas(texto){
  const vistos = {}, fora = [];
  for(const parte of String(texto || "").split(";")){
    const n = parte.trim().replace(/\s+/g, " ");
    if(!n) continue;
    const chave = n.toLowerCase();
    if(vistos[chave]) continue;     /* o mesmo nome duas vezes é engano de digitação */
    vistos[chave] = true;
    fora.push(n);
  }
  return fora;
}
/* forma canônica: "  matias ;; severino  " -> "matias; severino" */
export function textoDePessoas(texto){ return listaDePessoas(texto).join("; "); }

export function pessoasDaEquipe(e){
  const prof = listaDePessoas(e && e.nome);
  const serv = listaDePessoas(e && e.serventes);
  return { profissionais: prof, serventes: serv, total: prof.length + serv.length };
}

/* "2 profissionais e 1 servente · 3 pessoas" */
export function composicao(e){
  const p = pessoasDaEquipe(e);
  const partes = [];
  if(p.profissionais.length) partes.push(p.profissionais.length + (p.profissionais.length === 1 ? " profissional" : " profissionais"));
  if(p.serventes.length) partes.push(p.serventes.length + (p.serventes.length === 1 ? " servente" : " serventes"));
  if(!partes.length) return "sem gente cadastrada";
  return partes.join(" e ") + (p.total > 1 ? " · " + p.total + " pessoas" : "");
}

/* ---------- formatação ---------- */

export function nf(v, casas){
  if(v === null || v === undefined) return "—";
  if(casas === undefined) casas = 2;
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
export function ni(v){
  if(v === null || v === undefined) return "—";
  return Number(v).toLocaleString("pt-BR");
}
export function dataCurta(s){
  return s ? String(s).slice(8,10) + "/" + String(s).slice(5,7) : "—";
}
