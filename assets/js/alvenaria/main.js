import { $, aviso, esc, fecharModal } from "../ui.js";
import { abrirFicha, definirRepintar, excluirApontamento, fecharFicha, registrarApontamento,
         salvarPlanejamento } from "./ficha.js";
import { abrirApontarLote, abrirMaterialLote, abrirPlanejarLote, definirRepintarLote,
         desenharBarraLote, registrarLote, salvarPlanoLote } from "./lote.js";
import { alternarApto, alternarSelecao, carregarCatalogo, composicao, definirMeuNome, diasDoIntervalo, est,
         hojeISO, limparSelecao, listaDePessoas, previsto, percentual, quantasSelecionadas,
         temArea, temPrevisto, textoDePessoas, unidade } from "./modelo.js";
import { CHAVE_SB, URL_SB, apagarEquipe, apagarPerfil, cfgLocal, conectar, entrar, gravarEquipe,
         gravarPerfil, guardarCfgLocal, lerEquipes, lerPerfis, lerPlano, lerSituacao,
         problemaConfig, sair, sessaoAtual, usuario } from "./nuvem.js";
import { definirPeriodo, desenharEquipes, desenharFiltros, desenharIndicadores, desenharMaterial,
         desenharPavimentos, desenharPerfis, desenharPrazos, desenharProducao } from "./paineis.js";
import { alternarInversao, aplicarZoom, desenharMosaico, desenharPlanta, irAtePeca, mudarZoom, pintarPinos } from "./vistas.js";
import { exportarMaterial } from "./exportar.js";

/* ------------------------------------------------------------
   ALVENARIA DE VEDAÇÃO — ponto de partida

   Ordem: catálogo (vem do repositório, sempre funciona) → ligação
   com o Supabase → login → apontamentos. A planta aparece mesmo
   que a nuvem falhe; só o lançamento fica desligado, com aviso.
   ------------------------------------------------------------ */

window.vnCarregado = true;

function travar(){ document.body.classList.add("bloqueado"); }
function destravar(){
  document.body.classList.remove("bloqueado");
  document.body.classList.add("liberado");
  /* a planta foi montada atrás da tela de login, quando o container
     ainda podia ter largura zero: refaz a conta agora que ela aparece */
  requestAnimationFrame(function(){ if(est.vista === "planta") aplicarZoom(); });
}

/* ---------- telas de entrada (mesmo visual do sistema de serviços) ---------- */
function logoSrc(){
  const el = document.querySelector(".carimbo__logo");
  return el ? el.src : "";
}
function telaConfiguracao(mensagem){
  travar();
  $("#modais").innerHTML =
  '<div class="cortina portao"><div class="portao__caixa">' +
    '<img class="portao__logo" src="' + logoSrc() + '" alt="Villa Ninita">' +
    "<h2>Ligar à nuvem</h2>" +
    '<p class="portao__ajuda">Cole os dois valores do projeto Supabase desta obra, ' +
      "que ficam em Project Settings. Isso é pedido uma única vez neste aparelho.</p>" +
    (mensagem ? '<div class="portao__erro">' + esc(mensagem) + "</div>" : "") +
    '<label class="portao__r" for="cfgUrl">Project URL</label>' +
    '<input class="portao__campo" type="text" id="cfgUrl" inputmode="url" autocapitalize="off" ' +
      'placeholder="https://xxxxxxxx.supabase.co" value="' + esc(String(URL_SB).indexOf("COLE") === 0 ? "" : URL_SB) + '">' +
    '<label class="portao__r" for="cfgChave">Publishable key</label>' +
    '<input class="portao__campo" type="text" id="cfgChave" autocapitalize="off" placeholder="sb_publishable_...">' +
    '<button class="btn btn--marca portao__btn" id="btnSalvarCfg">Ligar à nuvem</button>' +
  "</div></div>";
}
function telaLogin(mensagem){
  travar();
  $("#modais").innerHTML =
  '<div class="cortina portao"><div class="portao__caixa">' +
    '<img class="portao__logo" src="' + logoSrc() + '" alt="Villa Ninita">' +
    "<h2>Alvenaria de vedação</h2>" +
    '<p class="portao__ajuda">Entre com o usuário que o Roberto cadastrou para você.</p>' +
    (mensagem ? '<div class="portao__erro">' + esc(mensagem) + "</div>" : "") +
    '<label class="portao__r" for="loginEmail">E-mail</label>' +
    '<input class="portao__campo" type="email" id="loginEmail" autocomplete="username" ' +
      'inputmode="email" autocapitalize="off" value="' + esc(cfgLocal("email","")) + '">' +
    '<label class="portao__r" for="loginSenha">Senha</label>' +
    '<input class="portao__campo" type="password" id="loginSenha" autocomplete="current-password">' +
    '<button class="btn btn--marca portao__btn" id="btnEntrar">Entrar</button>' +
  "</div></div>";
  setTimeout(function(){
    const e = $("#loginEmail"), s = $("#loginSenha");
    if(e && !e.value) e.focus(); else if(s) s.focus();
  }, 60);
}

