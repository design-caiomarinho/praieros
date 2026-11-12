# Praieros

Site independente que apresenta o Boletim de Balneabilidade do Inema (praias de Salvador, BA) de forma clara. **Não tem vínculo com o Inema e não é canal oficial.**
Idioma do produto: pt-BR. Código, commits e nomes técnicos: inglês.

## Princípios inegociáveis

1. **Nunca inventar, corrigir ou "suavizar" um resultado.** O status exibido é exatamente o do boletim. Na dúvida, não exibir.
2. **Toda ficha mostra fonte e data do boletim** ("Boletim nº X · dd/mm/aaaa" + "Fonte: Inema").
3. **Status nunca é transmitido só por cor:** sempre cor + texto. Em elementos sem texto (como os marcadores do mapa) usar também um símbolo.
4. Dado de saúde: se a leitura do PDF falhar ou gerar dúvida, manter o último boletim válido e avisar. Nunca publicar dado lido com incerteza.

## Fonte de dados

- Página oficial: https://www.ba.gov.br/inema/iniciativas/qualidade-das-praias (atualizada semanalmente; **mostra só o boletim mais recente, sem arquivo de edições anteriores**).
- Um PDF por região. **Escopo de exibição:** só o litoral de Salvador (PDF "SALVADOR"). O PDF "BAÍA DE TODOS-OS-SANTOS" é lido e arquivado por inteiro, mas não é exibido (no boletim 37/2026 nenhum ponto dele é de Salvador; ver `docs/decisions.md`).
- **Os nomes dos arquivos não seguem padrão.** Nunca montar a URL: abrir a página e localizar o link pelo **rótulo** da região.
- O PDF tem texto extraível (não é imagem). Cada ponto traz código (ex.: `SSA IN 100`), local da coleta e categoria (Própria | Imprópria). As colunas são inferidas pela ordem do texto: **validar a leitura** (campos obrigatórios, nº de pontos, categoria reconhecida) antes de gravar. Confirmar na Fase 1 que o código do ponto é um identificador estável entre boletins.
- **Histórico é nosso:** cada boletim lido válido é salvo em `data/bulletins/` (JSON versionado no Git). R3 depende de comparar com o anterior. Se a leitura falhar, não sobrescrever (D4).
- A leitura roda em tarefa agendada (GitHub Actions); novo boletim válido dispara novo build do site.
- Pendente: confirmar termos de uso do site para reutilização e leitura automática.

## Modelo de dados

`Boletim` (região, nº/ano, data de emissão, url do PDF) → `Praia` (nome, bairro) → `Ponto` (código, descrição do local, posição aproximada) → `Resultado` (Própria | Imprópria, por ponto e boletim).
Uma praia pode ter 1 ou mais pontos. A posição no mapa é aproximada (informar isso na UI).
**O universo de praias não é só o boletim:** existem também as **praias de referência** (nome e posição do OpenStreetMap, em `data/catalog/reference-beaches.json`, sem ponto de coleta), que aparecem como "Sem resultado" (R4a). O resumo (D2) não as conta. Ver `docs/decisions.md`, sessão 10.

## Regras de negócio (fonte da verdade)

