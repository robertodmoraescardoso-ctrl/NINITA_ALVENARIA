import { $, esc } from "../ui.js";
import { lerApontamentos } from "./nuvem.js";
import { SERVICOS, composicao, dataCurta, est, executado, hojeISO, linearDe, m2Executado, meuNome, nf, ni, nomeServico, percentual, pessoasDaEquipe, previsto, producaoPorEquipe, ROTULO, status, temArea, temPrevisto, unidade, visiveis } from "./modelo.js";

/* ------------------------------------------------------------
   PAINÉIS — indicadores, filtros, prazos, equipes e material
   ------------------------------------------------------------ */

const COR = { ok:"var(--alv-ok)", andamento:"var(--alv-andamento)", atraso:"var(--alv-atraso)",
              zero:"var(--alv-zero)", semquant:"var(--alv-semquant)" };

/* ---------- barra de pavimentos ---------- */
export function desenharPavimentos(){
  const un = unidade();
  $("#alvPavs").innerHTML = est.pavimentos.map(function(p){
    const lista = est.porPavimento[p.c] || [];
    const prev = lista.reduce(function(s,w){ return s + (temPrevisto(w) ? previsto(w) : 0); }, 0);
    const feito = lista.reduce(function(s,w){ return s + executado(w); }, 0);
    const pc = prev > 0 ? Math.round(feito/prev*100) : null;
    return '<button type="button" class="alv-pav" data-pav="' + p.c + '" aria-pressed="' + (p.c === est.pav) + '">' +
      "<b>" + esc(p.n) + "</b><i>" + lista.length + " par · " +
      (pc === null ? "s/ " + un : pc + "%") + "</i></button>";
  }).join("");
}

/* ---------- indicadores ---------- */
export function desenharIndicadores(){
  const lista = est.porPavimento[est.pav] || [];
  const un = unidade();
  const prev = lista.reduce(function(s,w){ return s + (temPrevisto(w) ? previsto(w) : 0); }, 0);
  const feito = lista.reduce(function(s,w){ return s + executado(w); }, 0);
  const pc = prev > 0 ? feito/prev*100 : 0;
  const prontas = lista.filter(function(w){ return status(w) === "ok"; }).length;
  const atrasadas = lista.filter(function(w){ return status(w) === "atraso"; }).length;
  const semApont = lista.filter(function(w){ return percentual(w) === 0; }).length;
  const semResp = lista.filter(function(w){ const p = est.plano[w.id]; return !p || !p.responsavel; }).length;

  $("#alvIndicadores").innerHTML =
    ind(prev > 0 ? nf(pc,1) + "%" : "—", SERVICOS[est.servico].rotuloExec,
        nf(feito) + " de " + nf(prev) + " " + un) +
    ind(prontas + " / " + lista.length, "Paredes concluídas", semApont + " sem apontamento") +
    ind(atrasadas, "Fora do prazo", atrasadas ? "ver aba Prazos" : "nenhuma atrasada", atrasadas ? "ind--atrasado" : "") +
    ind(semResp, "Sem responsável", "de " + lista.length + " paredes");
}
function ind(numero, rotulo, detalhe, classe){
  return '<div class="ind ' + (classe || "") + '"><span class="ind__n">' + esc(String(numero)) + "</span>" +
    '<span class="ind__r">' + esc(rotulo) + "</span>" +
    (detalhe ? '<span class="ind__d">' + esc(detalhe) + "</span>" : "") + "</div>";
}

