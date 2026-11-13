# Decisões

## Fase 0: ferramentas

- **Vitest** para testes: combina com as funções puras de R1–R4 e D1–D3 e roda TypeScript sem configuração extra.
- **ESLint 9 (flat config)** com `typescript-eslint` e `eslint-plugin-astro` para lint.
- **Prettier** com `prettier-plugin-astro` para formatação.
- `@astrojs/check` e `typescript` para checagem de tipos (`npm run check`).

## Fase 1 / sessão 1: busca dos PDFs

- **cheerio** (dependência nova) para achar os links pelo rótulo. O HTML do gov.br é irregular e uma regex seria frágil.
- **@types/node** (devDependency) para tipar `node:fs` nos testes e no script de fixtures.
- **`fetch` nativo** do Node, sem biblioteca de rede. Timeout de 20 s por requisição, 1 nova tentativa (só para erro de rede, timeout e HTTP 5xx), 1 s de espera. HTTP 4xx não repete.
- **Nunca lança:** o módulo devolve resultado por região (`ok` / `reason`). Uma região falhar não impede a outra. Quem chama decide (D4).
- **Rótulo ambíguo** (mesmo rótulo apontando para endereços diferentes) é erro, não escolha. Rótulo repetido com o mesmo endereço é aceito.
- **Validação do download:** o arquivo precisa começar com `%PDF-`. Não confiamos só no `content-type`.
- **User-Agent** identifica o projeto como independente, sem dados pessoais.
- **Fixtures** salvas com `npm run fixtures:save` (acessa o site; uso manual e raro): `salvador.pdf`, `baia-de-todos-os-santos.pdf`, `qualidade-das-praias.html`, `robots.txt`. Boletim de 06/11/2026.
- **Termos de uso: continua pendente.** Nenhuma conclusão sobre permissão foi tirada do robots.txt nem do rodapé.

## Fase 1 / sessão 2: leitura e validação dos boletins

- **unpdf** (dependência nova) para extrair o texto dos PDFs. Roda em Node puro, então funciona no GitHub Actions sem instalar nada no sistema (o `pdftotext` existe só nesta máquina).
- **Leitura** em funções puras (`parseBulletinText`, `validateBulletin`, `readBulletin`); só a extração do PDF e a gravação fazem I/O. Qualquer texto que não encaixe vira erro, nunca um palpite. Nomes e descrições ficam exatamente como no boletim (ex.: "Stella Mares" não é corrigido).
- **Quebras do PDF:** em Salvador a categoria vem partida em linhas ("Imp / róp / ria") e algumas descrições ocupam 2 linhas. O parser cola essas quebras. Na Baía a categoria vem inteira.
- **Validação (D4):** cabeçalho completo, data real e não futura, região, categoria (Própria | Imprópria), código no formato `AAA XX 000` com prefixo da região, sem códigos repetidos, nome da praia plausível, texto sobrando depois do último ponto, fim da seção Observações identificado e **10 a 80 pontos** (`MIN_POINTS`/`MAX_POINTS`). Se algo falhar, nada é gravado.
- **Região por aliases:** o texto de "Costa:" é comparado (sem caixa, acento ou pontuação) com uma lista de aliases conhecidos por região, em `REGIONS` (`src/lib/inema/bulletin.ts`). Salvador: "Litoral de Salvador", "Salvador", "Baía de Todos os Santos - Litoral Salvador". Baía de Todos os Santos: "Baía de Todos os Santos", "Baía de Todos-os-Santos". Texto desconhecido é erro.
- **Gravação:** `data/bulletins/AAAA-NN-regiao.json` (ex.: `2026-37-salvador.json`), esquema versionado (`schemaVersion: 1`). Gravação atômica. Conteúdo igual = "unchanged". Mesmo nº/ano com conteúdo diferente = "conflict": **não sobrescreve** e pede decisão humana.
- **Observações verbatim:** a seção "Observações" é guardada em `observations` (lista de linhas, como extraídas, sem o cabeçalho de página repetido "CAMPANHA …"). Nada é exibido ainda. O boletim 37/2026 de Salvador traz um aviso sobre São Tomé de Paripe (área sob investigação ambiental, evitar contato com a água). Como mostrar isso é decisão de produto pendente.
- **Baía gravada por inteiro (29 pontos), sem filtro.** Nesta edição nenhum ponto da Baía é de Salvador (Madre de Deus, Salinas, Itaparica, Vera Cruz etc.) e o PDF não traz município. **O escopo de exibição é só o litoral de Salvador** (PDF "SALVADOR"); a Baía é lida e arquivada, mas não exibida. O CLAUDE.md foi ajustado. Se uma edição futura da Baía trouxer pontos de Salvador, será preciso um critério (por exemplo, lista de códigos), a decidir.
- **Correção de contagem:** a sessão anterior falou em 28 pontos na Baía. São **29**; o `grep` perdeu `BTS CÇ 100` por causa da cedilha. Salvador tem 38 (30 Impróprias, 8 Próprias); a Baía, 29 (14 Impróprias, 15 Próprias).

### Estabilidade do código do ponto: parcialmente verificada

Comparação dos dois PDFs (boletim 37/2026, 06/11/2026), 67 pontos no total:

- **Confirmado:** todos os 67 códigos são únicos, dentro de cada PDF e entre os dois. Seguem o padrão `SSA|BTS` + 2 letras (aceita `Ç`) + número de 3 dígitos. O prefixo separa as regiões (SSA em Salvador, BTS na Baía), sem sobreposição.
- **Padrão observado:** a mesma praia com vários pontos usa o mesmo par de letras e numeração 100, 200, 300 (Farol da Barra `FB 100/200`, Madre de Deus `MD 100/200/300`). **O par de letras não identifica a praia sozinho:** `SSA CO 100` é Corsário e `SSA CO 200` é Patamares; `SSA RV 300` é Buracão, mas `RV 100/200` são Rio Vermelho. Portanto, o código identifica o **ponto**, e o nome da praia deve vir sempre do campo `beach`, nunca do código.
- **Não confirmado:** que o mesmo código continue apontando para o mesmo local de uma semana para outra. Só existe uma edição em mãos (o site mostra apenas a mais recente) e os dois PDFs são da mesma edição. Isso só se verifica quando houver um segundo boletim lido.
- **A fazer na leitura automática:** ao gravar um boletim novo, comparar com o anterior da mesma região e avisar quando um código mudar de praia ou de local, ou quando códigos sumirem ou surgirem. Até lá, tratar o código como identificador provisório.

## Fase 1 / sessão 3: regras de negócio (R1–R4, D1–D3)

Funções puras em `src/lib/rules/` (`evaluateBeaches`, `summarize`, `worstStatus`, `currentBulletin`), sem I/O e sem relógio (D5 sai disso: só a chegada de um boletim novo muda o resultado). Testes em `rules.test.ts`, uma ou mais por linha da tabela de estados.

- **Identidade.** Ponto = nome da praia normalizado + `code`. Praia = nome (`beach`) normalizado (sem caixa, acento nem espaços repetidos). Não agrupamos por código: o par de letras não identifica a praia (`SSA CO 100` Corsário, `SSA CO 200` Patamares). O nome exibido é o do último boletim em que a praia apareceu, com a grafia original.
- **Renomeação: nunca inferida** (princípio 1; a estabilidade do código ainda não foi confirmada). Nome novo = praia nova; o nome antigo some do boletim atual e segue R3 e depois R4(b). Renomeações conhecidas entram numa tabela manual, aprovada por pessoa (`aliases`: nome antigo -> nome atual, aplicada uma vez, sem encadear). O arquivo `data/beach-aliases.json` ainda não existe; as funções já recebem a tabela como parâmetro.
- **Contagem de N (D3).** Conta os boletins arquivados que saíram depois da última aparição com resultado. Semana não lida não conta. Mais de N (`>`) vira "Sem resultado"; exatamente N ainda é desatualizada. `STALE_BULLETINS_LIMIT = 3` em `config.ts`, sobrescrevível por chamada (`staleLimit`).
- **Estado por ponto, praia agrega.** A praia é `current` se algum ponto está no boletim atual; senão `stale`, `too-old` ou `never`. "Última aparição" ignora aparições sem informação (`category: null`).
- **D1.** `worstStatus` considera os pontos que mostram status (atuais e desatualizados): Imprópria > Própria > Sem resultado. Pontos antigos demais ficam de fora.
- **D2.** `summarize` conta pontos conhecidos; antigos demais contam como "Sem resultado"; praia sem pontos não conta.
- **`category: null`** existe só no tipo de domínio, para a linha "no boletim atual, sem informação". O parser atual só aceita Própria | Imprópria, então essa linha não ocorre com dados reais.

### Pendências de produto

- **Faixa com pontos parcialmente desatualizados.** Quando só alguns pontos de uma praia saem do boletim, o motor devolve `kind: 'current'` e `stalePoints > 0`. Como exibir a faixa "Boletim desatualizado" (na praia, só no ponto, ou nos dois) e qual data mostrar ainda precisa de decisão de produto/design.
- **Origem do catálogo de praias** (necessário para "nunca apareceu", R4a). As funções recebem `catalog` como parâmetro, mas a lista (nome e bairro) ainda não existe. A decidir na fase do mapa, junto com as posições aproximadas.
- **Próxima sessão: alerta de provável renomeação.** Na ingestão, avisar quando um nome de praia some e outro surge no mesmo boletim (por exemplo, com o mesmo código), para uma pessoa decidir se entra em `beach-aliases`. Junta-se ao aviso de mudança de código já previsto acima.

## Fase 1 / sessão 4: ingestão agendada

Workflow `.github/workflows/ingest-bulletins.yml` (diário, `0 9 * * *` UTC = 06h em Salvador, e manual) roda `npm run bulletins:ingest` (`scripts/ingest-bulletins.ts`, lógica em `src/lib/inema/ingest-run.ts`).

- **D4 por região, sem tudo-ou-nada.** Cada região é lida, validada e gravada de forma independente (a Baía é só arquivo; falha nela não bloqueia Salvador). O que falhar não é gravado. As regiões válidas são commitadas e o workflow termina com falha (`::error::`) se qualquer região ou a página falhou.
- **Idempotência.** Mesmo nº/ano/região já gravado e igual = nada a fazer. Só o `sourceUrl` diferente (o Inema pode renomear o arquivo) também conta como igual e o JSON antigo é mantido. Qualquer outro conteúdo diferente = erro, e o arquivo nunca é sobrescrito (decisão humana).
- **Commit.** Um commit por arquivo novo de `data/bulletins/`: `data: boletim nº X/ANO <região>`, push direto na `main`. Isso pressupõe que a `main` não tem proteção que bloqueie o `GITHUB_TOKEN`.
- **Commits feitos com `GITHUB_TOKEN` não disparam outros workflows** (regra do GitHub, para evitar laços). Portanto, o push do commit de dados **não** dispara o build/deploy do site. **Relevante para a Fase 5:** o workflow de deploy precisa ser chamado de outra forma, por exemplo `workflow_call`/`workflow_dispatch` encadeado ao final deste mesmo workflow, ou deploy no próprio job, ou um PAT/GitHub App para o push.
- **Fim de linha.** `.gitattributes` com `* text=auto eol=lf` e `endOfLine: "lf"` explícito no Prettier, para os JSON gravados no Linux do CI serem idênticos aos do Windows.

## Fase 2 / sessão 1: tokens do Figma

- **Origem.** Arquivo Figma `l6SlSnIIqQOXbsQdOVliPN`, nó `14:3001`. Uma única chamada `get_variable_defs` (70 entradas) foi usada só para conferência: devolve valores já resolvidos, sem aliases, e só o que o nó usa. O `tokens/tokens.json` gravado é o export completo das variáveis (formato DTCG, com aliases `{grupo.nome}`) fornecido por Caio, e bate com a chamada. **A partir daqui a fonte é `tokens/tokens.json`; o Figma não é mais consultado para tokens.**
- **Grupos.** `primitives` (cores neutral, brand, red, green, amber e variantes alpha; fontes, pesos, tamanhos, line-height, letter-spacing; espaçamento), `s-color` (surface, border, content, shadow), `s-typo` (heading, body, label, caption) e `space` (inset, gap, stack, inline).
- **Geração.** `npm run tokens:build` roda `scripts/build-tokens.ts` (função pura em `src/lib/tokens/to-css.ts`, com teste) e escreve `src/styles/tokens.css`. Nome da variável = caminho com hífens (`--s-color-surface-default`). Aliases viram `var(--...)`; o erro é explícito se um alias não tiver destino. O CSS é commitado e está no `.prettierignore`; nunca editar à mão.
- **Conversões de literais.** Tamanho e espaçamento em `px`; line-height sem unidade; peso pelo número da chave (`weight.600` -> `600`); família com espaço inicial aparado e fallback `system-ui, sans-serif`.
- **Status.** Própria = `positive`, Imprópria = `negative`, Sem resultado = `unknown`, Boletim desatualizado = `warning`. É uma leitura dos nomes; confirmar no design ao montar os componentes.

### Pendências

- **Unidade do `letter-spacing`: resolvido (2026-11-11).** Confirmado em porcentagem: `-1` = -1% = `-0.01em`, como o gerador já converte.
- **`heading/large` no retorno do MCP** apontava para o peso de `heading/medium`. No export os dois são `600`; sem efeito.
- **Pesos:** o `$value` é o nome (`semibold`); o número vem da chave. Se um peso novo surgir, as duas partes precisam bater.
- **Ausentes no Figma:** raio de borda, espessura de borda, sombras como valor (só há cores `shadow`), breakpoints, z-index, modo escuro. Se as telas precisarem, adicionar ao Figma e reexportar.
- `primitives.font.size.28/32/56` e `spacing.20` existem mas nenhum token semântico os usa ainda.

## Fase 2 / sessão 2: StatusChip

- **Valores assumidos (a remover quando existirem no Figma).** `radius.full = 999px` e `border-width.default = 1px` ficam em `tokens/extra.json`, que `npm run tokens:build` junta ao `tokens.json` (erro se uma chave se repetir). Arquivo separado para um novo export do Figma não apagá-los. O Figma usa esses valores soltos no chip (`37:626`); não são variáveis lá.
- **StatusChip sem símbolo, por decisão do design.** Segue o nó `37:626`: cor + texto (o princípio 3 do `CLAUDE.md` foi ajustado: elementos sem texto, como os marcadores do mapa, usam também símbolo). Os ícones (check, minus, "!", "?") ficam para os marcadores do mapa; não há `Icon.astro` nem SVGs no repositório por enquanto.
- **Estilo do chip.** Altura 24px, padding `inset/2xs` x `inset/xs`, pílula, borda 1px; "Sem resultado" tracejado, fundo `unknown/soft`, borda `border/strong`, texto `content/secondary` (como no Figma). Tipografia `label/medium`.
- **Página de componentes só em dev.** `src/dev/components.astro` é registrada por uma integração em `astro.config.mjs` (`injectRoute` só quando o comando é `dev`): fica em `/dev/components` no `npm run dev` e não entra no `npm run build` (verificado: `dist/` não tem `dev/`). Fica fora de `src/pages` de propósito, e por isso difere do caminho citado no pedido original.

## Fonte Switzer (self-host)

