import { $ } from "../ui.js";
import { apartamentosDe, aptosAtivos, est, hojeISO, palletsDe, porPallet, quantitativoMaterial, somaPallets, temPallets } from "./modelo.js";

/* ------------------------------------------------------------
   EXPORTAR — quantitativo de material em planilha Excel (.xlsx)

   Dois escopos:
   · pavimento: a mesma tabela da aba Material, para o pavimento
     aberto na tela (respeita os apartamentos escolhidos), seguida
     da aba "Programação Entregas";
   · prédio: uma aba "Resumo" com SKU × pavimento e os totais, e
     depois uma aba por pavimento.

   Na aba do pavimento, a tabela de SKUs começa SEMPRE na linha 9
   (cabeçalho na 8): a Programação Entregas aponta para ela por
   fórmula ('<aba>'!A9, '<aba>'!F9…). Os blocos que vão em pallet
   vêm primeiro e contíguos; depois o XVAR; depois as telas.

   Biblioteca: xlsx-js-style (SheetJS com estilos — fonte, cor,
   borda, altura de linha). Só é baixada no primeiro clique.
   ------------------------------------------------------------ */

const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
let carregando = null;

function carregarXlsx(){
  if(window.XLSX && window.XLSX.utils) return Promise.resolve(window.XLSX);
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

const NOTA_PALLET = "Pallets: saldo ÷ blocos por pallet (lista do almoxarifado, 13/11/2026), arredondado para cima, SKU a SKU — " +
  "um pallet não mistura SKU. Coluna F com 20% de perda. Blocos por pallet em azul são editáveis: a família 19 está em branco " +
  "porque o almoxarifado ainda não informou; preencha e a planilha recalcula. XVAR e telas não vão em pallet.";

const NOTA = "O assentado é estimado: quantidade de projeto × % de levante apontado em cada parede. " +
  "Nenhuma contagem de bloco é feita no apontamento. XVAR é bloco cortado, sem dimensão em projeto. " +
  "O bloco calha (CER-CAL) entra como alvenaria; isole-o para separar verga.";

const NOTA_PROG = "Cada caminhão leva cada SKU na proporção do que falta entregar dele (tabela auxiliar abaixo); no " +
  "arredondamento, só os SKUs de maior fração sobem 1 pallet, até fechar a capacidade — nenhum caminhão passa do limite. " +
  "O espaço livre do último caminhão (G4) é completado com reforço pelo peso de uso; a sobra do arredondamento vai para o " +
  "SKU mais usado. Base: coluna F (Pallets 20% perda) da aba ";

/* ---------- estilo (layout do sistema) ---------- */
const COR = { marca: "005E71", escuro: "101B30", claro: "EAF0F5", borda: "9AA8BA", cinza: "66758A",
              azul: "0000FF", verde: "008000", preto: "000000", branco: "FFFFFF" };
function fonte(extra){ return Object.assign({ name: "Calibri", sz: 12, color: { rgb: COR.preto } }, extra || {}); }
const LINHA = function(cor){ return { style: "thin", color: { rgb: cor || COR.borda } }; };
const EST = {
  base:      { font: fonte() },
  titulo:    { font: fonte({ sz: 14, bold: true, color: { rgb: COR.marca } }) },
  sub:       { font: fonte({ color: { rgb: COR.cinza } }) },
  secao:     { font: fonte({ bold: true, color: { rgb: COR.marca } }) },
  cab:       { font: fonte({ bold: true, color: { rgb: COR.branco } }), fill: { patternType: "solid", fgColor: { rgb: COR.marca } },
               alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: { bottom: LINHA(COR.escuro) } },
  cabEsq:    { font: fonte({ bold: true, color: { rgb: COR.branco } }), fill: { patternType: "solid", fgColor: { rgb: COR.marca } },
               alignment: { horizontal: "left", vertical: "center", wrapText: true }, border: { bottom: LINHA(COR.escuro) } },
  total:     { font: fonte({ bold: true }), fill: { patternType: "solid", fgColor: { rgb: COR.claro } }, border: { top: LINHA(COR.escuro) } },
  nota:      { font: fonte({ sz: 11, color: { rgb: COR.cinza } }), alignment: { wrapText: true, vertical: "top" } }
};
function mescla(a, b){
  const r = {};
  [a, b].forEach(function(o){ if(!o) return; for(const k in o){ r[k] = (typeof o[k] === "object" && !Array.isArray(o[k])) ? Object.assign({}, r[k] || {}, o[k]) : o[k]; } });
  return r;
}

function dataBR(iso){ return iso.slice(8,10) + "/" + iso.slice(5,7) + "/" + iso.slice(0,4); }
function m1(v){ return Math.round(v * 10) / 10; }
function m2(v){ return Math.round(v * 100) / 100; }
function soma(ids, obj){ return ids.reduce(function(s,i){ return s + (obj[i] || 0); }, 0); }
function col(n){ let s = ""; n++; while(n > 0){ const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function ref(c, r){ return col(c) + r; }                      // c 0-based, r 1-based
function abaRef(nome){ return "'" + String(nome).replace(/'/g, "''") + "'"; }
const ehTela = function(i){ return String(est.skus[i]).indexOf("TELA") === 0; };
const ehXvar = function(i){ return /XVAR/.test(String(est.skus[i])); };

function cabecalho(titulo){
  return [
    ["Villa Ninita · Poço da Panela · Alvenaria de vedação"],
    [titulo],
    ["Emitido em", dataBR(hojeISO())],
    []
  ];
}

/* ---------- aba do pavimento ---------- */
/* Devolve as linhas (aoa), as células com fórmula/estilo próprio e
   onde está a tabela de pallets, para a Programação Entregas. */
function linhasPavimento(q){
  const L = cabecalho("Material · " + q.nome + (q.aptos.length ? " · " + q.aptos.join(" + ") : ""));
  const extras = [];   // {c, r (1-based), cell}
  const info = { primeira: 9, n: 0, palletsEstimados: 0 };
  L.push(["LEVANTE · MATERIAL"]);                                      // linha 5
  L.push(["Pallets com 20% de perda sobre o saldo. Blocos por pallet em azul: editável."]);   // 6
  L.push([]);                                                          // 7
  if(q.ordem.length){
    const prog = q.ordem.filter(function(i){ return !ehTela(i) && !ehXvar(i); });
    const xvar = q.ordem.filter(ehXvar), telas = q.ordem.filter(ehTela);
    L.push(["SKU", "Previsto (un)", "Estimado assentado (un)", "Saldo (un)", "Blocos por pallet",
            "Pallets (c/ 20% perda)", "Pallets (sem perda)"]);       // 8
    const linhaSku = function(i, emPallet){
      const r = L.length + 1;
      const p = q.previsto[i] || 0, a = Math.round(q.assentado[i] || 0);
      L.push([est.skus[i], p, a, null, null, null, null]);
      extras.push({ c: 3, r: r, cell: { t: "n", f: "B" + r + "-C" + r } });
      if(emPallet){
        const bpp = porPallet(i);
        extras.push({ c: 4, r: r, cell: bpp === null ? { t: "s", v: "", s: { font: fonte({ color: { rgb: COR.azul } }) } }
                                                     : { t: "n", v: bpp, s: { font: fonte({ color: { rgb: COR.azul } }) } } });
        extras.push({ c: 5, r: r, cell: { t: "n", f: 'IF(E' + r + '="",0,ROUNDUP(D' + r + '*1.2/E' + r + ',0))' } });
        extras.push({ c: 6, r: r, cell: { t: "n", f: 'IF(E' + r + '="","",ROUNDUP(D' + r + '/E' + r + ',0))' } });
        if(bpp !== null) info.palletsEstimados += Math.ceil(Math.max(0, p - a) * 1.2 / bpp);
      }
      return r;
    };
    prog.forEach(function(i){ linhaSku(i, true); });
    info.n = prog.length;
    xvar.forEach(function(i){ linhaSku(i, false); });
    const fimBlocos = L.length;                        // última linha de bloco (1-based)
    telas.forEach(function(i){ linhaSku(i, false); });
    const fimTelas = L.length;
    const r0 = info.primeira, rP = info.primeira + info.n - 1;
    let r = L.length + 1;
    L.push(["Total blocos"]);
    ["B", "C", "D"].forEach(function(cl, k){ extras.push({ c: 1 + k, r: r, cell: { t: "n", f: "SUM(" + cl + r0 + ":" + cl + fimBlocos + ")" } }); });
    if(info.n){
      extras.push({ c: 5, r: r, cell: { t: "n", f: "SUM(F" + r0 + ":F" + rP + ")" } });
      extras.push({ c: 6, r: r, cell: { t: "n", f: "SUM(G" + r0 + ":G" + rP + ")" } });
    }
    if(telas.length){
      r = L.length + 1;
      L.push(["Total telas"]);
      ["B", "C", "D"].forEach(function(cl, k){ extras.push({ c: 1 + k, r: r, cell: { t: "n", f: "SUM(" + cl + (fimBlocos + 1) + ":" + cl + fimTelas + ")" } }); });
    }
    L.push([NOTA_PALLET]);
  } else {
    L.push(["Sem quantitativo publicado: este pavimento não tem elevação no ConstruCode."]);
  }
  L.push([]);
  L.push(["LEVANTE · ÁREA (m²)"]);
  if(q.area.total > 0){
    L.push(["Previsto (m²)", m2(q.area.total)]);
    L.push(["Executado (m²)", m2(q.area.total - q.area.falta)]);
    L.push(["Falta levantar (m²)", m2(q.area.falta)]);
  } else {
    L.push(["Sem área de projeto: pavimento sem elevação publicada no ConstruCode."]);
  }
  if(q.area.total > 0 && q.area.sem) L.push(["Peças sem área (fora da conta)", q.area.sem]);
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
  return { L: L, extras: extras, info: info };
}

/* Saldo por apartamento: uma coluna por apartamento (os escolhidos,
   ou todos se nenhum foi escolhido) e, na última, o conjunto (ou o
   pavimento). Cada parede está em um apartamento só. */
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
    L.push(["PALLETS POR APARTAMENTO · o que falta subir, arredondado para cima, sem perda"]);
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

/* ---------- resumo do prédio ---------- */
function linhasResumo(qs){
  const L = cabecalho("Material · prédio inteiro");
  const comMat = qs.filter(function(q){ return q.ordem.length; });
  const semMat = qs.filter(function(q){ return !q.ordem.length; });

  const ids = {};
  comMat.forEach(function(q){ q.ordem.forEach(function(i){ ids[i] = true; }); });
  const ordem = Object.keys(ids).map(Number).sort(function(a,b){ return a-b; });
  const ehBloco = function(i){ return !ehTela(i); };

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
    L.push(["PALLETS A SUBIR POR PAVIMENTO · arredondado para cima, SKU a SKU, sem perda"]);
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

/* ---------- Programação Entregas ---------- */
/* Tudo o que é calculado é fórmula do Excel. O código só decide o
   layout: quantas linhas de SKU (as da aba do pavimento) e quantas
   colunas de entrega (4, ou mais se o total pedir mais caminhões). */
function folhaProgramacao(XLSX, abaPav, info){
  const ws = {};
  const n = info.n, r0 = 11, rN = r0 + n - 1, T = rN + 1;
  const CAP = 120;
  const k = Math.max(4, Math.ceil(info.palletsEstimados / CAP));
  const cE = 3, cUlt = cE + k - 1, cTot = cUlt + 1, cConf = cUlt + 2, cRef = cUlt + 3;
  const L = col, A = "$" + "B$" + T;                   // $B$T
  const QTD = "#,##0;(#,##0);-";
  const aba = abaRef(abaPav);
  const centro = { alignment: { horizontal: "center", vertical: "center" } };
  let maxR = 1;

  function put(c, r, cell, estilo){
    const s = mescla(EST.base, estilo || null);
    if(cell.s) Object.assign(s, mescla(s, cell.s));
    const x = Object.assign({}, cell, { s: s });
    if(c >= 1 && c <= cRef && !(s.alignment && s.alignment.horizontal)) x.s = mescla(x.s, centro);
    ws[ref(c, r)] = x;
    if(r > maxR) maxR = r;
  }
  const txt = function(v){ return { t: "s", v: v }; };
  const num = function(v, z){ return { t: "n", v: v, z: z }; };
  const fx  = function(f, z, t){ return { t: t || "n", f: f, z: z }; };
  const azul = { font: fonte({ color: { rgb: COR.azul } }), fill: { patternType: "solid", fgColor: { rgb: COR.claro } } };
  const verde = { font: fonte({ color: { rgb: COR.verde } }) };
  const esq = { alignment: { horizontal: "left", vertical: "center" } };

  /* título */
  put(0, 1, txt("Programação de entregas · " + abaPav), EST.titulo);
  put(0, 2, txt("Villa Ninita · Poço da Panela · emitido em " + dataBR(hojeISO()) + " · azul = editável, verde = vem da aba " + abaPav), EST.sub);

  /* 1. entradas */
  const hoje = new Date(hojeISO() + "T12:00:00Z");
  const seg = new Date(hoje); seg.setUTCDate(hoje.getUTCDate() + ((8 - hoje.getUTCDay()) % 7 || 7));   // próxima segunda
  const serial = Math.round((Date.UTC(seg.getUTCFullYear(), seg.getUTCMonth(), seg.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000);
  put(0, 3, txt("Capacidade por caminhão (pallets)"), esq);       put(1, 3, num(CAP, QTD), azul);
  put(0, 4, txt("Data da 1ª entrega"), esq);                      put(1, 4, num(serial, "[$-416]ddd dd/mm/yyyy"), azul);
  put(0, 5, txt("Dias entre 1ª e 2ª entrega da semana"), esq);    put(1, 5, num(3, "0"), azul);
  put(2, 5, txt("seg→qui = 3; dias seguidos = 1"), mescla(EST.sub, esq));

  /* 2. resumo */
  put(0, 6, txt("Total de pallets a entregar"), esq);             put(1, 6, fx("B" + T, QTD));
  put(0, 7, txt("Nº de caminhões"), esq);                         put(1, 7, fx("ROUNDUP(B6/B3,0)", "0"));
  put(0, 8, txt("Semanas de entrega (2 entregas/semana)"), esq);  put(1, 8, fx("ROUNDUP(B7/2,0)", "0"));
  /* a planilha tem k colunas de entrega; se mudarem a capacidade e
     precisar de mais caminhões, avisa em vez de errar calado */
  put(3, 6, fx('IF(B7>' + k + ',"Faltam colunas: são "&B7&" caminhões e a planilha tem ' + k + '. Exporte de novo pelo sistema.","")', null, "s"),
      { font: fonte({ bold: true, color: { rgb: "C00000" } }), alignment: { horizontal: "left", vertical: "center" } });
  put(3, 4, txt("Espaço livre no último caminhão (pallets)"), mescla(esq, { font: fonte({ bold: true }) }));
  /* todo caminhão antes do último sai cheio: já foram MIN((B7−1)×B3; total) */
  put(6, 4, fx("B3-(B" + T + "-MIN((B7-1)*B3,B" + T + "))", QTD), { font: fonte({ bold: true }) });

  /* 3. cabeçalho */
  for(let c = cE; c <= cUlt; c++){
    put(c, 9, num(c - cE + 1, '"Entrega "0'), { font: fonte({ bold: true, color: { rgb: COR.marca } }) });
    const D = L(c);
    put(c, 10, fx('IF(' + D + '$9>$B$7,"",$B$4+INT((' + D + '$9-1)/2)*7+MOD(' + D + '$9-1,2)*$B$5)', "[$-416]ddd dd/mm"), EST.cab);
  }
  put(0, 10, txt("SKU"), EST.cabEsq);
  put(1, 10, txt("Pallets (c/ 20% perda)"), EST.cab);
  put(2, 10, txt("Peso no total"), EST.cab);
  put(cTot, 10, txt("Total programado"), EST.cab);
  put(cConf, 10, txt("Confere"), EST.cab);
  put(cRef, 10, txt("Reforço no último caminhão"), EST.cab);

  /* 4. linhas por SKU
     Rateio pelo maior resto, caminhão a caminhão: a parte ideal de
     cada SKU (tabela auxiliar, abaixo da nota) é o que FALTA dele ×
     carga do caminhão ÷ o que falta no total. Todos arredondam para
     baixo e só as maiores frações sobem 1 pallet, até fechar a carga:
     nenhum caminhão passa da capacidade e nenhum SKU passa do saldo.
     Empate de fração: vence a linha de cima. */
  const J = L(cRef), H = L(cTot), UL = L(cUlt);
  const hTit = T + 6, h0 = T + 7, hN = h0 + n - 1;     // tabela auxiliar
  const hr = function(r){ return h0 + (r - r0); };
  const fr = function(x){ return "ROUND(MOD(" + x + ",1),9)"; };
  for(let r = r0; r <= rN; r++){
    const rPav = info.primeira + (r - r0);
    put(0, r, fx(aba + "!A" + rPav, null, "s"), mescla(verde, esq));
    put(1, r, fx(aba + "!F" + rPav, QTD), verde);
    put(2, r, fx("B" + r + "/" + A, "0.0%"));
    for(let c = cE; c <= cUlt; c++){
      const D = L(c);
      const xs = D + "$" + h0 + ":" + D + "$" + hN, x = D + hr(r);
      const carga = "MIN($B$3," + A + "-(" + D + "$9-1)*$B$3)";
      const acima = r > r0 ? "+SUMPRODUCT(--(" + fr(D + "$" + h0 + ":" + D + (hr(r) - 1)) + "=" + fr(x) + "))" : "";
      const posicao = "SUMPRODUCT(--(" + fr(xs) + ">" + fr(x) + "))" + acima;
      const falta = carga + "-SUMPRODUCT(INT(" + xs + "))";
      put(c, r, fx('IF(' + D + '$9>$B$7,"",INT(' + x + ')+IF(' + posicao + '<' + falta + ',1,0)+IF(' + D + '$9=$B$7,$' + J + r + ',0))', QTD));
      /* parte ideal deste SKU neste caminhão */
      const jaFoi = c > cE ? "-SUM($D" + r + ":" + L(c - 1) + r + ")" : "";
      const jaFoiTot = c > cE ? "-SUM($D$" + T + ":" + L(c - 1) + "$" + T + ")" : "";
      put(c, hr(r), fx('IF(' + D + '$9>$B$7,0,IF((' + A + jaFoiTot + ')<=0,0,($B' + r + jaFoi + ')*' + carga + '/(' + A + jaFoiTot + ')))', "0.000"),
          { font: fonte({ sz: 11, color: { rgb: COR.cinza } }) });
    }
    put(0, hr(r), fx("A" + r, null, "s"), mescla({ font: fonte({ sz: 11, color: { rgb: COR.cinza } }) }, esq));
    put(cTot, r, fx("SUM(D" + r + ":" + UL + r + ")", QTD));
    put(cConf, r, fx('IF(' + H + r + '=B' + r + '+' + J + r + ',"OK","Revisar")', null, "s"));
    put(cRef, r, fx("ROUNDDOWN($C" + r + "*$G$4,0)+IF($B" + r + "=MAX($B$" + r0 + ":$B$" + rN + "),$G$4-SUMPRODUCT(ROUNDDOWN($C$" + r0 +
      ":$C$" + rN + "*$G$4,0)),0)", QTD));
  }

  /* 5. totais e validação */
  put(0, T, txt("Total por caminhão"), mescla(EST.total, esq));
  put(1, T, fx("SUM(B" + r0 + ":B" + rN + ")", QTD), EST.total);
  put(2, T, fx("SUM(C" + r0 + ":C" + rN + ")", "0.0%"), EST.total);
  for(let c = cE; c <= cUlt; c++){
    const D = L(c);
    put(c, T, fx('IF(' + D + '$9>$B$7,"",SUM(' + D + r0 + ':' + D + rN + '))', QTD), EST.total);
    put(c, T + 1, fx('IF(' + D + '$9>$B$7,"",' + D + T + '/$B$3)', "0.0%"));
    put(c, T + 2, fx('IF(' + D + '$9>$B$7,"",IF(' + D + T + '>$B$3,"Excede","OK"))', null, "s"));
  }
  put(cTot, T, fx("SUM(" + H + r0 + ":" + H + rN + ")", QTD), EST.total);
  put(cConf, T, fx('IF(' + H + T + '=B' + T + '+' + J + T + ',"OK","Revisar")', null, "s"), EST.total);
  put(cRef, T, fx("SUM(" + J + r0 + ":" + J + rN + ")", QTD), EST.total);
  put(0, T + 1, txt("Ocupação do caminhão"), esq);
  put(0, T + 2, txt("Limite de carga"), esq);

  /* 7. nota */
  put(0, T + 4, txt(NOTA_PROG + abaPav + "; XVAR e telas não vão em pallet."), EST.nota);
  for(let c = 1; c <= cRef; c++) put(c, T + 4, txt(""), EST.nota);
  put(0, hTit, txt("Cálculo auxiliar do rateio · parte ideal de cada SKU por caminhão (não editar)"),
      mescla(EST.secao, { font: fonte({ bold: true, sz: 11, color: { rgb: COR.cinza } }) }));

  ws["!ref"] = "A1:" + ref(cRef, maxR);
  ws["!merges"] = [{ s: { r: T + 3, c: 0 }, e: { r: T + 3, c: cRef } }];
  ws["!cols"] = [{ wpx: 307 }].concat(new Array(cRef).fill(0).map(function(){ return { wpx: 127 }; }));
  const rows = []; rows[9] = { hpt: 34 }; rows[T + 3] = { hpt: 64 };
  ws["!rows"] = rows;
  return ws;
}

/* ---------- montagem e estilo das abas comuns ---------- */
const LARG_PAV = [34, 14, 24, 12, 16, 22, 20, 26];

/* aplica o visual do sistema: título, seções, cabeçalhos e totais */
function estilizar(ws){
  const linhas = {};
  for(const r in ws){
    if(r[0] === "!") continue;
    const m = r.match(/^([A-Z]+)(\d+)$/);
    (linhas[m[2]] = linhas[m[2]] || []).push(r);
  }
  for(const nr in linhas){
    const a = ws["A" + nr], va = a && typeof a.v === "string" ? a.v : "";
    let e = EST.base;
    if(nr === "2") e = EST.titulo;
    else if(nr === "1" || nr === "3") e = EST.sub;
    else if(va === "SKU" || va === "Pavimento") e = EST.cab;
    else if(/^Total/.test(va)) e = EST.total;
    else if(va && va === va.toUpperCase() && /[A-Z]/.test(va) && va.length > 4) e = EST.secao;
    else if(va.length > 90) e = EST.nota;
    linhas[nr].forEach(function(r){
      const c = ws[r];
      c.s = mescla(e, c.s || null);
      if(e === EST.cab && r.indexOf("A") === 0) c.s = mescla(c.s, { alignment: { horizontal: "left" } });
    });
  }
}

function folha(XLSX, linhas, larguras, extras){
  const ws = XLSX.utils.aoa_to_sheet(linhas.map(function(l){ return l.map(function(v){ return v === null ? undefined : v; }); }));
  (extras || []).forEach(function(x){
    const s = x.cell.s; const c = Object.assign({}, x.cell); delete c.s;
    ws[ref(x.c, x.r)] = c;
    if(s) c.s = s;
  });
  /* milhar com ponto, decimal com vírgula: o Excel aplica o
     separador do computador, o formato só diz quantas casas */
  for(const r in ws){
    if(r[0] === "!") continue;
    const c = ws[r];
    if(c.t === "n" && !c.z) c.z = c.f || Number.isInteger(c.v) ? "#,##0" : (Math.round(c.v * 10) === c.v * 10 ? "#,##0.0" : "#,##0.00");
  }
  /* !ref precisa cobrir as células de fórmula acrescentadas */
  const rng = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for(const r in ws){
    if(r[0] === "!") continue;
    const d = XLSX.utils.decode_cell(r);
    if(d.r > rng.e.r) rng.e.r = d.r;
    if(d.c > rng.e.c) rng.e.c = d.c;
  }
  ws["!ref"] = XLSX.utils.encode_range(rng);
  estilizar(ws);
  ws["!cols"] = larguras.map(function(w){ return { wch: w }; });
  return ws;
}

/* ---------- resultado guardado junto com a fórmula ----------
   Excel no celular, pré-visualização do WhatsApp/Drive e Excel em
   modo protegido NÃO recalculam: mostram só o valor guardado na
   célula. Sem ele, toda fórmula aparece em branco. Aqui cada fórmula
   é calculada (HyperFormula, compatível com as funções do Excel) e o
   resultado vai junto; a fórmula continua lá, e o Excel do computador
   recalcula ao abrir (fullCalcOnLoad). */
const HF_URL = "https://cdn.jsdelivr.net/npm/hyperformula@2.6.2/dist/hyperformula.full.min.js";
let carregandoHF = null;
function carregarHF(){
  if(window.HyperFormula) return Promise.resolve(window.HyperFormula);
  if(!carregandoHF){
    carregandoHF = new Promise(function(ok, falha){
      const s = document.createElement("script");
      s.src = HF_URL; s.async = true; s.crossOrigin = "anonymous";
      s.onload = function(){ window.HyperFormula ? ok(window.HyperFormula) : falha(new Error("calculadora incompleta")); };
      s.onerror = function(){ carregandoHF = null; s.remove(); falha(new Error("Não deu para baixar a calculadora de fórmulas. Confira a internet.")); };
      document.head.appendChild(s);
    });
  }
  return carregandoHF;
}

async function gravarResultados(XLSX, wb){
  let HF;
  try { HF = await carregarHF(); } catch(e){ return; }   // sem ela, o arquivo ainda sai com as fórmulas
  const folhas = {};
  wb.SheetNames.forEach(function(n){
    const ws = wb.Sheets[n], d = XLSX.utils.decode_range(ws["!ref"] || "A1"), a = [];
    for(let r = 0; r <= d.e.r; r++){
      const l = [];
      for(let c = 0; c <= d.e.c; c++){
        const x = ws[XLSX.utils.encode_cell({ r: r, c: c })];
        l.push(!x ? null : (x.f ? "=" + x.f : (x.v === "" || x.v === undefined ? null : x.v)));
      }
      a.push(l);
    }
    folhas[n] = a;
  });
  const hf = HF.buildFromSheets(folhas, { licenseKey: "gpl-v3", useArrayArithmetic: true });
  wb.SheetNames.forEach(function(n){
    const ws = wb.Sheets[n], id = hf.getSheetId(n);
    for(const ref in ws){
      if(ref[0] === "!" || !ws[ref].f) continue;
      const d = XLSX.utils.decode_cell(ref);
      const v = hf.getCellValue({ sheet: id, row: d.r, col: d.c });
      if(v === null || v === undefined){ ws[ref].t = "s"; ws[ref].v = ""; }
      else if(typeof v === "number"){ ws[ref].t = "n"; ws[ref].v = v; }
      else if(typeof v === "boolean"){ ws[ref].t = "b"; ws[ref].v = v; }
      else if(typeof v === "string"){ ws[ref].t = "s"; ws[ref].v = v; }
      /* erro de fórmula: deixa sem valor, o Excel mostra o erro ao recalcular */
    }
  });
  hf.destroy();
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
    wb.Props = { Title: "Material de Alvenaria · Villa Ninita", Language: "pt-BR" };
    const usados = {};
    let arquivo;

    if(escopo === "predio"){
      const qs = est.pavimentos.map(function(p){ return quantitativoMaterial(p.c); });
      const nCols = qs.filter(function(q){ return q.ordem.length; }).length;
      const larg = [26].concat(new Array(nCols).fill(11), [15, 19, 11]);
      XLSX.utils.book_append_sheet(wb, folha(XLSX, linhasResumo(qs), larg), nomeAba("Resumo", usados));
      qs.forEach(function(q){
        const p = linhasPavimento(q);
        XLSX.utils.book_append_sheet(wb, folha(XLSX, p.L, LARG_PAV, p.extras), nomeAba(q.nome, usados));
      });
      arquivo = "Material_Alvenaria_Predio_" + hojeISO() + ".xlsx";
    } else {
      const sel = aptosAtivos(est.pav);
      const q = quantitativoMaterial(est.pav, sel);
      const p = linhasPavimento(q);
      const nome = nomeAba(q.nome, usados);
      XLSX.utils.book_append_sheet(wb, folha(XLSX, p.L, LARG_PAV, p.extras), nome);
      /* logo depois da aba do pavimento: a programação de entregas */
      if(p.info.n) XLSX.utils.book_append_sheet(wb, folhaProgramacao(XLSX, nome, p.info), nomeAba("Programação Entregas", usados));
      arquivo = "Material_Alvenaria_" + est.pav + (sel.length ? "_" + sel.join("-") : "") + "_" + hojeISO() + ".xlsx";
    }

    diz("Calculando as fórmulas…");
    await gravarResultados(XLSX, wb);
    wb.Workbook = Object.assign({}, wb.Workbook || {}, { CalcPr: { fullCalcOnLoad: true } });
    XLSX.writeFile(wb, arquivo, { compression: true, cellStyles: true });
    diz("Planilha baixada: " + arquivo);
  } catch(e){
    diz(e.message || String(e), true);
  } finally {
    if(botao) botao.disabled = false;
  }
}
