import { $ } from "../ui.js";
import { est, hojeISO, quantitativoMaterial } from "./modelo.js";

/* ------------------------------------------------------------
   EXPORTAR — quantitativo de material em planilha Excel (.xlsx)

   Dois escopos:
   · pavimento: a mesma tabela da aba Material, para o pavimento
     aberto na tela;
   · prédio: uma aba "Resumo" com SKU × pavimento e os totais, e
     depois uma aba por pavimento, igual à do escopo anterior.

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

const NOTA = "O assentado é estimado: quantidade de projeto × % de levante apontado em cada parede. " +
  "Nenhuma contagem de bloco é feita no apontamento. XVAR é bloco cortado, sem dimensão em projeto. " +
  "O bloco calha (CER-CAL) entra como alvenaria; isole-o para separar verga.";

function dataBR(iso){ return iso.slice(8,10) + "/" + iso.slice(5,7) + "/" + iso.slice(0,4); }
function m1(v){ return Math.round(v * 10) / 10; }
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
  const L = cabecalho("Material · " + q.nome);
  L.push(["LEVANTE · MATERIAL"]);
  if(q.ordem.length){
    L.push(["SKU", "Previsto (un)", "Estimado assentado (un)", "Saldo (un)"]);
    for(const i of q.ordem){
      const p = q.previsto[i], a = Math.round(q.assentado[i]);
      L.push([est.skus[i], p, a, p - a]);
    }
    [["Total blocos", q.blocos], ["Total telas", q.telas]].forEach(function(t){
      const p = soma(t[1], q.previsto), a = Math.round(soma(t[1], q.assentado));
      L.push([t[0], p, a, p - a]);
    });
  } else {
    L.push(["Sem quantitativo publicado: este pavimento não tem elevação no ConstruCode."]);
  }
  L.push([]);
  L.push(["MARCAÇÃO · METRO LINEAR"]);
  if(q.linear.total > 0){
    L.push(["Previsto (m)", m1(q.linear.total)]);
    L.push(["Falta marcar (m)", m1(q.linear.falta)]);
  } else {
    L.push(["Nenhuma peça deste pavimento tem comprimento levantado."]);
  }
  if(q.linear.sem) L.push(["Peças sem comprimento (fora da conta)", q.linear.sem]);
  L.push([]);
  L.push([NOTA]);
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

  if(semMat.length){
    L.push([]);
    L.push(["Sem quantitativo de material (sem elevação no ConstruCode): " +
            semMat.map(function(q){ return q.nome; }).join(", ") + "."]);
  }

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

function folha(XLSX, linhas, larguras){
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  /* milhar com ponto, decimal com vírgula: o Excel aplica o
     separador do computador, o formato só diz quantas casas */
  for(const ref in ws){
    if(ref[0] === "!") continue;
    const c = ws[ref];
    if(c.t === "n") c.z = Number.isInteger(c.v) ? "#,##0" : "#,##0.0";
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
        XLSX.utils.book_append_sheet(wb, folha(XLSX, linhasPavimento(q), [34, 14, 24, 12]), nomeAba(q.nome, usados));
      });
      arquivo = "Material_Alvenaria_Predio_" + hojeISO() + ".xlsx";
    } else {
      const q = quantitativoMaterial(est.pav);
      XLSX.utils.book_append_sheet(wb, folha(XLSX, linhasPavimento(q), [34, 14, 24, 12]), nomeAba(q.nome, usados));
      arquivo = "Material_Alvenaria_" + est.pav + "_" + hojeISO() + ".xlsx";
    }

    XLSX.writeFile(wb, arquivo, { compression: true });
    diz("Planilha baixada: " + arquivo);
  } catch(e){
    diz(e.message || String(e), true);
  } finally {
    if(botao) botao.disabled = false;
  }
}