- **Licença (2026-11-11).** Caio leu a ITF Free Font License (https://www.fontshare.com/licenses/itf-ffl) e confirmou uso comercial e uso em site.
- **Atribuição: decidido não incluir.** O metadado da própria fonte (campo de licença, versão 1.200) diz: "You agree to identify the ITF fonts by name and credit the ITF's ownership of the trademarks and copyrights in any design or production credits." Foi avisado em 2026-11-11 e Caio decidiu seguir sem linha de crédito no site. Risco registrado: a cláusula fala de "design or production credits"; se o site passar a ter página de créditos, ou a licença for relida de outra forma, incluir "Tipografia: Switzer, © Indian Type Foundry" (copy em `docs/copy.md`).
- **Arquivos.** `public/fonts/`: `Switzer-Regular.otf` (400), `Switzer-Medium.otf` (500), `Switzer-Semibold.otf` (600), só os pesos que o `tokens.json` referencia. Os outros 15 (Thin, Light, Bold, Black, itálicos etc.) foram removidos, pois tudo em `public/` iria para o site.
- **Formato: `.otf` (CFF) direto, sem converter para woff2.** Cada arquivo tem 35–48 KB. Verificado: versão 1.200, pesos internos 400/500/600, cobertura dos caracteres do português (acentos, ç, aspas e travessões, reticências, º, ª). Otimização futura possível: converter para woff2 (exigiria ferramenta nova, a registrar aqui).
- **`@font-face`** em `src/styles/fonts.css`, `font-display: swap`, família `Switzer`; o fallback `system-ui, sans-serif` vem de `tokens.css`. Por ora é importado só na página de dev; quando existir um layout base, importar lá.

## Padronização de nomenclatura (inglês)

- **Auditoria.** O código já estava quase todo em inglês. Em português estavam: o arquivo `StatusChip.astro` (PascalCase), os valores do status do chip (`propria`, `impropria`, `desatualizado`, `sem-resultado`) e o enum `Status` das regras (`'Própria' | 'Imprópria' | 'Sem resultado'`) com seus usos em `evaluate.ts` e nos testes.
- **Convenção.** Código em inglês, arquivos em kebab-case, textos da interface em português (regra no `CLAUDE.md`). Status: `suitable | unsuitable | no-result` (`Status`) e `ChipStatus = Status | 'outdated'`. `outdated` é só visual: uma praia desatualizada mantém `suitable` ou `unsuitable` e ganha a faixa.
- **Conversão em um único lugar.** `src/lib/rules/status.ts`: `categoryToStatus` (valor do boletim -> enum) e `STATUS_LABELS` (rótulos pt-BR).
- **Ficou em português, de propósito.** `Category = 'Própria' | 'Imprópria'` (dado do boletim, gravado em `data/bulletins/`, validado no parser); ids de região (`salvador`, `baia-de-todos-os-santos`, nomes próprios que também estão em `data/`); rótulos e aliases do site do Inema; mensagens de erro; comentários e descrições de testes.
- **Componentes planejados:** `OutdatedBanner`, `NoResultBanner`, `PointCard` (arquivos em kebab-case). Ainda não criados.

## Fase 2 / sessão 3: faixas e PointCard

- **Faixas** (`outdated-banner.astro`, `no-result-banner.astro`): nós `132:8746` e `125:3786`. Fundo `surface/warning/soft` e `surface/unknown/soft`, borda inferior tracejada 1px (`border/warning` e `border/strong`), padding `inset/xs`, texto `caption/small` centralizado (cores `content/warning` e `content/secondary`). O texto pode quebrar em telas estreitas (o Figma usa linha única).
- **Texto da faixa Sem resultado:** vale o do Figma ("Sem resultado. A praia não consta no boletim ou a análise é antiga."), por decisão de Caio em 2026-11-11, em vez da frase proposta no pedido. Registrado em `docs/copy.md`.
- **PointCard** (`point-card.astro`, nó `125:3704`): borda lateral de 4px, borda 1px `border/default` nos outros três lados, padding `inset/md`, gap `stack/xs`, nome em `body/large`, descrição em `body/medium` (`content/secondary`), sem raio. Usa o StatusChip.
- **Valores assumidos (a remover quando existirem no Figma):** `border-width.accent = 4px` em `tokens/extra.json`; cores da borda lateral dos estados `suitable`, `unsuitable` e `outdated` (`border/positive`, `border/negative`, `border/warning`), pois o nó só mostra `no-result` (`border/unknown`); nome do ponto em Semibold 600 e cor `content/primary`, pois o Figma usa Switzer Bold com cor fixa #343e45 (sem variável nem peso 700 nos tokens).

## Fase 2 / sessão 4: Button, ButtonIcon, InputText, Icon

- **Nós:** Button `123:2668`, ButtonIcon `117:4609`, InputText `117:5370`. Só tokens, nenhum valor novo. Alturas (56, 48 e 40) e anel de foco derivados com `calc()` dos tokens (`2 x inset + 24`; anel de 1px a 4px da borda), pois não há token de tamanho.
- **Ícones:** os nós usam só dois glifos, busca (20 e 24 px) e info (24 px); as cores por estado viraram `currentColor`. Salvos uma vez em `src/icons/` e embutidos inline por `icon.astro`. Fechar e compartilhar não aparecem nesses nós: não foram criados, e o campo de busca não tem botão de limpar (o Figma não mostra). Os botões do Figma usam a busca como ícone reservado; o ícone real de cada uso sai nas telas.
- **Foco:** o anel (`border/focus`) aparece só por teclado (`:focus-visible`). Nos botões o clique do mouse não ativa o anel. No campo de texto o navegador trata todo foco como `:focus-visible`, inclusive por clique; por isso `input-text.astro` tem um script mínimo que marca `data-ring` só quando o foco chegou por Tab. No clique, o campo muda só as bordas (fundo e `border/accent`).
- **Estado "enabled" do Figma** (secondary e ghost: fundo `accent/subtle`, borda `border/accent`) virou `selected` + `aria-pressed`. Primary não tem esse estado.
- **Button secondary desabilitado** usa `surface/hover` como cor da borda, como no Figma.
- **InputText** ocupa 100% do contêiner (o Figma usa 428px fixos).
- **Vitrine:** a prop `state` (hover, focus, typing) existe só para mostrar os estados em `/dev/components`.

## Fase 2 / sessão 5: cabeçalho e painel da ficha

- **Regra de trabalho (2026-11-11):** o Figma é estático; telas são exemplos de preenchimento e não definem o componente. Variações e estados saem da lógica (regras, tabela de estados, concept). Só se pergunta por asset faltando ou valor visual sem token e sem equivalente. Regra no `CLAUDE.md`.
- **Nó do cabeçalho:** `126:4735` (tela Início / Desktop, `115:4277`): 56px, `surface/default`, borda inferior 1px, três ButtonIcon de 56px separados por divisores 1px. Ordem: compartilhar, informações (ghost), busca (filled/accent). Rótulos acessíveis: "Compartilhar o site", "Fonte e como ler" (link para `/fonte`), "Buscar praia". Mobile usa o mesmo cabeçalho (sem frame mobile no Figma).
- **Logo (decisão 3):** `src/assets/logo.svg` (115x24) com símbolo e o nome PRAIEROS em contorno, enviado por Caio (o Figma só expunha o símbolo; o texto estava vivo em Khand). Não depende de fonte. O `alt` da imagem é "Praieros, página inicial".
- **Khand (decisão 4):** não hospedada.
- **Cor #0a2461 (decisão 5):** fica dentro do SVG do logo, sem token.
- **Ícones novos** (conjunto `30:99`): compartilhar (`126:5439`), fechar (`42:1104`), link externo (`46:2856`). `share-24` veio do botão do cabeçalho; `share-20`, `close-20`, `external-20` do conjunto, com cor em `currentColor`. `close-24` foi derivado de `close-20` (coordenadas x1,2; traço 2), como search/info 24 se relacionam com os de 20. Não existe `external-24` (usado só em 20px).
- **BeachPanel (genérico):** recebe nome, bairro, boletim, pontos, `notice`, `note` e `layout` por props; não lê dados nem aplica regras. A tela da ficha do Figma não foi consultada (o link do pedido veio sem URL); estrutura derivada do escopo e da tabela de estados.
- **Estados por props:** própria/imprópria: pontos com seus status, sem faixa. Desatualizada: `notice="outdated"` + pontos com o último status; o boletim passado é o da última aparição. Sem resultado: `notice="no-result"`, sem cartões de ponto, e `note` com a frase da tabela.
- **Divergência a confirmar:** a tabela do CLAUDE.md diz "Faixa: Nenhuma" para sem resultado, mas o pedido da sessão pede a faixa cinza. Seguiu-se o pedido (faixa cinza). Se a faixa não deve aparecer, basta não passar `notice`.
- **Subtítulo sem pontos:** sem cartões não há contagem confiável, então mostra só o bairro. Com pontos: "bairro · N ponto(s) de coleta" (`pointsLabel`, testado).
- **Mobile (folha inferior):** mesmo conteúdo do desktop; muda a borda (topo em vez de esquerda). Sem raio nos cantos e sem alça de arrastar: não há token de raio além de `radius-full` nem especificação. A interação da folha (arrastar, altura) fica para a fase do mapa.
- **Chip do boletim:** pílula com borda `border/default`, texto `label/medium` em `content/secondary` (neutro, para não ser confundido com o chip de status). Links "Como ler e fonte" e "Boletim original": `content/accent`, sublinhados, `body/medium` Semibold; o segundo abre em nova aba com ícone de link externo. "Ver detalhes" é Button primário (link) e "Compartilhar praia" é secundário com ícone; ambos na vertical, largura total.
- **Dados fictícios** só em `src/dev/components.astro` (vitrine, 428px e 375px).

## Fase 3 / sessão 6: esqueleto da tela inicial

- **Layout:** nó `115:4277` (Início / Desktop): cabeçalho de 56px e mapa ocupando o resto da altura. O Figma não mostra o painel aberto; o conteúdo da tela (badges, botões do mapa) é só exemplo e não foi copiado.
- **Estrutura:** `base-layout.astro` (lang pt-BR, viewport, título, descrição, tokens e fontes, reset mínimo) e `index.astro` (`AppHeader` + mapa neutro `role="region"` "Mapa das praias" + `<aside>` da ficha). Altura `100dvh`. Mapa em `surface/strong` como bloco neutro.
- **Largura do painel:** o `beach-panel.astro` não definia largura (só 100%; os 428px estavam nos quadros da vitrine). Por decisão de Caio, 428px (a do cartão do Figma) viraram o token `size.panel-width` em `tokens/extra.json` (`--size-panel-width`). É a fonte única: `beach-panel` (desktop), `index.astro` e a vitrine usam a variável. A remover de `extra.json` se o Figma definir a largura do painel.
- **Breakpoint:** 1024px (decisão de Caio): acima, painel lateral à direita; abaixo, folha inferior. Com o painel de 428px, 768px deixaria pouco espaço para o mapa. Fica como literal na media query (CSS não aceita variável ali).
- **Painel oculto:** `<aside hidden>` sem conteúdo (some também para leitores de tela). Abrir, fechar e foco ficam para a sessão da ficha. Mobile: contêiner absoluto na base, largura total, `max-height` 100% do palco com rolagem; sem alça, raio, animação ou gesto (motion só depois da Fase 3).
- **Cabeçalho no mobile:** abaixo de 1024px o inset esquerdo do `AppHeader` é `inset/md` (16px), em vez de `inset/lg` (24px) do desktop (decisão de Caio).
- **Textos (título e descrição da página):** registrados em `docs/copy.md`.

## Fase 3 / sessão 7: catálogo e camada de dados

- **Catálogo** (`data/catalog/salvador.json`, `schemaVersion: 2`): por praia, `name` (igual ao boletim), `neighborhood`, `neighborhoodSource`, `neighborhoodVerified`, `proposalNote` e `points` (`code`, `lat`, `lng`, `source`, `verified`). Chave do ponto = código (identidade do ponto segue praia + código nas regras). Posição é por praia: o centro da praia vale para todos os pontos dela (aproximada; a UI avisa).
- **Proposta automática** (`npm run catalog:propose`): Nominatim (OpenStreetMap), consulta "<nome>, Salvador, Bahia" e, se não aceitar, "Praia de <nome>, Salvador, Bahia". Aceita só se houver **exatamente um** resultado `natural/beach` dentro da caixa de Salvador; senão descarta e deixa `null`, com o motivo em `proposalNote` e em `docs/catalog-todo.md` (não encontrada, não é praia, fora de Salvador, mais de uma candidata). Nunca escolhe entre candidatas. Bairro vem do mesmo resultado (`suburb`, `neighbourhood`, `city_district`, `quarter`); ausente = `null`. Tudo entra com `verified: false`; praias com algo `verified: true` não são tocadas. A decisão é função pura (`src/lib/catalog/propose.ts`); a rede fica só no script.
- **Política do Nominatim:** no máximo 1 requisição por segundo (intervalo de 1,1 s só entre chamadas de rede), User-Agent `praieros-catalog/0.1`, cache em `data/catalog/.cache/` (ignorado pelo Git; só o resultado aceito é versionado: coordenada, bairro e ID do OSM). Contato opcional: variável `CATALOG_CONTACT` no `.env` (ignorado pelo Git) vira `(contato: ...)` no User-Agent; sem ela, usa o genérico. O contato não é gravado em arquivo versionado.
- **Atribuição:** dados de posição e bairro propostos vêm do OpenStreetMap, © contribuidores do OpenStreetMap, licença ODbL (https://www.openstreetmap.org/copyright). Quando o mapa existir, a atribuição precisa aparecer na interface; ela é obrigatória também nos tiles, se forem do OSM.
- **`verified: false` nunca vai para produção.** `buildSiteModel` tem `includeUnverified` (padrão `false`). Sem ele, posição não verificada vira `null` (`onMap: false`) e bairro não verificado vira `null`. As páginas passam `includeUnverified: import.meta.env.DEV`. O **status do boletim não depende de `verified`**: só posição e bairro.
- **Validação** (`npm run catalog:validate`, `validateCatalog`): erro se faltar código do boletim atual no catálogo, código repetido, coordenada pela metade, fora de Salvador, ou `verified: true` sem coordenadas. Avisos: códigos que sobram (praia fora do boletim atual é legítima, R3), pontos sem coordenada (fora do mapa) e pontos não verificados.
- **Camada de dados** (`src/lib/site/build-beach-models.ts`, pura): reutiliza `evaluateBeaches` e `summarize`. Faixa: `outdated` só para praia desatualizada (R3); `too-old` e `never` não têm faixa (`lastAnalysisDate` e `notInCurrentBulletin` dão o texto). Slug = nome normalizado com hífens (`beachSlug`); unicidade testada com os dados reais. I/O só em `load-data.ts`.
- **Resumo (D2):** conta os pontos que já constaram em algum boletim. Ponto do catálogo que nunca constou não entra na contagem (o boletim não o menciona). A rever se o resumo do desktop pedir outra coisa.
- **Catálogo de praias e bairro:** a ordem dos pontos é por código. `neighborhood` das praias descartadas segue `null` até alguém preencher.

## Fase 3 / sessão 7b: segunda rodada de propostas

- **Esquema v3:** `source` ganha `method` (`name` | `overpass` | `description`) e `confidence` (`high` | `medium` | `low`). Tudo continua `verified: false`; nenhum script grava `verified: true`.
- **Etapas, na ordem, parando na primeira que aceitar** (`resolveBeach`, em `src/lib/catalog/propose.ts`; a rede é injetada, então a decisão é testável): (1) Nominatim com variações do nome ("X", "Praia do/da/de X", nome sem "Praia"), sempre "…, Salvador, Bahia"; (2) lista única do Overpass; (3) descrição do local, só se 1 e 2 falharem, ponto a ponto.
- **Regra mantida e reforçada: exatamente um candidato coerente.** "Coerente" agora também exige nome compatível: o nome do boletim precisa estar contido no nome do OSM como palavras inteiras seguidas, ignorando caixa, acento, artigos e "Praia" (o contrário não vale: "Praia da Barra" não é o "Farol da Barra"). Isso vale já na etapa 1: a rodada anterior aceitava qualquer praia única achada pela busca. Com a regra, Roma e Rio Vermelho (antes aceitas) foram descartadas porque o OSM devolveu praias de outro nome. Ficou de fora também "Farol de Itapuã" (o OSM devolvia "Praia de Pedra do Sal").
- **Overpass inclui lagoas e marina:** a consulta lista `natural=beach`, `natural=water` (lagoas) e `leisure=marina` com nome na caixa de Salvador, **porque o boletim lista lagoas (Lagoa de Pituaçu, Lagoa de Abaeté) e uma marina (Marina Contorno)**, que não são praias no OSM. Consulta única, em cache. Bairro vem de um `reverse` do Nominatim no ponto aceito (`null` se não vier). Confiança média.
- **Descrição do local (etapa 3):** usa o trecho antes da primeira vírgula, sem a abertura ("Em frente à…"). Só vale se citar um nome próprio (palavra com maiúscula depois da primeira) e se o nome do resultado contiver o trecho citado; senão descarta. Isso barrou "quadra de esportes" (genérica) e "Jazz na Avenida" (nome diferente), que a primeira versão aceitou por acaso. Confiança baixa, `verified: false`, marcada no todo como "baixa confiança". Nesta rodada nenhuma posição saiu por essa etapa.
- **Reprocessamento:** o script só toca pontos sem posição e nunca entradas verificadas. Nesta rodada as propostas anteriores (todas não verificadas) foram zeradas e refeitas com o critério novo.
- **Overpass ocupado:** o servidor público respondeu 502 em tentativas seguidas; o script repete até 2 vezes com pausa de 30 s, e o resultado fica em cache. Os 15–17 `proposalNote` do catálogo trazem o motivo de cada etapa.
- **Atribuição OSM** segue como na sessão 7.

## Fase 3 / sessão 8a: mapa, marcadores e painel

- **Provedor de tiles: OpenFreeMap** (instância pública, estilo Positron, `https://tiles.openfreemap.org/styles/positron`). Gratuito, uso comercial permitido, sem chave de API, sem SLA. Atribuição ao OpenStreetMap e ao OpenMapTiles obrigatória: vem do estilo e aparece no controle de atribuição do MapLibre (canto inferior esquerdo, para não colidir com o zoom). **Pendência: ler os Termos de Serviço do OpenFreeMap antes de publicar.**
- **Dependência nova: `maplibre-gl`** (v6). Ajustes: `optimizeDeps.exclude` no `astro.config.mjs` (o pré-empacotamento do Vite quebra o caminho do worker no dev) e importação explícita do worker (`?worker&url`) em `controller.ts` (sem isso o worker não é emitido no build e o mapa fica indisponível em produção). Testado em dev e em `astro preview`.
- **Cores do mapa:** `applyPalette` troca só o preenchimento das camadas `background`, `landuse_residential`, `building` (terreno: `surface/strong`), `park` e `landcover_wood` (parques: `surface/positive/subtle`) e `water` (mar: `surface/accent/subtle`). Os valores são lidos dos tokens em tempo de execução. O restante do estilo (ruas, rótulos) fica como no Positron.
- **Visão inicial:** `fitBounds` dos pontos disponíveis, sem animação (`animate: false`, `duration: 0` no zoom). Sem pontos (produção, enquanto nenhum for verificado): centro de Salvador `-38.4813, -12.9714`, zoom 11 (valores assumidos).
- **Verificação:** a página usa `buildSiteModel` com `includeUnverified: import.meta.env.DEV`. Em produção, enquanto nenhum ponto estiver verificado, o mapa abre vazio e nenhuma ficha é gerada (confirmado no `dist/index.html`: lista de marcadores `[]`).
- **Marcador (Figma 117:4522; símbolos do conjunto 30:99):** círculo de 24px com símbolo e, abaixo, a pílula com o nome da praia. Estados: `suitable` (check, verde), `unsuitable` (traço, vermelho), `outdated` (!, âmbar), `no-result` (?, cinza, pílula tracejada) e selecionado (pino azul, pílula azul). Derivações: `outdated` é o ponto de uma praia desatualizada (R3); praia antiga demais ou nunca vista mostra `no-result` (R4). O Figma não traz o selecionado com o símbolo do status; o status segue no `aria-label` e no `aria-pressed`. Rótulo acessível: "Praia, Ponto de coleta N, status" (desatualizado: "Boletim desatualizado, último resultado: X").
- **Pílula do marcador:** o Figma (117:4522, relido na sessão 8a-2) agora usa os tokens `inset/xs` (8px) e `inset/2xs` (4px), iguais ao que já estava no código.
- **Âncora do marcador:** círculo ancorado pelo centro; o pino selecionado, pela ponta (muda o deslocamento ao selecionar).
- **Todos os pontos mostram o nome da praia** na pílula, como no Figma. Praias com vários pontos repetem o nome. Se poluir o mapa, reavaliar.
- **Ficha (painel):** gerada no servidor para cada praia com marcador (versões desktop e mobile; o CSS mostra uma). `toPanelData` (`src/lib/site/panel-props.ts`) traduz o `BeachModel` sem regra nova. Pontos chamados "Ponto N" (ordem do catálogo, por código). Faixa: `outdated` para praia desatualizada; `no-result` para "nunca apareceu" e "antiga demais" (como nas variações da vitrine); praia no boletim atual sem informação mostra o chip "Sem resultado" e nenhuma faixa. Nesses dois casos a ficha não lista pontos (como na vitrine), e a nota segue a tabela do CLAUDE.md. Bairro ausente cai em "Salvador" (valor assumido). Link do PDF: o `sourceUrl` do boletim; se faltar, a página oficial do Inema.
- **Interação:** clique no marcador abre a ficha e leva o foco ao botão de fechar; fechar (botão ou Esc) esconde a ficha, limpa a seleção e devolve o foco ao marcador. Clicar no mapa vazio não fecha (só o botão, como pedido). Componente do mapa e página conversam por eventos (`marker-select`, `marker-set`).
- **Atribuição x folha inferior (mobile):** resolvida na sessão 8a-2 (atribuição no topo do mapa).
- **Estados do mapa:** carregando (pílula do Figma 117:4900) até o primeiro desenho do mapa; indisponível (Figma 117:5012) se o estilo não carregar ou se ocorrer erro de fonte/tile antes do primeiro desenho. "Tente novamente" refaz tudo. Erros de tile depois do primeiro desenho não derrubam o mapa. O ícone de carregando fica **parado**: a rotação é motion e só entra com o motion (docs/motion.md).
- **Zoom:** `ButtonIcon` outlined com `plus` e `minus` (Figma 117:4828, sem o terceiro botão, que é tela cheia: fora do escopo desta sessão). Rótulos acessíveis em `docs/copy.md`.
- **Possível incoerência no Figma (aviso, texto mantido):** o erro (117:4959) tem "Tente de novo" no corpo e "Tente novamente" no botão. O texto de carregando foi corrigido no Figma ("Carregando o mapa…").

## Fase 3 / sessão 8a-2: aparência do mapa e limite de navegação

- **Regra de tokens (CLAUDE.md):** valor visual sem token usa o token mais próximo (2px vira 4px; empate, o maior), com a premissa registrada aqui, sem parar. Só asset (SVG, imagem) faz parar para perguntar.
- **Estilo trocado para Bright** (OpenFreeMap): o Positron não tem camada de areia nem tantas quadras. A referência (`design/map-reference.png`, imagem enviada no chat) pede mar, terreno, quadras, ruas, parques e areia. O restante da sessão 8a (provedor, atribuição, termos pendentes) vale igual.
- **Cores, pelo token mais próximo da referência** (`src/lib/map/palette.ts` classifica as camadas pelo id): terreno `surface/strong` (neutral-100); quadras e construções `surface/emphasis` (neutral-200, um pouco mais escuro que o terreno); ruas `surface/default` (neutral-50, quase branco); mar, rios e lagoas `surface/accent/soft` (brand-200; a referência é um ciano mais claro e não há token ciano); parques, matas e gramados `surface/positive/soft` (green-200, mais saturado que o verde da referência); areia `surface/warning/subtle` (amber-100, o único bege disponível). Opacidades e padrões das camadas são removidos para a cor do token aparecer como está. Fronteiras, balsa e teleférico ficam ocultos.
- **Nenhum texto de base:** todas as camadas `symbol` (nomes de ruas, bairros, lugares, ícones) saem do estilo, e `glyphs` e `sprite` também. Só os rótulos dos marcadores aparecem.
- **Limite de navegação:** bounding box do limite administrativo de Salvador (OpenStreetMap, relação 362362), consultado **uma vez** no Overpass (`scripts/fetch-salvador-bounds.ts`, cache em `data/catalog/.cache/`) e fixado em `src/lib/map/salvador-bounds.ts`: oeste -38.6994346, sul -13.0173949, leste -38.3034141, norte -12.7335624 (inclui as ilhas da Baía de Todos-os-Santos). Folga de 0,02° (cerca de 2 km). `navigationBounds(pontos)` amplia a área se algum ponto ficar de fora; um teste confere todos os pontos do catálogo (hoje nenhum fica fora). Praias nas bordas podem ficar parcialmente cortadas, como esperado.
- **`maxBounds` e zoom mínimo:** o mapa usa essa área como `maxBounds`. O `minZoom` é o zoom em que a área inteira cabe na tela, recalculado a cada redimensionamento (inclui a ficha abrindo no desktop, que estreita o mapa) por um `ResizeObserver`. **Desvio do pedido:** o cálculo é uma função pura em Web Mercator (`minZoomToFit`, testada), em vez de `cameraForBounds`, que depende da instância do mapa e não dá para testar sem navegador. O resultado é o mesmo zoom de encaixe.
- **Atribuição no mobile:** abaixo de 1024px o controle de atribuição fica no topo do mapa (a folha da ficha cobre a base). No desktop continua no canto inferior esquerdo. Substitui a pendência da sessão 8a sobre a atribuição coberta pela folha.
- **Textos do Figma relidos** (117:4816, 117:4959): "Carregando o mapa…" (corrigido no Figma). O erro seguiu igual ("Tente de novo…" no corpo e "Tente novamente" no botão, mantidos). Pílula do marcador (117:4522) agora com tokens (8px e 4px), iguais ao que já estava.

- **Fundo do mapa (sessão 8a-2):** a área do mapa tem a cor do mar (`surface/accent/soft`) desde o primeiro quadro, e o canvas do MapLibre fica invisível (`opacity: 0`, sem transição) até o primeiro desenho, para não aparecer o cinza do terreno antes dos tiles. O estado de carregando (Figma 117:4900) não mudou; sem tempo limite nem shimmer.
- **Ajustar à tela (Figma 117:4831, terceiro botão da pilha):** `ButtonIcon` outlined com o ícone de cantos (`fit-screen-24.svg`), rótulo "Ajustar o mapa à tela". Reenquadra todos os pontos como na visão inicial (`fitBounds` com o mesmo padding, sem animação), respeitando o `maxBounds` de Salvador; sem pontos, volta ao centro de Salvador. Não é tela cheia. **Desvio no SVG:** o export do Figma tem um canto com preenchimento (`fill`) e outro com traço de 1,8 (os demais, 2); usei traço de 2 nos quatro cantos, sem preenchimento, porque o preenchimento desenharia um triângulo. **Conferir no Figma** se é um defeito do ícone.

- **Ajuste do limite (sessão 8a-2, desktop):** o limite administrativo inclui as ilhas e o lado do Recôncavo, o que deslocava a cidade para a direita e mostrava terreno que não é Salvador; o norte deixava o mapa subir demais. A área de navegação (`SALVADOR_URBAN_BOUNDS`) corta o oeste em -38.56 e o norte em -12.83 (mais a folga de 0,02°, que ainda inclui todos os pontos do catálogo). **Ilhas da Baía (Frades, Bom Jesus) ficam fora da navegação.**
- **`maxBounds` por formato de tela:** o MapLibre, com `maxBounds`, preenche a tela e corta a área no lado maior (numa tela larga, cortava norte e sul). `containBounds` amplia o limite para a proporção da tela, simétrico, e é recalculado ao redimensionar; assim o zoom mínimo mostra a área inteira e o mapa não sobe nem desce além dela. Em tela larga sobra faixa de mapa nos lados (inevitável sem cortar a cidade).

## Fase 3 / sessão 8b: revisão do catálogo (só em desenvolvimento)

- **Rota e endpoint só em dev.** `/dev/catalog-review` (`src/dev/catalog-review.astro`) e `/dev/api/catalog` (`src/dev/catalog-api.ts`) são registrados com `injectRoute` em `astro.config.mjs` dentro do `if (command === 'dev')`, como `/dev/components`. Nada entra no build (conferido: `dist/` não contém a página nem o endpoint). O endpoint só atualiza `data/catalog/salvador.json`; não faz commit.
- **`verified: true` só nasce da ação "Aprovar praia"** (`approveBeach`, `src/lib/catalog/review.ts`). Aprovação é por praia (pontos e bairro de uma vez), sem aprovação em massa. Exige posição em todos os pontos e **bairro preenchido**. Mover um ponto ou editar o bairro tira a aprovação (é preciso aprovar de novo).
- **Estado da praia:** sem posição (algum ponto sem coordenadas), proposto, verificado (todos os pontos e o bairro aprovados).
- **Schema v4.** `CatalogPoint.proposals` e `CatalogEntry.neighborhoodProposals` guardam as propostas automáticas substituídas por edição manual (só crescem). `source` pode ser `{ provider: 'manual', method: 'manual', editedAt }`. A leitura aceita v3 e migra (`migrateCatalog`); o arquivo vira v4 na primeira gravação. `data/catalog/salvador.json` segue em v3 até lá.
- **Servidor decide.** A página envia uma ação (`approve`, `move`, `neighborhood`); o servidor lê o arquivo, aplica, valida (`validateForWrite`: esquema, mesmas praias e códigos, coordenadas dentro de Salvador, `verified` coerente, histórico preservado) e grava de forma atômica (arquivo temporário + `rename`, uma gravação por vez).
- **Sugestão de bairro (consulta inversa).** Depois de posicionar ou mover um ponto, `GET /dev/api/catalog?lat=&lng=` consulta o Nominatim (`/reverse`, zoom 18), com cache em `data/catalog/.cache/` (fora do Git), no máximo 1 consulta por segundo e o mesmo User-Agent do script de propostas. A sugestão aparece com o botão "Usar"; nunca preenche o bairro sozinha. Salvar a sugestão sem mudar o texto grava `neighborhoodSource` com `method: 'reverse'` (confiança média); qualquer outro texto grava `manual` e guarda a proposta anterior.
- **Mapa próprio** (`src/dev/catalog-review/review-map.ts`): reaproveita o estilo, a paleta e as funções de bounds do mapa do site, mas sem `maxBounds`, sem estados de carregando/erro e com marcadores arrastáveis. Pin = cor + símbolo (✓ verificado, ? proposto) + número do ponto; só um pin por praia mostra o nome. Não é componente do produto, então não vai para `docs/components.md`.
- **Zoom ao selecionar** (instantâneo, sem animação de câmera): praia ou pin → enquadra todos os pontos da praia com margem de 64px e zoom máximo 17; um ponto único (ou pontos praticamente no mesmo lugar) → zoom 17, que mostra a faixa de areia e as ruas vizinhas. Subitem de ponto na lista → centraliza só nele (zoom 17), para facilitar o ajuste. Selecionar uma praia destaca todos os pontos; selecionar um ponto destaca só ele.
- **Arrasto mínimo de 3 px.** Um `dragend` espúrio (toque ou redimensionamento da janela) gravou um ponto durante os testes; arrastos menores que 3 px voltam o pin à posição gravada e não gravam.
- **Estilo da página** só com tokens (sem Figma: é ferramenta interna). Sem valor visual novo.

## Fase 3 / sessão 8c: posicionamento automático

- **Regra de produção (substitui "só `verified: true` aparece").** Em produção aparecem os pontos com `verified: true` **ou** posicionados automaticamente (`source.method = "auto-placed"`) que passaram em todas as verificações aplicáveis (`shownInProduction`, `src/lib/catalog/placement.ts`), tratados como **posição aproximada**. O que não passar fica fora do mapa. Em desenvolvimento (`includeUnverified`) aparece tudo que tem posição. Bairro continua exigindo `neighborhoodVerified`.
- **Fontes.** Só OpenStreetMap (Overpass e Nominatim). Nunca memória para coordenadas, nunca API do Google. Política de uso: 1 requisição por segundo, User-Agent identificável, cache em `data/catalog/.cache/` (fora do Git); o cache e o limite de taxa foram extraídos para `scripts/osm-client.ts`.
- **Verificações (`checks` em cada ponto; todas puras e obrigatórias).** (1) `inSalvador`: dentro do **polígono administrativo** (relação OSM 362362, a mesma do limite do mapa), não numa caixa; (2) `nearBeach`: a no máximo **80 m** da geometria da praia; (3) `minSpacing`: a pelo menos **40 m** dos outros pontos da mesma praia. Cada uma guarda `pass | fail | n/a` e a distância medida. `n/a` só vale para o espaçamento (praia de um ponto) e **nunca** para a geometria: sem geometria, o ponto não vai para produção. As verificações são refeitas no fim sobre as posições finais de todos os pontos da praia.
- **40 m de espaçamento mínimo (escolha minha).** Pontos de coleta da mesma praia costumam ficar a dezenas de metros um do outro; 40 m evita marcadores sobrepostos no zoom de praia e ainda cabe em praias curtas. Constante `MIN_SPACING_M`. Se a geometria não comporta o espaçamento, os pontos que não cabem ficam sem posição, com o motivo.
- **Geometria.** Uma consulta Overpass (`out geom`, praias, lagoas e marinas com nome em Salvador, como na proposta); os elementos cujo nome combina com o do boletim (`namesMatch`) formam a geometria da praia. Distância medida ponto a segmento (aproximação plana, suficiente na escala de uma praia); dentro de contorno fechado vale 0.
- **Como cada ponto é posicionado.** (a) Pista da descrição do local (rua, estabelecimento) no Nominatim **limitado a Salvador** (`bounded=1`); aceita o primeiro resultado que passa nas três verificações (`basis: description`, confiança média). (b) Sem pista aceitável: distribui ao longo da "linha central" da praia (linha aberta mais longa, ou o arco entre os dois vértices mais distantes de um contorno fechado), em partes iguais, na ordem dos códigos, com grade de reserva a cada 10 m quando a posição ideal está ocupada (`basis: spread`, confiança baixa). (c) **Sem geometria no OSM:** só a descrição, com o critério de nome do Nominatim já usado nas propostas (`basis: description-only`, baixa confiança). A verificação de geometria fica `n/a`, então esses pontos **não vão para produção**: aparecem só na visão geral, aguardando aprovação.
- **Nunca altera** pontos com `verified: true` nem `manual` (os planos pulam e a validação de gravação, no modo `auto`, recusa qualquer mudança neles). Pontos não aprovados são reprocessados: a proposta OSM anterior vai para `proposals`; o resultado automático anterior é simplesmente substituído.
- **Pontos que não passam** ficam sem posição (`lat/lng` nulos), com `placementNote` e vão para `docs/catalog-todo.md` com o motivo. Isso inclui as posições de proposta OSM antigas (centro da praia, iguais para todos os pontos): ficam só em `proposals`.
- **Esquema.** Continua v4: `checks` e `placementNote` são campos opcionais do ponto; `proposals` passa a aceitar também fontes `auto`. `validateForWrite` ganhou o modo `auto` (script) além do `review` (página de revisão, que continua exigindo `manual` ao mover).
- **Reinício do catálogo.** `data/catalog/salvador.json` foi restaurado ao último commit (1 ponto movido por engano na revisão; nenhum `manual` nem `verified` no arquivo) e a migração para v4 foi refeita pelo script.
- **Visão geral** (`/dev/catalog-overview`, só em dev, como as outras páginas `/dev`): todos os pontos num mapa, por estado — ✓ verificado, ≈ automático (produção, aproximado), ? aguardando aprovação (só dev) — e a lista dos sem posição com o motivo. Cor + símbolo + número. Reaproveita o mapa e o CSS dos pins da página de revisão (`src/dev/catalog-review/`).
- **"Posição aproximada" na interface.** Até aqui a interface não tinha esse aviso. Entrou como uma linha de texto no cartão do ponto (`PointCard`, prop `approximate`) só para pontos não aprovados à mão. Texto **provisório**, registrado em `docs/copy.md`; o `PointCard` segue pendente de componentizar no Figma (ver `docs/components.md`).

## Fase 3 / sessão 8d: níveis de aproximação (nenhum ponto fora do mapa)

- **Mudança de rumo (decisão de Caio).** Não há posicionamento à mão e nenhum ponto de coleta pode ficar fora do mapa. O modo "Pontos sem posição" com clique foi cancelado (nunca chegou a ser implementado). Todo ponto do catálogo tem pin, mesmo aproximado; quanto menos exata a posição, mais claro o aviso na ficha.
- **Regra de produção (substitui "geometria `n/a` nunca vai" e a regra da sessão 8c).** Aparecem **todos** os pontos com posição: `verified: true` e `auto-placed` em qualquer nível, sem exceção (`shownInProduction`). O que protege o usuário é o aviso na ficha, não a ausência do pin.
- **Aviso na ficha (textos provisórios, sempre visíveis, nunca escondidos).** Níveis g, a, b: "Posição aproximada". Níveis c, d, e: "Posição muito aproximada", em destaque (cor de aviso e peso de rótulo). Verificado e manual não avisam. O marcador não muda de forma por causa disso; o `aria-label` do marcador também diz a aproximação (quem usa leitor de tela é avisado). Sem Figma: pendente de componentizar (`docs/components.md`, `docs/copy.md`).
- **Níveis.** g = geometria da praia no OSM (sessão 8c, sem a regra do litoral, que não serve a lagoas). Para o que o g não posiciona, tenta-se na ordem e para-se no primeiro que passa: **a)** referências da descrição (rua, hospital, hotel etc., até 4, com abreviaturas como "Prof." e "Av." tratadas), no Nominatim limitado a Salvador; se duas ou mais referências se afastam mais de 300 m entre si, o nível é recusado; **b)** nome da praia (com a dica de `osm-name-hints.json`); **c)** bairro ou localidade (citado na descrição, ou o nome da praia lido como localidade: só resultados de tipo lugar); **d)** interpolação pela ordem do boletim ao longo do litoral; **e)** último recurso: ponto do litoral mais próximo do centro dos vizinhos posicionados.
- **Verificações em a–e.** Dentro do polígono de Salvador; a até 150 m do litoral (`natural=coastline` do OSM, uma consulta Overpass com cache; d e e já nascem sobre o litoral); 40 m de distância dos outros pontos da mesma praia. Dois pontos da mesma praia no mesmo resultado (b e c dão o mesmo ponto): o seguinte é deslocado ao longo do litoral em passos de 45 m até passar nos 40 m, e o motivo registra o deslocamento.
- **O que cada ponto grava** (`source`, tipo `auto-placed`): `level` (g a e), `basis`, `confidence` (g: média ou baixa; a, b: baixa; c, d, e: **muito baixa**), `reason` (por que caiu nesse nível, com o motivo de cada nível anterior) e `query`; `checks` ganhou `nearCoast`. Nunca grava `verified`. Nunca memória nem Google.
- **Âncoras de d e e.** Só pontos de nível g, a, b, verificados e manuais; nunca c, d, e, para não acumular erro de aproximações anteriores. d usa o vizinho posicionado mais próximo na ordem de cada lado, proporcional ao índice; sem vizinho dos dois lados, cai para e.
- **A ordem do boletim acompanha o litoral? (verificação antes do nível d).** Cada ponto posicionado é projetado na cadeia contínua mais longa do litoral e comparado com a ordem do boletim por Kendall tau; consistente se `|tau| ≥ 0,95` (corte de Caio). Resultado no boletim 37/2026: **tau 0,987**, 31 pontos usados, 3 inversões (SSA PB 100 > SSA SM 100, SSA ON 100 > SSA ON 200 e SSA IT 100 > SSA IT 200: pontos próximos entre si, a dezenas ou poucas centenas de metros), sentido igual ao da cadeia; 2 pontos ficam fora da conta por estarem a mais de 150 m da cadeia principal (SSA LP 100 e SSA LA 100, as lagoas). O script imprime esse relatório a cada execução.
- **Pin na costa (pedido de Caio: é praia, não rua nem prédio).** Nos níveis a, b e c a posição achada no Nominatim é levada para o **ponto mais próximo da linha da costa** (areia e mar), desde que já esteja a até 150 m dela; o motivo registra quantos metros foi ajustada. O mesmo vale para a pista da descrição no nível g: vai para o ponto mais próximo da geometria da praia (se já está dentro da área da praia, fica onde está). Os níveis d e e já nascem sobre a costa.
- **O resultado precisa ser a referência citada (nível a).** Só vale o resultado do Nominatim cujo nome contém todas as palavras significativas da referência (4 letras ou mais). Sem isso, "igreja Nossa Senhora de Santana" foi aceita como "Igreja Nossa Senhora das Neves", da Ilha de Maré, só por estar dentro de Salvador (SSA RV 200 apareceu no litoral norte): corrigido, com teste.
- **Lagoa não é praia do mar (pedido de Caio).** Lagoa de Pituaçu e Lagoa de Abaeté ficam sobre a geometria da própria lagoa (nível g). Nos níveis a–e, um ponto de "Lagoa …" nunca é ajustado para a costa do mar, não passa pela verificação de litoral (`nearCoast: n/a`) e **não entra nos níveis d e e** (cairiam no mar): sem resultado nos níveis a–c, fica sem posição com o motivo. Hoje as duas têm posição pelo nível g.
- **Correções do diagnóstico de Penha.** `geometryForBeach` só aceita elementos do OSM com algum ponto dentro do polígono de Salvador (a "Penha" achada antes era a de Vera Cruz, na Ilha de Itaparica; a Penha de Salvador agora entra pelo nível g). A nota de falha diz a verificação que realmente falhou ("geometria fora do polígono de Salvador", "mais de 80 m da praia", "sem espaço…"), não "sem espaço" por padrão.
- **Dica do OSM para a Lagoa de Pituaçu.** `osm-name-hints.json` ganhou "Lagoa de Pituaçu" → "Represa do Parque Pituaçu" (só para a busca): a lagoa fica a mais de 150 m do litoral e, sem geometria, cairia no nível e, na praia do mar.
- **Visão geral** (`/dev/catalog-overview`): cada ponto mostra o nível (letra no pin e na lista, com o motivo completo); estados: verificado, automático (g, a, b), muito aproximado (c, d, e), aguardando (posição de outra origem, não aprovada) e sem posição.
- **Risco aceito.** Nos níveis c, d e e o pin pode ficar a centenas de metros, ou mais, do local real da coleta. O status exibido continua sendo o do boletim (princípio 1); o aviso "Posição muito aproximada" fica sempre visível na ficha.