async function fazerLogin(){
  const email = ($("#loginEmail").value || "").trim();
  const senha = $("#loginSenha").value || "";
  if(!email || !senha){ telaLogin("Preencha e-mail e senha."); return; }
  const b = $("#btnEntrar");
  b.disabled = true; b.textContent = "Entrando…";
  try{
    await entrar(email, senha);
    fecharModal();
    destravar();
    await carregarDaNuvem();
  }catch(e){
    telaLogin(/Invalid login/i.test(String(e && e.message)) ? "E-mail ou senha não conferem." : String(e && e.message || e));
  }
}

/* ---------- carga ---------- */
async function carregarDaNuvem(){
  est.conectado = true;
  est.podeGravar = true;
  try{
    const [situacao, plano, equipes, perfis] = await Promise.all([
      lerSituacao(), lerPlano(), lerEquipes(), lerPerfis().catch(function(){ return null; })
    ]);

    /* perfis é opcional: enquanto a migração 002 não rodar, a tabela
       não existe e todo mundo segue apontando, como antes */
    est.meuEmail = ((usuario && usuario.email) || "").trim().toLowerCase();
    if(perfis){
      est.perfis = perfis;
      const meu = perfis.find(function(p){
        return String(p.email || "").trim().toLowerCase() === est.meuEmail && p.ativo !== false;
      });
      est.papel = meu ? meu.papel : "apontador";
    } else {
      est.perfis = [];
      est.papel = "apontador";
    }
    est.podeGravar = est.papel !== "gestor";
    est.situacao = {};
    situacao.forEach(function(s){
      /* antes da migração 003 a visão não tem 'servico': tudo o que
         existe lá é levante, que é o que o painel media até agora */
      est.situacao[s.pavimento + "__" + s.parede + "__" + (s.servico || "elevacao")] = s;
    });
    est.plano = {};
    plano.forEach(function(p){
      est.plano[p.pavimento + "__" + p.parede] = { id:p.id, responsavel:p.responsavel, inicio:p.inicio, fim:p.fim };
    });
    est.equipes = equipes;
    est.aviso = "";
    if(usuario && usuario.email) definirMeuNome(cfgLocal("nome", ""));
    $("#alvUsuario").textContent = (usuario && usuario.email) || "";
  }catch(e){
    const t = String(e && (e.message || e));
    est.podeGravar = false;
    est.aviso = /relation .* does not exist|schema cache|alvenaria_/i.test(t)
      ? "As tabelas ainda não existem no banco. Rode migracoes/001_alvenaria.sql no Supabase: a planta e o catálogo funcionam, o apontamento não."
      : "Não foi possível ler os apontamentos: " + t;
  }
  repintar();
}

