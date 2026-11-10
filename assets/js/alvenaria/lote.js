import { $, esc } from "../ui.js";
import { campoEquipe, fecharFicha, mostrarFolha, valorEquipe } from "./ficha.js";
import { est, hojeISO, limparSelecao, m2Executado, materialDe, nf, ni, nomesDeEquipe,
         percentual, quantasSelecionadas, selecionadas, temArea } from "./modelo.js";
import { gravarApontamento, gravarPlano } from "./nuvem.js";

/* ------------------------------------------------------------
   LOTE — agir sobre várias paredes de uma vez

   O caso real: "essas doze paredes do 3º tipo a equipe terminou
   hoje", ou "vou executar estas na semana que vem, quanto bloco
   preciso subir para o andar".

   Cada parede recebe o SEU lançamento, com a SUA área. Nada vira
   um registro só: senão a medição por parede e a produtividade por
   equipe deixam de fechar.
   ------------------------------------------------------------ */

let repintar = function(){};
export function definirRepintarLote(fn){ repintar = fn || function(){}; }

/* ---------- barra fixa ---------- */
export function desenharBarraLote(){
  const barra = $("#alvLote");
  if(!barra) return;
  const n = quantasSelecionadas();
  const ligada = est.selecionando && n > 0;
  document.body.classList.toggle("com-lote", ligada);
  barra.classList.toggle("ver", ligada);
  if(!ligada){ barra.innerHTML = ""; return; }

  const paredes = selecionadas();
  const area = paredes.reduce(function(s,w){ return s + (temArea(w) ? w.area : 0); }, 0);
  const feito = paredes.reduce(function(s,w){ return s + m2Executado(w); }, 0);
  const semQuant = paredes.filter(function(w){ return !w.sku; }).length;

  barra.innerHTML =
    '<div class="alv-lote__info"><b>' + n + (n === 1 ? " parede" : " paredes") + "</b>" +
      "<span>" + (area > 0 ? nf(feito,0) + " de " + nf(area,0) + " m² · " : "") +
      esc(est.pavPorCodigo[est.pav].n) +
      (semQuant ? " · " + semQuant + " sem quantitativo" : "") + "</span></div>" +
    '<div class="alv-lote__acoes">' +
      '<button type="button" class="btn" id="alvLoteMaterial">Material</button>' +
      '<button type="button" class="btn" id="alvLotePlanejar">Planejar</button>' +
      '<button type="button" class="btn btn--marca" id="alvLoteApontar">Apontar</button>' +
      '<button type="button" class="btn btn--claro" id="alvLoteLimpar" aria-label="Limpar seleção">Limpar</button>' +
    "</div>";
}

function cabecalho(titulo, subtitulo){
  return '<div class="alv-ficha__cab alv-ficha__pad" id="alvFichaCab">' +
    '<div class="alv-ficha__puxador" aria-hidden="true"></div>' +
    '<div style="display:flex;align-items:flex-start;gap:10px">' +
      '<div style="flex:1 1 auto;min-width:0">' +
        "<h2>" + esc(titulo) + "</h2>" +
        '<div class="alv-ficha__sub">' + esc(subtitulo) + "</div>" +
      "</div>" +
      '<button type="button" class="alv-ficha__x" id="alvFechar" aria-label="Fechar">×</button>' +
    "</div></div>";
}

function resumo(paredes){
  return paredes.length + (paredes.length === 1 ? " parede" : " paredes") + " · " +
         est.pavPorCodigo[est.pav].n + " · " + paredes.map(function(w){ return w.codigo; }).join(", ");
}

/* ============================================================
   MATERIAL DA SELEÇÃO
   ============================================================ */