## Dicas de nome para o OpenStreetMap (`osm-name-hints.json`)

- **O que é.** `data/catalog/osm-name-hints.json` mapeia o nome do **boletim** para o nome usado no **OpenStreetMap**, só para a **busca** da praia (hoje: Placafor → Placaford, Stella Mares → Stella Maris). Função pura `osmSearchName` (`src/lib/catalog/osm-hints.ts`): compara sem caixa nem acento, não encadeia, e sem dica devolve o nome do boletim. Usada em `scripts/place-catalog.ts` (`geometryForBeach`) e em `scripts/propose-catalog.ts` (`resolveBeach`: consultas do Nominatim, `decideCandidate` e `matchOverpass`).
- **O nome exibido continua o do boletim** (princípio 1): o catálogo, a interface e as regras nunca veem o nome do OSM. A dica só entra no ponto onde o nome vira consulta.
- **Diferença para `beach-aliases.json`** (renomeação entre boletins, ainda não criado):

|                       | `osm-name-hints.json`                                | `beach-aliases.json`                                             |
| --------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Pergunta que responde | "Como o OSM chama esta praia?"                       | "Esta praia do boletim antigo é a mesma do boletim novo?"        |
| Afeta o nome exibido? | Não                                                  | Sim: o nome antigo passa a valer como o atual nas regras (R2–R4) |
| Usada em              | busca no OSM (propostas e posicionamento automático) | avaliação dos boletins                                           |
| Onde fica             | `data/catalog/`                                      | `data/`                                                          |

