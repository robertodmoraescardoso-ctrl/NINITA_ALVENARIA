# Villa Ninita — Alvenaria de vedação

Apontamento da execução da alvenaria da obra Villa Ninita
(Poço da Panela, Recife/PE — Rio Ave) sobre a planta de 1ª fiada:
o apontador toca na parede no desenho e lança quanto foi executado,
por quem e em que prazo.

Site estático: HTML, CSS e JavaScript puros, sem etapa de compilação.
Os dados ficam no Supabase (banco Postgres).

> Separado de propósito do **NINITA_SERVI-OS**, que acompanha os
> serviços da obra: outro repositório, outro endereço, outro visual e
> outras chaves de aparelho. O que os dois dividem é o **projeto
> Supabase** — banco e login — porque o plano gratuito permite só
> dois projetos por conta e as duas vagas já estavam ocupadas.
>
> Na prática isso ajuda: quem aponta usa um único usuário nos dois
> sistemas. As tabelas desta disciplina têm o prefixo `alvenaria_` e
> não encostam nas dos serviços. Para separar o banco mais à frente,
> basta apontar o `config.js` para outro projeto e rodar a migração
> lá — ela é idempotente.

---

## Estrutura de pastas

```
index.html              a página (única)
config.js               URL e chave publicável do Supabase
assets/
  css/estilo.css        casca: carimbo, abas, botões, portão de login
  css/alvenaria.css     planta, mosaico, ficha e listas
  dados/
    alvenaria-catalogo.json   as 1.272 peças do projeto (953 PR entram no sistema)
    alvenaria-plantas.json    as marcações clicáveis das plantas (só as PR aparecem)
    alvenaria-apartamentos.json  em que apartamento fica cada parede do tipo
  img/plantas/          as cinco pranchas de 1ª fiada, em PNG
  js/ui.js              utilitários de tela
  js/alvenaria/
    main.js             arranque, login, eventos e equipes
    nuvem.js            conexão e gravação
    modelo.js           catálogo em memória e regras de situação
    vistas.js           planta de 1ª fiada e mosaico
    ficha.js            ficha da parede e lançamento
    lote.js             seleção múltipla: material, apontar, planejar
    paineis.js          indicadores, prazos, equipes e material
    exportar.js         planilha Excel do quantitativo de material
migracoes/              scripts SQL do banco, numerados (rodar em ordem)
```

> **Atenção ao publicar:** o `index.html`, o `config.js` e a pasta
> `assets/` inteira têm que ir juntos. Se faltar algo, o site mostra
> um aviso em vez de abrir — não fica em branco.

---

## O que vem do projeto e o que vem da obra

O **catálogo** das paredes (área líquida, blocos por SKU, espessura,
avisos) e a **geometria das plantas** moram em `assets/dados/`,
versionados no git. Eles saem das pranchas da Tecomat publicadas no
ConstruCode e só mudam quando sai revisão nova.

No **banco** fica só o que a obra produz: apontamento, planejamento e
as equipes. Trocar uma prancha por revisão nova significa refazer os
dois arquivos de `assets/dados/` junto com o PNG — não mexe no banco.

### Só paredes PR

O projeto numera dois tipos de peça: paredes (`PRxxx`) e shafts
(`SHxxx`). **Este sistema controla só as PR.** Os shafts — 47 no térreo,
34 em cada pavimento tipo, 65 na cobertura e 3 no semienterrado, 319 no
prédio — saem na carga do catálogo (`carregarCatalogo`, em `modelo.js`)
e com isso somem de tudo de uma vez: mosaico, pinos da planta, busca,
totais, lote, prazos e material.

Os dois JSON continuam com os shafts, intactos. Se um dia eles
voltarem ao controle, é tirar o filtro `ehParede` — uma linha — e
nada mais muda, porque os dados nunca saíram.

| Pavimento | Paredes PR |
|---|---|
| Semienterrado | 81 |
| Térreo | 119 |
| Tipo (cada, ×6) | 104 |
| Academia | 5 |
| Cobertura | 124 |
| **Prédio** | **953** |

---

## Dois serviços, duas unidades

A alvenaria se mede de dois jeitos, e o painel trata os dois como
serviços separados — o seletor no alto da página troca entre eles, e
mapa, indicadores, prazos e produção seguem o que estiver escolhido:

| Serviço | O que é | Unidade | De onde vem o previsto |
|---|---|---|---|
| **Levante** | subir a parede | m² | tabelas QUANTITATIVO das elevações (soma modular dos blocos) |
| **Marcação** | a 1ª fiada | metro linear | `LEV_COTAÇÃO_M² ALVENARIA DETALHADO_R00.xlsx`, aba MEMORIA |

Cada parede guarda um apontamento por serviço: marcar não conclui o
levante, e o histórico mostra os dois lado a lado, etiquetados.

**O metro linear não cobre tudo.** A planilha de cotação traz só as
paredes `PR` do térreo, do tipo e da cobertura:

| Pavimento | Peças | Com metro linear |
|---|---|---|
| Semienterrado | 81 | 0 |
| Térreo | 119 | 119 |
| Tipo (cada) | 104 | 104 |
| Academia | 5 | 0 |
| Cobertura | 124 | 123 (falta a PR039) |

Onde não há comprimento, a marcação só
pode ser apontada como concluída ou não, sem metros — do mesmo jeito
que o levante nos pavimentos sem elevação publicada.

> **Atenção à área.** A planilha de cotação também traz m², calculado
> por comprimento × altura − vãos. **Não é o m² do painel**, que vem da
> contagem de blocos das elevações. Os totais ficam perto (2,7% no
> térreo, 2,8% no tipo), mas parede a parede há divergências grandes:
> cerca de 18% delas diferem mais de 15%, e algumas chegam a dobrar.
> O painel usa a planilha **apenas para o metro linear**. Se for cotar
> pela planilha e medir pelo painel, os dois números não vão fechar —
> vale decidir qual é a referência antes de fechar contrato.

### Onde as duas fontes brigam

Das 212 paredes que as duas fontes descrevem com número, **40 diferem
mais de 15%**. O quadro abaixo diz o que explicaria cada diferença — não
quem está certo, porque isso só a peça no andar resolve.

| O que explicaria | Peças | Efeito na obra¹ | Em módulo¹ |
|---|---|---|---|
| Equivale a altura | 9 | +85,9 m² | 89,3 m² |
| Vão que a planilha não desconta | 7 | −60,5 m² | 60,5 m² |
| Vão ocupa quase a parede toda | 15 | +1,5 m² | 39,3 m² |
| Equivale a comprimento | 9 | −25,7 m² | 34,1 m² |

¹ térreo uma vez + tipo seis vezes. *Efeito* soma com sinal, *módulo*
ignora o sinal.

**O total engana.** Na obra inteira a diferença líquida é de 1,2 m² —
os erros se cancelam quase perfeitamente. Mas são **223 m² de quantidade
assentados em peças onde as duas fontes discordam**. Para fechar o total
de um contrato, tanto faz. Para medir peça a peça — que é o que o painel
faz — não dá para ignorar.

**As maiores, em ordem:**

| Pavimento | Peça | L | H | vão | planilha | projeto | dif |
|---|---|---|---|---|---|---|---|
| Térreo | PR001, PR002, PR003 | 2,58 | 1,77 | 1,16 | 3,40 | **7,07** | +3,67 (108%) |
| Tipo | PR066 | 3,14 | 2,38 | 0,00 | 7,47 | 4,12 | −3,35 |
| Tipo | PR098 | 2,00 | 2,72 | 0,00 | 5,43 | 2,17 | −3,26 |
| Térreo | PR040 | 4,97 | 2,41 | 6,10 | 5,89 | 3,04 | −2,85 |
| Tipo | PR029, PR030, PR031 | 4,74 | 2,43 | 4,37 | 7,15 | **9,99** | +2,84 |

Sobre a **PR001/002/003 do térreo** — o nicho da prumada, três peças
idênticas: a altura de 1,77 m da planilha está certa, confirmada na
obra. Então quem não fecha é o quantitativo da elevação, que traz 159
blocos = 7,07 m² para uma parede de 2,58 × 1,77. Aquele quantitativo
cobre mais do que esse trecho de 1,77 m. **São as três peças em que o
previsto do painel está mais alto do que a parede real** — 11,0 m² no
térreo. Enquanto a elevação não for revista, medir essas três pelo
painel paga mais que o dobro.

O diagnóstico peça a peça, com as três correções possíveis para cada
uma (altura, vão e comprimento), está em
`doc/divergencias-diagnostico.csv`.

---

## Quem entra e o que pode fazer