export function abrirMaterialLote(){
  const paredes = selecionadas();
  if(!paredes.length) return;
  est.loteAberto = true;
  const m = materialDe(paredes);
  const ordem = Object.keys(m.previsto).map(Number).sort(function(a,b){ return a-b; });
  const ehBloco = function(i){ return String(est.skus[i]).indexOf("TELA") !== 0; };
  const soma = function(arr, obj){ return arr.reduce(function(s,i){ return s + (obj[i] || 0); }, 0); };
  const blocos = ordem.filter(ehBloco), telas = ordem.filter(function(i){ return !ehBloco(i); });

  const corpo = ordem.length
    ? '<div class="alv-tabela-rolante"><table class="alv-tabela">' +
        "<thead><tr><th>SKU</th><th>Total (un)</th><th>Falta assentar</th></tr></thead><tbody>" +
        ordem.map(function(i){
          return "<tr><td>" + esc(est.skus[i]) + "</td><td>" + ni(m.previsto[i]) +
                 "</td><td>" + ni(Math.ceil(m.restante[i])) + "</td></tr>";
        }).join("") +
        "</tbody><tfoot>" +
          "<tr><td>Blocos</td><td>" + ni(soma(blocos, m.previsto)) + "</td><td>" +
            ni(Math.ceil(soma(blocos, m.restante))) + "</td></tr>" +
          "<tr><td>Telas</td><td>" + ni(soma(telas, m.previsto)) + "</td><td>" +
            ni(Math.ceil(soma(telas, m.restante))) + "</td></tr>" +
        "</tfoot></table></div>"
    : '<div class="vazio">Nenhuma das peças escolhidas tem quantitativo de projeto.</div>';

  $("#alvFicha").innerHTML =
    cabecalho("Material da seleção", resumo(paredes)) +
    '<div class="alv-bloco-sec alv-ficha__pad">' +
      '<div class="alv-fatos">' +
        '<div class="alv-fato"><div class="alv-fato__r">Área líquida</div><div class="alv-fato__v">' +
          (m.area > 0 ? nf(m.area) + " m²" : "—") + "</div></div>" +
        '<div class="alv-fato"><div class="alv-fato__r">Peças</div><div class="alv-fato__v">' +
          paredes.length + "</div></div>" +
        '<div class="alv-fato"><div class="alv-fato__r">Blocos no total</div><div class="alv-fato__v">' +
          ni(soma(blocos, m.previsto)) + "</div></div>" +
      "</div>" +
      (m.semQuant
        ? '<div class="alv-lote-aviso">' + m.semQuant + (m.semQuant === 1 ? " peça escolhida não tem" : " peças escolhidas não têm") +
          " quantitativo de projeto e ficaram fora desta conta.</div>" : "") +
    "</div>" +
    '<div class="alv-bloco-sec alv-ficha__pad"><h4>Para levar ao andar</h4>' + corpo +
      '<div class="alv-msg">"Falta assentar" desconta o que já foi apontado em cada parede, ' +
        "proporcional ao percentual. Arredondado para cima, bloco não se parte pela metade. " +
        "Blocos cortados (XVAR) entram na contagem de peças, mas não têm dimensão em projeto.</div>" +
    "</div>";
  mostrarFolha();
}

/* ============================================================
   APONTAR EM LOTE
   ============================================================ */
export function abrirApontarLote(){
  const paredes = selecionadas();
  if(!paredes.length) return;
  est.loteAberto = true;
  const semQuant = paredes.filter(function(w){ return !temArea(w); }).length;

  $("#alvFicha").innerHTML =
    cabecalho("Apontar em lote", resumo(paredes)) +
    '<div class="alv-bloco-sec alv-ficha__pad"><h4>Percentual para todas</h4>' +
      '<div class="alv-pcts">' + [0,25,50,75,100].map(function(v){
        return '<button type="button" data-lpct="' + v + '" aria-pressed="' + (v === 100) + '">' + v + "%</button>";
      }).join("") + "</div>" +
      '<input type="range" class="alv-faixa" id="alvLotePct" min="0" max="100" step="1" value="100" aria-label="Percentual executado">' +
      '<div class="alv-grade" style="margin-top:4px">' +
        '<label class="alv-campo"><span>% executado</span>' +
          '<input id="alvLotePctN" type="number" inputmode="numeric" min="0" max="100" step="1" value="100"></label>' +
        '<label class="alv-campo"><span>Data</span>' +
          '<input id="alvLoteData" type="date" value="' + hojeISO() + '" max="' + hojeISO() + '"></label>' +
      "</div>" +
      '<div class="alv-grade" style="margin-top:10px">' +
        campoEquipe("alvLoteEquipe", "alvLoteEquipeOutra", "") +
      "</div>" +
      '<div class="alv-lote-aviso">O percentual vale para cada parede, e o m² de cada uma sai ' +
        "calculado pela sua própria área. Cada peça recebe o seu lançamento no histórico." +
        (semQuant ? " " + semQuant + (semQuant === 1 ? " peça não tem" : " peças não têm") +
          " área de projeto: nelas fica só o percentual." : "") + "</div>" +
      '<button type="button" class="alv-salvar" id="alvLoteRegistrar">Registrar em ' +
        paredes.length + (paredes.length === 1 ? " parede" : " paredes") + "</button>" +
      '<div class="alv-msg" id="alvLoteMsg"></div>' +
    "</div>";
  mostrarFolha();
}

export async function registrarLote(botao){
  const paredes = selecionadas();
  if(!paredes.length) return;
  const pct = Math.max(0, Math.min(100, Math.round(Number(($("#alvLotePct")||{}).value) || 0)));
  const equipe = valorEquipe("alvLoteEquipe", "alvLoteEquipeOutra");
  const data = (($("#alvLoteData") && $("#alvLoteData").value) || hojeISO());
  const msg = $("#alvLoteMsg");

  botao.disabled = true;
  let ok = 0; const falhas = [];
  for(let i = 0; i < paredes.length; i++){
    const w = paredes[i];
    if(msg){ msg.className = "alv-msg"; msg.textContent = "Gravando " + (i+1) + " de " + paredes.length + "…"; }
    const area = temArea(w) ? Math.round(w.area * pct) / 100 : null;
    try{
      await gravarApontamento({ pavimento:w.pav, parede:w.codigo, data:data,
                                percentual:pct, area_m2:area, equipe:equipe });
      est.situacao[w.id] = { pavimento:w.pav, parede:w.codigo, data:data,
                             percentual:pct, area_m2:area, equipe:equipe };
      ok++;
    }catch(e){
      falhas.push(w.codigo + " (" + ((e && (e.message || e.code)) || "erro") + ")");
    }
  }
  botao.disabled = false;
  repintar();

  if(msg){
    if(!falhas.length){
      msg.className = "alv-msg";
      msg.textContent = ok + (ok === 1 ? " parede registrada" : " paredes registradas") +
        " em " + pct + "%" + (equipe ? " por " + equipe : "") + ".";
    }else{
      msg.className = "alv-msg erro";
      msg.textContent = ok + " de " + paredes.length + " gravadas. Falharam: " +
        falhas.slice(0,6).join("; ") + (falhas.length > 6 ? " e mais " + (falhas.length-6) : "") + ".";
    }
  }
  if(!falhas.length){ limparSelecao(); desenharBarraLote(); repintar(); }
}