Ambas são tabelas manuais, aprovadas por uma pessoa; uma não substitui a outra.

## Motion

- **Decisão:** o movimento é definido pelo designer no Figma (variáveis de duração e curva + quadro de especificação). O Claude Code só implementa o que estiver escrito lá, sem inventar valores.
- **Quando:** tokens e transições de fluxo depois da Fase 3 (fluxos); microinterações de componentes na Fase 4 (acabamento). Antes disso, nenhuma animação. Plano em `docs/motion.md`.

## Marcador por praia, selo e pins numerados (Fase 3)

- **Agrupamento:** por praia (`slug`), nunca por proximidade. Praia com 1 ponto: marcador normal, sem selo. Com 2+ pontos: um marcador no centro do retângulo dos pontos.
- **Severidade do grupo:** Imprópria > Sem resultado > Própria (`src/lib/map/group-status.ts`). "Desatualizada" não entra: é faixa de aviso, e o ponto desatualizado conta com o último status. O `aria-label` do grupo acrescenta "Boletim desatualizado" se algum ponto estiver nessa situação.
- **Selo:** sempre o total de pontos ("2", "3"), nunca "1/2". O selo é redondo, igual aos demais, e não marca divergência; o detalhe ("1 imprópria e 1 própria") vai no `aria-label` e na ficha. Sem ícone novo.
- **Pins numerados:** mesmo marcador do ponto, com o número no selo ao lado (símbolo do status dentro do círculo). O nome da praia aparece no pin 1; nos outros só ao selecionar, focar ou passar o mouse.
- **R5 passa a valer com o grupo aberto**, que acontece de duas formas: (a) a praia está selecionada (clique no grupo, num pin ou no cartão; fica aberta em qualquer zoom); (b) os pontos ficam afastados na tela por pelo menos `GROUP_OPEN_MIN_SPREAD_PX = 56` (maior distância entre dois pontos, Web Mercator, tile de 512 px). 56 px = pin de 24 px + selo + folga de toque. Ao afastar o zoom, volta ao marcador único (se não estiver selecionada).
- **Clique no grupo:** enquadra os pontos com `maxZoom = GROUP_FIT_MAX_ZOOM = 17`. Recolher: clicar no mapa vazio, fechar a ficha ou Esc (a seleção sai; o grupo volta a seguir o zoom).
- **Zoom máximo do mapa:** 22 (padrão do MapLibre; os tiles são ampliados). Pontos a 40 m ficam a 56 px por volta do zoom 16,7 (tile de 512 px), então abrem sem precisar de 19 ou 20.
- **Nomes por zoom:** `LABEL_MIN_ZOOM = 13` (`src/lib/map/label-visibility.ts`). O zoom mínimo calculado fica em ~9,5 (celular) a ~10,8 (desktop); 13 é cerca de 2 a 3,5 níveis acima, onde vizinhas como Barra e Rio Vermelho ficam a mais de 100 px. Abaixo, só ícones, números e selos; selecionado, foco ou hover mostram o nome em qualquer zoom. Sem animação.
- **Limite de navegação:** folga em torno de Salvador de 0,02° para 0,05° (~5,5 km), para o zoom mínimo mostrar mais terreno fora da cidade.

- **Fora do site (não são praia):** Santa Maria, Lagoa de Pituaçu e Lagoa de Abaete (`NOT_BEACHES` em `src/lib/site/load-data.ts`). O Inema as lista no boletim, mas o Praieros mostra só praias: ficam fora do mapa, da busca e do resumo. Os boletins gravados e o catálogo não mudam; é decisão de exibição.
- **Nomes nos pins abertos (revisto em 2026-11-11):** só o pin selecionado mostra o nome (em qualquer zoom); os outros pins do grupo mostram só o número, e o nome aparece neles apenas com foco ou hover. Praias de um ponto seguem a regra do zoom 13.
- **Clique no marcador:** vale para o marcador todo (ícone, selo e nome); o SVG interno não recebe clique e o estado visual só é refeito quando muda.
- **Fechar a ficha mantém a marca:** ao fechar a ficha (X ou Esc), o último marcador clicado continua no estado selecionado (pino azul) e recebe o foco, para o usuário não perder a referência. Depois disso, clique no mapa vazio ou Esc tira a marca. Antes, fechar a ficha limpava a seleção.

## Sessão 10: praias de referência (OSM)

- **O universo de praias deixa de ser só o boletim.** Nenhuma praia de Salvador some do mapa só por não constar no boletim atual. Além das do boletim e do catálogo, existem as **praias de referência**: praias com nome (`natural=beach`) no OpenStreetMap, dentro do polígono de Salvador, que não casam com nenhuma praia do boletim ou do catálogo.
- **Fonte da posição: OpenStreetMap.** `npm run catalog:reference` (Overpass, com cache, 1 requisição por segundo, User-Agent com `CATALOG_CONTACT`; nunca memória nem Google) grava `data/catalog/reference-beaches.json`: nome do OSM, id OSM, posição representativa (ponto da própria geometria mais próximo do centro dela), origem `osm`. Reaproveita a consulta de geometria do posicionamento (mesmo cache). Sem ponto de coleta.
- **Casamento de nomes** com o boletim/catálogo: nome normalizado igual, ou `namesMatch` (nome do boletim contido no do OSM, palavras inteiras) com `osm-name-hints.json`. `beach-aliases.json` (renomeações aprovadas) é lido se existir (`data/catalog/`, opcional). Quem casa **não** é referência: se um nome do OSM passar a constar no boletim, ele se une à praia do boletim (mesma chave de nome). Homônimo fora de Salvador (Penha em Vera Cruz) fica de fora pelo polígono, como no posicionamento.
- **`data/catalog/reference-exclude.json`**: lista de nomes a ignorar (começa vazia), aplicada na geração e no carregamento.
- **Suspeitas de duplicata** (relatório do script, nunca descartadas sozinhas): referência a menos de 300 m de uma praia do boletim (menor distância entre a posição da referência e os pontos ou a geometria dela), ou com nome parecido (um contido no outro, nos dois sentidos, ou 1 letra de diferença em nomes curtos / 2 a partir de 7 letras). A decisão (alias ou exclusão) é do Caio.
- **Estado de uma referência (R4a):** `kind: 'reference'`, "Sem resultado", sem chip de status e sem faixa; a ficha diz "Esta praia não consta no boletim nº X." com fonte e data do boletim atual. Não é chamada de "ponto de coleta" e não sugere que o Inema a analisa. Marcador: o `no-result` existente (símbolo "?"), um só, sem selo nem número. "Desatualizada" continua com o "!" (dois marcadores distintos, sempre cor + símbolo + texto).
- **D2 não muda:** o resumo conta **pontos de coleta**; praias de referência não têm ponto e ficam fora (rótulo diz "pontos de coleta").
- **R3/R4b:** praia que saiu do boletim atual mantém pontos e posições do catálogo (o catálogo nunca remove ponto) e continua como desatualizada, ou "Sem resultado" depois de `STALE_BULLETINS_LIMIT`. Coberto por testes com boletins sintéticos (nunca em `data/bulletins/`).
- **Dados fora do commit** até o Caio decidir (`data/catalog/*`). O carregamento tolera os arquivos ausentes: sem eles o site mostra só boletim + catálogo.
- **Busca:** ainda não construída; as referências já estão no modelo (`BeachModel.isReference`) que ela vai consumir.
- **Referência só se a posição representativa estiver em Salvador** (além de algum vértice dentro do polígono): praia que só encosta na divisa fica de fora (ex.: Praia da Gamboa saiu em 2026-11-11).
- **Decisões sobre suspeitas (Caio, 2026-11-11):** "Canta Galo" -> "Praia do Cantagalo" em `osm-name-hints.json` (só para a busca; o nome exibido não muda); "Praia da Barra" em `reference-exclude.json`; Praia da Paciência, Prainha da Fonte do Boi e Praia do Paredão ficam como referência.

## Sessão 11: painel lateral fiel ao Figma (nó 123:2440)

- **Estrutura:** cabeçalho (padding 24, borda inferior; título `heading-large`, subtítulo, chip do boletim) e corpo (padding 24). No corpo, ações no topo e links + crédito no rodapé do painel (`justify-between`); se a ficha for mais alta que a tela, o painel rola. Faixas Desatualizado/Sem resultado ficam acima do cabeçalho (não estão no Figma, vêm da tabela de estados).
- **O que saiu da tela (só deixou de ser exibido):** ícone de compartilhar no botão "Compartilhar praia" e os links sublinhados azuis (viraram botões-linha). Nenhum dado nem lógica foi apagado (o ícone `share` segue no `Icon`).
- **"1 pontos de coleta" no Figma:** erro de plural do exemplo; o código mantém "1 ponto" / "3 pontos" (`pointsLabel`).
- **Botão fechar:** já era `ButtonIcon` xsmall (40 px) com ícone de 24 px; sem mudança.
- **Botão-linha ("Como ler e fonte", "Boletim original"):** variante simples do `Button` (props `spread`, `target`), não estilo local. `secondary`, largura total, texto à esquerda e ícone de 20 px à direita (chevron e link externo). Hover e foco herdam do `secondary`. `target="_blank"` já inclui `rel="noopener noreferrer"`.
- **Ícones novos** (do Figma, `currentColor`): `chevron-right-20`, `rain-20`.
- **Tokens:** sem faltas. O chip do boletim tem altura de 24 px (`primitives-spacing-24`, como a altura dos botões; sem token semântico). Padding 4/8 px do chip pelos tokens `inset-2xs`/`inset-xs`.
- **Aviso de chuva (texto do design, não do boletim).** Regra (Caio, 2026-11-11), função pura `shouldShowRainNotice` em `src/lib/site/rain-notice.ts`, com testes: mostra quando **pelo menos um ponto exibido está Própria**. Para praia desatualizada vale o último status conhecido (o painel já recebe esse status); pontos mistos mostram; todos Impróprios (ou Sem resultado) não mostram; fichas sem pontos (referência, sem resultado, antiga demais, nunca apareceu) não mostram. Fica dentro da lista de pontos, abaixo do último cartão, como no Figma. O texto não é lido do boletim nem reescrito por regra; é fixo.
- **Variações sem Figma, derivadas por lógica:** 1, 2 ou 3 ou mais pontos (a lista de cartões só cresce); desatualizada (faixa acima do cabeçalho, chip do último status); sem resultado e referência (sem cartões, sem aviso de chuva, nota "não consta no boletim nº X" sob o chip, como antes). O chip do boletim, o link "Boletim original" e "Fonte: Inema" aparecem em toda ficha.

### Sessão 11 (ajustes pedidos por Caio, 2026-11-11)

