import { $, esc } from "../ui.js";
import { apagarMovimento, gravarEstoque, lerApontamentos, lerEstoque } from "./nuvem.js";
import { est, hojeISO, nf, ni, porPallet } from "./modelo.js";

/* ------------------------------------------------------------
   ESTOQUE — almoxarifado central de blocos

   Regras combinadas com o Roberto (17/11/2026):
   · um estoque só, da obra inteira;
   · recebimento e contagem digitados em PALLETS INTEIROS;
   · não se lança saída: o consumo de projeto vem dos apontamentos
     de elevação (blocos de projeto × % levantado de cada parede);
   · o consumo REAL só aparece na contagem física:
       consumo real até D  = recebido até D − contado em D
       consumo projeto até D = blocos das paredes × % levantado em D
       % a mais           = real ÷ projeto − 1
   · depois da contagem, o estoque parte do contado:
       estoque = contado + recebido depois − consumo de projeto depois
   · curva ABC por quantidade, em pallets (A até 80%, B até 95%).

   SKU sem número de pallet (família 19, XVAR, telas) fica fora:
   não dá para digitar em pallets o que não tem pallet.
   ------------------------------------------------------------ */

let movs = null;        // movimentos do banco
let aponts = null;      // apontamentos (histórico completo)
let erroLeitura = "";
let modo = "entrada";   // entrada | contagem
let aguardando = "";    // id do movimento armado para excluir

function skusEstoque(){
  const r = [];
  for(let i = 0; i < est.skus.length; i++){ if(porPallet(i) !== null) r.push(i); }
  return r;
}

/* blocos de projeto já levantados, por SKU, até a data (inclusive);
   sem data = tudo o que foi apontado. Usa o último lançamento de
   cada parede até a data — o apontamento é acumulado. */
const cacheProjeto = {};
function consumoProjeto(ate){
  const chave = ate || "*";
  if(cacheProjeto[chave]) return cacheProjeto[chave];
  const ult = {};
  (aponts || []).forEach(function(a){
    if((a.servico || "elevacao") !== "elevacao") return;
    if(ate && String(a.data) > ate) return;
    ult[a.pavimento + "__" + a.parede] = Number(a.percentual) || 0;  // vem em ordem de data
  });
  const c = {};
  for(const k in ult){
    const w = est.porId[k];
    if(!w || !w.sku) continue;
    const f = Math.max(0, Math.min(100, ult[k])) / 100;
    for(const s in w.sku) c[s] = (c[s] || 0) + w.sku[s] * f;
  }
  cacheProjeto[chave] = c;
  return c;
}

function calcular(){
  for(const k in cacheProjeto) delete cacheProjeto[k];
  const hoje = consumoProjeto(null);
  return skusEstoque().map(function(i){
    const nome = est.skus[i], bpp = porPallet(i);
    const ms = (movs || []).filter(function(m){ return m.sku === nome; });
    const entradas = ms.filter(function(m){ return m.tipo === "entrada"; });
    const contagens = ms.filter(function(m){ return m.tipo === "contagem"; });
    const recebido = entradas.reduce(function(s, m){ return s + m.blocos; }, 0);
    const projHoje = hoje[i] || 0;
    const cont = contagens.length ? contagens[contagens.length - 1] : null;
    let estoque, real = null, projAte = null, excesso = null;
    if(cont){
      const D = String(cont.data);
      const entAte = entradas.filter(function(m){ return String(m.data) <= D; })
                             .reduce(function(s, m){ return s + m.blocos; }, 0);
      projAte = consumoProjeto(D)[i] || 0;
      real = entAte - cont.blocos;
      excesso = projAte > 0 ? real / projAte - 1 : null;
      estoque = cont.blocos + (recebido - entAte) - (projHoje - projAte);
    } else {
      estoque = recebido - projHoje;
    }
    return { i: i, nome: nome, bpp: bpp, recebido: recebido, projHoje: projHoje,
             estoque: estoque, cont: cont, real: real, projAte: projAte, excesso: excesso };
  });
}

/* A até 80% do estoque em pallets, B até 95%, C o resto. A classe
   vem do acumulado ANTES do item: o primeiro sempre é A. */
function curvaABC(linhas){
  const itens = linhas.filter(function(l){ return l.estoque > 0; })
    .map(function(l){ return { nome: l.nome, pallets: l.estoque / l.bpp }; })
    .sort(function(a, b){ return b.pallets - a.pallets; });
  const total = itens.reduce(function(s, x){ return s + x.pallets; }, 0);
  let acum = 0;
  itens.forEach(function(x){
    const antes = total > 0 ? acum / total : 0;
    x.classe = antes < 0.80 ? "A" : (antes < 0.95 ? "B" : "C");
    acum += x.pallets;
    x.pct = total > 0 ? x.pallets / total * 100 : 0;
    x.acum = total > 0 ? acum / total * 100 : 0;
  });
  return { itens: itens, total: total };
}

