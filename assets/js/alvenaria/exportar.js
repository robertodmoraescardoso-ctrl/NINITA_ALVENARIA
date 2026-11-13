import { $ } from "../ui.js";
import { apartamentosDe, aptosAtivos, est, hojeISO, palletsDe, quantitativoMaterial, somaPallets, temPallets } from "./modelo.js";

/* ------------------------------------------------------------
   EXPORTAR — quantitativo de material em planilha Excel (.xlsx)

   Dois escopos:
   · pavimento: a mesma tabela da aba Material, para o pavimento
     aberto na tela;
   · prédio: uma aba "Resumo" com SKU × pavimento e os totais, e
     depois uma aba por pavimento, igual à do escopo anterior.

   Nos pavimentos divididos em apartamentos (o tipo), cada aba
   ganha a tabela "saldo por apartamento": o que ainda falta subir
   para cada um. A exportação do pavimento respeita os
   apartamentos escolhidos na tela.

   Os números saem de quantitativoMaterial(), a mesma conta da
   tela. A biblioteca (SheetJS) só é baixada no primeiro clique:
   quem nunca exporta não paga por ela.
   ------------------------------------------------------------ */

const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
let carregando = null;

function carregarXlsx(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(!carregando){
    carregando = new Promise(function(ok, falha){
      const s = document.createElement("script");
      s.src = XLSX_URL;
      s.async = true;
      s.crossOrigin = "anonymous";
      s.onload = function(){
        if(window.XLSX) ok(window.XLSX);
        else { carregando = null; falha(new Error("O gerador de planilha carregou incompleto.")); }
      };
      s.onerror = function(){
        carregando = null;
        s.remove();
        falha(new Error("Não deu para baixar o gerador de planilha. Confira a internet e tente de novo."));
      };
      document.head.appendChild(s);
    });
  }
  return carregando;
}

const NOTA_PALLET = "Pallets: blocos ÷ blocos por pallet (lista do almoxarifado, 13/11/2026), arredondado para cima, " +
  "SKU a SKU — um pallet não mistura SKU. — = sem número de pallet (família 19 e bloco cortado XVAR). Tela não vai em pallet.";

const NOTA = "O assentado é estimado: quantidade de projeto × % de levante apontado em cada parede. " +
  "Nenhuma contagem de bloco é feita no apontamento. XVAR é bloco cortado, sem dimensão em projeto. " +
  "O bloco calha (CER-CAL) entra como alvenaria; isole-o para separar verga.";

function dataBR(iso){ return iso.slice(8,10) + "/" + iso.slice(5,7) + "/" + iso.slice(0,4); }
function m1(v){ return Math.round(v * 10) / 10; }
function m2(v){ return Math.round(v * 100) / 100; }
function soma(ids, obj){ return ids.reduce(function(s,i){ return s + (obj[i] || 0); }, 0); }

function cabecalho(titulo){
  return [
    ["Villa Ninita · Poço da Panela · Alvenaria de vedação"],
    [titulo],
    ["Emitido em", dataBR(hojeISO())],
    []
  ];
}