/* ---------- repintura ---------- */
function repintar(){
  Array.prototype.forEach.call(document.querySelectorAll("[data-servico]"), function(b){
    b.setAttribute("aria-pressed", String(b.dataset.servico === est.servico));
  });
  desenharPavimentos();
  desenharIndicadores();

  const abas = { mapa:"#alvMapa", prazos:"#alvPrazosTela", equipes:"#alvEquipesTela", material:"#alvMaterial" };
  for(const k in abas){ const el = $(abas[k]); if(el) el.classList.toggle("oculto", est.aba !== k); }
  Array.prototype.forEach.call(document.querySelectorAll("[data-aba]"), function(b){
    b.setAttribute("aria-selected", String(b.dataset.aba === est.aba));
  });

  if(est.aba === "mapa"){
    desenharFiltros();
    const naPlanta = est.vista === "planta";
    $("#alvPlanta").classList.toggle("oculto", !naPlanta);
    $("#alvMosaico").classList.toggle("oculto", naPlanta);
    $("#alvLegendaDim").classList.toggle("oculto", naPlanta);
    Array.prototype.forEach.call(document.querySelectorAll("[data-vista]"), function(b){
      b.setAttribute("aria-pressed", String(b.dataset.vista === est.vista));
    });
    /* selecionar várias só faz sentido no mosaico: na planta o zoom
       está sempre em cima de um pedaço, e o lote some da vista */
    if(naPlanta && est.selecionando){ est.selecionando = false; limparSelecao(); }
    const bs = $("#alvSelecionar");
    bs.classList.toggle("oculto", naPlanta);
    bs.setAttribute("aria-pressed", String(est.selecionando));
    bs.textContent = est.selecionando
      ? (quantasSelecionadas() ? "Sair da seleção" : "Cancelar seleção")
      : "Selecionar várias";
    bs.classList.toggle("btn--marca", est.selecionando);
    if(naPlanta) desenharPlanta(); else desenharMosaico();
  }
  if(est.aba !== "mapa" && est.selecionando){ est.selecionando = false; limparSelecao(); }
  desenharBarraLote();
  if(est.aba === "prazos") desenharPrazos();
  if(est.aba === "material") desenharMaterial();

  const av = $("#alvAviso");
  av.innerHTML = est.aviso ? "<strong>Atenção.</strong> " + esc(est.aviso) : "";
  av.classList.toggle("oculto", !est.aviso);
}
definirRepintar(repintar);
definirRepintarLote(repintar);