/* ---------- filtros ---------- */
export function desenharFiltros(){
  const lista = est.porPavimento[est.pav] || [];
  const conta = {};
  lista.forEach(function(w){ const s = status(w); conta[s] = (conta[s] || 0) + 1; });
  const comAviso = lista.filter(function(w){ return !!w.avisos; }).length;
  const minhas = lista.filter(function(w){
    const p = est.plano[w.id];
    return !!(p && p.responsavel && meuNome() && p.responsavel.toLowerCase() === meuNome().toLowerCase());
  }).length;

  const defs = [
    ["todas", "Todas", null, lista.length],
    ["zero", "Não iniciadas", "zero", conta.zero || 0],
    ["andamento", "Em execução", "andamento", conta.andamento || 0],
    ["ok", "Concluídas", "ok", conta.ok || 0],
    ["atraso", "Fora do prazo", "atraso", conta.atraso || 0],
    ["semquant", "Sem " + unidade(), "semquant", conta.semquant || 0],
    ["avisos", "Com aviso", null, comAviso]
  ];
  if(meuNome()) defs.push(["minhas", "Minhas", null, minhas]);

  $("#alvFiltros").innerHTML = defs.map(function(d){
    const cor = d[2] ? '<i class="alv-cor" style="background:' + COR[d[2]] + '"></i>' : "";
    return '<button type="button" class="chip-filtro" data-filtro="' + d[0] + '" aria-pressed="' + (est.filtro === d[0]) + '">' +
      cor + esc(d[1]) + ' <span class="chip-filtro__n">' + d[3] + "</span></button>";
  }).join("");
}

/* ---------- prazos ---------- */
export function desenharPrazos(){
  const hoje = hojeISO();
  const d7 = new Date(); d7.setDate(d7.getDate() + 7);
  const limite = d7.getFullYear() + "-" + String(d7.getMonth()+1).padStart(2,"0") + "-" + String(d7.getDate()).padStart(2,"0");

  const comPlano = est.paredes.filter(function(w){
    const p = est.plano[w.id];
    return p && (p.fim || p.inicio || p.responsavel);
  });
  const atrasadas = [], semana = [], programadas = [], semPrazo = [], concluidas = [];
  comPlano.forEach(function(w){
    const p = est.plano[w.id];
    if(percentual(w) >= 100){ concluidas.push(w); return; }
    if(!p.fim){ semPrazo.push(w); return; }
    if(p.fim < hoje) atrasadas.push(w);
    else if(p.fim <= limite) semana.push(w);
    else programadas.push(w);
  });

  function ordenar(arr){
    return arr.sort(function(a,b){
      const fa = (est.plano[a.id].fim || "9999") + a.id;
      const fb = (est.plano[b.id].fim || "9999") + b.id;
      return fa.localeCompare(fb);
    });
  }
  function linha(w){
    const p = est.plano[w.id], s = status(w);
    return '<div class="alv-linha">' +
      '<span class="alv-linha__cod">' + esc(w.codigo) + "</span>" +
      '<span class="alv-linha__pav">' + esc(est.pavPorCodigo[w.pav].n) + "</span>" +
      '<span class="alv-linha__meio">' + esc(p.responsavel || "sem responsável") +
        (p.inicio ? " · início " + dataCurta(p.inicio) : "") + "</span>" +
      '<span class="alv-linha__fim">' + (p.fim ? dataCurta(p.fim) : "—") + "</span>" +
      '<span class="alv-selo ' + s + '">' + percentual(w) + "%</span>" +
      '<button type="button" class="btn btn--p" data-peca="' + w.id + '">abrir</button>' +
    "</div>";
  }
  function grupo(titulo, arr){
    if(!arr.length) return "";
    return '<h2 class="alv-titulo">' + titulo + ' <span style="color:var(--texto-3)">' + arr.length + "</span></h2>" +
      '<div class="alv-linhas">' + ordenar(arr).map(linha).join("") + "</div>";
  }

  const html = grupo("Fora do prazo", atrasadas) + grupo("Vencem em 7 dias", semana) +
               grupo("Programadas", programadas) + grupo("Sem prazo definido", semPrazo) +
               grupo("Concluídas", concluidas);
  $("#alvPrazos").innerHTML = html ||
    '<div class="vazio">Nenhuma parede tem responsável ou prazo lançado ainda. ' +
    'Abra uma parede no Mapa e preencha o planejamento.</div>';
}

/* ---------- equipes ---------- */
/* O cadastro vem primeiro e sempre aparece: é o que o Roberto
   precisa para alimentar a lista de "quem executou". A produção
   depende de ler os lançamentos, que pode falhar; o cadastro não. */