/* uma aba por pavimento: material do levante e metro linear da marcação */
function linhasPavimento(q){
  const L = cabecalho("Material · " + q.nome + (q.aptos.length ? " · " + q.aptos.join(" + ") : ""));
  L.push(["LEVANTE · ÁREA (m²)"]);
  if(q.area.total > 0){
    L.push(["Previsto (m²)", m2(q.area.total)]);
    L.push(["Executado (m²)", m2(q.area.total - q.area.falta)]);
    L.push(["Falta levantar (m²)", m2(q.area.falta)]);
  } else {
    L.push(["Sem área de projeto: pavimento sem elevação publicada no ConstruCode."]);
  }
  if(q.area.total > 0 && q.area.sem) L.push(["Peças sem área (fora da conta)", q.area.sem]);
  L.push([]);
  L.push(["LEVANTE · MATERIAL"]);
  if(q.ordem.length){
    const comPallet = temPallets();
    const saldoDe = function(i){ return (q.previsto[i] || 0) - Math.round(q.assentado[i] || 0); };
    const pal = function(i){ const p = palletsDe(saldoDe(i), i); return p === null ? "—" : p; };
    L.push(["SKU", "Previsto (un)", "Estimado assentado (un)", "Saldo (un)"].concat(comPallet ? ["Pallets a subir"] : []));
    for(const i of q.ordem){
      const p = q.previsto[i], a = Math.round(q.assentado[i]);
      L.push([est.skus[i], p, a, p - a].concat(comPallet ? [pal(i)] : []));
    }
    [["Total blocos", q.blocos], ["Total telas", q.telas]].forEach(function(t, k){
      const p = soma(t[1], q.previsto), a = Math.round(soma(t[1], q.assentado));
      L.push([t[0], p, a, p - a].concat(comPallet ? [k === 0 ? somaPallets(q.blocos, saldoDe).total : "—"] : []));
    });
    if(comPallet) L.push([NOTA_PALLET]);
  } else {
    L.push(["Sem quantitativo publicado: este pavimento não tem elevação no ConstruCode."]);
  }
  linhasPorApartamento(q).forEach(function(l){ L.push(l); });
  L.push([]);
  L.push(["MARCAÇÃO · METRO LINEAR"]);
  if(q.linear.total > 0){
    L.push(["Previsto (m)", m1(q.linear.total)]);
    L.push(["Executado (m)", m1(q.linear.total - q.linear.falta)]);
    L.push(["Falta marcar (m)", m1(q.linear.falta)]);
  } else {
    L.push(["Nenhuma peça deste pavimento tem comprimento levantado."]);
  }
  if(q.linear.sem) L.push(["Peças sem comprimento (fora da conta)", q.linear.sem]);
  L.push([]);
  L.push([NOTA]);
  return L;
}

/* Saldo por apartamento: uma coluna por apartamento (os escolhidos,
   ou todos se nenhum foi escolhido) e, na última, o conjunto sem
   o conjunto (ou o pavimento) — que é o que está na tabela de cima.
   Cada parede está em um apartamento só: as colunas somam o total. */
function linhasPorApartamento(q){
  const todos = apartamentosDe(q.pav);
  if(!todos.length || !q.ordem.length) return [];
  const cols = q.aptos.length ? q.aptos : todos;
  const qs = cols.map(function(a){ return quantitativoMaterial(q.pav, [a]); });
  const saldo = function(qa, i){ return (qa.previsto[i] || 0) - Math.round(qa.assentado[i] || 0); };
  const saldoTot = function(qa, ids){
    return soma(ids, qa.previsto) - Math.round(soma(ids, qa.assentado));
  };
  const L = [[], ["SALDO POR APARTAMENTO (un) · o que ainda falta subir"]];
  L.push(["SKU"].concat(cols, [q.aptos.length ? "Conjunto" : "Pavimento"]));
  q.ordem.forEach(function(i){
    L.push([est.skus[i]].concat(qs.map(function(qa){ return saldo(qa, i); }), [saldo(q, i)]));
  });
  L.push(["Total blocos"].concat(qs.map(function(qa){ return saldoTot(qa, q.blocos); }), [saldoTot(q, q.blocos)]));
  L.push(["Total telas"].concat(qs.map(function(qa){ return saldoTot(qa, q.telas); }), [saldoTot(q, q.telas)]));

  if(temPallets()){
    const pal = function(qa, i){ const p = palletsDe(saldo(qa, i), i); return p === null ? "—" : p; };
    const palTot = function(qa){ return somaPallets(q.blocos, function(i){ return saldo(qa, i); }).total; };
    L.push([]);
    L.push(["PALLETS POR APARTAMENTO · o que falta subir, arredondado para cima"]);
    L.push(["SKU"].concat(cols, [q.aptos.length ? "Conjunto" : "Pavimento"]));
    q.blocos.forEach(function(i){
      L.push([est.skus[i]].concat(qs.map(function(qa){ return pal(qa, i); }), [pal(q, i)]));
    });
    L.push(["Total pallets"].concat(qs.map(palTot), [palTot(q)]));
    L.push(["Cada apartamento arredonda o seu pallet para cima; por isso a soma das colunas pode passar " +
            "do total, que arredonda uma vez só. Subindo um apartamento por vez, vale a coluna dele."]);
  }

  const divisas = (est.porPavimento[q.pav] || []).filter(function(w){
    return w.divisa && w.divisa.some(function(a){ return cols.indexOf(a) !== -1; });
  });
  if(divisas.length){
    L.push(["Paredes em cima da divisa ficam com o apartamento que vem antes na sequência 01A, 02A, 01B, 02B, " +
            "01C, 02C: " + divisas.map(function(w){
              return w.codigo + " → " + w.aptos[0] + " (divisa " + w.divisa.join("/") + ")";
            }).join(", ") + "."]);
  }
  return L;
}

