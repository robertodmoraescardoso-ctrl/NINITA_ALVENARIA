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