function dataBR(s){ s = String(s || ""); return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4); }
function pct(v){ return (v >= 0 ? "+" : "") + nf(v * 100, 1) + "%"; }

export async function desenharEstoque(recarregar){
  const alvo = $("#alvEstoqueTela");
  if(!alvo) return;
  if(recarregar || movs === null){
    alvo.innerHTML = '<div class="alv-msg">Carregando estoque…</div>';
    try {
      const r = await Promise.all([lerEstoque(), lerApontamentos()]);
      movs = r[0]; aponts = r[1]; erroLeitura = "";
    } catch(e){
      movs = null;
      erroLeitura = (e && e.message) || String(e);
    }
  }
  pintar();
}

function pintar(){
  const alvo = $("#alvEstoqueTela");
  if(!alvo) return;
  if(movs === null){
    alvo.innerHTML = '<div class="vazio" style="margin-top:20px">Não foi possível ler o estoque. ' +
      (/alvenaria_estoque/.test(erroLeitura)
        ? "A tabela ainda não existe: falta rodar a migração <b>006_estoque.sql</b> no Supabase."
        : "Confira a conexão e se você está logado.") +
      '<br><small>' + esc(erroLeitura) + "</small></div>";
    return;
  }
  const linhas = calcular();
  const abc = curvaABC(linhas);
  const comCont = linhas.filter(function(l){ return l.cont && l.projAte > 0; });
  const realT = comCont.reduce(function(s, l){ return s + l.real; }, 0);
  const projT = comCont.reduce(function(s, l){ return s + l.projAte; }, 0);
  const excessoGeral = projT > 0 ? realT / projT - 1 : null;
  const ultimaCont = (movs || []).filter(function(m){ return m.tipo === "contagem"; })
    .map(function(m){ return String(m.data); }).sort().pop();
  const recebidoPal = (movs || []).filter(function(m){ return m.tipo === "entrada"; })
    .reduce(function(s, m){ return s + m.pallets; }, 0);

  alvo.innerHTML =
    '<h2 class="alv-titulo">Estoque central de blocos</h2>' +
    '<div class="indicadores">' +
      ind(nf(abc.total, 1) + " pal", "Em estoque (estimado)",
          ni(Math.round(linhas.reduce(function(s, l){ return s + Math.max(0, l.estoque); }, 0))) + " blocos") +
      ind(excessoGeral === null ? "—" : pct(excessoGeral), "Consumo acima do projeto",
          ultimaCont ? "na contagem de " + dataBR(ultimaCont) : "falta a primeira contagem física",
          excessoGeral !== null && excessoGeral > 0.05 ? "ind--atrasado" : "") +
      ind(ni(recebidoPal) + " pal", "Recebido até hoje", (movs || []).filter(function(m){ return m.tipo === "entrada"; }).length + " lançamento(s)") +
    "</div>" +
    (est.podeGravar ? blocoLancar() : "") +
    tabelaEstoque(linhas) +
    tabelaABC(abc) +
    historico();
}

function ind(numero, rotulo, detalhe, classe){
  return '<div class="ind ' + (classe || "") + '"><span class="ind__n">' + esc(String(numero)) + "</span>" +
    '<span class="ind__r">' + esc(rotulo) + "</span>" +
    (detalhe ? '<span class="ind__d">' + esc(detalhe) + "</span>" : "") + "</div>";
}

function blocoLancar(){
  const ent = modo === "entrada";
  return '<h2 class="alv-titulo">Lançar</h2>' +
    '<div class="chips" role="group" aria-label="Tipo de lançamento">' +
      '<button type="button" class="chip-filtro" data-estmodo="entrada" aria-pressed="' + ent + '">Recebimento</button>' +
      '<button type="button" class="chip-filtro" data-estmodo="contagem" aria-pressed="' + !ent + '">Contagem física</button>' +
    "</div>" +
    '<div class="alv-est-cab">' +
      '<label class="alv-campo"><span>' + (ent ? "Chegou em" : "Contado em") + "</span>" +
        '<input id="alvEstData" type="date" value="' + hojeISO() + '" max="' + hojeISO() + '"></label>' +
      '<label class="alv-campo"><span>Observação</span>' +
        '<input id="alvEstObs" maxlength="200" autocomplete="off" placeholder="' +
        (ent ? "NF, fornecedor, quebras…" : "quem contou, onde…") + '"></label>' +
    "</div>" +
    '<div class="alv-tabela-rolante"><table class="alv-tabela alv-est-grade"><thead><tr>' +
      "<th>SKU</th><th>Blocos/pallet</th><th>Pallets</th><th>= blocos</th></tr></thead><tbody>" +
      skusEstoque().map(function(i){
        return "<tr><td>" + esc(est.skus[i]) + "</td><td>" + ni(porPallet(i)) + "</td>" +
          '<td><input type="number" min="0" step="1" inputmode="numeric" data-estsku="' + esc(est.skus[i]) +
          '" aria-label="Pallets de ' + esc(est.skus[i]) + '"></td>' +
          '<td data-estbl="' + esc(est.skus[i]) + '">—</td></tr>';
      }).join("") +
    "</tbody></table></div>" +
    '<div class="alv-msg">' + (ent
      ? "Preencha só o que chegou. Pallets inteiros."
      : "Preencha só o que foi contado: <b>em branco</b> = não contado; <b>0</b> = contado e não tem nenhum. Pallets inteiros.") +
    "</div>" +
    '<div class="alv-exportar"><button type="button" class="btn btn--marca" id="alvEstLancar">' +
      (ent ? "Lançar recebimento" : "Lançar contagem") + '</button><span class="alv-msg" id="alvEstMsg" role="status"></span></div>';
}