Duas coisas separadas:

1. **A conta** — criada no Supabase, em *Authentication > Users*. Sem
   conta ninguém entra. O convite por e-mail deixa a pessoa escolher a
   própria senha.
2. **O papel** — definido na página, em *Equipes > Quem tem acesso*:

| Papel | Pode |
|---|---|
| `admin` | lança e gerencia os papéis |
| `apontador` | lança execução, prazo e equipes |
| `gestor` | só acompanha: vê tudo, não grava nada |

A trava é no banco, não só na tela: as regras de acesso (RLS) checam
o papel antes de aceitar qualquer gravação. Esconder botão protege do
engano; a regra do banco protege de verdade.

**Quem não está na lista entra como `apontador`.** É de propósito:
assim ninguém perde acesso quando a migração 002 roda, e não há risco
de todo mundo ficar trancado do lado de fora. Enquanto a lista estiver
vazia, qualquer pessoa logada pode criar perfis — então a primeira
coisa a fazer depois da migração é **se cadastrar como `admin`**.

Remover um perfil aqui não apaga a conta no Supabase: a pessoa volta a
entrar como apontador. Para tirar o acesso de vez, desative o usuário
no Supabase.

---

## O apontamento é um intervalo, não um dia

Parede não nasce e termina no mesmo dia. O lançamento guarda **quando
começou** e **quando terminou**:

| Campo | O que é |
|---|---|
| *Começou em* | o dia em que a equipe pegou aquele trecho |
| *Terminou em* | o dia em que parou ali e foi medido |

Os dois vêm preenchidos com hoje, então quem fez tudo num dia só toca
no botão e pronto. Mexer numa ponta arrasta a outra se elas se
cruzarem, e abaixo dos campos a tela diz quantos dias de trabalho o
lançamento está cobrindo. No banco, `data` continua sendo a data de
referência — a que ordena o histórico e decide qual é o apontamento
mais recente da peça; `data_inicio` é a ponta nova.

---

## A equipe é gente, não um rótulo

O cadastro, na aba **Equipes**, tem dois campos:

| Campo | O que vai nele |
|---|---|
| *Profissional(is)* | os pedreiros — `Matias; Severino` |
| *Servente(s)* | os serventes — `João; Pedro` |