/* ---------- eventos ---------- */
document.addEventListener("click", function(ev){
  const alvo = ev.target.closest(
    "[data-pav],[data-aba],[data-vista],[data-zoom],[data-inverter],[data-filtro],[data-peca]," +
    "[data-pct],[data-lpct],[data-apto],[data-eqdel],[data-perfdel],[data-apdel],[data-selecionar],[data-periodo],[data-servico]," +
    "#alvFechar,#alvRegistrar,#alvSalvarPlano,#btnEntrar,#btnSalvarCfg,#alvSair,#alvCortina," +
    "#alvEqAdd,#alvPerfAdd,#alvExpPav,#alvExpPredio," +
    "#alvLoteMaterial,#alvLotePlanejar,#alvLoteApontar,#alvLoteLimpar,#alvLoteRegistrar,#alvLoteSalvarPlano");
  if(!alvo) return;

  if(alvo.dataset.periodo !== undefined){
    definirPeriodo(Number(alvo.dataset.periodo));
    desenharProducao();
    return;
  }
  if(alvo.dataset.apdel){ excluirApontamento(alvo); return; }
  if(alvo.dataset.apto !== undefined){
    alternarApto(alvo.dataset.apto);
    desenharMaterial();
    return;
  }
  if(alvo.id === "alvExpPav" || alvo.id === "alvExpPredio"){
    exportarMaterial(alvo.id === "alvExpPredio" ? "predio" : "pavimento", alvo);
    return;
  }
  if(alvo.id === "alvEqAdd"){ adicionarEquipe(alvo); return; }
  if(alvo.dataset.eqdel){ removerEquipe(alvo.dataset.eqdel); return; }
  if(alvo.id === "alvPerfAdd"){ adicionarPerfil(alvo); return; }
  if(alvo.dataset.perfdel){ removerPerfil(alvo.dataset.perfdel); return; }

  /* ---- lote ---- */
  if(alvo.dataset.selecionar){
    est.selecionando = !est.selecionando;
    if(!est.selecionando) limparSelecao();
    repintar();
    return;
  }
  if(alvo.id === "alvLoteLimpar"){ limparSelecao(); repintar(); return; }
  if(alvo.id === "alvLoteMaterial"){ abrirMaterialLote(); return; }
  if(alvo.id === "alvLotePlanejar"){ abrirPlanejarLote(); return; }
  if(alvo.id === "alvLoteApontar"){ abrirApontarLote(); return; }
  if(alvo.id === "alvLoteRegistrar"){ registrarLote(alvo); return; }
  if(alvo.id === "alvLoteSalvarPlano"){ salvarPlanoLote(alvo); return; }
  if(alvo.dataset.lpct !== undefined){
    const v = Number(alvo.dataset.lpct);
    if($("#alvLotePct")) $("#alvLotePct").value = v;
    if($("#alvLotePctN")) $("#alvLotePctN").value = v;
    Array.prototype.forEach.call($("#alvFicha").querySelectorAll("[data-lpct]"), function(b){
      b.setAttribute("aria-pressed", String(Number(b.dataset.lpct) === v));
    });
    return;
  }

  if(alvo.id === "alvCortina" || alvo.id === "alvFechar"){ fecharFicha(); return; }
  if(alvo.id === "btnEntrar"){ fazerLogin(); return; }
  if(alvo.id === "btnSalvarCfg"){ salvarConfiguracao(); return; }
  if(alvo.id === "alvSair"){ sair().then(function(){ location.reload(); }); return; }
  if(alvo.id === "alvRegistrar"){ registrarApontamento(alvo); return; }
  if(alvo.id === "alvSalvarPlano"){ salvarPlanejamento(alvo); return; }

  if(alvo.dataset.pav){
    est.pav = alvo.dataset.pav; est.busca = "";
    limparSelecao();   /* seleção não atravessa pavimento */
    guardarCfgLocal("pav", est.pav);
    repintar();
    window.scrollTo({ top:0, behavior:"smooth" });
    return;
  }
  if(alvo.dataset.aba){
    est.aba = alvo.dataset.aba;
    repintar();
    if(est.aba === "equipes") desenharEquipes();
    return;
  }
  if(alvo.dataset.vista){
    est.vista = alvo.dataset.vista;
    guardarCfgLocal("vista", est.vista);
    repintar();
    return;
  }
  if(alvo.dataset.servico){
    est.servico = alvo.dataset.servico;
    guardarCfgLocal("servico", est.servico);
    if(!est.aberta) limparSelecao();
    repintar();
    if(est.aba === "equipes") desenharProducao();
    /* trocar de serviço dentro da ficha remonta a ficha, para o
       formulário passar a falar da unidade certa */
    if(est.aberta) abrirFicha(est.aberta);
    return;
  }
  if(alvo.dataset.zoom){
    const z = alvo.dataset.zoom;
    mudarZoom(z === "tudo" ? 1 : z === "mais" ? est.zoom*1.6 : est.zoom/1.6);
    return;
  }
  if(alvo.dataset.inverter){
    guardarCfgLocal("inverter", alternarInversao() ? "1" : "0");
    return;
  }
  if(alvo.dataset.filtro){ est.filtro = alvo.dataset.filtro; repintar(); return; }
  if(alvo.dataset.peca){
    /* no mosaico em modo de seleção o toque marca a peça;
       na planta e fora do modo, abre a ficha como sempre */
    if(est.selecionando && est.vista === "mosaico" && est.aba === "mapa"){
      alternarSelecao(alvo.dataset.peca);
      /* mexe só na peça tocada e na barra: redesenhar o pavimento
         inteiro a cada toque trava o celular num andar de 189 peças */
      const marcada = !!est.selecao[alvo.dataset.peca];
      alvo.classList.toggle("escolhida", marcada);
      alvo.setAttribute("aria-pressed", String(marcada));
      let visto = alvo.querySelector(".alv-bloco__check");
      if(marcada && !visto){
        visto = document.createElement("span");
        visto.className = "alv-bloco__check";
        visto.setAttribute("aria-hidden", "true");
        visto.textContent = "✓";
        alvo.appendChild(visto);
      }
      if(!marcada && visto) visto.remove();
      desenharBarraLote();
      const bs = $("#alvSelecionar");
      if(bs) bs.textContent = quantasSelecionadas() ? "Sair da seleção" : "Cancelar seleção";
    } else {
      abrirFicha(alvo.dataset.peca);
    }
    return;
  }

  if(alvo.dataset.pct !== undefined){
    const v = Number(alvo.dataset.pct);
    const w = est.porId[est.aberta];
    if(!w) return;
    const r = $("#alvPct"); if(r) r.value = v;
    const n = $("#alvPctN"); if(n) n.value = v;
    const m = $("#alvM2");
    if(m && temPrevisto(w)) m.value = (previsto(w)*v/100).toFixed(2);
    Array.prototype.forEach.call($("#alvFicha").querySelectorAll("[data-pct]"), function(b){
      b.setAttribute("aria-pressed", String(Number(b.dataset.pct) === v));
    });
    return;
  }
});

