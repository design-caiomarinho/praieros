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