- **Faixa Desatualizado / Sem resultado no desktop:** sai do painel e vai para o **topo do mapa** (largura do mapa, logo abaixo do cabeçalho; o painel começa embaixo do cabeçalho). Fica visível só com a ficha aberta. No mobile continua dentro da folha (fora desta sessão). Código: `.map-banner` em `index.astro`; `BeachPanel` só renderiza a faixa com `layout="mobile"`.
- **"Posição aproximada" / "Posição muito aproximada" deixam de aparecer** nos cartões de ponto (o Figma não tem). O nível de precisão (`accuracy`) continua nos dados, no `PointCard` (prop) e no aria-label dos marcadores; só não é exibido. **Pendência:** a regra do CLAUDE.md ("a posição no mapa é aproximada, informar na UI") precisa de outro lugar, por exemplo na página "Fonte e como ler". Os textos em `docs/copy.md` ficam como "não exibidos".
- **Chip do boletim:** "Boletim nº X · emitido em dd/mm/aaaa" (texto do Figma 123:2445). Vale também para praia desatualizada (a data é a do boletim em que apareceu).
- **Foco ao abrir a ficha:** vai para o próprio painel (`tabindex="-1"`, sem anel), não mais para o botão fechar, que aparecia sempre com foco. O foco por teclado (Tab) no botão continua com anel.
- **Clique em marcador agrupado (praia com 2+ pontos):** primeiro passo é só **enquadrar os pontos** (zoom máx. `GROUP_FIT_MAX_ZOOM = 17`) e abrir os pins numerados, **sem abrir a ficha**. A ficha abre ao clicar num pin. O grupo aberto assim fica aberto (`expandedSlug` no controlador) até um clique no mapa vazio. Substitui "clique no grupo abre a ficha" da sessão 9.
- **Clique em marcador de um ponto só:** centraliza e aproxima até `POINT_FOCUS_ZOOM = 15` (nunca afasta), sem animação, e abre a ficha.
- **Área de clique dos marcadores:** o nome que aparece por hover, foco ou seleção com zoom abaixo de 13 ("peek") flutua sob o ícone e não faz parte da área de clique, para não cobrir pins vizinhos. Com zoom 13 ou mais o nome continua parte do botão.

- **Bairro (2026-11-11):** a ficha nunca mostra "Salvador" no lugar do bairro; sem bairro conhecido, o subtítulo mostra só "N ponto(s) de coleta". Os bairros que faltavam (14 do catálogo e as 16 praias de referência) foram preenchidos por consulta inversa do OpenStreetMap (`npm run catalog:neighborhoods`, Nominatim, só OSM), **sem conferência**: ficam `neighborhoodVerified: false` no catálogo e, nas referências, só aparecem em desenvolvimento (como o bairro não conferido do catálogo). Em produção, bairro não conferido não aparece. **Conferir na página `/dev/catalog-review`**: o OSM traz grafias erradas ("Rio Vemelho" por Rio Vermelho) e bairros duvidosos (Praia de Inema -> "Quilombo do Alto do Tororó", Praia do Alvejado -> "Rio Sena", Bonfim/Pedra Furada/Marina Contorno). Rodar o script de novo não altera bairros já preenchidos; `catalog:reference` regrava as referências e perde os bairros (rodar o script depois).

- **Botões de zoom do mapa (2026-11-12):** + , − e ajustar à tela usam `ButtonIcon` `outlined` tamanho `xsmall` (40 px), em vez de `medium` (56 px). Só muda o tamanho; o `label` e o comportamento são os mesmos.

### Ficha "Sem resultado" (Figma 125:3674, 2026-11-12)

- **Corpo:** estado vazio centralizado (ícone de alerta, "Sem resultado", "Não há resultado do Inema para esta praia."). Saem os botões "Ver detalhes" e "Compartilhar praia" nesse estado (props e lógica continuam).
- **Exceção ao princípio 2 (data do boletim):** o chip vira "Boletim não encontrado", sem número nem data. A fonte continua no rodapé. Decisão de Caio.
- **Nota "Esta praia não consta no boletim nº X." deixa de ser exibida** (nunca apareceu e referência).
- **Variação derivada (R4b, antiga demais):** mantém "A última análise foi em dd/mm/aaaa, antiga demais para mostrar." (tabela de estados do CLAUDE.md). A faixa do topo usa o texto do Figma nos dois casos.
- **Subtítulo:** usa o nº real de pontos da praia (`pointCount`); com 0 pontos mostra "Sem ponto de coleta" (decisão de Caio, sessão 20b; antes omitia). Nunca "0 pontos".
- **Navbar:** divisor de 1px antes de todos os botões, inclusive o primeiro (como no Figma).
- **Botões de zoom:** o Figma 125:3687 mostra 56 px; mantido o 40 px (xsmall) da decisão de 2026-11-12, por ser mais recente. Pendente de confirmação.

## Sessão 12: busca (Figma 117:5075)

- **O que o nó define:** só o estado inicial no desktop (título, chip do boletim, campo, "Perto de você", grade "Bairros"). Resultados, sem resultado de busca e mobile foram derivados por lógica. Os exemplos (bairros, praias do mapa, boletim nº 36) não são regra.
- **Bairros sugeridos (decisão de Caio):** derivados do catálogo: bairros com ao menos uma praia, sem repetir (sem diferenciar acento nem caixa), em ordem alfabética; a seção some se não houver nenhum. Clicar preenche o campo com o bairro e lista as praias dele. Hoje, em produção: **0 bairros** (nenhum está conferido, então não aparecem); em dev: **25** (sem conferir; ex.: "Rio Vemelho" vem do OSM com erro de grafia).
- **"Perto de você / Usar minha localização": não renderizado.** Pendente do design: faltam frames de pedido de permissão, permissão negada e usuário fora de Salvador.
- **Sem resultado de busca:** segue o desenho enviado por Caio (mesmo do erro do mapa): ícone, título com o termo digitado, texto e botão "Tente novamente" (limpa o campo e volta aos bairros). Nesse estado os bairros ficam escondidos. Substitui o texto provisório.
- **Mobile fora desta sessão.** O componente tem `layout` (`desktop` | `mobile`) e na página o painel vira folha inferior abaixo de 1024px, mas não foi verificado nem desenhado.
- **Largura (decisão de Caio):** busca e ficha têm a mesma largura, a maior: 477px (`size.panel-width` passou de 428 para 477; sem token separado).
- **Um painel por vez (decisão de Caio):** abrir a busca esconde a ficha; clicar num marcador com a busca aberta fecha a busca. O botão de busca da navbar, com o painel aberto (`aria-expanded=true`), muda de filled para o visual ghost, como os outros (Figma 126:4529).
- **Busca:** normalização sem acento, sem caixa e ignorando "praia", "de", "do", "da" (também "dos", "das"); se o texto só tiver essas palavras, compara com elas mesmas. Ordem: nome começa com o texto, cada termo começa uma palavra do nome, nome contém, bairro; empate alfabético (pt-BR). Sem dependência nova.
- **Universo:** todas as praias do modelo (inclui referência, desatualizada e antiga demais). Praia sem marcador no mapa fica na lista como não selecionável (`aria-disabled`); hoje todas têm marcador.
- **Resultado:** pior status (D1). "N de M pontos impróprios" só com 2+ pontos e ao menos um impróprio. Referência: "Sem resultado", sem contagem. Desatualizada: chip com o último status conhecido e a linha "Boletim desatualizado".
- **Integração:** botão da navbar tem `aria-controls`/`aria-expanded`. Abrir a busca esconde a ficha; fechar sem escolher (Esc ou fechar) devolve a ficha e o foco ao botão. Escolher uma praia enquadra como o clique no marcador (1 ponto aproxima; 2+ abre o grupo) e abre a ficha (o grupo abre a ficha sem ponto escolhido). Novo `focusBeach` no controlador do mapa e evento `marker-focus`.
- **Teclado:** foco no campo ao abrir; ↓/↑ entre campo e resultados; Enter escolhe (no campo, o primeiro resultado); Esc fecha.
- **Botão de bairro:** usa o `Button small` do catálogo (48px). Os 40px do Figma 125:3132 foram erro de design (decisão de Caio). Peso do nome da praia: 600 (não há token 700; mesmo padrão do PointCard).
- **Nome longo (decisão de Caio):** no botão de bairro, nome acima de 20 caracteres é abreviado: a primeira palavra vira a inicial com ponto e a ligação some ("Quilombo do Alto do Tororó" -> "Q. Alto do Tororó"); repete com a palavra seguinte se ainda passar, sobrando ao menos 3 palavras (`abbreviateLabel`, com testes). O nome completo continua no rótulo para leitor de tela e é o que preenche o campo. Nos resultados da lista, o nome quebra em duas linhas (não abrevia).
- **Item de resultado (Figma 117:6342):** nome em negrito, ponto de 8px com a cor do status, detalhe "Bairro · N ponto(s) de coleta" e seta. Estados seguindo a lógica do catálogo: hover só com a borda de destaque; foco (teclado) com borda de destaque e anel de foco; desabilitado (sem marcador no mapa) igual ao botão secundário desabilitado. **Só o ponto (decisão de Caio):** o status é transmitido só pelo ponto colorido, como no design; o texto do status ("Própria", "Imprópria"...) fica só para leitor de tela. É uma exceção consciente ao princípio 3 (cor + texto) para quem enxerga. Praia sem ponto de coleta: sem "0 ponto de coleta" (o Figma mostra, mas a regra é nunca "0 pontos"). O contador "N praias encontradas" (negrito no número) aparece acima da lista. Os bairros continuam visíveis abaixo dos resultados.
- **Cabeçalho com a busca aberta:** a linha de baixo da navbar não passa sob o botão de busca, que se junta ao painel (Figma 126:4604).
- **Rolagem:** só o corpo do painel rola. Os textos só para leitor de tela (`sr-only`) ficam presos ao corpo (`position: relative`); antes criavam rolagem na página.
- **Linha da navbar com a busca aberta:** a linha desenhada à parte fica sobre a borda (`bottom: -1px`), e não 1px acima dela.
- **Faixa azul junto ao painel (corrigido):** era o canvas do mapa com largura desatualizada ao abrir ou fechar um painel (sobrava o fundo, cor do mar, junto à borda). Agora o mapa se redimensiona na hora quando o atributo `hidden` da ficha ou da busca muda (`beach-map.astro`), e o observador de tamanho também chama `map.resize()`. Só o atributo dos painéis é observado, não os marcadores, para não criar laço com o evento `resize`. O anel de foco do canvas e da área rolável do painel também foi removido.
- **Fresta azul junto ao painel (2ª correção):** com escala de pixels fracionária (largura do mapa como 379,2px) o canvas ficava até 1px menor que o contêiner e aparecia o fundo (cor do mar) entre o mapa e a borda do painel. O canvas agora passa 4px da borda direita (`inset` negativo, o contêiner corta).

## Sessão 13: bairro automático por polígono do OSM

- **Fonte e método:** só OpenStreetMap (nunca memória nem Google). O OSM tem polígonos de bairro de Salvador (`boundary=administrative`, `admin_level=10`, 86 com anel). `npm run catalog:neighborhoods` baixa todos numa consulta do Overpass (cache, 1 req/s, `CATALOG_CONTACT`) e decide por ponto-em-polígono (`src/lib/catalog/neighborhood.ts`, funções puras com testes). Sem Nominatim por praia.
- **Regra por praia:** vale a posição dos pontos de alta confiança: automáticos de nível g, a ou b (sem nível = g) e pontos aprovados à mão. Níveis c, d, e (posição muito aproximada), pontos sem posição e propostas soltas do OSM não valem: um bairro errado seria erro factual. Cada ponto vota no polígono que o contém; vence o mais frequente. Empate, nenhum voto ou nenhum ponto de alta confiança = não preenche, com o motivo em `neighborhoodNote`. Praia de referência: a posição vem da geometria da praia.
- **Gravação:** `neighborhood` (nome do OSM, sem a tabela de nomes), `neighborhoodSource` (`method: polygon`, `confidence` alta se todos os pontos são de alta confiança e concordam, média nos demais, `osmId`, `osmName`, `reason`) e `neighborhoodNote` (motivo de não ter preenchido). Nada grava `verified`. Bairro conferido ou corrigido à mão (`neighborhoodVerified`) não é tocado e prevalece. O automático substitui o `reverse` antigo (consulta inversa, não conferido).
- **Regra de produção (substitui "só exibir bairro conferido"):** aparece em produção o bairro conferido à mão e o automático por polígono (`isAutoNeighborhood`), na praia do boletim e na de referência. O `reverse` antigo só aparece em desenvolvimento. O subtítulo da ficha e a seção "Bairros" da busca já derivavam do catálogo e não mudaram de layout; praia sem bairro continua sem nada.
- **Tabela de nomes (decisão de Caio):** `data/catalog/neighborhood-names.json` (nome no OSM -> nome exibido), aplicada na leitura (`displayNeighborhood`, `buildSiteModel` com `neighborhoodNames`) sem alterar o dado do OSM. Como a tabela de apelidos de praia: só entra o que Caio aprovar. Vale só para o bairro automático; o texto conferido à mão não é alterado. Hoje: "Rio Vemelho" -> "Rio Vermelho".
- **Páginas de dev:** `/dev/catalog-overview` e a revisão mostram o bairro exibido, o nome no OSM (se a tabela mudou), o método, a confiança e o motivo.
- **Ajustes aprovados por Caio (A + B + C restrita), 2026-11-12:**
  - **A. Vãos no contorno:** 8 polígonos de bairro do OSM não fechavam (vão de 22 a 144 m entre dois trechos: Boca do Rio, Imbuí, STIEP, Jardim Armação, Costa Azul, Chame-Chame, Graça, Trobogy) e eram descartados na leitura. A montagem agora une as pontas soltas mais próximas, de até 150 m, com um trecho reto (`closeGaps`, `MAX_GAP_M`); vão maior ou ponta sem par continua descartando o polígono. O relatório informa quantos foram fechados (8). Nenhuma praia que já tinha bairro mudou por isso.
  - **B. Tolerância de 100 m:** só quando nenhum polígono contém o ponto: o polígono mais próximo vale se estiver a até 100 m e o segundo estiver mais de 100 m além do primeiro (sem empate). Vale por ponto e na praia de referência. Grava `polygon`, confiança média e o motivo ("a N m do polígono X, sem polígono que o contenha"). Hoje só Penha -> Ribeira (62 m).
  - **C restrita:** o nome da praia só desempata quando os pontos empatam entre exatamente dois polígonos e um deles tem o nome da praia (sem acento nem caixa). Nunca contraria a posição de alta confiança (Patamares continua em Pituaçu e Boa Viagem em Monte Serrat). Confiança média e motivo "desempatado pelo nome da praia". Hoje só Pituba (Amaralina x Pituba -> Pituba).

## Sessão 14: Classificação (Figma 125:3895)

- **Tela:** Classificação, só desktop (o design não cobre mobile; fica para a sessão da folha inferior). O nó se chama "Boletim obsoleto / Desktop", mas o conteúdo é o painel Classificação; o Figma só mostra o caso Própria.
- **Entrada e navegação:** painel dentro de `index.astro`, sem rota nova. O botão "Ver detalhes" da ficha (antes sem destino) abre a Classificação da mesma praia; voltar retorna à ficha (foco em "Ver detalhes"); fechar e Esc fecham o painel. Clicar noutra praia volta à ficha. No mobile "Ver detalhes" não aparece enquanto não houver a folha de Classificação.
- **Quando é oferecida (`classificationFor`, função pura):** só praia que mostra status (`current` ou `stale`) e cujo pior status (D1) tem texto aprovado. Própria e Imprópria (o texto de Imprópria é provisório, escrito no tom do design a pedido do Caio, sem citar causa porque o boletim só traz a categoria). Sem resultado, antiga demais, nunca apareceu e praia de referência: sem "Ver detalhes". Desatualizada usa o último status e mantém a faixa de aviso no topo do mapa. Praia com pontos mistos usa o pior status; se for Sem resultado, não é oferecida. Não há praia desatualizada nos dados atuais: o caso é coberto só por teste unitário.
- **Fonte e data (exceção ao princípio 2):** seguindo o design, o painel não traz "Boletim nº X · dd/mm/aaaa"; só "Fonte: Inema · Praieros não é canal oficial". A data continua na ficha, que fica um passo antes. Decisão do Caio.
- **Links:** "Boletim original" = PDF do boletim da praia (do modelo). "Ver resolução" = https://www.ana.gov.br/portalpnqa/Publicacao/Resolu%C3%A7%C3%A3o_Conama_274_Balneabilidade.pdf, **provisória: a URL canônica ainda será confirmada**.
- **Ícone:** `arrow-left` (24 px) salvo do Figma (nó 125:4153). Valores visuais todos de tokens; nenhum token novo.
- **Compartilhar praia:** botão presente como no design, ainda sem ação (como o da ficha).

## Sessão 15: Fonte e como ler (Figma 126:4345)

- **Tela:** só desktop (o design não cobre mobile; fica para a sessão da folha inferior). Painel dentro de `index.astro` (`source-panel.astro`), sem rota `/fonte`. Os links "Fonte e como ler" (cabeçalho) e "Como ler e fonte" (ficha) apontam para `#fonte`; no desktop abrem o painel no lugar da ficha/busca; no mobile ainda não fazem nada.
- **Navegação:** voltar e Esc devolvem a ficha que estava aberta (ou fecham, se não havia); fechar encerra a ficha também. O foco volta a quem abriu. Escolher marcador ou abrir a busca tira a Fonte do lugar.
- **Glossário:** o título do 4º termo está como "Imprópria" no Figma (126:7534), mas o texto descreve "Sem resultado"; exibimos **Sem resultado** (provável erro de camada). Decisão do Caio.
- **Boletim:** "nº 36 / 29/10/2026" é exemplo; número (formato `37/2026`, como na ficha), data e PDF vêm do boletim atual. Sem boletim atual: a linha fica "Inema, Boletim de Balneabilidade." e o botão some.
- **Créditos do mapa:** uma linha, sem prosa, com os links das licenças, em nova aba (com "(abre em nova aba)" só para leitor de tela). Provisória: não está no design. Sem link para a página oficial do Inema (o design só traz "Boletim original"). Decisão do Caio.
- **Tokens:** o negrito dos rótulos ("Fonte:" etc.) é Bold no Figma; os tokens só têm 400/500/600, usamos 600 (o maior). Créditos do mapa no mesmo texto dos demais itens (`body-medium`), com sublinhado nos links.