document.addEventListener("input", function(ev){
  const w = est.porId[est.aberta];
  const alvo = ev.target;

  if(alvo.id === "alvPct" && w){
    const v = Number(alvo.value);
    if($("#alvPctN")) $("#alvPctN").value = v;
    if($("#alvM2") && temPrevisto(w)) $("#alvM2").value = (previsto(w)*v/100).toFixed(2);
    Array.prototype.forEach.call($("#alvFicha").querySelectorAll("[data-pct]"), function(b){
      b.setAttribute("aria-pressed", String(Number(b.dataset.pct) === v));
    });
  }
  if(alvo.id === "alvPctN" && w){
    const v = Math.max(0, Math.min(100, Number(alvo.value) || 0));
    if($("#alvPct")) $("#alvPct").value = v;
    if($("#alvM2") && temPrevisto(w)) $("#alvM2").value = (previsto(w)*v/100).toFixed(2);
  }
  if(alvo.id === "alvM2" && w && temPrevisto(w)){
    const base = previsto(w);
    const m = Math.max(0, Math.min(base, Number(alvo.value) || 0));
    const v = Math.round(m/base*100);
    if($("#alvPct")) $("#alvPct").value = v;
    if($("#alvPctN")) $("#alvPctN").value = v;
  }
  if(alvo.id === "alvLotePct"){
    const v = Number(alvo.value);
    if($("#alvLotePctN")) $("#alvLotePctN").value = v;
    Array.prototype.forEach.call($("#alvFicha").querySelectorAll("[data-lpct]"), function(b){
      b.setAttribute("aria-pressed", String(Number(b.dataset.lpct) === v));
    });
  }
  if(alvo.id === "alvLotePctN"){
    const v = Math.max(0, Math.min(100, Number(alvo.value) || 0));
    if($("#alvLotePct")) $("#alvLotePct").value = v;
  }
  /* cadastro de equipe: mostra como o ponto e vírgula está sendo
     lido, para ninguém descobrir só depois de gravar */
  if(alvo.id === "alvEqNome" || alvo.id === "alvEqServ"){
    const p = $("#alvEqPreview");
    if(p){
      const prof = listaDePessoas(($("#alvEqNome") || {}).value);
      const serv = listaDePessoas(($("#alvEqServ") || {}).value);
      p.className = "alv-msg";
      p.innerHTML = (prof.length || serv.length)
        ? "Vai gravar " + esc(composicao({ nome: prof.join("; "), serventes: serv.join("; ") })) +
          ": <b>" + esc(prof.join(" · ") || "—") + "</b>" +
          (serv.length ? " e " + esc(serv.join(" · ")) : "")
        : "Mais de um nome? Separe por <b>ponto e vírgula</b>. " +
          "Os profissionais são o nome da equipe na hora de apontar.";
    }
  }
  if(alvo.id === "alvBusca"){
    est.busca = alvo.value;
    if(est.vista === "planta"){
      pintarPinos();
      const q = est.busca.trim().toUpperCase();
      const casa = (est.porPavimento[est.pav] || []).filter(function(x){ return x.codigo.indexOf(q) !== -1; });
      if(q.length >= 4 && casa.length === 1) irAtePeca(casa[0].codigo);
    } else {
      desenharMosaico();
    }
  }
});