/* ============================================================
   PLANEJAR EM LOTE
   ============================================================ */
export function abrirPlanejarLote(){
  const paredes = selecionadas();
  if(!paredes.length) return;
  est.loteAberto = true;
  const responsaveis = [];
  for(const k in est.plano){
    const r = est.plano[k] && est.plano[k].responsavel;
    if(r && responsaveis.indexOf(r) === -1) responsaveis.push(r);
  }
  responsaveis.sort();

  $("#alvFicha").innerHTML =
    cabecalho("Planejar em lote", resumo(paredes)) +
    '<div class="alv-bloco-sec alv-ficha__pad"><h4>Responsável e prazo para todas</h4>' +
      '<div class="alv-grade">' +
        '<label class="alv-campo largo"><span>Responsável</span>' +
          '<input id="alvLoteResp" list="alvLoteResps" placeholder="quem responde pelas paredes"></label>' +
        '<label class="alv-campo"><span>Início previsto</span><input id="alvLoteIni" type="date"></label>' +
        '<label class="alv-campo"><span>Fim previsto</span><input id="alvLoteFim" type="date"></label>' +
      "</div>" +
      '<datalist id="alvLoteResps">' +
        responsaveis.map(function(x){ return '<option value="' + esc(x) + '"></option>'; }).join("") +
        nomesDeEquipe().map(function(x){ return '<option value="' + esc(x) + '"></option>'; }).join("") +
      "</datalist>" +
      '<div class="alv-lote-aviso">Campo deixado em branco não apaga o que já existe na parede: ' +
        "só é gravado o que você preencher.</div>" +
      '<button type="button" class="alv-salvar secundario" id="alvLoteSalvarPlano">Salvar em ' +
        paredes.length + (paredes.length === 1 ? " parede" : " paredes") + "</button>" +
      '<div class="alv-msg" id="alvLoteMsg2"></div>' +
    "</div>";
  mostrarFolha();
}

export async function salvarPlanoLote(botao){
  const paredes = selecionadas();
  if(!paredes.length) return;
  const resp = (($("#alvLoteResp") && $("#alvLoteResp").value) || "").trim();
  const ini = ($("#alvLoteIni") && $("#alvLoteIni").value) || "";
  const fim = ($("#alvLoteFim") && $("#alvLoteFim").value) || "";
  const msg = $("#alvLoteMsg2");

  if(!resp && !ini && !fim){
    if(msg){ msg.className = "alv-msg erro"; msg.textContent = "Preencha ao menos um campo."; }
    return;
  }
  if(ini && fim && fim < ini){
    if(msg){ msg.className = "alv-msg erro"; msg.textContent = "O fim previsto está antes do início."; }
    return;
  }

  botao.disabled = true;
  let ok = 0; const falhas = [];
  for(let i = 0; i < paredes.length; i++){
    const w = paredes[i];
    if(msg){ msg.className = "alv-msg"; msg.textContent = "Gravando " + (i+1) + " de " + paredes.length + "…"; }
    const atual = est.plano[w.id] || {};
    try{
      const salvo = await gravarPlano({
        id: atual.id, pavimento: w.pav, parede: w.codigo,
        responsavel: resp || atual.responsavel || "",
        inicio: ini || atual.inicio || "",
        fim: fim || atual.fim || ""
      });
      est.plano[w.id] = { id: salvo.id, responsavel: salvo.responsavel, inicio: salvo.inicio, fim: salvo.fim };
      ok++;
    }catch(e){
      falhas.push(w.codigo + " (" + ((e && (e.message || e.code)) || "erro") + ")");
    }
  }
  botao.disabled = false;
  repintar();

  if(msg){
    if(!falhas.length){
      msg.className = "alv-msg";
      msg.textContent = ok + (ok === 1 ? " parede atualizada." : " paredes atualizadas.");
    }else{
      msg.className = "alv-msg erro";
      msg.textContent = ok + " de " + paredes.length + " gravadas. Falharam: " +
        falhas.slice(0,6).join("; ") + (falhas.length > 6 ? " e mais " + (falhas.length-6) : "") + ".";
    }
  }
  if(!falhas.length){ limparSelecao(); desenharBarraLote(); repintar(); }
}

export function fecharLote(){ fecharFicha(); }