## Sessão 16: ajuste de escopo (só docs)

- **Resumo do boletim (desktop):** sai do escopo; não será feito.
- **Compartilhar praia e Compartilhar site:** ficam **pendentes, para depois**. Os botões existentes (ficha, Classificação, cabeçalho) continuam sem ação. A **R6** (link compartilhado abre sempre o estado atual; prévia com status + data do boletim do momento do envio) permanece válida para quando forem feitos.
- **Próxima etapa:** refinar o mobile (folha inferior, busca mobile, Classificação e Fonte e como ler no mobile) e depois o motion (`docs/motion.md`).

## Sessão 17: home mobile (nós 117:4916, 117:4762, 117:5022)

- **Auditoria:** cabeçalho, marcadores, estado de erro e fundo já batiam com o Figma. Ajustado só o mapa abaixo de 1024px (desktop intacto).
- **Zoom:** a 16px (`space-inset-md`) das bordas no mobile, como no Figma (antes 24px).
- **Pílula "Carregando o mapa…":** igual à do desktop (largura do conteúdo, centralizada, a 24px do topo). Decisão de Caio, que substitui o ajuste inicial (largura útil, 16px do topo) e os 370px fixos do Figma.
- **Áreas seguras:** o zoom usa `max(16px, env(safe-area-inset-*))` (entalhes e barra do sistema). Não definido no Figma; derivado.
- **Alvos de toque:** os botões de 56px já passam de 44px; nada a mudar.
- **Rótulo cortado na borda / rotação:** o mapa tem `overflow: clip` e `maxBounds`; em paisagem o layout continua o mesmo abaixo de 1024px. Sem tratamento extra.
- **Atribuição:** continua no topo do mapa no mobile (sessão 8a-2).
- **Nomes dos marcadores:** o Figma mostra sempre; mantemos a regra de zoom ≥ 13 (decisão anterior, evita sobreposição).
- **Fora do escopo desta sessão:** folha inferior, busca mobile, Classificação e Fonte no mobile (os frames não cobrem).

## Sessão 18: busca mobile (Figma 117:5257)

- **Layout:** tela cheia sob a navbar (`position: absolute; inset: 0` no palco, `z-index: 3`), não mais folha inferior. Padding 16 lateral e 24 vertical (cabeçalho e corpo); só o corpo rola. Desktop não mudou (painel lateral, padding 24). Fechar volta ao mapa e, como antes, devolve a ficha que estava aberta.
- **Bairro selecionado (derivado do 2º quadro):** o botão do bairro fica "ligado" (`aria-pressed`, estilo `selected` do Button) quando o campo traz exatamente o nome dele; some ao editar o texto. No mobile, escolher um bairro **não** foca o campo, para o teclado virtual não cobrir a lista.
- **Resultados:** mesmo item do desktop. Ao digitar, os bairros continuam abaixo dos resultados (quadros 5 e 6). **Ao escolher um bairro pelo botão (desktop e mobile), a seção "Bairros" some** e ficam só as praias encontradas (pedido de Caio); editar o texto, limpar ou reabrir a busca traz os bairros de volta.
- **Divergência com o CLAUDE.md (frame não seguido):** o frame mostra "0 ponto de coleta" na praia sem ponto. Mantida a regra atual: sem ponto, a contagem é omitida (praias de referência), não se escreve "0 ponto".
- **Foco:** ao abrir, vai para o campo; ao fechar, volta ao botão de busca do cabeçalho; Esc fecha.
- **Derivados (o Figma não cobre):** teclado virtual (lista rola dentro do corpo, `overscroll-behavior: contain`); área segura (`env(safe-area-inset-bottom)` no fim do corpo); alvo de toque do fechar: 40px desenhados, 44px de área (pseudo-elemento, 2px de folga). Botões de bairro ficam em 40px (Figma; gap de 8px impede ampliar a área sem sobrepor); as linhas de resultado já passam de 44px.
- **Fora do escopo:** "Perto de você" (faltam permissão negada e fora de Salvador) e o skeleton de carregamento (ver `docs/motion.md`).
- **Item de resultado sem "N de M pontos impróprios" (pedido de Caio, desktop e mobile):** o card mostra só nome, status (ponto + bairro · pontos) e, se for o caso, "Boletim desatualizado". A D1 continua valendo para o status exibido (pior status dos pontos, que vem no ponto de cor e no texto de status); a função pura `improperSummary` fica em `src/lib/search/` (com testes) sem uso na interface.
- **Painéis nunca ficam "vivos" por baixo (pedido de Caio):** abrir a busca encerra a ficha (some o conteúdo e a faixa, não só o painel) e a Fonte; **fechar a busca sem escolher volta ao mapa**, nunca a uma ficha ou à Fonte anterior (substitui "fechar sem escolher devolve a ficha que estava aberta"). O marcador clicado continua marcado. O "Voltar" da Fonte para a ficha segue como estava. A D1 do CLAUDE.md foi ajustada (sem "N de M pontos impróprios").

## Degradê de rolagem no rodapé dos painéis (pedido de Caio)

- Painéis que rolam (busca, ficha, Fonte e como ler; no mobile, a busca e, por ora, a folha da ficha) ganham um degradê de 48px (token `spacing-48`), de transparente até `surface/default`, no rodapé enquanto há conteúdo abaixo. Some ao chegar ao fim e quando o conteúdo cabe. É sticky e sem clique (`pointer-events: none`), sem aumentar a rolagem.
- Uso: atributo `data-scroll-fade` no elemento que rola (`src/styles/scroll-fade.css`, `src/lib/ui/scroll-fade.ts`, ligado em `index.astro`); em contêiner flex com `gap`, definir `--fade-gap` igual ao gap.
- **Sem transição por enquanto:** "aparecer suavemente" é motion e o `docs/motion.md` proíbe inventar duração e curva antes da fase de motion. A visibilidade liga e desliga direto; a suavização está em "Pendente de motion". Classificação no desktop usa o mesmo `.panel`, então já tem o degradê.
- O Figma não define altura nem cor do degradê: 48px e surface/default são premissa; confirmar com o design. A folha da ficha no mobile será redefinida por Caio; o atributo já está no `.panel`, a conferir lá.
- **Busca: o painel inteiro rola (correção, pedido de Caio):** cabeçalho (título, chip, campo) e corpo rolam juntos, como Fonte e como ler; antes só o corpo rolava e o degradê ficava no fim do corpo, fora do rodapé. Agora `data-scroll-fade` está na seção do painel (o degradê cola no rodapé visível) e o corpo só ocupa o resto da altura (centra o "sem resultado"). Vale no desktop e no mobile.
- **Vista de um bairro na busca (concepts de Caio, desktop; vale no mobile):** ao escolher um bairro o cabeçalho muda: seta de voltar à esquerda, **o nome do bairro no lugar de "Buscar"**, chip do boletim e **sem o campo de busca**; abaixo, "N praias encontradas" e a lista, sem a seção "Bairros". A seta volta à busca inicial (campo vazio, bairros), com o foco no bairro que estava aberto; "x" fecha a busca; Esc também. Ao entrar na vista o foco vai para a seta. Digitar no campo segue como antes (título "Buscar", resultados e bairros abaixo). Rótulo da seta: "Voltar" (igual a Fonte e como ler).
- **Divergência a decidir:** o concept mostra "0 ponto de coleta" na praia sem ponto (Praia do Cristo); mantida a regra atual (sem ponto, a contagem é omitida, nunca "0 ponto"), conforme CLAUDE.md. Se quiser o texto como no concept, é só dizer.

## Sessão 19: busca com o novo layout e espaçamentos (Figma 117:5075 e 117:5257, concepts de Caio)

- **Espaçamentos (desktop e mobile):** entre o bloco título + chip e o campo, **24** (`stack/lg`, antes 32); entre título e chip, **8** (`stack/xs`, antes 12). Padding do cabeçalho e do corpo: **24 no desktop, 16 no mobile em todos os lados** (antes 16 lateral e 24 vertical no mobile). Seção Bairros: 16 entre o rótulo e a grade, grade com gap de 8.
- **Mobile volta a ser folha inferior** (substitui "tela cheia" da sessão 18): sobre o mapa, colada embaixo, com borda de cima, altura de **60% do palco** (o Figma tem 450px num palco de 756px; não há token, premissa registrada) e rolagem do painel inteiro (cabeçalho + corpo), com o degradê no rodapé. O mapa continua visível acima. A vista de um bairro (seta, nome do bairro, sem campo) é a mesma do desktop.
- Área segura de baixo e alvo de toque de 44px do fechar seguem como na sessão 18. Fechar volta ao mapa (sem ficha por baixo).
- **Item de resultado segue o botão secundário (outlined), como os bairros (pedido de Caio; substitui a linha azul no hover):** hover e foco trocam a superfície para `surface/hover`; foco (teclado) ganha o anel; desabilitado fica transparente com a borda `surface/hover` e texto desabilitado. A borda não muda para azul.
- **Sem resultado de busca: inset vertical de 40px (pedido de Caio):** `padding-block: var(--space-inset-2xl)` (40px) no bloco da mensagem, em cima e embaixo (além do padding do corpo).
- **"0 ponto de coleta" na busca (pedido de Caio, como no concept; substitui a omissão):** o item de resultado de uma praia sem ponto de coleta (referência, informação desconhecida) mostra "Bairro · 0 ponto de coleta" com o ponto cinza e o texto "Sem resultado" para leitor de tela. `pointsLabel` usa o singular para 0 e 1 ("0 ponto", "1 ponto") e o plural a partir de 2, seguindo o concept. A ficha também mostra "Sem ponto de coleta" no subtítulo (pedido de Caio, sessão 20b), em vez de omitir.

## Sessão 19b: "Nenhum ponto", altura sem resultado e skeleton (Caio)

- **"Sem ponto de coleta"** (substitui "Nenhum ponto de coleta" e "0 ponto de coleta"; combina com "Sem resultado" e não afirma que a praia não tem ponto, só que o boletim não traz): `pointsLabel(0)`; aparece no item de resultado de praia sem ponto (informação desconhecida). A ficha continua sem a contagem quando não há ponto.
- **Sem resultado no mobile (imagem de Caio):** a folha se ajusta ao conteúdo (`height: auto`, máx. 100% do palco) para mostrar mensagem, botão e os 40px de inset sem rolar; nos outros estados segue 60% do palco.
- **Skeleton da busca (desktop e mobile):** blocos estáticos em `surface/strong` no lugar do título, chip, campo e grade de bairros (7 blocos de 40px); o botão de fechar fica. **Uso estratégico:** só enquanto o mapa carrega (acompanha o "Carregando o mapa…"), porque escolher uma praia depende do mapa; os dados da busca são estáticos e não têm carregamento próprio, então não há skeleton "de enfeite" nem espera artificial. No erro do mapa o painel volta ao normal. `aria-busy` no painel. Medidas sem token (título 144px, chip 55% da largura, rótulo 16px) são premissa. Pulso/brilho = motion, pendente. Ficha da praia: ainda sem desenho de skeleton; pendente.
- **Ponto de status desconhecido na busca (Figma 117:6459, Caio):** círculo de 8px cheio na cor `#8EA9B3` (`surface/unknown/default`), sem borda visível; antes era `surface/unknown/soft` com borda `border/strong`. Os pontos de Própria, Imprópria e Desatualizado seguem como estavam, a conferir com o design.

## Sessão 19c: sem degradê de rolagem e botão de busca "desabilitado" (Caio)

- **Degradê de rolagem removido** de todos os painéis (busca, ficha, Fonte, Classificação): apagados `scroll-fade.css`, `scroll-fade.ts` e o teste, e o atributo `data-scroll-fade`. Substitui a seção "Degradê de rolagem no rodapé" acima (e a pendência de motion dele).
- **Botão de busca com a busca aberta:** aparência de desabilitado (Figma 126:4529 e print de Caio): superfície padrão e ícone em `content/disabled`, sem hover. Com o painel aberto o botão não faz nada (`aria-disabled="true"`, mantém `aria-expanded`): fecha-se pelo "x" do painel ou Esc. Vale para qualquer botão preenchido que abre um painel (`controls`).

## Sessão 19d: bairro enquadra o mapa (Caio)

- **A cada clique em um bairro da busca**, o mapa enquadra (`fitBounds`, sem animação) todas as praias que a lista do bairro mostra, para o usuário ver de onde se trata. Evento `map-fit` (`slugs`) da busca para o mapa; `fitBeaches` no controlador. Mesmo padding de 64px e zoom máximo de enquadramento de grupo (`GROUP_FIT_MAX_ZOOM`). Se nenhuma dessas praias estiver no mapa, a câmera não mexe.
- **Mobile:** a folha da busca cobre a parte de baixo do mapa; o enquadramento soma a altura coberta ao padding de baixo, para as praias ficarem na parte visível, acima da folha. No desktop o mapa já encolhe ao lado do painel.
- A seta de voltar (sair da vista do bairro) não reenquadra o mapa; escolher uma praia da lista segue como antes (enquadra a praia).

## Sessão 20: ficha da praia no mobile em folha inferior + cartões de ponto clicáveis (Figma 125:3460, Caio)

- **Ficha mobile = folha inferior no mesmo padrão da busca:** colada embaixo, com borda de cima, **60% do palco** (Figma: 450px de 756px; sem token, premissa), conteúdo rolando por dentro (sem degradê). Cabeçalho e corpo com **padding 24 vertical e 16 lateral**; **16** entre título + subtítulo e o chip do boletim; área segura de baixo no corpo; alvo de toque do fechar de 44px (40px desenhados). Desktop não mudou.
- **Faixa de aviso (Desatualizado / Sem resultado) agora fica no topo do mapa também no mobile** (como no desktop, abaixo do cabeçalho do site), não mais dentro da folha. Com a folha por cima, o mapa continua visível acima dela.
- **Cartões de ponto clicáveis (pedido de Caio):** o cartão vira um botão: hover e foco (teclado) como os itens da busca (superfície `surface/hover`, foco com anel); clicar **escolhe o pin daquele ponto no mapa** (mesmo evento do clique no pin) e os outros cartões ficam a 50% (como antes). `aria-pressed` marca o escolhido. Clicar no pin continua esmaecendo os cartões. Valia no desktop e no mobile. Dentro do botão só há elementos em linha (o nome do ponto deixou de ser um `h3`).
- **Fora do que foi feito (pendente):** (1) botão "Ver detalhes" na ficha mobile: o Figma tem, mas a Classificação no mobile ainda não existe; (2) "Compartilhar praia" segue sem ação; (3) skeleton da ficha: a ficha só abre depois do mapa pronto e os dados são estáticos, então ele nunca apareceria; fica para quando houver um carregamento real. O Figma escreve "1 pontos de coleta" no subtítulo; mantido "1 ponto de coleta" (singular correto).
- **Ficha de praia com informação desconhecida (sessão 20b, Caio):** o subtítulo passa a mostrar "Bairro · Sem ponto de coleta" (praias de referência e sem ponto), igual à busca. A ficha de "Sem resultado" do Figma 125:3674 não trazia a contagem; segue o pedido atual.

## Sessão 20c — cartões de ponto a 80% e enquadramento ao escolher ponto

- Cartões de ponto não selecionados ficam a **80%** (antes 50%): são clicáveis, então não podem parecer apagados. No hover e no foco por teclado voltam a **100%**, sem transição (motion pendente).
- Clicar em um cartão de ponto escolhe o pin e **enquadra as localizações da praia** (`map-fit` com o slug), em vez de só trocar o pin. No mobile o enquadramento desconta a folha da ficha (`#panel`) além da busca (`#search`), para os pontos não ficarem atrás dela.

## Sessão 20d — seta de voltar na ficha aberta pela busca

- Ficha aberta **pela busca** mostra a seta de voltar ao lado do título (mesmo padrão de Fonte e como ler e da vista de bairro); aberta pelo mapa (pin ou cartão), não mostra.
- Voltar reabre a busca **como estava** (texto, bairro escolhido e lista), com o foco no resultado que foi aberto; a ficha sai. Escolher outra praia pelo mapa apaga a origem "busca".
- Evento `search-back` (index → busca); `fromSearch` fica em `index.astro`.

## Sessão 21: Classificação no mobile (folha inferior, imagem de Caio)

- **Classificação mobile = mesma folha da ficha** (60% do palco, borda no topo, rolagem por dentro), no lugar da ficha enquanto aberta. Cabeçalho e corpo com padding 24 vertical e 16 lateral, área segura embaixo, alvo de toque do fechar de 44px. Mesmo componente do desktop, só com `@media (max-width: 1023px)`.
- **"Ver detalhes" agora aparece na ficha mobile** e abre a Classificação; voltar devolve a ficha. A rolagem da folha volta ao topo a cada troca de vista.
- **Skeleton de carregamento (3º/4º quadros da imagem):** não feito; os dados são estáticos e ele nunca apareceria (ver sessão 20). Pendente para quando houver carregamento real.

## Sessão 21b: Fonte e como ler no mobile (folha inferior)

- Mesma folha da Classificação e da ficha: 60% do palco, borda no topo, rolagem por dentro, padding 24 vertical e 16 lateral, área segura embaixo, fechar com alvo de 44px. O link "Fonte e como ler" (cabeçalho e ficha) agora abre o painel também no mobile; voltar, fechar e Esc funcionam como no desktop. Desktop não mudou.
- Skeleton de carregamento (quadros de baixo da imagem): não feito, mesma razão da sessão 20.