document.addEventListener("change", function(ev){
  const sel = ev.target;

  /* período da produção: em change, não em input — redesenhar a cada
     tecla tiraria o foco do campo de data no meio da digitação */
  if(sel.id === "alvPerDe" || sel.id === "alvPerAte"){
    est.periodoDe = ($("#alvPerDe") && $("#alvPerDe").value) || "";
    est.periodoAte = ($("#alvPerAte") && $("#alvPerAte").value) || "";
    desenharProducao();
    return;
  }

  /* intervalo do apontamento: mantém as duas pontas coerentes e diz
     quantos dias de trabalho o lançamento está cobrindo */
  if(sel.id === "alvDataIni" || sel.id === "alvData")
    return ajustarIntervalo("alvDataIni", "alvData", "alvDias", sel.id);
  if(sel.id === "alvLoteDataIni" || sel.id === "alvLoteData")
    return ajustarIntervalo("alvLoteDataIni", "alvLoteData", "alvLoteDias", sel.id);

  /* "Outra (digitar)" na lista de equipes revela o campo livre */
  if(!sel || !sel.dataset || !sel.dataset.equipeSel) return;
  const caixa = $("#" + sel.dataset.equipeSel + "-box");
  if(!caixa) return;
  const livre = sel.value === "__outra";
  caixa.classList.toggle("oculto", !livre);
  if(livre){ const c = $("#" + sel.dataset.equipeSel); if(c) c.focus(); }
});

/* ------------------------------------------------------------
   Intervalo do apontamento

   Quem mexe numa ponta arrasta a outra se elas se cruzarem — é o
   que a pessoa quis dizer, e evita o erro "o começo está depois do
   término" só porque ela mudou o campo de baixo primeiro.
   ------------------------------------------------------------ */
function ajustarIntervalo(idIni, idFim, idAviso, mexido){
  const ini = $("#" + idIni), fim = $("#" + idFim), aviso = $("#" + idAviso);
  if(!ini || !fim) return;
  if(ini.value && fim.value && ini.value > fim.value){
    if(mexido === idIni) fim.value = ini.value; else ini.value = fim.value;
  }
  ini.max = fim.value || hojeISO();
  if(!aviso) return;
  const d = diasDoIntervalo(ini.value, fim.value);
  aviso.className = "alv-msg";
  aviso.textContent = d <= 1 ? "Um dia de trabalho."
    : d + " dias de trabalho — é o que entra na conta de " + unidade() + "/dia da equipe.";
}

document.addEventListener("keydown", function(ev){
  if(ev.key === "Escape" && est.aberta) fecharFicha();
  if(ev.key === "Enter" && $("#btnEntrar")) fazerLogin();
});

let tempoResize;
window.addEventListener("resize", function(){
  clearTimeout(tempoResize);
  tempoResize = setTimeout(function(){ if(est.vista === "planta") aplicarZoom(); }, 180);
});
/* o giro do aparelho muda a largura depois do evento: espera o layout assentar */
window.addEventListener("orientationchange", function(){
  setTimeout(function(){ if(est.vista === "planta") aplicarZoom(); }, 320);
});

