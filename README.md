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

### A maior divergência: PR001, PR002 e PR003 do térreo

As três maiores diferenças da obra são as mesmas três paredes, idênticas
entre si — o nicho da prumada hidráulica do térreo:

| | comprimento | altura | vão | m² |
|---|---|---|---|---|
| Planilha | 2,58 m | **1,77 m** | 1,16 | 3,40 |
| Projeto (blocos) | 2,58 m | 2,74 a 3,19 m | — | **7,07** |

A diferença é de 3,67 m² por parede, 108%, 11,0 m² no térreo — **metade
de toda a divergência daquele pavimento**.

O erro está na altura da planilha, não no projeto:

- **1,77 m é a única altura abaixo de 1,94 m em todo o térreo.** As
  outras 108 paredes do andar usam de 2,35 m a 2,84 m, a maioria 2,38 m.
- A planilha dá 7,07 m² ÷ 2,58 m = **2,74 m** de parede cheia (3,19 m se
  o vão de 1,16 m² realmente existir). Qualquer um dos dois é coerente
  com um pé-direito de térreo mais alto que o do tipo.
- **A mesma parede no pavimento tipo fecha.** Lá a planilha usa 2,38 m
  com janela de 1,50 m² → 4,64 m², e o projeto traz 4,66 m². A conta da
  planilha está certa; só a altura do térreo ficou errada.

Para conferir, a elevação é a prancha `POCO_ALV_PE_007_TE-PR001` no
ConstruCode. Enquanto não for corrigida, o metro linear da planilha
continua válido (2,58 m) — o que não serve é o m² dessas três peças.

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

## Produtividade por equipe

Na aba **Equipes**, a produção é apurada num período que você escolhe
(campos *De* e *Até*, mais atalhos de 7, 30 e 90 dias ou *Tudo*).

O cálculo tem uma sutileza que vale entender: cada apontamento guarda
o percentual **acumulado** da parede naquela data, não o que foi feito
no dia. Somar `area_m2` direto contaria a mesma parede duas vezes — uma
peça apontada em 50% e depois em 100% viraria uma vez e meia. Então o
que entra na conta é o **avanço** sobre o lançamento anterior da mesma
peça, creditado a quem assinou o lançamento mais novo.

`m²/dia` é a RUP aproximada: m² do período ÷ dias distintos com
lançamento. Serve para comparar equipes e projetar prazo, não como
medição de folha.

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