- **R1** Existe um **boletim atual**: o mais recente publicado no site oficial. Os dados vêm de **leitura automática** dos PDFs.
- **R2** Cada praia mostra o resultado do **último boletim em que apareceu**.
- **R3** **Desatualizada:** praia que já teve informação, mas **não aparece no boletim atual**. Mantém o último status conhecido (Própria/Imprópria), mostra a faixa de aviso e a **data do boletim em que apareceu pela última vez**. Só vira desatualizada quando sai um novo boletim; o tempo corrido não conta.
- **R4** **Sem resultado:** o boletim não traz informação utilizável da praia. Não exibir status nem faixa. Há **dois casos**: (a) a praia **nunca apareceu** em nenhum boletim lido; (b) a praia já teve resultado, mas **passou do limite D3** (antigo demais). No caso (b) mostrar só a **data da última análise**, nunca o status antigo.
- **R5** Cada **ponto de coleta** tem seu próprio badge no mapa (3 pontos = 3 badges) quando o grupo da praia está aberto (clique/seleção ou zoom aproximado). Fechado, a praia de 2+ pontos mostra um marcador só (pior status: Imprópria > Sem resultado > Própria; selo redondo com o total de pontos, igual para todos). Critério e constantes em `docs/decisions.md`.
- **R6** **Link compartilhado:** abre sempre o estado atual. A mensagem enviada (WhatsApp) fica como estava; a prévia leva status + data do boletim do momento do envio.
- **D1** Em listas e busca, a praia mostra o **pior status** dos pontos (sem o texto "N de M pontos impróprios", removido por decisão de Caio; ver `docs/decisions.md`, sessão 18). No mapa, cada ponto mantém o seu badge.
- **D2** O resumo (próprias / impróprias / sem resultado) conta **pontos**, e o rótulo deve dizer isso.
- **D3** Praia desatualizada por mais de **N boletins** consecutivos sem aparecer vira "Sem resultado". `N = 3`, constante configurável (`STALE_BULLETINS_LIMIT`). Valor a confirmar.
- **D4** Falha ou mudança de formato na leitura do PDF: manter o último boletim válido, registrar o erro e exibir aviso discreto. Não bloquear o site.
- **D5** Demora do site oficial em publicar: não marcar nada como desatualizado sem boletim novo.
- **D6 (opcional, Could Have)** Ao abrir link antigo: faixa "Você abriu um link do boletim de dd/mm. Este é o mais recente."

### Estados da ficha

| Situação                                  | Chip do ponto                     | Faixa                                                | Data exibida                                                                         |
| ----------------------------------------- | --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| No boletim atual, própria                 | Própria                           | Nenhuma                                              | Do boletim atual                                                                     |
| No boletim atual, imprópria               | Imprópria                         | Nenhuma                                              | Do boletim atual                                                                     |
| No boletim atual, sem informação          | Sem resultado                     | Nenhuma                                              | Do boletim atual                                                                     |
| Nunca apareceu em boletim                 | Sem resultado                     | Nenhuma                                              | Do boletim atual ("Esta praia não consta no boletim nº X.")                          |
| Antigo demais (> N boletins sem aparecer) | Sem resultado                     | Nenhuma                                              | Do boletim atual + "A última análise foi em dd/mm/aaaa, antiga demais para mostrar." |
| Fora do boletim atual, já teve resultado  | Último status (Própria/Imprópria) | "Boletim desatualizado. A situação pode ter mudado." | Do último boletim em que apareceu                                                    |

Implementar R1–R4 e D1–D3 como **funções puras** (sem I/O), com testes unitários cobrindo cada linha da tabela acima.

## Telas (escopo)

Mapa + painel · Busca (sugestões antes de digitar; resultados ao digitar) · Ficha da praia · Classificação · Fonte e como ler · Estados: carregando, erro, mapa indisponível, sem resultado de busca, praia não encontrada, desatualizada.
**Fora do escopo:** Resumo do boletim (desktop), não será feito. **Pendentes, para depois:** Compartilhar praia e Compartilhar site (botões já existem sem ação; a R6 vale quando forem feitos).
Layout: desktop = mapa + painel lateral; mobile = mapa + folha inferior. Medidas e detalhes vêm do Figma e de `tokens/tokens.json`.
**Design é a fonte visual.** O Figma é a referência; o wireframe antigo não é. Onde o design não define algo, decidir com bom senso e **registrar a decisão em `docs/decisions.md`**.

## Copy e terminologia