/* resumo do prédio: uma coluna de previsto por pavimento */
function linhasResumo(qs){
  const L = cabecalho("Material · prédio inteiro");
  const comMat = qs.filter(function(q){ return q.ordem.length; });
  const semMat = qs.filter(function(q){ return !q.ordem.length; });

  const ids = {};
  comMat.forEach(function(q){ q.ordem.forEach(function(i){ ids[i] = true; }); });
  const ordem = Object.keys(ids).map(Number).sort(function(a,b){ return a-b; });
  const ehBloco = function(i){ return String(est.skus[i]).indexOf("TELA") !== 0; };

  L.push(["LEVANTE · MATERIAL (un)"]);
  L.push(["SKU"].concat(comMat.map(function(q){ return q.nome; }),
                       ["Previsto total", "Estimado assentado", "Saldo"]));
  function linha(rotulo, idsLinha){
    const porPav = comMat.map(function(q){ return soma(idsLinha, q.previsto); });
    const p = porPav.reduce(function(s,v){ return s + v; }, 0);
    const a = Math.round(comMat.reduce(function(s,q){ return s + soma(idsLinha, q.assentado); }, 0));
    L.push([rotulo].concat(porPav, [p, a, p - a]));
  }
  ordem.forEach(function(i){ linha(est.skus[i], [i]); });
  linha("Total blocos", ordem.filter(ehBloco));
  linha("Total telas", ordem.filter(function(i){ return !ehBloco(i); }));

  if(temPallets()){
    const blocosIds = ordem.filter(ehBloco);
    const saldoPav = function(q, i){ return (q.previsto[i] || 0) - Math.round(q.assentado[i] || 0); };
    const pal = function(q, i){ const p = palletsDe(saldoPav(q, i), i); return p === null ? "—" : p; };
    L.push([]);
    L.push(["PALLETS A SUBIR POR PAVIMENTO · arredondado para cima, SKU a SKU"]);
    L.push(["SKU"].concat(comMat.map(function(q){ return q.nome; }), ["Total"]));
    blocosIds.forEach(function(i){
      const v = comMat.map(function(q){ return pal(q, i); });
      const semDado = v.some(function(x){ return x === "—"; }) && v.every(function(x){ return x === "—" || x === 0; });
      L.push([est.skus[i]].concat(v, [semDado ? "—" : v.reduce(function(s, x){ return s + (x === "—" ? 0 : x); }, 0)]));
    });
    const tot = comMat.map(function(q){ return somaPallets(blocosIds, function(i){ return saldoPav(q, i); }).total; });
    L.push(["Total pallets"].concat(tot, [tot.reduce(function(s, v){ return s + v; }, 0)]));
    L.push([NOTA_PALLET]);
  }

  if(semMat.length){
    L.push([]);
    L.push(["Sem quantitativo de material (sem elevação no ConstruCode): " +
            semMat.map(function(q){ return q.nome; }).join(", ") + "."]);
  }

  L.push([]);
  L.push(["LEVANTE · ÁREA (m²)"]);
  L.push(["Pavimento", "Previsto (m²)", "Executado (m²)", "Falta levantar (m²)"]);
  let aT = 0, aF = 0;
  qs.forEach(function(q){
    aT += q.area.total; aF += q.area.falta;
    L.push([q.nome, m2(q.area.total), m2(q.area.total - q.area.falta), m2(q.area.falta)]);
  });
  L.push(["Total", m2(aT), m2(aT - aF), m2(aF)]);

  L.push([]);
  L.push(["MARCAÇÃO · METRO LINEAR"]);
  L.push(["Pavimento", "Previsto (m)", "Falta marcar (m)", "Peças sem comprimento"]);
  let tot = 0, falta = 0, sem = 0;
  qs.forEach(function(q){
    tot += q.linear.total; falta += q.linear.falta; sem += q.linear.sem;
    L.push([q.nome, m1(q.linear.total), m1(q.linear.falta), q.linear.sem]);
  });
  L.push(["Total", m1(tot), m1(falta), sem]);
  L.push([]);
  L.push([NOTA]);
  return L;
}

