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
    alvenaria-catalogo.json   as 1.272 paredes, com área e blocos
    alvenaria-plantas.json    as 699 marcações clicáveis das plantas
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
| Semienterrado | 84 | 0 |
| Térreo | 166 | 119 |
| Tipo (cada) | 138 | 104 |
| Academia | 5 | 0 |
| Cobertura | 189 | 123 (falta a PR039) |

Os shafts não constam dela. Onde não há comprimento, a marcação só
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