- Use exatamente: **Própria**, **Imprópria**, **Sem resultado**, **Boletim desatualizado**, **Ponto de coleta**.
- **Nomenclatura.** Código (arquivos, componentes, props, tipos, enums, funções, variáveis) em inglês; textos da interface em português. Arquivos de componentes em kebab-case, iguais ao Figma (`status-chip.astro`); a maiúscula só na importação (`import StatusChip from './status-chip.astro'`). Status no código: `suitable | unsuitable | outdated | no-result` (Própria, Imprópria, Desatualizado, Sem resultado); `outdated` só existe na interface (`ChipStatus`). O valor do boletim (`Category`: "Própria" | "Imprópria") fica em português, como vem do Inema e como é gravado em `data/bulletins/`; a conversão para o enum acontece só em `src/lib/rules/status.ts` (`categoryToStatus`). Comentários e descrições de testes seguem em português.
- Tom direto, sem culpar o usuário. Evitar "Oops". Erros dizem o que houve e o que fazer.
- Singular/plural correto ("0 ponto", "1 ponto", "3 pontos"; 0 no singular, como no concept da busca). Nomes de praia com capitalização do boletim.
- Textos oficiais (resolução CONAMA nº 274/2000) **não são reescritos**: só citados, com link.
- Os textos finais ficam em `docs/copy.md`. Não inventar copy nova sem registrar lá.

## Stack e comandos

- **Astro + TypeScript**, estilos em **CSS puro com variáveis** (tokens), mapa com **MapLibre GL**. Sem banco de dados nem servidor: dados em JSON versionado, hospedagem estática.
- Interatividade (mapa, busca) em componentes isolados; o resto é HTML/CSS estático. Evitar dependências novas sem registrar em `docs/decisions.md`.
- Pendente: provedor de tiles do mapa (plano gratuito e regras de uso).
- Comandos:
  - instalar: `npm install`
  - rodar: `npm run dev`
  - testar: `npm test` (Vitest; `npm run test:watch` em modo contínuo)
  - lint: `npm run lint` (ESLint); formatar: `npm run format` (Prettier)
  - tipos: `npm run check` (astro check)
  - build: `npm run build`

Tokens de design: `tokens/tokens.json` (fonte única). Não usar valores soltos de cor, espaçamento ou tipografia: sempre token.

## Como trabalhar neste repositório (economia de tokens)

- **Uma tarefa por sessão.** Uma fatia vertical pequena, terminada, testada e comitada. `/clear` ao trocar de assunto.
- **Planejar antes de codar** em qualquer tarefa que mexa em mais de 2 arquivos: propor plano curto e esperar aprovação.
- **Não ler o repositório inteiro.** Buscar com Grep/Glob e ler só os trechos necessários. Para pesquisa ampla, usar subagente (Explore) e trazer só o resumo.
- **Detalhes ficam em `docs/`**, não aqui. Ler `docs/*` só quando a tarefa pedir.
- **Dados de teste em fixtures** (`fixtures/`): PDFs e saídas de exemplo salvos. Nunca baixar o site oficial repetidamente.
- Não colar arquivos grandes, logs completos ou PDFs no chat. Mostrar só o erro relevante.
- Verificar o que foi feito rodando teste/lint/build antes de dizer que terminou.
- Commits pequenos e frequentes, mensagem no formato `tipo: resumo` (feat, fix, test, docs, refactor).
- Ao fim de cada fatia: atualizar a seção **Estado atual** abaixo (máx. 5 linhas).
- **Figma é estático e não tem todas as variações.** As telas do Figma são exemplos de preenchimento: o status ou o dado mostrado em uma tela não define o componente. Derive variações e estados pela lógica (regras de negócio, tabela de estados e concept), reutilizando componentes e tokens existentes, e registre cada premissa em `docs/decisions.md`. Quando faltar um valor visual que não existe nos tokens, use o token mais próximo para equilibrar o visual (2px vira 4px; em caso de empate, o maior), registre a premissa em `docs/decisions.md` e siga, sem parar para perguntar. Só PARE e pergunte quando faltar um asset (SVG, imagem).
- **Componentes sem nó no Figma** (alguns não foram componentizados de propósito; catálogo em `docs/components.md`). Leia só o nó que tiver (uma chamada), sem screenshots de telas inteiras, e use apenas tokens. Registre-o em `docs/components.md` como "Pendente de componentizar". Ao fim de cada sessão, liste os componentes novos "Pendentes de componentizar" para eu criá-los no Figma; depois da minha confirmação, mude a situação para "Componentizado" e a origem para o novo nó.
- Motion: ver docs/motion.md. Não implementar animações antes da fase indicada e não inventar valores.
- Rotinas de manutenção (git pull antes de começar, ingestão, falhas do workflow): `docs/maintenance.md`.