const LARG_PAV = [34, 14, 24, 12, 16, 12, 12, 26];

function folha(XLSX, linhas, larguras){
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  /* milhar com ponto, decimal com vírgula: o Excel aplica o
     separador do computador, o formato só diz quantas casas */
  for(const ref in ws){
    if(ref[0] === "!") continue;
    const c = ws[ref];
    if(c.t === "n") c.z = Number.isInteger(c.v) ? "#,##0" : (Math.round(c.v * 10) === c.v * 10 ? "#,##0.0" : "#,##0.00");
  }
  ws["!cols"] = larguras.map(function(w){ return { wch: w }; });
  return ws;
}

function nomeAba(nome, usados){
  let n = String(nome).replace(/[\\/\?\*\[\]:]/g, "-").slice(0, 31) || "Pavimento";
  let k = 2, base = n;
  while(usados[n]){ n = base.slice(0, 28) + " " + k++; }
  usados[n] = true;
  return n;
}

export async function exportarMaterial(escopo, botao){
  const msg = $("#alvExpMsg");
  const diz = function(t, erro){
    if(!msg) return;
    msg.textContent = t;
    msg.classList.toggle("erro", !!erro);
  };
  if(botao) botao.disabled = true;
  diz("Gerando a planilha…");
  try {
    const XLSX = await carregarXlsx();
    const wb = XLSX.utils.book_new();
    const usados = {};
    let arquivo;

    if(escopo === "predio"){
      const qs = est.pavimentos.map(function(p){ return quantitativoMaterial(p.c); });
      const nCols = qs.filter(function(q){ return q.ordem.length; }).length;
      const larg = [26].concat(new Array(nCols).fill(11), [15, 19, 11]);
      XLSX.utils.book_append_sheet(wb, folha(XLSX, linhasResumo(qs), larg), nomeAba("Resumo", usados));
      qs.forEach(function(q){
        XLSX.utils.book_append_sheet(wb, folha(XLSX, linhasPavimento(q), LARG_PAV), nomeAba(q.nome, usados));
      });
      arquivo = "Material_Alvenaria_Predio_" + hojeISO() + ".xlsx";
    } else {
      const sel = aptosAtivos(est.pav);
      const q = quantitativoMaterial(est.pav, sel);
      XLSX.utils.book_append_sheet(wb, folha(XLSX, linhasPavimento(q), LARG_PAV), nomeAba(q.nome, usados));
      arquivo = "Material_Alvenaria_" + est.pav + (sel.length ? "_" + sel.join("-") : "") + "_" + hojeISO() + ".xlsx";
    }

    XLSX.writeFile(wb, arquivo, { compression: true });
    diz("Planilha baixada: " + arquivo);
  } catch(e){
    diz(e.message || String(e), true);
  } finally {
    if(botao) botao.disabled = false;
  }
}