function tabelaEstoque(linhas){
  return '<h2 class="alv-titulo">Por SKU</h2>' +
    '<div class="alv-tabela-rolante"><table class="alv-tabela"><thead><tr>' +
      "<th>SKU</th><th>Recebido</th><th>Levantado (projeto)</th><th>Estoque</th>" +
      "<th>Última contagem</th><th>Consumo real</th><th>Acima do projeto</th></tr></thead><tbody>" +
      linhas.map(function(l){
        const neg = l.estoque < 0;
        return "<tr><td>" + esc(l.nome) + "</td>" +
          "<td>" + ni(Math.round(l.recebido / l.bpp)) + " pal<br><small>" + ni(l.recebido) + " bl</small></td>" +
          "<td>" + ni(Math.round(l.projHoje)) + " bl</td>" +
          '<td class="' + (neg ? "alv-neg" : "") + '">' + nf(l.estoque / l.bpp, 1) + " pal<br><small>" +
            ni(Math.round(l.estoque)) + " bl</small></td>" +
          "<td>" + (l.cont ? dataBR(l.cont.data) + "<br><small>" + ni(l.cont.pallets) + " pal</small>" : "—") + "</td>" +
          "<td>" + (l.real === null ? "—" : ni(Math.round(l.real)) + " bl<br><small>projeto " + ni(Math.round(l.projAte)) + "</small>") + "</td>" +
          '<td class="' + (l.excesso !== null && l.excesso > 0.05 ? "alv-neg" : "") + '"><b>' +
            (l.excesso === null ? "—" : pct(l.excesso)) + "</b></td></tr>";
      }).join("") +
    "</tbody></table></div>" +
    (linhas.some(function(l){ return l.estoque < 0; })
      ? '<div class="alv-msg erro">Estoque negativo: o levantado já passou do que foi recebido. Falta lançar recebimento, ou o apontamento está à frente da obra.</div>'
      : "") +
    '<div class="alv-msg">Estoque = recebido − blocos de projeto das paredes já levantadas. Depois de uma contagem, parte do ' +
      "contado. <b>Acima do projeto</b> só existe a partir da primeira contagem: consumo real (recebido até a contagem − contado) ÷ " +
      "consumo de projeto até aquela data − 1. Família 19, bloco cortado XVAR e telas ficam fora: não têm número de pallet.</div>";
}

function tabelaABC(abc){
  if(!abc.itens.length){
    return '<h2 class="alv-titulo">Curva ABC do estoque</h2><div class="vazio">Sem estoque positivo para classificar.</div>';
  }
  return '<h2 class="alv-titulo">Curva ABC do estoque · em pallets</h2>' +
    '<div class="alv-tabela-rolante"><table class="alv-tabela alv-abc"><thead><tr>' +
      "<th>Classe</th><th>SKU</th><th>Pallets</th><th>%</th><th>% acumulado</th><th></th></tr></thead><tbody>" +
      abc.itens.map(function(x){
        return '<tr><td><span class="alv-abc__c alv-abc__c--' + x.classe + '">' + x.classe + "</span></td>" +
          "<td>" + esc(x.nome) + "</td><td>" + nf(x.pallets, 1) + "</td><td>" + nf(x.pct, 1) + "%</td>" +
          "<td>" + nf(x.acum, 1) + "%</td>" +
          '<td class="alv-abc__barra"><i style="width:' + Math.max(2, Math.round(x.pct)) + '%"></i></td></tr>';
      }).join("") +
    "</tbody></table></div>" +
    '<div class="alv-msg">Ordenado pelo estoque em pallets. <b>A</b>: os itens que somam os primeiros 80% do estoque; ' +
      "<b>B</b>: até 95%; <b>C</b>: o resto. Pallet conta igual para qualquer bloco.</div>";
}

