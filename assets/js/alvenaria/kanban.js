import { esc } from "../ui.js";
import { est, hojeISO, nf, ni } from "./modelo.js";

/* ------------------------------------------------------------
   KANBAN DE REPOSIÇÃO — blocos

   Regras combinadas com o Roberto (23/11/2026):
   · prazo do fornecedor 1 semana, estoque de segurança 1 semana;
   · ponto de pedido = consumo semanal × (prazo + segurança);
   · o pedido repõe até prazo + segurança + 1 semana de ciclo
     (para não pedir toda semana) e fecha caminhão de 120 pallets,
     completando pelos blocos mais consumidos;
   · consumo semanal = ritmo de levante das últimas 4 semanas
     (blocos de projeto × % apontado), o mesmo da cobertura;
   · posição = saldo do almoxarifado + pedido em aberto;
   · pedido em aberto = pedido − recebimentos do mesmo SKU lançados
     a partir da data do pedido, na ordem dos pedidos (o cartão
     sai sozinho quando o material chega);
   · admin e apontador movem os cartões.
   ------------------------------------------------------------ */

export const KB = { prazo: 1, seguranca: 1, ciclo: 1, caminhao: 120 };

function dataCurtaBR(s){ s = String(s || ""); return s.slice(8, 10) + "/" + s.slice(5, 7); }
export function somaDias(iso, n){
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* quanto de cada pedido ainda não chegou (pallets), FIFO por SKU */
export function pedidosAbertos(pedidos, movs){
  const porSku = {};
  (pedidos || []).forEach(function(p){ (porSku[p.sku] = porSku[p.sku] || []).push(p); });
  const r = [];
  for(const sku in porSku){
    const ps = porSku[sku].slice().sort(function(a, b){ return (String(a.data) + a.criado_em).localeCompare(String(b.data) + b.criado_em); });
    const ent = (movs || []).filter(function(m){ return m.tipo === "entrada" && m.sku === sku; })
      .map(function(m){ return { data: String(m.data), pal: m.pallets }; })
      .sort(function(a, b){ return a.data.localeCompare(b.data); });
    ps.forEach(function(p){
      let falta = p.pallets;
      ent.forEach(function(e){
        if(falta <= 0 || e.pal <= 0 || e.data < String(p.data)) return;
        const t = Math.min(falta, e.pal); e.pal -= t; falta -= t;
      });
      r.push(Object.assign({}, p, { aberto: falta }));
    });
  }
  return r;
}

/* situação de cada SKU a partir do almoxarifado (estoque.js) */
export function situacao(almox, abertos){
  return almox.map(function(a){
    const abertoPal = abertos.filter(function(p){ return p.sku === a.nome; })
      .reduce(function(s, p){ return s + Math.max(0, p.aberto); }, 0);
    const posicao = a.saldo + abertoPal * a.bpp;
    const ponto = a.semanal * (KB.prazo + KB.seguranca);
    const alvo = a.semanal * (KB.prazo + KB.seguranca + KB.ciclo);
    const precisa = a.semanal > 0 && posicao < ponto;
    return { nome: a.nome, bpp: a.bpp, saldo: a.saldo, semanal: a.semanal, abertoPal: abertoPal,
             posicao: posicao, ponto: ponto, precisa: precisa,
             sugerido: precisa ? Math.ceil((alvo - posicao) / a.bpp) : 0,
             cobertura: a.semanal > 0 ? Math.max(0, a.saldo) / a.semanal : null };
  });
}

/* fecha o pedido em caminhões de 120: o que falta completar vai
   para os blocos de maior consumo (pallets/semana), maior resto */
export function montarCaminhao(sit){
  const total = sit.reduce(function(s, x){ return s + x.sugerido; }, 0);
  if(!total) return { linhas: [], caminhoes: 0, total: 0 };
  const caminhoes = Math.ceil(total / KB.caminhao);
  const extra = caminhoes * KB.caminhao - total;
  const peso = sit.map(function(x){ return x.semanal > 0 ? x.semanal / x.bpp : 0; });
  const somaPeso = peso.reduce(function(s, v){ return s + v; }, 0);
  const ideal = peso.map(function(v){ return somaPeso > 0 ? extra * v / somaPeso : 0; });
  const add = ideal.map(Math.floor);
  let resto = extra - add.reduce(function(s, v){ return s + v; }, 0);
  ideal.map(function(v, i){ return { i: i, f: v - Math.floor(v) }; })
    .sort(function(a, b){ return b.f - a.f || a.i - b.i; })
    .forEach(function(o){ if(resto > 0 && peso[o.i] > 0){ add[o.i]++; resto--; } });
  const linhas = sit.map(function(x, i){ return { nome: x.nome, bpp: x.bpp, sugerido: x.sugerido, pallets: x.sugerido + add[i] }; })
    .filter(function(l){ return l.pallets > 0; });
  return { linhas: linhas, caminhoes: caminhoes, total: caminhoes * KB.caminhao };
}

/* ---------- tela ---------- */

function cartaoPedir(x){
  return '<div class="alv-kb__card alv-kb__card--pedir"><b>' + esc(x.nome) + "</b>" +
    "<span>saldo " + nf(Math.max(0, x.saldo) / x.bpp, 1) + " pal · cobre " + (x.cobertura === null ? "—" : nf(x.cobertura, 1)) + " sem</span>" +
    (x.abertoPal ? "<span>já pedido: " + ni(x.abertoPal) + " pal</span>" : "") +
    "<span>ponto de pedido " + nf(x.ponto / x.bpp, 1) + " pal</span>" +
    '<span class="alv-kb__sug">pedir ' + ni(x.sugerido) + " pal</span></div>";
}

function cartaoPedido(p, podeGravar, armado){
  const atrasado = p.previsao && String(p.previsao) < hojeISO();
  return '<div class="alv-kb__card' + (atrasado ? " alv-kb__card--atraso" : "") + '"><b>' + esc(p.sku) + "</b>" +
    "<span>" + ni(p.aberto) + " pal em aberto" + (p.aberto !== p.pallets ? " (de " + ni(p.pallets) + ")" : "") + "</span>" +
    "<span>pedido " + dataCurtaBR(p.data) + (p.previsao ? " · chega " + dataCurtaBR(p.previsao) : "") + "</span>" +
    (atrasado ? '<span class="alv-kb__atraso">atrasado</span>' : "") +
    (p.observacao ? "<small>" + esc(p.observacao) + "</small>" : "") +
    (podeGravar
      ? '<span class="alv-kb__acoes">' +
          (p.status === "pedido" ? '<button type="button" class="btn btn--p" data-kbtransito="' + esc(p.id) + '">Em trânsito →</button>' : "") +
          '<button type="button" class="btn btn--p btn--claro" data-kbcancelar="' + esc(p.id) + '">' + (armado ? "Cancelar?" : "×") + "</button>" +
        "</span>"
      : "") +
    "</div>";
}

export function htmlKanban(sit, abertos, opcoes){
  const pedir = sit.filter(function(x){ return x.precisa; });
  const feitos = abertos.filter(function(p){ return p.aberto > 0 && p.status === "pedido"; });
  const transito = abertos.filter(function(p){ return p.aberto > 0 && p.status === "transito"; });
  const ok = sit.filter(function(x){ return !x.precisa; });
  const col = function(tit, cls, n, corpo, rodape){
    return '<div class="alv-kb__col alv-kb__col--' + cls + '"><div class="alv-kb__tit">' + tit +
      ' <span class="chip-filtro__n">' + n + "</span></div>" + (corpo || '<div class="alv-kb__vazio">—</div>') + (rodape || "") + "</div>";
  };
  return '<h2 class="alv-titulo">Kanban de reposição</h2>' +
    '<div class="alv-kb">' +
      col("Pedir", "pedir", pedir.length, pedir.map(cartaoPedir).join(""),
          pedir.length && opcoes.podeGravar && !opcoes.montando
            ? '<button type="button" class="btn btn--marca alv-kb__montar" id="alvKbMontar">Montar pedido · caminhão de ' + KB.caminhao + "</button>" : "") +
      col("Pedido feito", "feito", feitos.length, feitos.map(function(p){ return cartaoPedido(p, opcoes.podeGravar, opcoes.armado === String(p.id)); }).join("")) +
      col("Em trânsito", "transito", transito.length, transito.map(function(p){ return cartaoPedido(p, opcoes.podeGravar, opcoes.armado === String(p.id)); }).join("")) +
      col("OK", "ok", ok.length, ok.map(function(x){
        return '<div class="alv-kb__mini"><b>' + esc(x.nome) + "</b><span>" +
          (x.abertoPal > 0 ? "aguardando " + ni(x.abertoPal) + " pal"
            : x.semanal > 0 ? "cobre " + nf(x.cobertura, 1) + " sem" : "sem consumo recente") + "</span></div>";
      }).join("")) +
    "</div>" +
    (opcoes.montando ? htmlMontagem(sit) : "") +
    '<div class="alv-msg">Ponto de pedido = consumo semanal × ' + (KB.prazo + KB.seguranca) + " semanas (" + KB.prazo +
      " de prazo do fornecedor + " + KB.seguranca + " de segurança). O pedido repõe até " + (KB.prazo + KB.seguranca + KB.ciclo) +
      " semanas e fecha caminhão de " + KB.caminhao + " pallets pelos blocos mais consumidos. O cartão sai de “Pedido feito” " +
      "sozinho quando o recebimento é lançado. Consumo semanal = ritmo de levante das últimas 4 semanas: sem levante " +
      "apontado, o bloco não entra em pedido.</div>";
}

function htmlMontagem(sit){
  const m = montarCaminhao(sit);
  if(!m.linhas.length) return "";
  return '<div class="alv-kb__montagem"><h3>Pedido · ' + m.caminhoes + " caminhão(ões) · " + ni(m.total) + " pallets</h3>" +
    '<div class="alv-est-cab">' +
      '<label class="alv-campo"><span>Data do pedido</span><input id="alvKbData" type="date" value="' + hojeISO() + '" max="' + hojeISO() + '"></label>' +
      '<label class="alv-campo"><span>Previsão de chegada</span><input id="alvKbPrev" type="date" value="' + somaDias(hojeISO(), 7 * KB.prazo) + '"></label>' +
      '<label class="alv-campo largo"><span>Observação</span><input id="alvKbObs" maxlength="200" autocomplete="off" placeholder="fornecedor, nº do pedido…"></label>' +
    "</div>" +
    '<div class="alv-tabela-rolante"><table class="alv-tabela alv-est-grade"><thead><tr>' +
      "<th>SKU</th><th>Pela necessidade</th><th>Pallets no pedido</th><th>= blocos</th></tr></thead><tbody>" +
      m.linhas.map(function(l){
        return "<tr><td>" + esc(l.nome) + "</td><td>" + ni(l.sugerido) + "</td>" +
          '<td><input type="number" min="0" step="1" inputmode="numeric" value="' + l.pallets + '" data-kbsku="' + esc(l.nome) +
          '" data-kbbpp="' + l.bpp + '" aria-label="Pallets de ' + esc(l.nome) + '"></td>' +
          '<td data-kbbl="' + esc(l.nome) + '">' + ni(l.pallets * l.bpp) + "</td></tr>";
      }).join("") +
      '</tbody><tfoot><tr><td>Total</td><td></td><td id="alvKbTotal">' + ni(m.total) + ' pal</td><td></td></tr></tfoot></table></div>' +
    '<div class="alv-msg" id="alvKbAviso"></div>' +
    '<div class="alv-exportar"><button type="button" class="btn btn--marca" id="alvKbRegistrar">Registrar pedido</button>' +
      '<button type="button" class="btn btn--claro" id="alvKbFechar">Fechar</button>' +
      '<span class="alv-msg" id="alvKbMsg" role="status"></span></div></div>';
}

/* total do pedido enquanto se edita: avisa se não fecha caminhão */
export function atualizarTotalMontagem(){
  let tot = 0;
  Array.prototype.forEach.call(document.querySelectorAll("[data-kbsku]"), function(inp){
    const n = Number(inp.value);
    const ok = Number.isInteger(n) && n >= 0;
    if(ok) tot += n;
    const cel = document.querySelector('[data-kbbl="' + inp.dataset.kbsku + '"]');
    if(cel) cel.textContent = ok ? ni(n * Number(inp.dataset.kbbpp)) : "—";
  });
  const t = document.getElementById("alvKbTotal"); if(t) t.textContent = ni(tot) + " pal";
  const a = document.getElementById("alvKbAviso");
  if(a){
    const r = tot % KB.caminhao;
    a.textContent = r === 0 ? "" : "Não fecha caminhão: " + ni(tot) + " pallets = " + Math.floor(tot / KB.caminhao) +
      " caminhão(ões) cheio(s) + " + ni(r) + " pallets.";
    a.classList.toggle("erro", r !== 0);
  }
  return tot;
}