## Estado atual

Fase 0 concluída (setup). Fase 1, sessão 1 concluída: `src/lib/inema/fetch-bulletins.ts` acha os links por rótulo e baixa os PDFs sem lançar exceção; fixtures salvas em `fixtures/` (boletim de 06/11/2026).
Fixtures regeneráveis com `npm run fixtures:save` (acessa o site; uso raro).
Fase 1, sessão 2 concluída: leitura e validação dos PDFs (`ingest-bulletin.ts`), JSON gravado em `data/bulletins/` (`npm run bulletins:build`, só lê `fixtures/`). Código do ponto: único, estabilidade entre semanas ainda não confirmada.
Fase 1, sessão 3 concluída: R1–R4 e D1–D3 como funções puras em `src/lib/rules/` (identidade, renomeação e pendências em `docs/decisions.md`).
Fase 1, sessão 4 concluída: workflow diário `.github/workflows/ingest-bulletins.yml` (`npm run bulletins:ingest`), D4 por região; GITHUB_TOKEN não dispara outros workflows (ver `docs/decisions.md`).
Fase 2, sessão 1 concluída: `tokens/tokens.json` (do Figma, com aliases) e `src/styles/tokens.css` gerado por `npm run tokens:build`; pendências em `docs/decisions.md`.
Fase 2, sessão 2 (parcial): tokens do Figma + `tokens/extra.json`; `StatusChip` em `src/components/status-chip.astro`; página `/dev/components` só em dev. Faltam faixas e PointCard (aguardam links).
Fonte Switzer self-host (`public/fonts/`, `src/styles/fonts.css`); atribuição da licença dispensada por decisão (ver `docs/decisions.md`).
Nomenclatura em inglês padronizada (status `suitable | unsuitable | outdated | no-result`, arquivos em kebab-case).
Fase 2, sessão 3: `OutdatedBanner`, `NoResultBanner` e `PointCard` criados (pendentes de componentizar no Figma); valores assumidos em `docs/decisions.md`.
Fase 2, sessão 4: `Button`, `ButtonIcon`, `InputText` e `Icon` (SVGs em `src/icons/`) com todos os estados do Figma, foco só por teclado; vitrine em `/dev/components`.
Fase 2, sessão 5: `AppHeader` e `BeachPanel` (genérico, por props; desktop e mobile) em `/dev/components`; ícones compartilhar, fechar e link externo.
Fase 3, sessão 6: esqueleto da tela inicial (`base-layout`, `index.astro`: cabeçalho, mapa neutro, `<aside>` oculto; breakpoint 1024px; token `size.panel-width`). Sem mapa nem dados.
Fase 3, sessão 7: catálogo `data/catalog/salvador.json` (proposta do OpenStreetMap, `verified: false` só em dev; `npm run catalog:propose|validate|todo`) e camada de dados `src/lib/site/` (`buildSiteModel`). Pendências em `docs/catalog-todo.md`: conferir posições e bairros e preencher os descartes.
Fase 3, sessão 7b: propostas em 3 etapas (nome → Overpass → descrição) com `method`/`confidence` e critério "um candidato coerente" (nome compatível); 17 de 31 praias com proposta, 14 descartadas (motivos em `docs/catalog-todo.md`).
Fase 3, sessão 8a: mapa (MapLibre + OpenFreeMap, cores por tokens), um marcador por ponto, ficha real no painel, zoom e estados carregando/indisponível (textos do Figma em `docs/copy.md`). Em produção o mapa mostra só o que a regra de produção libera (ver sessão 8c).
Fase 3, sessão 8a-2: estilo Bright sem texto, cores por tokens, mapa limitado a Salvador (`maxBounds` + zoom mínimo, funções puras em `src/lib/map/`), atribuição no topo no mobile; fundo do mapa na cor do mar; botão ajustar à tela; regra de tokens ajustada.
Fase 3, sessão 8b: página `/dev/catalog-review` e endpoint `/dev/api/catalog` (só em `npm run dev`) para aprovar praias, arrastar pontos, posicionar e editar bairro (sugestão por consulta inversa do OSM); catálogo em schema v4 (`proposals`). Só essa página grava `verified: true`; o commit dos dados é pedido por você.
Fase 3, sessão 8c/8d: posicionamento automático (`npm run catalog:place`, só OpenStreetMap, nunca memória nem Google, nunca grava `verified`). Nenhum ponto fica fora do mapa: nível g (geometria da praia) e, para o resto, níveis a–e do mais confiável ao menos (referências da descrição, nome da praia, bairro, interpolação pela ordem do boletim, último recurso no litoral), com verificações (polígono de Salvador, ≤150 m do litoral, 40 m entre pontos). **Regra de produção (substitui "só `verified: true`" e "geometria n/a nunca vai"):** aparecem todos os pontos `verified` ou `auto-placed`; a ficha avisa sempre "Posição aproximada" (g, a, b) ou "Posição muito aproximada" (c, d, e), textos provisórios. Nunca altera `verified`/`manual`. Conferência em `/dev/catalog-overview` (só dev, mostra o nível de cada ponto).
Fase 3, sessão 9: marcador por praia com selo com o total de pontos; grupo abre em pins numerados no clique ou quando os pontos ficam a 56 px ou mais na tela; nomes só a partir do zoom 13; funções puras em `src/lib/map/` com testes; folga do mapa maior (0,05°).
Fase 3, sessão 10: praias de referência do OSM (`npm run catalog:reference`, `reference-exclude.json`, lista de suspeitas de duplicata), `kind: 'reference'` nas regras, marcador "?" sem selo e ficha "não consta no boletim"; testes com boletins sintéticos de R3/R4b. Dados em `data/catalog/` ainda fora do commit.
Fase 3, sessão 11: painel lateral fiel ao Figma 123:2440 (aviso de chuva por regra pura, botões-linha), faixa de aviso no topo do mapa, sem texto de posição aproximada (pendência: avisar em "Fonte e como ler"), clique no grupo só dá zoom (ficha abre no pin). Ver `docs/decisions.md`.
Fase 3, sessão 12: busca desktop (`search-panel`, `src/lib/search/` com testes): sugestões por bairro do catálogo, resultados com D1, sem resultado provisório; "Perto de você" e mobile pendentes (ver `docs/decisions.md`).
Fase 3, sessão 13: bairro automático por polígono do OSM (`npm run catalog:neighborhoods`, níveis g/a/b, nunca grava `verified`); aparece em produção, com a tabela de nomes aprovada `data/catalog/neighborhood-names.json` (ver `docs/decisions.md`).
Fase 3, sessão 14: painel Classificação (desktop, só Própria; Imprópria pendente de texto), aberto por "Ver detalhes" na ficha. Ver `docs/decisions.md`.
Fase 3, sessão 15: painel Fonte e como ler (desktop, `source-panel.astro`, aberto pelo cabeçalho e pela ficha, créditos do mapa provisórios). Ver `docs/decisions.md`.
Sessão 16 (escopo, só docs): Resumo do boletim sai do escopo; Compartilhar praia/site ficam pendentes (R6 mantida); ver `docs/decisions.md`.
Sessões 18–19: busca em folha inferior no mobile (Figma 117:5257), vista de um bairro (seta, nome, sem campo), spacings novos, degradê de rolagem; ver `docs/decisions.md`.
Próxima: refinar o mobile (folha inferior, Classificação e Fonte no mobile) e depois o motion (`docs/motion.md`). Pendentes: ler os Termos do OpenFreeMap antes de publicar; termos de uso do site do Inema.