function historico(){
  const ult = (movs || []).slice().reverse().slice(0, 40);
  if(!ult.length) return '<h2 class="alv-titulo">Lançamentos</h2><div class="vazio">Nenhum recebimento ou contagem ainda.</div>';
  return '<h2 class="alv-titulo">Lançamentos</h2><div class="alv-hist">' +
    ult.map(function(m){
      const armado = aguardando === String(m.id);
      return '<div class="alv-hist__l' + (armado ? " confirmando" : "") + '">' +
        '<span class="alv-hist__d">' + dataBR(m.data) + "</span>" +
        "<span><b>" + (m.tipo === "entrada" ? "Recebido" : "Contado") + "</b> · " + esc(m.sku) + " · " +
          ni(m.pallets) + " pal (" + ni(m.blocos) + " bl)" +
          (m.observacao ? " · " + esc(m.observacao) : "") +
          '<br><small>' + esc(m.autor || "") + "</small></span>" +
        (est.podeGravar
          ? '<button type="button" class="alv-hist__x' + (armado ? " confirma" : "") + '" data-estdel="' + esc(m.id) +
            '" aria-label="Excluir lançamento">' + (armado ? "Excluir?" : "×") + "</button>"
          : "") +
        "</div>";
    }).join("") + "</div>";
}

/* ---------- ações ---------- */

async function lancar(botao){
  const msg = $("#alvEstMsg");
  const diz = function(t, erro){ if(msg){ msg.textContent = t; msg.classList.toggle("erro", !!erro); } };
  const data = ($("#alvEstData") && $("#alvEstData").value) || "";
  if(!data){ diz("Informe a data.", true); return; }
  if(data > hojeISO()){ diz("A data está no futuro.", true); return; }
  const obs = (($("#alvEstObs") && $("#alvEstObs").value) || "").trim();
  const linhas = [];
  let invalido = "";
  Array.prototype.forEach.call(document.querySelectorAll("#alvEstoqueTela [data-estsku]"), function(inp){
    const t = String(inp.value).trim();
    if(t === "") return;
    const n = Number(t);
    if(!Number.isInteger(n) || n < 0){ invalido = inp.dataset.estsku; return; }
    if(modo === "entrada" && n === 0) return;
    const i = est.skus.indexOf(inp.dataset.estsku);
    linhas.push({ tipo: modo, data: data, sku: inp.dataset.estsku, pallets: n,
                  blocos_por_pallet: porPallet(i), observacao: obs });
  });
  if(invalido){ diz(invalido + ": use pallets inteiros (0, 1, 2…).", true); return; }
  if(!linhas.length){ diz(modo === "entrada" ? "Nenhum pallet preenchido." : "Nenhum SKU contado.", true); return; }
  botao.disabled = true;
  diz("Gravando…");
  try {
    await gravarEstoque(linhas);
    await desenharEstoque(true);
    const m2 = $("#alvEstMsg");
    if(m2){ m2.textContent = (modo === "entrada" ? "Recebimento lançado: " : "Contagem lançada: ") + linhas.length + " SKU(s)."; }
  } catch(e){
    botao.disabled = false;
    diz("Não gravou: " + ((e && e.message) || e), true);
  }
}

async function excluir(id){
  if(aguardando !== String(id)){ aguardando = String(id); pintar(); return; }
  aguardando = "";
  try { await apagarMovimento(id); await desenharEstoque(true); }
  catch(e){ pintar(); alert("Não excluiu: " + ((e && e.message) || e)); }
}

/* eventos próprios da aba, delegados na seção */
document.addEventListener("click", function(ev){
  const tela = $("#alvEstoqueTela");
  if(!tela || !tela.contains(ev.target)) return;
  const b = ev.target.closest("[data-estmodo],#alvEstLancar,[data-estdel]");
  if(!b){ if(aguardando){ aguardando = ""; pintar(); } return; }
  if(b.dataset.estmodo){ modo = b.dataset.estmodo; aguardando = ""; pintar(); return; }
  if(b.id === "alvEstLancar"){ lancar(b); return; }
  if(b.dataset.estdel){ excluir(b.dataset.estdel); return; }
});
document.addEventListener("input", function(ev){
  const inp = ev.target;
  if(!inp || !inp.dataset || inp.dataset.estsku === undefined) return;
  const cel = document.querySelector('#alvEstoqueTela [data-estbl="' + inp.dataset.estsku + '"]');
  const n = Number(String(inp.value).trim());
  const i = est.skus.indexOf(inp.dataset.estsku);
  if(cel) cel.textContent = String(inp.value).trim() === "" || !Number.isInteger(n) || n < 0 ? "—" : ni(n * porPallet(i));
});
