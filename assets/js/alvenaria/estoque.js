import { $, esc } from "../ui.js";
import { apagarMovimento, atualizarPedido, cancelarPedido, gravarEstoque, gravarPedidos, lerApontamentos, lerEstoque, lerPedidos } from "./nuvem.js";
import { atualizarTotalMontagem, htmlKanban, pedidosAbertos, situacao } from "./kanban.js";
import { apartamentosDe, est, hojeISO, nf, ni, porPallet } from "./modelo.js";

/* ------------------------------------------------------------
   ESTOQUE — almoxarifado central de blocos

   Movimentos (migrações 006 e 007), em pallets + avulsos:
     entrada    chegou na obra                      + almoxarifado
     envio      almoxarifado → pavimento/apartamento − almox, + andar
     devolucao  sobra do andar volta                 + almox, − andar
     quebra     perda/avaria no almoxarifado         − almox
     contagem   contagem física do almoxarifado: acerta o saldo, e a
                diferença vira "divergência de almoxarifado"

   Consumo acima do projeto (por andar ou apartamento):
     enviado líquido (envios − devoluções) ÷ blocos de projeto já
     levantados (blocos de cada parede × % do último apontamento) − 1.
   Enquanto o andar/apartamento não chega a 100%, parte do enviado
   ainda está empilhada lá: o número é "parcial". O indicador do alto
   só soma andares e apartamentos CONCLUÍDOS.

   Cobertura: saldo do almoxarifado ÷ consumo de projeto médio das
   últimas 4 semanas (ritmo real dos apontamentos).

   SKU sem número de pallet (família 19, XVAR, telas) fica fora.
   ------------------------------------------------------------ */

const ROTULO = { entrada: "Recebimento", envio: "Envio para o andar", devolucao: "Devolução do andar",
                 quebra: "Quebra / perda", contagem: "Contagem física" };
const LIMITE_EXCESSO = 0.05;   // vermelho acima de 5% (combinado em 17/11/2026)
const COBERTURA_MIN = 2;       // semanas

let movs = null, aponts = null, erroLeitura = "";
let modo = "entrada";
let aguardando = "";
let destPav = "", destApto = "";
/* kanban de reposição: pedidos (migração 008) e o painel de montagem */
let pedidos = [], erroPedidos = "", montando = false, armadoKb = "";

