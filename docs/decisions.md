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
- **Textos (título e descrição da página):** registrados em `docs/copy.md`.

## Motion

- **Decisão:** o movimento é definido pelo designer no Figma (variáveis de duração e curva + quadro de especificação). O Claude Code só implementa o que estiver escrito lá, sem inventar valores.
- **Quando:** tokens e transições de fluxo depois da Fase 3 (fluxos); microinterações de componentes na Fase 4 (acabamento). Antes disso, nenhuma animação. Plano em `docs/motion.md`.