Mais de um nome, **separado por ponto e vírgula**. Enquanto você digita,
a linha abaixo mostra como está sendo lido (*"Vai gravar 2 profissionais
e 1 servente · 3 pessoas"*), porque descobrir o separador depois de
gravar é tarde.

**Os profissionais são a identidade da equipe.** É esse texto que o
apontamento guarda em `equipe`, é ele que aparece na lista de *quem
executou* e é por ele que a produção é somada. Por isso a mesma pessoa
não pode estar nos dois campos, e duas equipes não podem ter a mesma
lista de profissionais — a tela recusa os dois casos.

No banco, `nome` continua sendo a coluna da identidade (agora com a
lista), `serventes` é nova e `empresa` saiu da tela mas não foi apagada.

---

## Desfazer: excluir equipe e excluir lançamento

Nada neste sistema é apagado de verdade. **Não existe `DELETE` em
lugar nenhum** — excluir preenche `excluido_em`, a linha some das
leituras e continua no banco. Medição apagada para valer não se
audita depois, e engano de apontador acontece.

**Equipe** — o `×` à direita de cada equipe, na aba *Equipes*. A
equipe sai da lista de *quem executou*, mas os lançamentos que ela
já assinou continuam dizendo o nome dela no histórico e na produção.

**Lançamento** — o `×` à direita de cada linha do *Histórico*, dentro
da ficha da parede. São **dois toques**: o primeiro vira *Excluir?* em
vermelho, o segundo confirma. Tocar em outro lançamento desarma o
primeiro. Não há `alert()`: no celular, no meio de uma folha
deslizante, o diálogo some atrás do teclado.

Ao excluir, **a parede volta ao lançamento anterior daquele serviço**,
não a zero. Se alguém apontou 50%, depois 100%, e o 100% estava
errado, a peça volta a 50% e ao status *em execução*. Só quando não
sobra nenhum lançamento do serviço é que ela volta a *não iniciada*.
O outro serviço não é tocado: excluir um levante não mexe na marcação.

O gestor não vê nenhum dos dois botões.

---

## Produtividade por equipe

Na aba **Equipes**, a produção é apurada num período que você escolhe
(campos *De* e *Até*, mais atalhos de 7, 30 e 90 dias ou *Tudo*).

O cálculo tem duas sutilezas que valem entender.

**O avanço, não o acumulado.** Cada apontamento guarda o percentual
**acumulado** da parede, não o que foi feito no dia. Somar `area_m2`
direto contaria a mesma parede duas vezes — uma peça apontada em 50% e
depois em 100% viraria uma vez e meia. Então o que entra na conta é o
**avanço** sobre o lançamento anterior da mesma peça, creditado a quem
assinou o lançamento mais novo.

**Dias em obra, não dias com lançamento.** A coluna *Dias em obra* soma
os dias corridos cobertos pelos intervalos, sem contar duas vezes o dia
em que dois lançamentos se encontram. Uma parede levantada de segunda a
quarta vale três dias, não um. É isso que faz o `m²/dia` ser RUP de
verdade: antes, lançar o acumulado uma vez por semana dava uma RUP sete
vezes maior que a real.

`m²/dia` é RUP aproximada: quantidade do período ÷ dias em obra. Serve
para comparar equipes e projetar prazo, não como medição de folha.

O **período** filtra pela data de referência. Um trecho que começou
antes do período entra inteiro se terminou dentro dele: o avanço é
creditado na medição, não rateado dia a dia.

---

## Exportar o material em planilha

Na aba **Material**, dois botões geram um arquivo Excel (`.xlsx`):

- **Exportar &lt;pavimento&gt;** — a mesma tabela da tela, para o
  pavimento aberto: SKU, previsto, estimado assentado e saldo, os
  totais de blocos e telas e o metro linear da marcação.
  Arquivo `Material_Alvenaria_TP01_2026-11-12.xlsx`.
- **Exportar prédio inteiro** — uma aba *Resumo* com cada SKU numa
  linha e um pavimento por coluna, mais previsto total, assentado e
  saldo; o metro linear de todos os pavimentos; e depois uma aba por
  pavimento, igual à exportação individual.
  Arquivo `Material_Alvenaria_Predio_2026-11-12.xlsx`.

Os números da tela e da planilha saem da mesma função
(`quantitativoMaterial`, em `modelo.js`): as duas não têm como
discordar. Os valores vão como **número**, não texto — dá para somar,
filtrar e montar tabela dinâmica direto no Excel.

O assentado continua sendo estimado (previsto × % de levante
apontado); a nota vai no rodapé de cada aba. Semienterrado, Academia
e Cobertura aparecem sem material porque não têm elevação publicada.

O gerador de planilha (SheetJS 0.18.5, via cdnjs) só é baixado no
primeiro clique. Sem internet, o botão avisa e não faz nada.

---

## Material por apartamento

No pavimento tipo, a aba **Material** mostra chips com os seis
apartamentos — **01A, 02A, 01B, 02B, 01C, 02C** — e o total de blocos
de cada um. Dá para marcar **um ou vários**: a marcação (metro
linear), a tabela de material e a planilha exportada passam a somar
só as paredes deles. **Pavimento inteiro** volta ao total. A escolha
atravessa a troca de pavimento: o 01A do 1º tipo e o do 4º tipo são o
mesmo apartamento em andares diferentes.

A divisão veio do croqui do Roberto (12/11/2026), casado com a prancha
de 1ª fiada do tipo pelos eixos Y3, Y2 e Y1 — a escala bateu nos dois
intervalos. A planta pintada por apartamento, para conferir, está em
`doc/apartamentos-tipo.png`. A atribuição de cada parede está em
`assets/dados/alvenaria-apartamentos.json`: mudar uma parede de
apartamento é editar uma linha ali.

| Apartamento | Paredes | Blocos | Telas |
|---|---|---|---|
| 01A | 24 | 2.614 | 236 |
| 02A | 14 | 1.720 | 171 |
| 01B | 19 | 2.471 | 160 |
| 02B | 14 | 1.724 | 171 |
| 01C | 17 | 2.051 | 160 |
| 02C | 16 | 2.264 | 236 |
| **Pavimento** | **104** | **12.844** | **991** |

### O que ficou na divisa

O traço à mão não decide a parede que está em cima dele. Essas foram
conferidas na prancha, uma a uma:

- **Entre 02A e 01B a parede é dupla** (critério acústico): PR067/PR068
  são a folha do 02A, PR069/PR070 a do 01B. O traço do croqui passava
  um pouco à esquerda das duas folhas.
- **Perto do eixo de cada núcleo**, PR023 é do 02 (o rótulo está do
  lado do 01, a parede não); PR026, PR057 e PR058 são do 01. O mesmo
  vale para as equivalentes dos blocos B e C.
- **17 paredes estão em cima da divisa**: os eixos dos três núcleos
  (PR001, PR029, PR045, PR059, PR060 no bloco A; PR002, PR030, PR046,
  PR077, PR078 no B; PR003, PR031, PR050, PR093, PR094 no C) e a
  parede única entre os blocos B e C (PR085, PR086). São 2.521 blocos
  por pavimento.

**A parede de divisa fica com um apartamento só: o que vem antes na
sequência 01A, 02A, 01B, 02B, 01C, 02C** — o da esquerda na planta,
que é quem chega primeiro nela se a execução seguir essa ordem.
Decisão do Roberto em 12/11/2026. Com isso os seis apartamentos somam
exatamente o pavimento. No JSON, a lista `divisas` guarda os dois
vizinhos de cada uma: trocar o lado de uma parede é mudar o
apartamento dela em `paredes`.

A tela avisa as duas pontas: ao escolher o 01A, "inclui 5 paredes de
divisa que ficaram com esta seleção"; ao escolher o 02A, "não inclui
5 paredes de divisa que ficaram com o vizinho". Escolhendo os dois
juntos, não há aviso. A planilha lista para onde foi cada uma.

Na planilha, cada aba de pavimento tipo ganha a tabela **saldo por
apartamento** (o que ainda falta subir), com uma coluna por
apartamento e, na última, o pavimento ou o conjunto escolhido — as colunas somam o total.

O **térreo** não tem divisão em apartamentos: o croqui é do tipo.

---

## Seleção em lote

No **Mosaico**, o botão *Selecionar várias* entra no modo de seleção:
cada toque marca ou desmarca uma parede e uma barra no rodapé mostra
quantas peças e quantos m² estão escolhidos. Dali saem três ações:

- **Material** — quanto bloco e tela a seleção precisa, por SKU, com
  uma coluna de *falta assentar* que desconta o que já foi apontado.
  É o número para subir material ao andar.
- **Apontar** — o mesmo percentual em todas. Cada parede recebe o
  **seu próprio** lançamento, com a **sua** área: nada vira um
  registro só, senão a medição por peça e a produtividade por equipe
  deixam de fechar.
- **Planejar** — responsável e prazo para todas. Campo em branco não
  apaga o que já existe.

A seleção vale só no mosaico e zera ao trocar de pavimento — apontar
em peça que não está na tela é pedido de engano.

---

## Rodar no computador (VS Code + Live Server)

Os arquivos de `assets/js` são *módulos*, e o navegador só carrega
módulos quando a página vem de um endereço `http://`. **Abrir o
`index.html` com dois cliques não funciona** — use o Live Server e
clique em **Go Live**.

Atenção: rodando local, o sistema usa **o mesmo banco da produção**
(o do `config.js`). Tudo o que for gravado aparece para a equipe.

---

## Aplicar migrações do banco

1. Supabase > **SQL Editor > New query**.
2. Copie o conteúdo inteiro do arquivo `.sql` e cole.
3. **Run**. Deve aparecer *Success. No rows returned*.
4. Rode na ordem dos números e uma vez só cada arquivo.
5. Só depois publique a versão do site que usa a migração.

Depois da `001`, cadastre em **Authentication > Users** quem vai
apontar. Sem usuário ninguém entra, e sem entrar ninguém grava.

---

## Publicar

O GitHub Pages publica a branch `main`:

```bash
git push origin main
```

---

## Paleta

A identidade segue a construtora **Rio Ave**, em tema escuro porque
quem aponta usa o celular no andar, muitas vezes contra a luz:

| Token | Cor |
|---|---|
| darkest blue | `#101b30` |
| dark blue | `#1a253c` |
| medium blue | `#005e71` |
| light blue | `#5daaab` |
| light gray | `#e8eaed` |

A prancha de 1ª fiada é preta sobre branco; o site a mostra invertida
por padrão, para não virar uma lâmina de luz no meio do painel. O
botão **Invertida**, na barra da planta, volta ao desenho original.