function blocoCadastro(){
  /* O formulário aparece sempre, mesmo sem permissão de gravar: se
     estiver escondido, quem tentar cadastrar não encontra nada e não
     descobre por quê. Se a gravação falhar, a mensagem explica. */
  const formulario =
    '<div class="alv-nova-equipe">' +
      '<label class="alv-campo"><span>Profissional(is)</span>' +
        '<input id="alvEqNome" maxlength="200" placeholder="ex.: Matias; Severino" autocomplete="off"></label>' +
      '<label class="alv-campo"><span>Servente(s)</span>' +
        '<input id="alvEqServ" maxlength="200" placeholder="ex.: João; Pedro" autocomplete="off"></label>' +
      '<button type="button" class="btn btn--marca" id="alvEqAdd">Adicionar</button>' +
    "</div>" +
    '<div class="alv-msg" id="alvEqPreview">Mais de um nome? Separe por <b>ponto e vírgula</b>. ' +
      "Os profissionais são o nome da equipe na hora de apontar.</div>" +
    '<div class="alv-msg" id="alvEqMsg"></div>';

  const lista = est.equipes.length
    ? '<div class="alv-linhas" style="margin-top:10px">' + est.equipes.map(function(e){
        const p = pessoasDaEquipe(e);
        return '<div class="alv-linha">' +
          '<span class="alv-linha__meio" style="color:var(--texto)">' +
            '<b>' + esc(p.profissionais.join("; ") || e.nome) + "</b>" +
            '<span style="display:block;color:var(--texto-3);font-size:11.5px">' +
              (p.serventes.length ? "servente" + (p.serventes.length > 1 ? "s" : "") + ": " +
                esc(p.serventes.join("; ")) + " · " : "") +
              esc(composicao(e)) +
              (e.empresa ? " · " + esc(e.empresa) : "") +
            "</span>" +
          "</span>" +
          '<button type="button" class="alv-apagar" data-eqdel="' + esc(e.id) +
            '" aria-label="Remover ' + esc(e.nome) + '">&times;</button>' +
        "</div>";
      }).join("") + "</div>"
    : '<div class="vazio" style="margin-top:10px">Nenhuma equipe cadastrada ainda. ' +
      'O que você adicionar aqui aparece na lista de "quem executou" ao apontar uma parede.</div>';

  return '<h2 class="alv-titulo">Equipes cadastradas</h2>' + formulario + lista;
}

/* os lançamentos ficam guardados aqui para trocar o período sem
   bater no banco a cada clique */
let apontamentosLidos = null;

