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