function skusEstoque(){
  const r = [];
  for(let i = 0; i < est.skus.length; i++){ if(porPallet(i) !== null) r.push(i); }
  return r;
}
function pavsComMaterial(){
  return est.pavimentos.filter(function(p){
    return (est.porPavimento[p.c] || []).some(function(w){ return w.sku; });
  });
}
function dataBR(s){ s = String(s || ""); return s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4); }
function pct(v){ return (v >= 0 ? "+" : "") + nf(v * 100, 1) + "%"; }
function diasAntes(iso, n){
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function palBl(bl, bpp){ return nf(bl / bpp, 1) + " pal<br><small>" + ni(Math.round(bl)) + " bl</small>"; }

/* % levantado de cada parede até a data (último apontamento) */
const cachePct = {};
function pctAte(ate){
  const k = ate || "*";
  if(cachePct[k]) return cachePct[k];
  const ult = {};
  (aponts || []).forEach(function(a){
    if((a.servico || "elevacao") !== "elevacao") return;
    if(ate && String(a.data) > ate) return;
    ult[a.pavimento + "__" + a.parede] = Math.max(0, Math.min(100, Number(a.percentual) || 0)) / 100;
  });
  cachePct[k] = ult;
  return ult;
}
/* paredes de um escopo: pavimento inteiro (apto vazio) ou apartamento */
function paredesDe(pav, apto){
  return (est.porPavimento[pav] || []).filter(function(w){
    return w.sku && (!apto || w.aptos.indexOf(apto) !== -1);
  });
}
/* blocos de projeto por SKU: previsto e levantado até a data */
function projeto(paredes, ate){
  const f = pctAte(ate), prev = {}, lev = {};
  paredes.forEach(function(w){
    const p = f[w.id] || 0;
    for(const s in w.sku){
      prev[s] = (prev[s] || 0) + w.sku[s];
      lev[s] = (lev[s] || 0) + w.sku[s] * p;
    }
  });
  return { prev: prev, lev: lev };
}
const somaSkus = function(obj){ return skusEstoque().reduce(function(s, i){ return s + (obj[i] || 0); }, 0); };

function calcular(){
  for(const k in cachePct) delete cachePct[k];
  const skus = skusEstoque();
  const hoje = hojeISO();

  /* 1. almoxarifado por SKU, em ordem cronológica */
  const almox = {};
  skus.forEach(function(i){
    almox[i] = { i: i, nome: est.skus[i], bpp: porPallet(i), saldo: 0, recebido: 0, enviado: 0,
                 devolvido: 0, quebrado: 0, cont: null, div: null };
  });
  const porNome = {}; skus.forEach(function(i){ porNome[est.skus[i]] = almox[i]; });
  (movs || []).forEach(function(m){
    const a = porNome[m.sku]; if(!a) return;
    const b = m.blocos;
    if(m.tipo === "entrada"){ a.saldo += b; a.recebido += b; }
    else if(m.tipo === "envio"){ a.saldo -= b; a.enviado += b; }
    else if(m.tipo === "devolucao"){ a.saldo += b; a.devolvido += b; }
    else if(m.tipo === "quebra"){ a.saldo -= b; a.quebrado += b; }
    else if(m.tipo === "contagem"){ a.div = b - a.saldo; a.saldo = b; a.cont = m; }
  });

  /* 2. cobertura: consumo de projeto do prédio nas últimas 4 semanas */
  const todas = [];
  pavsComMaterial().forEach(function(p){ paredesDe(p.c, "").forEach(function(w){ todas.push(w); }); });
  const levHoje = projeto(todas, null).lev, lev28 = projeto(todas, diasAntes(hoje, 28)).lev;
  skus.forEach(function(i){
    const a = almox[i];
    a.levTotal = levHoje[i] || 0;
    a.semanal = Math.max(0, (levHoje[i] || 0) - (lev28[i] || 0)) / 4;
    a.cobertura = a.semanal > 0 ? Math.max(0, a.saldo) / a.semanal : null;
    a.liquido = a.enviado - a.devolvido;
  });

  /* 3. escopos com envio: andar inteiro e apartamentos */
  const env = {};   // "PAV|APTO" -> {sku: blocos líquidos}
  (movs || []).forEach(function(m){
    if(m.tipo !== "envio" && m.tipo !== "devolucao") return;
    if(!porNome[m.sku]) return;
    const sinal = m.tipo === "envio" ? 1 : -1;
    const i = porNome[m.sku].i;
    [m.pavimento + "|", m.apartamento ? m.pavimento + "|" + m.apartamento : null].forEach(function(k){
      if(!k) return;
      env[k] = env[k] || {};
      env[k][i] = (env[k][i] || 0) + sinal * m.blocos;
    });
  });
  const escopos = Object.keys(env).sort().map(function(k){
    const pav = k.split("|")[0], apto = k.split("|")[1] || "";
    const pr = projeto(paredesDe(pav, apto), null);
    const enviado = somaSkus(env[k]), lev = somaSkus(pr.lev), prev = somaSkus(pr.prev);
    const fracao = prev > 0 ? lev / prev : 0;
    return { chave: k, pav: pav, apto: apto, enviado: enviado, lev: lev, prev: prev, fracao: fracao,
             concluido: fracao >= 0.995, noAndar: enviado - lev,
             excesso: lev > 0 ? enviado / lev - 1 : null, porSku: env[k], projSku: pr };
  });

  /* 4. excesso consolidado: andares concluídos inteiros; senão, os
        apartamentos concluídos daquele andar */
  let eT = 0, lT = 0; const contados = [];
  const porPav = {};
  escopos.forEach(function(e){ (porPav[e.pav] = porPav[e.pav] || []).push(e); });
  for(const pav in porPav){
    const andar = porPav[pav].find(function(e){ return !e.apto; });
    if(andar && andar.concluido){ eT += andar.enviado; lT += andar.lev; contados.push(andar); continue; }
    porPav[pav].filter(function(e){ return e.apto && e.concluido; })
      .forEach(function(e){ eT += e.enviado; lT += e.lev; contados.push(e); });
  }
  return { almox: skus.map(function(i){ return almox[i]; }), escopos: escopos,
           excessoGeral: lT > 0 ? eT / lT - 1 : null, contados: contados };
}

function curvaABC(almox){
  const itens = almox.filter(function(a){ return a.saldo > 0; })
    .map(function(a){ return { nome: a.nome, pallets: a.saldo / a.bpp }; })
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

/* ---------- tela ---------- */

export async function desenharEstoque(recarregar){
  const alvo = $("#alvEstoqueTela");
  if(!alvo) return;
  if(recarregar || movs === null){
    alvo.innerHTML = '<div class="alv-msg">Carregando estoque…</div>';
    try {
      const r = await Promise.all([lerEstoque(), lerApontamentos()]);
      movs = r[0]; aponts = r[1]; erroLeitura = "";
    } catch(e){ movs = null; erroLeitura = (e && e.message) || String(e); }
    /* pedidos à parte: sem a migração 008 o resto do estoque funciona */
    try { pedidos = await lerPedidos(); erroPedidos = ""; }
    catch(e){ pedidos = []; erroPedidos = (e && e.message) || String(e); }
  }
  pintar();
}

function ind(numero, rotulo, detalhe, classe){
  return '<div class="ind ' + (classe || "") + '"><span class="ind__n">' + esc(String(numero)) + "</span>" +
    '<span class="ind__r">' + esc(rotulo) + "</span>" +
    (detalhe ? '<span class="ind__d">' + esc(detalhe) + "</span>" : "") + "</div>";
}

function pintar(){
  const alvo = $("#alvEstoqueTela");
  if(!alvo) return;
  if(movs === null){
    alvo.innerHTML = '<div class="vazio" style="margin-top:20px">Não foi possível ler o estoque. ' +
      (/alvenaria_estoque|avulsos|pavimento/.test(erroLeitura)
        ? "Falta rodar no Supabase a migração <b>006_estoque.sql</b> e/ou a <b>007_estoque_movimentos.sql</b>."
        : "Confira a conexão e se você está logado.") +
      "<br><small>" + esc(erroLeitura) + "</small></div>";
    return;
  }
  const c = calcular();
  const abc = curvaABC(c.almox);
  const recebido = c.almox.reduce(function(s, a){ return s + a.recebido; }, 0);
  const quebrado = c.almox.reduce(function(s, a){ return s + a.quebrado; }, 0);
  const comCob = c.almox.filter(function(a){ return a.cobertura !== null; })
    .sort(function(a, b){ return a.cobertura - b.cobertura; });
  const pior = comCob[0];

  alvo.innerHTML =
    '<h2 class="alv-titulo">Estoque central de blocos</h2>' +
    '<div class="indicadores">' +
      ind(nf(abc.total, 1) + " pal", "No almoxarifado",
          ni(Math.round(c.almox.reduce(function(s, a){ return s + Math.max(0, a.saldo); }, 0))) + " blocos") +
      ind(c.excessoGeral === null ? "—" : pct(c.excessoGeral), "Consumo acima do projeto",
          c.contados.length ? "em " + c.contados.length + " andar(es)/apto(s) concluído(s)" : "nenhum andar ou apto concluído com envio",
          c.excessoGeral !== null && c.excessoGeral > LIMITE_EXCESSO ? "ind--atrasado" : "") +
      ind(pior ? nf(pior.cobertura, 1) + " sem" : "—", "Menor cobertura",
          pior ? pior.nome + " no ritmo das últimas 4 semanas" : "sem levante nas últimas 4 semanas",
          pior && pior.cobertura < COBERTURA_MIN ? "ind--atrasado" : "") +
      ind(recebido > 0 ? nf(quebrado / recebido * 100, 1) + "%" : "—", "Quebra",
          ni(quebrado) + " blocos lançados como perda") +
    "</div>" +
    blocoKanban(c) +
    (est.podeGravar ? blocoLancar(c) : "") +
    tabelaAlmox(c) +
    tabelaEscopos(c) +
    tabelaABC(abc) +
    historico();
}

function blocoKanban(c){
  if(erroPedidos){
    return '<h2 class="alv-titulo">Kanban de reposição</h2><div class="alv-msg erro">Os pedidos não puderam ser lidos' +
      (/alvenaria_pedidos/.test(erroPedidos) ? ": falta rodar a migração <b>008_pedidos.sql</b> no Supabase." : ": " + esc(erroPedidos)) + "</div>";
  }
  const ab = pedidosAbertos(pedidos, movs);
  return htmlKanban(situacao(c.almox, ab), ab, { podeGravar: est.podeGravar, montando: montando, armado: armadoKb });
}

async function registrarPedido(botao){
  const msg = $("#alvKbMsg");
  const diz = function(t, erro){ if(msg){ msg.textContent = t; msg.classList.toggle("erro", !!erro); } };
  const data = ($("#alvKbData") && $("#alvKbData").value) || "";
  const prev = ($("#alvKbPrev") && $("#alvKbPrev").value) || "";
  if(!data || data > hojeISO()){ diz("Confira a data do pedido.", true); return; }
  if(prev && prev < data){ diz("A previsão de chegada está antes do pedido.", true); return; }
  const obs = (($("#alvKbObs") && $("#alvKbObs").value) || "").trim();
  const linhas = []; let invalido = "";
  Array.prototype.forEach.call(document.querySelectorAll("#alvEstoqueTela [data-kbsku]"), function(inp){
    const t = String(inp.value).trim(); if(t === "") return;
    const n = Number(t);
    if(!Number.isInteger(n) || n < 0){ invalido = inp.dataset.kbsku; return; }
    if(n === 0) return;
    linhas.push({ data: data, sku: inp.dataset.kbsku, pallets: n, blocos_por_pallet: Number(inp.dataset.kbbpp), previsao: prev, observacao: obs });
  });
  if(invalido){ diz(invalido + ": use pallets inteiros.", true); return; }
  if(!linhas.length){ diz("Nenhum pallet no pedido.", true); return; }
  botao.disabled = true; diz("Gravando…");
  try {
    await gravarPedidos(linhas);
    montando = false;
    await desenharEstoque(true);
  } catch(e){ botao.disabled = false; diz("Não gravou: " + ((e && e.message) || e), true); }
}

async function moverPedido(id, acao){
  if(acao === "cancelar" && armadoKb !== String(id)){ armadoKb = String(id); pintar(); return; }
  armadoKb = "";
  try {
    if(acao === "cancelar") await cancelarPedido(id);
    else await atualizarPedido(id, { status: "transito" });
    await desenharEstoque(true);
  } catch(e){ pintar(); alert("Não foi possível: " + ((e && e.message) || e)); }
}

function blocoLancar(c){
  const comDestino = modo === "envio" || modo === "devolucao";
  const comAvulso = modo !== "entrada";
  const pavs = pavsComMaterial();
  if(comDestino && !destPav) destPav = (pavs[0] || {}).c || "";
  const aptos = apartamentosDe(destPav);
  if(destApto && aptos.indexOf(destApto) === -1) destApto = "";
  const dica = {
    entrada: "Preencha só o que chegou, em pallets inteiros. Conferir NF × pallets na descarga.",
    envio: "O que o guincho/elevador levou para o andar. Use “Sugerir” para preencher com o que falta enviar.",
    devolucao: "Sobra que voltou do andar para o almoxarifado (ao fechar o apartamento/andar).",
    quebra: "Bloco perdido no almoxarifado ou na descarga. Diga o motivo na observação.",
    contagem: "Só o ALMOXARIFADO. Em branco = não contado; 0 = contado e não tem. Pallet aberto: some os blocos soltos em “avulsos”."
  }[modo];
  return '<h2 class="alv-titulo">Lançar</h2>' +
    '<div class="chips" role="group" aria-label="Tipo de lançamento">' +
      Object.keys(ROTULO).map(function(k){
        return '<button type="button" class="chip-filtro" data-estmodo="' + k + '" aria-pressed="' + (modo === k) + '">' + ROTULO[k] + "</button>";
      }).join("") +
    "</div>" +
    '<div class="alv-est-cab">' +
      '<label class="alv-campo"><span>Data</span><input id="alvEstData" type="date" value="' + hojeISO() + '" max="' + hojeISO() + '"></label>' +
      (comDestino
        ? '<label class="alv-campo"><span>' + (modo === "envio" ? "Para o pavimento" : "Do pavimento") + "</span>" +
            '<select id="alvEstPav">' + pavs.map(function(p){
              return '<option value="' + esc(p.c) + '"' + (p.c === destPav ? " selected" : "") + ">" + esc(p.n) + "</option>";
            }).join("") + "</select></label>" +
          '<label class="alv-campo"><span>Apartamento</span><select id="alvEstApto">' +
            '<option value="">Andar inteiro / área comum</option>' +
            aptos.map(function(a){ return '<option value="' + a + '"' + (a === destApto ? " selected" : "") + ">" + a + "</option>"; }).join("") +
          "</select></label>"
        : "") +
      '<label class="alv-campo"><span>Observação</span><input id="alvEstObs" maxlength="200" autocomplete="off" placeholder="' +
        ({ entrada: "NF, fornecedor…", quebra: "motivo da quebra", contagem: "quem contou" }[modo] || "guincho, equipe…") + '"></label>' +
    "</div>" +
    '<div class="alv-tabela-rolante"><table class="alv-tabela alv-est-grade"><thead><tr>' +
      "<th>SKU</th><th>Blocos/pallet</th><th>Pallets</th>" + (comAvulso ? "<th>Avulsos</th>" : "") +
      "<th>= blocos</th>" + (modo === "envio" ? "<th>Falta enviar</th>" : "") + "</tr></thead><tbody>" +
      skusEstoque().map(function(i){
        const n = esc(est.skus[i]);
        return "<tr><td>" + n + "</td><td>" + ni(porPallet(i)) + "</td>" +
          '<td><input type="number" min="0" step="1" inputmode="numeric" data-estsku="' + n + '" aria-label="Pallets de ' + n + '"></td>' +
          (comAvulso ? '<td><input type="number" min="0" step="1" inputmode="numeric" data-estav="' + n + '" aria-label="Blocos avulsos de ' + n + '"></td>' : "") +
          '<td data-estbl="' + n + '">—</td>' +
          (modo === "envio" ? '<td data-estfalta="' + n + '">' + faltaEnviar(c, i) + "</td>" : "") + "</tr>";
      }).join("") +
    "</tbody></table></div>" +
    '<div class="alv-msg">' + dica + "</div>" +
    '<div class="alv-exportar">' +
      (modo === "envio" ? '<button type="button" class="btn" id="alvEstSugerir">Sugerir pelo que falta enviar</button>' : "") +
      '<button type="button" class="btn btn--marca" id="alvEstLancar">Lançar ' + ROTULO[modo].toLowerCase() + "</button>" +
      '<span class="alv-msg" id="alvEstMsg" role="status"></span></div>';
}

/* falta enviar para o destino escolhido = previsto do escopo − enviado
   líquido para ele (o que já foi assentado veio de envios anteriores) */
function faltaBlocos(c, i){
  if(!destPav) return 0;
  const prev = projeto(paredesDe(destPav, destApto), null).prev[i] || 0;
  const e = c.escopos.find(function(x){ return x.chave === destPav + "|" + destApto; });
  return Math.max(0, prev - ((e && e.porSku[i]) || 0));
}
function faltaEnviar(c, i){
  const b = faltaBlocos(c, i);
  return b > 0 ? Math.ceil(b / porPallet(i)) + " pal" : "—";
}

function tabelaAlmox(c){
  return '<h2 class="alv-titulo">Almoxarifado por SKU</h2>' +
    '<div class="alv-tabela-rolante"><table class="alv-tabela"><thead><tr>' +
      "<th>SKU</th><th>Recebido</th><th>Enviado líquido</th><th>Quebra</th><th>Saldo</th>" +
      "<th>Última contagem</th><th>Divergência</th><th>Cobertura</th></tr></thead><tbody>" +
      c.almox.map(function(a){
        return "<tr><td>" + esc(a.nome) + "</td><td>" + palBl(a.recebido, a.bpp) + "</td>" +
          "<td>" + palBl(a.liquido, a.bpp) + "</td><td>" + ni(a.quebrado) + " bl</td>" +
          '<td class="' + (a.saldo < 0 ? "alv-neg" : "") + '"><b>' + palBl(a.saldo, a.bpp) + "</b></td>" +
          "<td>" + (a.cont ? dataBR(a.cont.data) : "—") + "</td>" +
          '<td class="' + (a.div !== null && a.div < 0 ? "alv-neg" : "") + '">' +
            (a.div === null ? "—" : (a.div > 0 ? "+" : "") + ni(a.div) + " bl") + "</td>" +
          '<td class="' + (a.cobertura !== null && a.cobertura < COBERTURA_MIN ? "alv-neg" : "") + '">' +
            (a.cobertura === null ? "—" : nf(a.cobertura, 1) + " sem") + "</td></tr>";
      }).join("") +
    "</tbody></table></div>" +
    (c.almox.some(function(a){ return a.saldo < 0; })
      ? '<div class="alv-msg erro">Saldo negativo: saiu mais do que entrou. Falta lançar recebimento ou houve envio em dobro.</div>' : "") +
    '<div class="alv-msg">Saldo = recebido − enviado + devolvido − quebra; a contagem física acerta o saldo e a diferença aparece em ' +
      "<b>Divergência</b> (negativa = sumiu material do almoxarifado sem lançamento). <b>Cobertura</b> = saldo ÷ consumo médio " +
      "semanal de projeto das últimas 4 semanas; em vermelho abaixo de " + COBERTURA_MIN + " semanas — hora de pedir.</div>";
}

function tabelaEscopos(c){
  if(!c.escopos.length){
    return '<h2 class="alv-titulo">Consumo por andar e apartamento</h2>' +
      '<div class="vazio">Nenhum envio lançado ainda. O consumo acima do projeto aparece quando o material sai do almoxarifado para o andar.</div>';
  }
  return '<h2 class="alv-titulo">Consumo por andar e apartamento</h2>' +
    '<div class="alv-tabela-rolante"><table class="alv-tabela"><thead><tr>' +
      "<th>Destino</th><th>Levantado</th><th>Enviado líquido</th><th>Projeto levantado</th>" +
      "<th>No andar (estim.)</th><th>Acima do projeto</th></tr></thead><tbody>" +
      c.escopos.map(function(e){
        const nome = (est.pavPorCodigo[e.pav] || {}).n || e.pav;
        const exc = e.excesso === null ? "—" : pct(e.excesso);
        const verm = e.concluido && e.excesso !== null && e.excesso > LIMITE_EXCESSO;
        return "<tr><td>" + esc(nome) + (e.apto ? " · <b>" + esc(e.apto) + "</b>" : " <small>(andar todo)</small>") + "</td>" +
          "<td>" + nf(e.fracao * 100, 0) + "%</td><td>" + ni(Math.round(e.enviado)) + " bl</td>" +
          "<td>" + ni(Math.round(e.lev)) + " bl</td>" +
          '<td class="' + (e.noAndar < 0 ? "alv-neg" : "") + '">' + ni(Math.round(e.noAndar)) + " bl</td>" +
          '<td class="' + (verm ? "alv-neg" : "") + '">' + (e.concluido ? "<b>" + exc + "</b>" : exc + " <small>parcial</small>") + "</td></tr>";
      }).join("") +
    "</tbody></table></div>" +
    '<div class="alv-msg"><b>Acima do projeto</b> = enviado líquido ÷ blocos de projeto já levantados − 1. Só vale como resultado ' +
      "quando o destino chega a 100% e a sobra é devolvida; antes disso aparece como <small>parcial</small> (inclui material " +
      "ainda empilhado no andar). <b>No andar</b> negativo = levantou mais do que foi enviado: falta lançar envio.</div>";
}

function tabelaABC(abc){
  if(!abc.itens.length){
    return '<h2 class="alv-titulo">Curva ABC do almoxarifado</h2><div class="vazio">Sem saldo positivo para classificar.</div>';
  }
  return '<h2 class="alv-titulo">Curva ABC do almoxarifado · em pallets</h2>' +
    '<div class="alv-tabela-rolante"><table class="alv-tabela alv-abc"><thead><tr>' +
      "<th>Classe</th><th>SKU</th><th>Pallets</th><th>%</th><th>% acumulado</th><th></th></tr></thead><tbody>" +
      abc.itens.map(function(x){
        return '<tr><td><span class="alv-abc__c alv-abc__c--' + x.classe + '">' + x.classe + "</span></td>" +
          "<td>" + esc(x.nome) + "</td><td>" + nf(x.pallets, 1) + "</td><td>" + nf(x.pct, 1) + "%</td>" +
          "<td>" + nf(x.acum, 1) + "%</td>" +
          '<td class="alv-abc__barra"><i style="width:' + Math.max(2, Math.round(x.pct)) + '%"></i></td></tr>';
      }).join("") +
    "</tbody></table></div>" +
    '<div class="alv-msg"><b>A</b>: itens que somam os primeiros 80% dos pallets parados; <b>B</b>: até 95%; <b>C</b>: o resto. ' +
      "Comece a contagem pelos A.</div>";
}

function historico(){
  const ult = (movs || []).slice().reverse().slice(0, 50);
  if(!ult.length) return '<h2 class="alv-titulo">Lançamentos</h2><div class="vazio">Nenhum lançamento ainda.</div>';
  const verbo = { entrada: "Recebido", envio: "Enviado", devolucao: "Devolvido", quebra: "Quebra", contagem: "Contado" };
  return '<h2 class="alv-titulo">Lançamentos</h2><div class="alv-hist">' +
    ult.map(function(m){
      const armado = aguardando === String(m.id);
      const dest = m.pavimento ? " · " + (m.tipo === "envio" ? "→ " : "← ") +
        esc((est.pavPorCodigo[m.pavimento] || {}).n || m.pavimento) + (m.apartamento ? " " + esc(m.apartamento) : "") : "";
      return '<div class="alv-hist__l' + (armado ? " confirmando" : "") + '">' +
        '<span class="alv-hist__d">' + dataBR(m.data) + "</span>" +
        "<span><b>" + verbo[m.tipo] + "</b> · " + esc(m.sku) + " · " + ni(m.pallets) + " pal" +
          (m.avulsos ? " + " + ni(m.avulsos) + " av" : "") + " (" + ni(m.blocos) + " bl)" + dest +
          (m.observacao ? " · " + esc(m.observacao) : "") + "<br><small>" + esc(m.autor || "") + "</small></span>" +
        (est.podeGravar
          ? '<button type="button" class="alv-hist__x' + (armado ? " confirma" : "") + '" data-estdel="' + esc(m.id) +
            '" aria-label="Excluir lançamento">' + (armado ? "Excluir?" : "×") + "</button>"
          : "") +
        "</div>";
    }).join("") + "</div>";
}

/* ---------- ações ---------- */

function inteiro(t){ t = String(t == null ? "" : t).trim(); if(t === "") return ""; const n = Number(t); return Number.isInteger(n) && n >= 0 ? n : NaN; }

async function lancar(botao){
  const msg = $("#alvEstMsg");
  const diz = function(t, erro){ if(msg){ msg.textContent = t; msg.classList.toggle("erro", !!erro); } };
  const data = ($("#alvEstData") && $("#alvEstData").value) || "";
  if(!data){ diz("Informe a data.", true); return; }
  if(data > hojeISO()){ diz("A data está no futuro.", true); return; }
  const comDestino = modo === "envio" || modo === "devolucao";
  if(comDestino && !destPav){ diz("Escolha o pavimento.", true); return; }
  const obs = (($("#alvEstObs") && $("#alvEstObs").value) || "").trim();
  const linhas = []; let invalido = "";
  Array.prototype.forEach.call(document.querySelectorAll("#alvEstoqueTela [data-estsku]"), function(inp){
    const sku = inp.dataset.estsku;
    const avInp = document.querySelector('#alvEstoqueTela [data-estav="' + sku + '"]');
    const p = inteiro(inp.value), a = avInp ? inteiro(avInp.value) : "";
    if(Number.isNaN(p) || Number.isNaN(a)){ invalido = sku; return; }
    if(p === "" && a === "") return;                         // não preenchido
    const pal = p === "" ? 0 : p, av = a === "" ? 0 : a;
    if(modo !== "contagem" && pal + av === 0) return;        // zero só faz sentido na contagem
    const i = est.skus.indexOf(sku);
    linhas.push({ tipo: modo, data: data, sku: sku, pallets: pal, avulsos: av, blocos_por_pallet: porPallet(i),
                  pavimento: comDestino ? destPav : "", apartamento: comDestino ? destApto : "", observacao: obs });
  });
  if(invalido){ diz(invalido + ": use números inteiros (0, 1, 2…).", true); return; }
  if(!linhas.length){ diz("Nada preenchido.", true); return; }
  botao.disabled = true; diz("Gravando…");
  try {
    await gravarEstoque(linhas);
    await desenharEstoque(true);
    const m2 = $("#alvEstMsg");
    const feito = { entrada: "Recebimento lançado", envio: "Envio lançado", devolucao: "Devolução lançada",
                    quebra: "Quebra lançada", contagem: "Contagem lançada" }[modo];
    if(m2) m2.textContent = feito + ": " + linhas.length + " SKU(s).";
  } catch(e){ botao.disabled = false; diz("Não gravou: " + ((e && e.message) || e), true); }
}

function sugerir(){
  const c = calcular();
  skusEstoque().forEach(function(i){
    const inp = document.querySelector('#alvEstoqueTela [data-estsku="' + est.skus[i] + '"]');
    const b = faltaBlocos(c, i);
    if(inp){ inp.value = b > 0 ? String(Math.ceil(b / porPallet(i))) : ""; atualizarPrevia(est.skus[i]); }
  });
}

function atualizarPrevia(sku){
  const cel = document.querySelector('#alvEstoqueTela [data-estbl="' + sku + '"]');
  if(!cel) return;
  const p = inteiro((document.querySelector('#alvEstoqueTela [data-estsku="' + sku + '"]') || {}).value);
  const a = inteiro((document.querySelector('#alvEstoqueTela [data-estav="' + sku + '"]') || {}).value);
  if(Number.isNaN(p) || Number.isNaN(a) || (p === "" && a === "")){ cel.textContent = "—"; return; }
  cel.textContent = ni((p === "" ? 0 : p) * porPallet(est.skus.indexOf(sku)) + (a === "" ? 0 : a));
}

async function excluir(id){
  if(aguardando !== String(id)){ aguardando = String(id); pintar(); return; }
  aguardando = "";
  try { await apagarMovimento(id); await desenharEstoque(true); }
  catch(e){ pintar(); alert("Não excluiu: " + ((e && e.message) || e)); }
}

document.addEventListener("click", function(ev){
  const tela = $("#alvEstoqueTela");
  if(!tela || !tela.contains(ev.target)) return;
  const b = ev.target.closest("[data-estmodo],#alvEstLancar,#alvEstSugerir,[data-estdel],#alvKbMontar,#alvKbFechar,#alvKbRegistrar,[data-kbtransito],[data-kbcancelar]");
  if(!b){ if(aguardando || armadoKb){ aguardando = ""; armadoKb = ""; pintar(); } return; }
  if(b.id === "alvKbMontar"){ montando = true; pintar(); atualizarTotalMontagem(); return; }
  if(b.id === "alvKbFechar"){ montando = false; pintar(); return; }
  if(b.id === "alvKbRegistrar"){ registrarPedido(b); return; }
  if(b.dataset.kbtransito){ moverPedido(b.dataset.kbtransito, "transito"); return; }
  if(b.dataset.kbcancelar){ moverPedido(b.dataset.kbcancelar, "cancelar"); return; }
  if(b.dataset.estmodo){ modo = b.dataset.estmodo; aguardando = ""; pintar(); return; }
  if(b.id === "alvEstLancar"){ lancar(b); return; }
  if(b.id === "alvEstSugerir"){ sugerir(); return; }
  if(b.dataset.estdel){ excluir(b.dataset.estdel); return; }
});
document.addEventListener("change", function(ev){
  const t = ev.target;
  if(!t || (t.id !== "alvEstPav" && t.id !== "alvEstApto")) return;
  /* redesenha para atualizar a coluna "falta enviar", sem perder o que já foi digitado */
  const guarda = {};
  ["alvEstData", "alvEstObs"].forEach(function(id){ const el = $("#" + id); if(el) guarda[id] = el.value; });
  Array.prototype.forEach.call(document.querySelectorAll("#alvEstoqueTela [data-estsku],#alvEstoqueTela [data-estav]"),
    function(el){ guarda[(el.dataset.estsku !== undefined ? "p:" + el.dataset.estsku : "a:" + el.dataset.estav)] = el.value; });
  if(t.id === "alvEstPav"){ destPav = t.value; destApto = ""; } else { destApto = t.value; }
  pintar();
  for(const k in guarda){
    const el = k.indexOf("p:") === 0 ? document.querySelector('#alvEstoqueTela [data-estsku="' + k.slice(2) + '"]')
             : k.indexOf("a:") === 0 ? document.querySelector('#alvEstoqueTela [data-estav="' + k.slice(2) + '"]')
             : $("#" + k);
    if(el) el.value = guarda[k];
  }
  skusEstoque().forEach(function(i){ atualizarPrevia(est.skus[i]); });
});
document.addEventListener("input", function(ev){
  const t = ev.target;
  if(!t || !t.dataset) return;
  if(t.dataset.kbsku !== undefined){ atualizarTotalMontagem(); return; }
  if(t.dataset.estsku !== undefined) atualizarPrevia(t.dataset.estsku);
  else if(t.dataset.estav !== undefined) atualizarPrevia(t.dataset.estav);
});