## Sessão 22: reagrupar ao afastar o zoom e nomes por espaço livre (Caio)

- **Grupo aberto volta a ser um marcador só ao afastar o zoom**, mesmo se aberto por clique ou seleção (antes ficava aberto em qualquer zoom e deixava pins do mesmo local soltos e sobrepostos). Regra em `isGroupOpen` (`spread.ts`): aberto por pedido enquanto os pontos estão a 32 px ou mais na tela (`GROUP_KEEP_OPEN_MIN_SPREAD_PX`, premissa: ~ largura do ícone + folga) ou no zoom de enquadramento (17+); sem pedido, 56 px como antes. A praia selecionada que se fecha mostra o marcador agrupado em estado selecionado.
- **Nomes por espaço, não por zoom fixo:** `pickLabels` (`label-visibility.ts`) escolhe, a partir do zoom 11 (`LABEL_FLOOR_ZOOM`, premissa; substitui o 13 fixo), os nomes que cabem sem cobrir outro nome nem outro ícone. Prioridade: Imprópria, Sem resultado, Desatualizada, Própria; selecionado/foco/hover primeiro. Medido com a fonte real do rótulo; recalculado em zoom e ao fim do movimento. Pins numerados continuam sem nome fixo.

## Sessão 23: motion de abrir e fechar a busca (Figma 187:3839)

- **Valores lidos do Figma** (chaves do protótipo, não variáveis): painel `translateX 477→0`, 1300 ms, atraso 400 ms; camada azul de fundo (`surface/accent`, Frame 117) `473→0`, 1500 ms, atraso 200 ms; linha do cabeçalho 1440→1384 px (menos a largura do botão), 418 ms, atraso ≈304 ms. Curvas `0.645,0.045,0.355,1` (painel e camada) e `0.64,0.05,0.35,1` (linha). Tokens `--motion-*` em `tokens/extra.json` (tipos novos `duration` e `cubicBezier` em `to-css.ts`); os nomes são nossos, os valores do Figma.
- **Fechamento = inverso literal** (confirmado por Caio): painel e camada saem juntos com atraso 0 e as mesmas durações; a linha volta no fim (atraso 978 ms = 1700 − 304 − 418) com a curva espelhada `0.65,0,0.36,0.95` (derivada; a curva do painel é simétrica). O painel só é escondido ao fim de 1500 ms.
- **Derivações:** a camada começa 4 px visível (473 de 477 = `border-width.accent`, token). A largura da linha não é animada: `clip-path` na `::after` (a borda fica transparente), sem reflow. Mobile (Figma não cobre): folha `translateY(100%→0)` com os mesmos tokens, sem camada azul.
- **Troca de painel sem animar:** escolher marcador/praia ou abrir Fonte e como ler tira a busca na hora (evento `search-dismiss`), para nunca haver dois painéis lado a lado durante a saída. Só o fechar pelo "x" e Esc animam.
- **Movimento reduzido (proposta):** sem transição nenhuma; o painel aparece e some na hora, mesmo estado final. Foco ao abrir/fechar não depende da animação; durante a saída o painel fica `inert`.

- **Correção (Caio): o mapa acompanha a abertura.** A camada azul não é só um deslize: é a própria coluna da busca, que cresce de 4px a 477px (`width`, mesmos 1500 ms, atraso 200 ms e curva), empurrando o mapa; o painel (477px, ancorado à direita) desliza por cima, recortado pela coluna. O fechamento é o inverso e o mapa volta a ocupar o espaço aos poucos. Troca deliberada de `transform` por `width` nesta coluna (causa reflow); o mapa já redimensiona o canvas a cada quadro via ResizeObserver.
- **Correção 2 (Caio):** (a) o foco no campo rolava a coluna (`overflow: hidden` rola) e empurrava o painel por cima da camada azul; agora `overflow: clip`. (b) Durante a abertura o mapa encolhia a cada quadro e o recálculo de limites/zoom mínimo dava zoom e fazia o mapa \"sumir\": agora só o canvas redimensiona a cada quadro e limites e zoom mínimo são recalculados 120 ms depois que o tamanho assenta (`controller.ts`).
- **Mudança (Caio): a busca sobrepõe o mapa em vez de empurrá-lo.** Substitui a "Correção" acima sobre empurrar. A coluna (camada azul + painel) sai do fluxo (`position: absolute`, direita, `z-index` 3) e continua animando `width` 4px → 477px com os mesmos tempos; o mapa não é redimensionado. Pedido de Caio: a câmera se adapta à área visível à esquerda, e os botões de zoom e ajustar andam para a esquerda com a coluna, 16px (`--space-stack-md`) entre eles e o painel (`right` 24px → 477px + 16px, mesmos tempos e curva; sem transição com movimento reduzido).
- **Câmera na área visível (derivado, sem valor no Figma):** o controlador recebe `getCoveredRight()` (largura do `#search` quando aberto no desktop) e soma ao `padding.right` de `fit`, grupo, `focusBeach` e `fitBeaches`; `easeTo` ao ponto usa `offset` de metade da largura coberta. Ao abrir a busca, se a praia selecionada ficar escondida, `revealSelected` leva-a à área visível com a duração, o atraso e a curva do painel (curva lida do token por `cubic-bezier.ts`); se já aparece, a câmera não se mexe, e ao fechar não volta sozinha. Limitação: o zoom mínimo é o do mapa inteiro, então "ajustar à tela" com a busca aberta pode não caber todos os pontos na área visível.

## Sessão 23b: hover dos botões e estado do botão de busca (Caio)

- **Hover:** `duration-hover` 300 ms e `easing-hover` `0.42, 0, 0.58, 1`, valores dados por Caio (tokens em `tokens/extra.json`). Aplicado em `Button` e `ButtonIcon` a `background-color`, `border-color` e `color`; sem transição com movimento reduzido. A troca para a aparência de desabilitado do botão de busca usa a mesma transição (suave, como o hover).
- **Botão de busca no tempo da animação:** a aparência desabilitada (`data-engaged`, em vez de `aria-expanded`) liga quando o painel branco está 50% em cena (atraso 400 ms + 650 ms; a curva do painel está a ~52% no meio do tempo, diferença desprezível) e, na saída, volta a `filled` também com o painel a 50% em cena (650 ms depois de fechar; ajuste de Caio: mesmo padrão da entrada). `aria-expanded`/`aria-disabled` seguem mudando na hora, para leitores de tela. Medido: liga ~1060 ms após abrir; desliga ~650 ms após fechar. Troca de painel sem animar e movimento reduzido: na hora.

## Sessão 23c: um sidebar para todos os painéis (Caio)

- **Mesma animação em todos os sidebars:** busca, ficha, Classificação e Fonte e como ler passam a viver num único `#sidebar` (camada azul + painel) que sobrepõe o mapa e usa os tempos do Figma 187:3839. `src/lib/site/sidebar-shell.ts` observa o `hidden` dos painéis: abre o sidebar quando algum aparece e o fecha (saída animada) quando nenhum resta. No mobile o sidebar é transparente (`display: contents`) e as folhas inferiores seguem como antes.
- **Troca de conteúdo = dissolve, sem fechar:** com o sidebar aberto, ir de um painel a outro (ou de uma praia a outra) só troca o conteúdo: o que saiu vira um clone (fantasma) que dissolve por cima do novo. Ao fechar, o fantasma fica parado até o fim da saída, para o painel não deslizar vazio. Duração e curva do dissolve: Caio pediu "uma curva simples e rápida" sem valores; usei os do hover (300 ms, `0.42, 0, 0.58, 1`) em tokens próprios `duration-dissolve`/`easing-dissolve`.
- **Origem fora da tela (correção de Caio):** a camada azul não fica mais 4px visível parada no começo; parte de largura 0 (e o painel de `translateX(100%)`), na abertura e no fechamento. Substitui a derivação "473 de 477 = border-width.accent" da sessão 23.
- **Câmera suave (pedido de Caio):** clique no pin, escolher praia, cartão de ponto, ajustar e bairro movem o mapa com `easeTo`/`fitBounds` na curva do painel (`easing-panel`). Duração: a do painel (1300 ms), derivada (Caio só definiu a curva); botões de zoom +/− seguem instantâneos. Ao escolher praia/pin a ficha abre antes da câmera mexer, para ela contar com a área que o sidebar cobre.
- **Faixa branca sob o botão azul de busca:** a borda de baixo do cabeçalho (1px) é transparente e mostrava o fundo branco sob o botão quando a linha encolhe. Uma faixa de 1px sob a linha acompanha a cor do botão (azul; branca quando ele vira "desabilitado"), com a transição do hover.

## Sessão 23d: novos tempos e curva do Figma 187:3839 (Caio)

- **Valores relidos do Figma (animação revisada):** painel `translateX 477→0` com atraso 300 ms e duração 1500 ms; camada azul `473→0` com atraso 200 ms e duração 1500 ms; ambos com a curva `0.175, 0.885, 0.32, 0.99` (passa de 1: leve ultrapassagem, como no Figma). Linha do cabeçalho inalterada (atraso 304 ms, 418 ms, `0.64, 0.05, 0.35, 1`).
- **Fechamento = inverso literal:** atraso 0 e as mesmas durações, com a curva **espelhada** (`0.68, 0.01, 0.825, 0.115`, token `easing-panel-close`; antes a curva era simétrica e servia para os dois sentidos). Linha de volta com atraso 1078 ms (1800 − 304 − 418).
- **50% do painel:** a curva não é simétrica, então o botão de busca liga/desliga no instante em que a curva chega a 50% (`halfwayTime`, ~12% do tempo): ≈ 480 ms depois de abrir e ≈ 1320 ms depois de fechar.
- **Câmera:** usa a curva e a duração do painel (agora 1500 ms, com a leve ultrapassagem).

- **Ajuste (Caio): sem o "bounce" final.** O último ponto de controle da curva do painel passa de 1.1 para 0.99: `0.175, 0.885, 0.32, 0.99` (não ultrapassa mais 1). A curva de saída espelhada vira `0.68, 0.01, 0.825, 0.115`. Substitui a ultrapassagem descrita acima.

- **Ajuste (Caio): a saída usa a mesma curva, sem espelhar.** Painel e camada azul saem com `0.175, 0.885, 0.32, 0.99`, e a linha do cabeçalho com a mesma curva da entrada (`0.64, 0.05, 0.35, 1`). Os tokens `easing-panel-close` e `easing-header-line-close` foram removidos; atrasos e durações do fechamento seguem como no inverso (atraso 0; linha com atraso 1078 ms). O botão de busca volta a `filled` no mesmo instante de 50% da curva (~12% da duração, ≈ 180 ms depois de fechar). Substitui as curvas espelhadas citadas antes.

- **Ajuste (Caio): na saída, primeiro a surface (painel branco) e depois a camada azul.** Fechar é a linha do tempo da abertura de trás para frente: na abertura a camada começa em 200 ms e o painel em 300 ms (ambos 1500 ms); na saída o painel começa em 0 e a camada em 100 ms (1800 − 1700; token `delay-panel-surface-close`), com a mesma curva. O sidebar só some depois de 1600 ms (100 + 1500); os botões de zoom acompanham a camada.

## Sessão 23e: botão de Fonte e animação dos pins (Figma 204:7892, Caio)

- **Botão de informação desativado com a Fonte aberta**, igual ao de busca (ghost com ícone na cor desabilitada, sem hover): liga a 50% da curva do painel na entrada (≈ 487 ms) e desliga a 50% na saída (≈ 187 ms); com o sidebar já aberto (troca de painel), na hora. Lógica em `sidebar-shell.ts`.
- **Pins (valores do Figma, ciclo "boomerang" de 2 s = 1 s por sentido):** nome 1000 ms (opacidade 0 → 1 e distância ao ícone 0 → 8px, curva `0.175, 0.885, 0.32, 0.99`); hover do ícone `scale 1.15` em 500 ms (curva `0.17, 0.88, 0.32, 0.99`, escrita assim no Figma). Sentido contrário: mesma curva e mesmo tempo (pedido de Caio). Vale para todos os pins (ponto único, praia agrupada e pins numerados). Tokens `duration-pin-label`, `duration-pin-hover`, `easing-pin-label`, `easing-pin-hover`, `scale-pin-hover` (tipo novo `number` só para `motion.scale`).
- **Derivações:** o nome deixou de ocupar espaço no fluxo do marcador (agora fora do fluxo, sob o ícone, como a dica `peek`) para animar a distância sem inflar a área de clique do marcador; o nome fixo continua clicável (`pointer-events`), a dica não. O hover também vale para o foco do teclado. A dica (`peek`: nome ao passar o mouse com zoom afastado) continua existindo e usa a mesma animação; o Figma só mostra o hover sem nome como "só o ícone cresce", então se a dica não for desejada, é uma decisão a confirmar.

## Sessão 23f: troca suave do pin selecionado e sidebar no mobile (Caio)

- **Pin selecionado:** círculo e pino viram duas camadas (`.marker__disc`, `.marker__pin`) que se fundem (opacidade + escala 0,4 → 1, origem na base). O deslocamento do MapLibre ficou fixo na ponta do pino (`[0,-24]`) e os 12px do círculo normal são o `translate` CSS do marcador, que anima junto. Tempo e curva do hover do pin (500 ms, `easing-pin-hover`): o Figma não define a troca (derivado). O círculo mantém a cor do status ao sumir. Não é morph de path (os glifos são diferentes).
- **Mobile:** o sidebar passa a existir também abaixo de 1024px, na vertical (60% do palco): `::before` azul e o painel branco sobem de baixo com os mesmos tempos, atrasos e curva do desktop (entrada: azul 200 ms, branco 300 ms; saída: branco 0, azul 100 ms), com dissolve na troca de conteúdo. A busca no mobile deixa de ter animação própria. Perda aceita: a busca sem resultado não encolhe mais ao conteúdo (a folha tem sempre 60%).
- Pendente: a câmera do mapa no mobile ainda não se adapta à área acima da folha.

## Sessão 23g: clique no terreno, carregando e troca do pin mais rápida (Caio)

- **Clique no terreno do mapa:** fecha o painel aberto (ficha, Classificação ou Fonte) e desmarca o pin de uma vez (antes eram dois cliques). Com a busca aberta, o clique também a fecha (saída animada, sem devolver o foco ao botão).
- **Aviso "Carregando o mapa":** entra como o nome do pin (opacidade 0 → 1, de cima para baixo −8px → 0, 1000 ms, `easing-pin-label`); sai com o inverso, mesma curva e tempo. Sem animação com movimento reduzido.
- **Troca círculo ↔ pino:** acelerada de 500 para 250 ms (`duration-pin-select`, curva `easing-pin-hover`); o hover do ícone continua em 500 ms.

## Sessão 23h: câmera do mapa no mobile (Caio)

- A câmera passa a considerar o que o painel cobre nos dois eixos (`getCovered`: direita no desktop, embaixo no mobile = 60% do palco, igual à altura da folha em `index.astro`). Enquadrar, aproximar, escolher ponto pelo cartão e enquadrar bairro usam só a área visível (folga + deslocamento do centro).
- `map-fit` deixou de medir a folha pelo DOM (ela começa fora da tela e dava medida errada na abertura): usa a mesma regra dos outros movimentos.
- `revealSelected` (sidebar abrindo) não interrompe um movimento de câmera já em curso: antes ele sobrescrevia o enquadramento da escolha na busca, deixando o pin fora do lugar.

## Sessão 23i: troca do pin sem deslocamento e linha da navbar no mobile (Caio)

- **Pin:** o marcador não se desloca mais ao selecionar. O deslocamento do MapLibre voltou a ser o do círculo (`[0,-12]`) e o pino é uma camada que sobe 12px do círculo, com a ponta sempre sobre o ponto; só escala e opacidade animam (250 ms). Um `::before` do marcador selecionado leva o clique também à parte do pino acima da caixa.
- **Navbar no mobile:** a folha sobe de baixo, longe do botão; por isso a linha de baixo do cabeçalho não encolhe nem abre vão sob o botão (busca ou Fonte). Só o botão muda de estado. No desktop segue o Figma 187:3852. (Interpretação do pedido de Caio: a linha "indo para a esquerda" no mobile estava errada.)

## Sessão 23j: cartões de ponto, interação invertida (Caio)

- Na ficha com vários pontos, o cartão do pin escolhido fica a 50% e sem hover (cursor padrão): não há o que escolher nele. Os outros ficam a 100%, com hover animado (300 ms, tokens de hover; opacidade e fundo). Antes era o contrário (os outros a 80%). Interpretação da frase de Caio: "quem tiver selecionado" = o ponto escolhido.

- (Sessão 23j, Caio) Clique no terreno do mapa com a busca aberta também a fecha, como os outros painéis (evento `search-outside`; saída animada).

- (Sessão 23j, correção de Caio) Cartão do ponto escolhido: sem opacidade reduzida (todos a 100%); a borda cinza vira a borda do status (token de cada um, 300 ms), sem hover e sem clique (`data-current`, `pointer-events: none`). Substitui o item "50% e sem hover" acima.

### Sessão 23l: faixa de aviso, dissolve e zoom (motion)