function iso(d){
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
export function definirPeriodo(dias){
  if(!dias){ est.periodoDe = ""; est.periodoAte = ""; return; }
  const ate = new Date(), de = new Date();
  de.setDate(de.getDate() - (dias - 1));
  est.periodoAte = iso(ate);
  est.periodoDe = iso(de);
}

export async function desenharEquipes(){
  const alvo = $("#alvEquipesTela");
  alvo.innerHTML = blocoCadastro() +
    '<div id="alvEquipesProd"><div class="alv-msg">Carregando lançamentos…</div></div>' +
    '<div id="alvPerfis"></div>';
  desenharPerfis();
  try{ apontamentosLidos = await lerApontamentos(); }
  catch(e){
    apontamentosLidos = null;
    $("#alvEquipesProd").innerHTML = '<div class="vazio" style="margin-top:20px">' +
      'Não foi possível ler os lançamentos. Se a migração ainda não foi rodada no Supabase, ' +
      'a produção por equipe fica vazia.</div>';
    return;
  }
  if(!est.periodoDe && !est.periodoAte) definirPeriodo(30);
  desenharProducao();
}

/* ------------------------------------------------------------
   QUEM TEM ACESSO

   Só o admin vê — com uma exceção: enquanto não existir nenhum
   perfil, qualquer um vê, senão ninguém conseguiria criar o
   primeiro admin. É a mesma exceção de arranque que a regra do
   banco faz na migração 002.
   ------------------------------------------------------------ */
export function desenharPerfis(){
  const destino = $("#alvPerfis");
  if(!destino) return;
  const arranque = est.perfis.length === 0;
  if(est.papel !== "admin" && !arranque){ destino.innerHTML = ""; return; }

  const formulario =
    '<div class="alv-nova-equipe">' +
      '<label class="alv-campo"><span>E-mail do usuário</span>' +
        '<input id="alvPerfEmail" type="email" inputmode="email" autocapitalize="off" ' +
        'autocomplete="off" placeholder="pessoa@empresa.com"></label>' +
      '<label class="alv-campo"><span>Nome</span>' +
        '<input id="alvPerfNome" maxlength="60" placeholder="como chamar" autocomplete="off"></label>' +
      '<label class="alv-campo"><span>Papel</span><select id="alvPerfPapel">' +
        '<option value="apontador">Apontador</option>' +
        '<option value="gestor">Gestor (só acompanha)</option>' +
        '<option value="admin">Administrador</option>' +
      "</select></label>" +
      '<button type="button" class="btn btn--marca" id="alvPerfAdd">Adicionar</button>' +
    "</div>" +
    '<div class="alv-msg" id="alvPerfMsg"></div>';

  const lista = est.perfis.length
    ? '<div class="alv-linhas" style="margin-top:10px">' + est.perfis.map(function(p){
        const eu = String(p.email || "").trim().toLowerCase() === est.meuEmail;
        return '<div class="alv-linha">' +
          '<span class="alv-linha__meio" style="color:var(--texto)">' +
            "<b>" + esc(p.nome || p.email) + "</b>" + (eu ? " (você)" : "") +
            '<span style="display:block;color:var(--texto-3);font-size:11.5px">' + esc(p.email) + "</span>" +
          "</span>" +
          '<span class="alv-selo ' + (p.papel === "gestor" ? "semquant" : p.papel === "admin" ? "ok" : "andamento") +
            '">' + esc(p.papel) + "</span>" +
          (eu ? "" : '<button type="button" class="alv-apagar" data-perfdel="' + esc(p.id) +
            '" aria-label="Remover ' + esc(p.email) + '">&times;</button>') +
        "</div>";
      }).join("") + "</div>"
    : "";

  destino.innerHTML =
    '<h2 class="alv-titulo">Quem tem acesso ao sistema</h2>' +
    (arranque
      ? '<div class="alv-lote-aviso">Nenhum perfil cadastrado ainda. Enquanto estiver assim, ' +
        "qualquer pessoa logada entra como apontador e pode criar perfis. " +
        "<b>Comece cadastrando você mesmo como Administrador</b> — a partir daí só admin mexe aqui.</div>"
      : "") +
    formulario + lista +
    '<div class="alv-msg">Cadastrar aqui define o <b>papel</b> de quem entra. Não cria a conta: ' +
      "o usuário em si é criado no Supabase, em Authentication &gt; Users. Quem não estiver nesta " +
      "lista entra como apontador." +
    "</div>";
}

export function desenharProducao(){
  const destino = $("#alvEquipesProd");
  if(!destino) return;
  const prod = producaoPorEquipe(apontamentosLidos || [], est.periodoDe, est.periodoAte, est.servico);
  const un = unidade();
  const nomes = Object.keys(prod.equipes).sort(function(a,b){
    return prod.equipes[b].m2 - prod.equipes[a].m2;
  });

  const controles =
    '<div class="alv-periodo">' +
      '<label class="alv-campo"><span>De</span><input type="date" id="alvPerDe" value="' + esc(est.periodoDe) + '"></label>' +
      '<label class="alv-campo"><span>Até</span><input type="date" id="alvPerAte" value="' + esc(est.periodoAte) + '"></label>' +
      '<div class="alv-periodo__rapido">' +
        '<button type="button" class="btn btn--p" data-periodo="7">7 dias</button>' +
        '<button type="button" class="btn btn--p" data-periodo="30">30 dias</button>' +
        '<button type="button" class="btn btn--p" data-periodo="90">90 dias</button>' +
        '<button type="button" class="btn btn--p" data-periodo="0">Tudo</button>' +
      "</div>" +
    "</div>";

  const tabela = nomes.length
    ? '<div class="alv-tabela-rolante"><table class="alv-tabela">' +
        "<thead><tr><th>Equipe</th><th>" + un + " no período</th><th>" + un + "/dia</th>" +
        "<th>Dias em obra</th><th>Paredes</th><th>Lanç.</th></tr></thead><tbody>" +
        nomes.map(function(k){
          const g = prod.equipes[k], dias = Object.keys(g.dias).length;
          return "<tr><td>" + esc(k) + "</td><td>" + nf(g.m2) + "</td><td>" +
                 (dias ? nf(g.m2/dias, 1) : "—") + "</td><td>" + dias + "</td><td>" +
                 Object.keys(g.pecas).length + "</td><td>" + g.lancamentos + "</td></tr>";
        }).join("") +
        "</tbody><tfoot><tr><td>Total</td><td>" + nf(prod.m2Total) + "</td><td>" +
          (prod.diasTotais ? nf(prod.m2Total/prod.diasTotais, 1) : "—") + "</td><td>" +
          prod.diasTotais + "</td><td></td><td></td></tr></tfoot></table></div>"
    : '<div class="vazio">Nenhuma execução lançada neste período.</div>';

  const porResp = carteiraPorResponsavel();

  destino.innerHTML =
    '<h2 class="alv-titulo">Produção por equipe</h2>' + controles + tabela +
    '<div class="alv-msg">Cada lançamento guarda o percentual <i>acumulado</i> da parede. ' +
      "O que entra aqui é o <b>avanço</b> sobre o lançamento anterior da mesma peça, creditado a " +
      "quem assinou o mais novo — senão uma parede apontada em 50% e depois em 100% contaria " +
      "uma vez e meia. <b>Dias em obra</b> são os dias corridos cobertos pelos intervalos dos " +
      "lançamentos, sem contar duas vezes o dia em que dois deles se encontram: uma parede " +
      "levantada de segunda a quarta vale três dias. " + un + "/dia é RUP aproximada, não medição de folha." +
      (prod.semAreaTotal ? " " + prod.semAreaTotal + " lançamento(s) em peça sem quantitativo entram na contagem de paredes, mas não em m²." : "") +
    "</div>" + porResp;
}

function carteiraPorResponsavel(){
  const porResp = {};
  est.paredes.forEach(function(w){
    const p = est.plano[w.id];
    if(!p || !p.responsavel) return;
    const k = p.responsavel.trim();
    const r = porResp[k] || (porResp[k] = { n:0, m2:0, prev:0, atraso:0, ok:0 });
    r.n++; r.m2 += executado(w); r.prev += temPrevisto(w) ? previsto(w) : 0;
    const s = status(w);
    if(s === "atraso") r.atraso++;
    if(s === "ok") r.ok++;
  });

  const resps = Object.keys(porResp).sort(function(a,b){ return porResp[b].n - porResp[a].n; });

  /* A carteira é do estado de hoje, não do período: mostra o que
     cada responsável tem na mão agora. */
  return '<h2 class="alv-titulo">Carteira por responsável</h2>' +
    (resps.length
      ? '<div class="alv-linhas">' + resps.map(function(k){
          const r = porResp[k];
          return '<div class="alv-linha">' +
            '<span class="alv-linha__meio" style="color:var(--texto);font-weight:600">' + esc(k) + "</span>" +
            '<span class="alv-linha__fim" style="width:72px">' + r.n + " par</span>" +
            '<span class="alv-linha__fim" style="width:100px">' + nf(r.m2,0) + "/" + nf(r.prev,0) + " " + unidade() + "</span>" +
            (r.atraso ? '<span class="alv-selo atraso">' + r.atraso + " atras.</span>"
                      : '<span class="alv-selo ok">' + r.ok + " ok</span>") +
          "</div>";
        }).join("") + "</div>"
      : '<div class="vazio">Nenhuma parede atribuída ainda.</div>');
}

/* ---------- material ---------- */
export function desenharMaterial(){
  const lista = (est.porPavimento[est.pav] || []).filter(function(w){ return w.sku; });
  const alvo = $("#alvMaterial");

  const previsto = {}, assentado = {};
  lista.forEach(function(w){
    /* o bloco sobe a parede: o que conta aqui é o levante */
    const f = percentual(w, "elevacao")/100;
    for(const k in w.sku){
      previsto[k] = (previsto[k] || 0) + w.sku[k];
      assentado[k] = (assentado[k] || 0) + w.sku[k]*f;
    }
  });
  /* marcação se mede em metro linear, não em bloco: o resumo do
     comprimento vem antes da tabela de material */
  const lin = linearDe(est.porPavimento[est.pav] || []);
  const blocoLinear =
    '<h2 class="alv-titulo">Marcação · ' + esc(est.pavPorCodigo[est.pav].n) + "</h2>" +
    (lin.total > 0
      ? '<div class="indicadores" style="margin-bottom:8px">' +
          ind(nf(lin.total,1) + " m", "Metro linear previsto", "soma das paredes levantadas") +
          ind(nf(lin.falta,1) + " m", "Falta marcar", "desconta o que já foi apontado") +
        "</div>"
      : '<div class="vazio">Nenhuma peça deste pavimento tem comprimento levantado.</div>') +
    (lin.sem
      ? '<div class="alv-msg">' + lin.sem + " peça(s) sem comprimento na planilha de cotação " +
        "(o semienterrado e a academia não constam dela) ficam fora desta conta.</div>"
      : "");

  if(!lista.length){
    alvo.innerHTML = blocoLinear +
      '<h2 class="alv-titulo">Levante · material</h2>' +
      '<div class="vazio">Este pavimento não tem quantitativo publicado: ' +
      "sem elevação no ConstruCode, não há tabela de material.</div>";
    return;
  }

  const ordem = Object.keys(previsto).map(Number).sort(function(a,b){ return a-b; });
  const ehBloco = function(i){ return String(est.skus[i]).indexOf("TELA") !== 0; };
  const soma = function(arr, obj){ return arr.reduce(function(s,i){ return s + (obj[i] || 0); }, 0); };
  const blocos = ordem.filter(ehBloco), telas = ordem.filter(function(i){ return !ehBloco(i); });

  alvo.innerHTML = blocoLinear +
    '<h2 class="alv-titulo">Levante · material · ' + esc(est.pavPorCodigo[est.pav].n) + "</h2>" +
    '<div class="alv-tabela-rolante"><table class="alv-tabela">' +
      "<thead><tr><th>SKU</th><th>Previsto (un)</th><th>Estimado assentado</th><th>Saldo</th></tr></thead><tbody>" +
      ordem.map(function(i){
        const p = previsto[i], a = Math.round(assentado[i]);
        return "<tr><td>" + esc(est.skus[i]) + "</td><td>" + ni(p) + "</td><td>" + ni(a) + "</td><td>" + ni(p-a) + "</td></tr>";
      }).join("") +
      "</tbody><tfoot>" +
      linhaTotal("Blocos", soma(blocos, previsto), Math.round(soma(blocos, assentado))) +
      linhaTotal("Telas", soma(telas, previsto), Math.round(soma(telas, assentado))) +
      "</tfoot></table></div>" +
    '<div class="alv-msg">O assentado é estimado: quantidade de projeto × % apontado da parede. ' +
      "Nenhuma contagem de bloco é feita no apontamento. XVAR é bloco cortado, sem dimensão em projeto. " +
      "O bloco calha (CER-CAL) entra como alvenaria; isole-o para separar verga.</div>";
}
function linhaTotal(rotulo, previsto, assentado){
  return "<tr><td>" + rotulo + "</td><td>" + ni(previsto) + "</td><td>" + ni(assentado) +
         "</td><td>" + ni(previsto - assentado) + "</td></tr>";
}