/* ---------- equipes ---------- */
async function adicionarEquipe(botao){
  const campoProf = $("#alvEqNome"), campoServ = $("#alvEqServ"), msg = $("#alvEqMsg");
  /* o texto vai gravado na forma canônica — "Matias; Severino" —
     porque é ele que o apontamento guarda para dizer quem executou */
  const nome = textoDePessoas(campoProf && campoProf.value);
  const serventes = textoDePessoas(campoServ && campoServ.value);
  function diz(t, erro){ if(msg){ msg.className = "alv-msg" + (erro ? " erro" : ""); msg.textContent = t; } }

  if(!nome){
    diz("Escreva ao menos um profissional. Mais de um, separe por ponto e vírgula.", true);
    if(campoProf) campoProf.focus();
    return;
  }
  const repetida = est.equipes.some(function(e){
    return textoDePessoas(e.nome).toLowerCase() === nome.toLowerCase();
  });
  if(repetida){ diz("Já existe uma equipe com esses profissionais.", true); return; }
  /* o mesmo nome dos dois lados quase sempre é engano */
  const cruzados = listaDePessoas(serventes).filter(function(s){
    return listaDePessoas(nome).some(function(p){ return p.toLowerCase() === s.toLowerCase(); });
  });
  if(cruzados.length){
    diz("\"" + cruzados.join("\", \"") + "\" está nos dois campos. Cada pessoa entra de um lado só.", true);
    return;
  }

  botao.disabled = true;
  diz("Gravando…");
  try{
    const nova = await gravarEquipe({ nome: nome, serventes: serventes });
    est.equipes.push(nova);
    est.equipes.sort(function(a,b){ return a.nome.localeCompare(b.nome, "pt-BR"); });
    desenharEquipes();
    aviso("Equipe de " + composicao(nova) + " cadastrada: " + nome + ".");
  }catch(e){
    diz(erroDeEquipe(e), true);
  }finally{
    botao.disabled = false;
  }
}

async function removerEquipe(id){
  const equipe = est.equipes.find(function(e){ return String(e.id) === String(id); });
  if(!equipe) return;
  try{
    await apagarEquipe(id);
    est.equipes = est.equipes.filter(function(e){ return String(e.id) !== String(id); });
    desenharEquipes();
    aviso("Equipe \"" + equipe.nome + "\" removida. Os apontamentos dela continuam no histórico.");
  }catch(e){
    aviso(erroDeEquipe(e), "erro");
  }
}

/* ---------- perfis de acesso ---------- */
async function adicionarPerfil(botao){
  const email = (($("#alvPerfEmail") || {}).value || "").trim().toLowerCase();
  const nome = (($("#alvPerfNome") || {}).value || "").trim();
  const papel = (($("#alvPerfPapel") || {}).value || "apontador");
  const msg = $("#alvPerfMsg");
  function diz(t, erro){ if(msg){ msg.className = "alv-msg" + (erro ? " erro" : ""); msg.textContent = t; } }

  if(!email || email.indexOf("@") < 1){ diz("Escreva o e-mail do usuário.", true); return; }
  if(est.perfis.some(function(p){ return String(p.email||"").toLowerCase() === email; })){
    diz("Esse e-mail já tem perfil.", true); return;
  }
  botao.disabled = true;
  diz("Gravando…");
  try{
    const novo = await gravarPerfil({ email: email, nome: nome, papel: papel });
    est.perfis.push(novo);
    est.perfis.sort(function(a,b){ return String(a.nome||a.email).localeCompare(String(b.nome||b.email), "pt-BR"); });
    if(email === est.meuEmail){ est.papel = novo.papel; est.podeGravar = novo.papel !== "gestor"; }
    desenharPerfis();
    aviso("Perfil de " + (nome || email) + " criado como " + papel + ".");
  }catch(e){
    diz(erroDePerfil(e), true);
  }finally{
    botao.disabled = false;
  }
}