- **Faixa de aviso (Sem resultado / Desatualizada):** desce de trás do cabeçalho (a faixa recorta no topo do palco), sem opacidade, 1000 ms na curva do nome do pin. Origem 8px acima da altura da faixa (a borda tracejada aparecia no começo). No desktop entra quando o painel chega a 50% do trajeto (atraso 300 ms + 50% da curva, ~590 ms; a curva é rápida no começo e muito longa no fim, esperar os 100% atrasava a faixa); no mobile (faixa no topo, painel embaixo) entra junto com o painel.
- **Saída:** a faixa sobe até -200% da altura (mesma curva); no desktop o painel começa a sair quando ela some atrás do cabeçalho (50% do trajeto, `halfwayTime`), sem esperar o fim. No mobile, saem juntos.
- **Dissolve da troca de conteúdo:** 300 → 150 ms (`duration-dissolve`), e passa a valer também para os estados da busca (sugestões, resultados, sem resultado, vista de bairro).
- **Zoom +/−:** suave, com o tempo e a curva da câmera (1500 ms, curva do painel).
- **Camada azul na faixa de aviso (sessão 23m):** como a do sidebar, atrás da faixa, com a mesma animação (cor `surface-accent-default`). Entra 100 ms à frente da faixa branca (300 − 200 ms, como no painel) e, na saída, vai embora 100 ms depois (atraso de saída da camada).
- **Largura da faixa (sessão 23n, desktop):** a faixa acompanha a largura do painel durante o movimento (transição de `right` com os tempos e a curva da camada azul do sidebar), em vez de pular para a largura final.
- **Fechar o painel com o pin marcado (sessão 23n):** o sidebar dispara `sidebar-close` e a câmera centraliza o pin na área toda do mapa (sem o recuo do painel), com o tempo e a curva da câmera. Clicar no terreno desmarca o pin, então não há movimento.

### Sessão 23o: faixa de carregamento do mapa

- **Substitui a pílula "Carregando o mapa…"** (Figma 117:4900) por uma faixa de 4px (`spacing-4`) de ponta a ponta, logo abaixo da navbar, com o azul de `surface-accent-default` avançando da esquerda para a direita. O texto vira só `aria-label` (leitor de tela). Pedido de Caio.
- **Avanço:** chega a 90% em 2500 ms (novo token `duration-load-progress`, curva do painel: rápida no começo, longa no fim) e espera o mapa; com o mapa pronto completa os 100% (300 ms, tempo e curva do hover), sobe para trás da navbar (1000 ms, curva da saída da faixa de aviso: até -200%, em vez de fade) e, junto, o mapa faz o zoom out.
- **Zoom out:** o mapa nasce 1 nível de zoom acima do enquadramento (metade da área visível; "50%" interpretado assim, `INTRO_ZOOM = 1` em `controller.ts`) e vai ao enquadramento com `fit()`: tempo e curva da câmera (1500 ms, curva do painel). Com movimento reduzido: sem animação (a faixa fica estática a 90% e some; o mapa já abre no enquadramento).
- O esqueleto da busca continua ligado ao `#map-loading` (some junto com a faixa).
- **Mapa só aparece com a faixa em 100% (sessão 23o):** o canvas fica invisível durante todo o avanço e é revelado (`data-revealed`) no instante em que a faixa completa, junto com o início do zoom out. A faixa sai subindo (até -200%) para trás da navbar.

### Sessão 24: publicação no GitHub Pages

- **Workflow** `.github/workflows/deploy-pages.yml`: a cada push na `main` (e manual) faz `npm ci`, `npm run build` e publica `dist/` com `actions/deploy-pages`. Endereço: `https://design-caiomarinho.github.io/praieros/`.
- **Base:** `astro.config.mjs` usa `base: '/praieros'` só quando `GITHUB_ACTIONS` está definido; em desenvolvimento e em build local o site continua na raiz. Favicon e link do logotipo usam `BASE_URL`; as fontes (`/fonts/…`) o Vite já prefixa.
- **Antes de divulgar (pendências do CLAUDE.md):** ler os Termos do OpenFreeMap e confirmar os termos de uso do site do Inema.
- **Ativação:** precisa ligar em Settings → Pages → Source: GitHub Actions (o token do workflow não consegue ativar sozinho). O repositório parece privado (a API pública devolve 404); Pages em repositório privado exige plano pago.

### Sessão 24b: auditoria do build de produção

- **Causa dos bugs só no GitHub Pages:** o CSS do build é minificado e reescreve `300ms` como `.3s` e `1500ms` como `1.5s`. O JS lia os tokens de tempo com `parseFloat` (leitura em ms) e passou a ver 0,3 ms e 1,5 ms: câmera instantânea, faixa de carregamento sem etapas (sem subida nem zoom out), atrasos do banner, fechamento do painel, dissolve e botão "engajado" todos sem espera.
- **Correção:** `cssTimeMs` (`src/lib/map/css-time.ts`, com testes) lê `ms`, `s` e número puro; todos os pontos do JS que liam tokens de tempo passam a usá-lo. **Regra:** nunca `parseFloat` em token de tempo; testar animações também no build (`npm run build` + `astro preview`), não só no `astro dev`.

### Sessão 24c: pin após os detalhes e compartilhar desativado

- **Pin ao fechar depois dos detalhes:** fechar a Classificação (X) encerra tudo e o pin volta ao normal; o clique no terreno sempre desmarca (mesmo sem `marked`). Fechar a ficha comum (X) continua mantendo o pin marcado, como já decidido.
- **Compartilhar desativado por enquanto:** o botão de ícone do cabeçalho e os botões "Compartilhar praia" (ficha e Classificação) ficam `disabled` (visual de desabilitado dos componentes) até a R6 ser implementada.

### Sessão 24d: folha inferior com destaque e alça (mobile)

- **Interação (pedido de Caio):** a folha começa com 60% do palco. Um gesto para cima (arrastar o dedo, roda) dá destaque à folha primeiro: ela cresce até o palco todo **sem rolar** o conteúdo (rolagem travada enquanto recolhida: `overflow-y: hidden`). Só depois o usuário rola. Com o conteúdo no topo no início do gesto, arrastar para baixo (ou roda para cima) recolhe a folha aos 60%, mapa à vista. Só expande se há o que rolar. Vale para ficha, Classificação, Fonte e busca.
- **Alça (drag handle):** botão no topo da folha (faixa de toque de 24 px, barra de 32×4 px, cor `neutral-300`): toque alterna; arrastar para cima expande e para baixo recolhe; `aria-expanded` e rótulo "Expandir o painel" / "Recolher o painel (ver o mapa)". Só no mobile.
- **Como:** `src/lib/site/sidebar-sheet.ts` liga `data-expanded` no `#sidebar`; a altura (60% → 100%) é transição CSS com o tempo e a curva da camada azul. Fechar o sidebar ou trocar de painel volta ao tamanho inicial. A câmera não acompanha o crescimento.
- **Rolagem só depois de fixar (sessão 24e):** enquanto a folha sobe (e depois de recolher), a rolagem do conteúdo fica travada; só libera quando a folha fixa na tela toda (`data-settled`, no `transitionend` da altura, com reserva de tempo). Ordem: arrasta primeiro, rola depois. A altura usa a mesma curva dos painéis (`easing-panel`, `cubic-bezier(.175,.885,.32,.99)`) e 1500 ms. Vale para toque (nativo ou emulado) e roda; no desktop em janela estreita, a alça também aceita arrastar com o mouse.
- **Zona de arraste só no topo (sessão 24f):** só a parte de cima da folha (alça + área do título, 72 px a partir do topo) controla o tamanho: arrastar para cima expande, para baixo recolhe (também com o conteúdo rolado). Fora dela o gesto é a rolagem normal do conteúdo, inclusive com a folha recolhida. Botões e campos (fechar, voltar, busca) não iniciam arraste. A rolagem só trava enquanto a folha se move (`data-moving`, até o fim da transição). Substitui o "gesto para cima em qualquer ponto expande" da sessão 24d.

### Sessão 25: tempos padronizados em 800 ms

- **Pedido de Caio (acelerar):** painel branco, camada azul do sidebar (inclui a altura da folha e a largura do banner) e câmera do mapa passam de 1500 ms para **800 ms**; banner de aviso e subida da faixa de carregamento, de 1000 ms para 800 ms (novo token `duration-banner`, separado do nome do pin, que segue em 1000 ms). A curva não muda.
- **Linha do cabeçalho:** acompanha o painel, então foi reduzida na mesma proporção (×800/1500): duração 418 → 223 ms, atraso de entrada 304 → 162 ms, atraso de saída 1078 → 575 ms.
- **Mantidos:** atrasos do painel (300 ms) e da camada azul (200 ms entrada, 100 ms saída), hover 300, dissolve 150, troca do pin 250, hover do pin 500, nome do pin 1000 e avanço da faixa de carregamento até 90% (2500 ms; é espera, não movimento). Os valores do Figma 187:3839 em `docs/motion.md` valem como histórico; os atuais estão em `tokens/extra.json`.

### Sessão 25b: alça de arraste interativa (mobile)

- A folha segue o dedo/mouse em tempo real na zona de arraste (altura entre 30% e 100% do palco, sem transição).
- Ao soltar: mais de 6% da altura acima do ponto de partida → completa até a tela toda; mais de 6% abaixo → volta aos 60%; menos que isso → mantém o estado; folha abaixo de 45% do palco → fecha o painel (mesmo efeito do X).
- O resto do movimento é animado (curva e tempo do painel) e a rolagem do conteúdo só libera quando termina (`data-moving`), subindo ou descendo.
- Limiares são constantes em `sidebar-sheet.ts` (`INTENT`, `DISMISS_BELOW`); valores assumidos, ajustáveis.

Correção (25b): ao fechar soltando muito abaixo, a folha fecha na altura em que foi solta (a altura não anima de volta aos 60%, o que embolava com a saída). O tamanho inicial volta quando o sidebar sai de cena.

Regra (25b): sem rolagem interna na posição de origem (60%) nem durante a animação, em todos os painéis (ficha, busca, Classificação, Fonte). O conteúdo só rola com a folha na tela toda e já fixada; voltando à origem, o conteúdo volta ao topo. (O seletor usa `:global`, pois os painéis são de outros componentes.)

Regra (25b): no mobile, com a folha na tela toda e já fixada, o cabeçalho ganha `data-sheet-top` e a linha de baixo some sob o botão ativo (busca ou Fonte), como no desktop, mas sem animação (encostou, sumiu). Ao começar a descer, a linha volta na hora.

Regra (25b): na origem (60%), um gesto para cima em qualquer ponto da folha (dedo, mouse ou roda para baixo) também pede a folha inteira: ela segue o dedo e completa, como pela alça. Gesto para baixo a partir do conteúdo não faz nada na origem. Com a folha inteira e fixada, fora da zona de arraste vale a rolagem normal. O clique gerado depois de arrastar a partir do conteúdo é ignorado.

Ajuste (25b): (1) na origem, o gesto de rolar para cima no conteúdo dispara a subida completa de uma vez (a folha não segue o dedo nesse caso); o arraste pela alça/zona do título continua seguindo o dedo. (2) A origem (60%) é o limite de baixo: a folha nunca fica menor; arrastar para baixo só volta à origem. Sem fechar por arraste (a animação de fechar com altura menor travava); fechar é pelo X ou clicando no mapa. Removidos `DISMISS_BELOW` e o fechamento por arraste.

Ajuste (25b): gestos da folha não podem virar "puxar para atualizar" do navegador. `overscroll-behavior: none` em `html` e `body`; `contain` nos painéis; `touch-action: none` na alça, na folha inteira na origem e durante o movimento. Com a folha inteira, o conteúdo rola normalmente (`auto`) e a zona do título é tratada por `preventDefault` em `sidebar-sheet.ts`. Verificado pelos estilos calculados; o comportamento real de toque precisa de conferência em aparelho.

Tempos (25c): animações das folhas (painel, camada azul e câmera) passam a 1000 ms. A altura da folha mobile (subir/descer pela alça e pelo gesto) fica em 800 ms, no novo token `motion.duration.sheet-drag`. Banner e faixa de carregamento seguem em 800 ms (o banner ainda acompanha a largura do painel).

Tempos (25d): painel, camada azul e câmera voltam ao valor anterior à padronização, 1500 ms (não 1400: era 1500 nos tokens). A altura da folha mobile no arraste segue em 800 ms (`sheet-drag`); banner e faixa de carregamento, 800 ms.

Desempenho no celular (25e): subir/descer a folha mobile animava `height` (recalcula o layout do conteúdo a cada quadro, o que travava em aparelhos reais). Agora a folha tem sempre a altura do palco e a origem (60% visível) é `translateY(40%)`; subir e descer anima só `transform`, com `will-change`, e o arraste também (`sidebar-sheet.ts`). `.stage` recorta a parte fora do palco no mobile. Mesmo tempo (`sheet-drag`, 800 ms) e mesma curva. Verificado no emulador; o ganho em aparelho real precisa de conferência.

## Sessão 26: atualização de tokens e componentes (design novo)

- Tokens (JSON novo do Figma): `surface.accent.hover` passa de `brand.600` para `brand.700`; `surface.indicator` sai (não era usado) e entra `surface.inverse` (`neutral.950`); novo `s-typo.label.small` (12 px, semibold, line 1). Resto dos tokens idêntico.
- Button (Figma 123:2668): alturas passam a 48 (medium) e 40 (small), por `2 x inset + 24` (medium: inset sm; small: inset xs na vertical e sm na horizontal). As telas existentes que usam Button ficam 8 px menores; ajuste de layout fica para o refino de cada tela.
- InputText (117:5370): altura 56 → 48 (padding vertical xs, horizontal md).
- Marcador do mapa (117:4522): nome do pin em `label.small`. Os 5 tipos (positivo, negativo, atenção, desconhecido tracejado, selecionado) já existiam.
- ButtonIcon (assets recebidos, Figma 30:99): SVGs de 20 px de `info`, `plus`, `minus`, `fit-screen` e `arrow-left` salvos em `src/icons/`. O ButtonIcon passa a 48 (medium) e 40 (xsmall) com ícone de 20 px. **Não foi fundido no Button**: depende de `controls`, `data-engaged` e do seletor `.btn-icon` em 4 painéis (zona de clique do fechar); fundir fica para uma sessão própria. Sobraram no Figma, sem uso ainda: check, list, question-mark, gps-fix, file, warning 20 px.

## Sessão 27: refino da tela de carregamento (Figma 117:4816)

- Header e busca: os cálculos de largura do botão (linha de baixo, encaixe com o painel, esqueleto do campo) estavam em 56 px (`inset-md`); passam a 48 px (`inset-sm`), como os botões do Figma.
- Faixa de carregamento: 16 px de altura (era 4). O movimento é sempre completo: 0 → 90% em 2500 ms (`load-progress`, curva `hover`, ease-in-out), e o último trecho 90% → 100% em 800 ms (`banner`). Com internet rápida, o mapa pronto antes da hora NÃO acelera a faixa: o fim espera a faixa chegar aos 90% (evento `animationend`); só então completa e o mapa aparece. Com internet lenta, a faixa espera em 90% até o mapa ficar pronto. Mínimo total ≈ 3,3 s. Reduzir movimento: sem animação, como antes.
- Controles de zoom: `medium` (48 px, ícones de 20 px), a 24 px do canto e 4 px entre si.

Sessão 27 (mapa carregado e erro): erro do mapa (Figma 117:4959) com a copy nova ("Tente de novo em instantes. Você ainda pode buscar a praia pelo nome."), título em 214 px (2 linhas), corpo em 280 px e botão "Tente novamente" em `medium` de 160 px. Pins: nome em `label.small` (feito na sessão 26); espaçamento do nome já igual ao do Figma 117:4522 (8 px do ícone, padding 8 e 4). Zoom em `medium` (48 px).

Sessão 28 (hover da busca, Figma 214:2880 e zoom 213:2549): o botão de busca do cabeçalho revela o texto "Busca" no hover (só com mouse) e no foco do teclado, via prop `reveal` do ButtonIcon (derivado do Button primary com ícone e texto do Figma; o ButtonIcon continua separado, ver sessão 26). A largura vai de 48 px ao conteúdo (~96 px) em 500 ms com a curva do pin (`pin-hover`); a coluna do texto anima de 0fr a 1fr (sem JS); o texto entra por opacidade em 150 ms (`dissolve`) com atraso de 100 ms, e sai primeiro, sem atraso. Não revela com o painel aberto (`aria-expanded` ou `data-engaged`) nem desabilitado. Reduzir movimento: sem transição. Texto visível `aria-hidden`; nome acessível segue "Buscar praia". Zoom: 40 px com 8 px de espaço (Figma 213:2549), confirmando a correção da sessão 27.

Ajuste (28): sem recorte no texto revelado (sem `overflow: hidden`): ele não fica cortado enquanto a largura abre, só entra por opacidade; `min-width: 0` mantém a coluna em 0fr.

## Sessão 29 — Painel de busca novo (Figma 213:3706 e 213:3802)

- Scroll indesejado fora do mapa: `html, body { height: 100%; overflow: hidden }`.
- Camada azul removida em todo o site; a entrada continua com as mesmas curvas e duração, agora sem atraso (`motion.delay.panel`, `panel-surface` e `panel-surface-close` = 0). A largura do sidebar e o deslize do conteúdo têm o mesmo tempo, então não há costura.
- Busca: cabeçalho só com título; campo e chip no corpo; bairros em botões de 48 px. A vista de resultados e a de bairro não têm Figma: mantêm o layout atual com o cabeçalho e o espaçamento novos (premissa).
- Botão de busca fechado mostra "Busca" no hover; com o painel aberto (desktop) mostra "Buscar" desabilitado (`revealEngaged`). A linha do cabeçalho não encolhe mais com a busca aberta.
- Botão azul ao abrir/fechar o painel: dissolve lento, novo token `motion.duration.engage` (700 ms, curva dissolve), também no texto.
- Mobile: alça flutuante de 64×5 (opacidade .3), 13 px acima da borda da folha. Tela cheia deixa 20 px de mapa no topo (`EXPANDED_GAP`), com o padding inferior compensado.
- Zoom no desktop: 24 px à esquerda do painel.