async function removerPerfil(id){
  const p = est.perfis.find(function(x){ return String(x.id) === String(id); });
  if(!p) return;
  try{
    await apagarPerfil(id);
    est.perfis = est.perfis.filter(function(x){ return String(x.id) !== String(id); });
    desenharPerfis();
    aviso("Perfil de " + (p.nome || p.email) + " removido. A conta no Supabase continua existindo.");
  }catch(e){
    aviso(erroDePerfil(e), "erro");
  }
}

function erroDePerfil(e){
  const t = String((e && (e.message || e.hint || e.details)) || e || "");
  if(/relation .* does not exist|schema cache|alvenaria_perfis/i.test(t))
    return "A tabela de perfis ainda não existe. Rode migracoes/002_perfis.sql no Supabase.";
  if(/duplicate key|unique/i.test(t)) return "Esse e-mail já tem perfil.";
  if(/row-level security|permission denied|violates/i.test(t))
    return "Só um administrador pode mexer nos perfis.";
  if(/Failed to fetch|NetworkError/i.test(t)) return "Sem conexão. Tente de novo.";
  return "Não gravou: " + t;
}

function erroDeEquipe(e){
  const t = String((e && (e.message || e.hint || e.details)) || e || "");
  if(/serventes/i.test(t))
    return "Falta a migração 005_equipe_pessoas.sql no Supabase: a tabela de equipes ainda não tem a coluna de serventes.";
  if(/relation .* does not exist|schema cache|alvenaria_equipes/i.test(t))
    return "A tabela de equipes ainda não existe no banco. Rode migracoes/001_alvenaria.sql no Supabase.";
  if(/duplicate key|unique/i.test(t)) return "Já existe uma equipe com esses profissionais.";
  if(/row-level security|permission denied/i.test(t)) return "Seu usuário não tem permissão para gravar.";
  if(/Failed to fetch|NetworkError/i.test(t)) return "Sem conexão. Tente de novo quando o sinal voltar.";
  return "Não gravou: " + t;
}

function salvarConfiguracao(){
  const url = ($("#cfgUrl").value || "").trim().replace(/\/+$/, "");
  const chave = ($("#cfgChave").value || "").trim();
  const problema = problemaConfig(url, chave);
  if(problema){ telaConfiguracao(problema); return; }
  guardarCfgLocal("url", url);
  guardarCfgLocal("chave", chave);
  location.reload();
}

/* ---------- arranque ---------- */
(async function(){
  try{
    const v = cfgLocal("vista", "");
    if(v === "planta" || v === "mosaico") est.vista = v;
    const sv = cfgLocal("servico", "");
    if(sv === "elevacao" || sv === "marcacao") est.servico = sv;
    est.inverter = cfgLocal("inverter", "1") !== "0";
    const p = cfgLocal("pav", "");

    await carregarCatalogo();
    if(p && est.pavPorCodigo[p]) est.pav = p;
    else est.pav = "TE";
    /* no celular a planta inteira não diz nada: começa aproximada */
    est.zoom = window.innerWidth < 700 ? 4 : 3;
    repintar();
  }catch(e){
    $("#alvAviso").classList.remove("oculto");
    $("#alvAviso").innerHTML = "<strong>Atenção.</strong> Não foi possível carregar o catálogo da alvenaria (" +
      esc(String(e && e.message || e)) + "). Confira se a pasta assets foi publicada inteira.";
    destravar();
    return;
  }

  const problema = problemaConfig(URL_SB, CHAVE_SB);
  if(problema){ telaConfiguracao(problema); return; }

  try{ conectar(); }
  catch(e){
    est.aviso = "A biblioteca do Supabase não carregou. A planta funciona; o apontamento não.";
    destravar(); repintar(); return;
  }

  const u = await sessaoAtual();
  if(!u){ telaLogin(); return; }
  destravar();
  await carregarDaNuvem();
})();
