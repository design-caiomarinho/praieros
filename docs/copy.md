# Copy

## Faixas de topo

| Componente     | Texto                                              | Origem                                                                                                   |
| -------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| OutdatedBanner | Boletim desatualizado. A situação pode ter mudado. | Figma, nó `132:8746`                                                                                     |
| NoResultBanner | Sem resultado. A praia não consta no boletim.      | Figma, nó `125:3786`, texto atualizado pelo nó `125:3674` (2026-11-12); vale também para "antiga demais" |

## Cabeçalho e ficha (sessão 5)

| Onde                                              | Texto                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Botões do cabeçalho (rótulo acessível)            | Compartilhar o site · Fonte e como ler · Buscar praia                                                              |
| Logo (link, texto oculto)                         | Praieros, página inicial                                                                                           |
| Painel                                            | Fechar ficha da praia · Ver detalhes · Compartilhar praia · Pontos de coleta · Como ler e fonte · Boletim original |
| Chip do boletim                                   | Boletim nº X · dd/mm/aaaa                                                                                          |
| Nota de rodapé                                    | Fonte: Inema · Praieros não é canal oficial                                                                        |
| Notas sob o chip (tabela de estados do CLAUDE.md) | Esta praia não consta no boletim nº X. · A última análise foi em dd/mm/aaaa, antiga demais para mostrar.           |
| Subtítulo                                         | bairro · N ponto(s) de coleta ("1 ponto de coleta", "3 pontos de coleta")                                          |

## Página inicial (sessão 6)

| Onde         | Texto                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Título       | Praieros · Balneabilidade das praias de Salvador                                                                                            |
| Descrição    | Boletim de balneabilidade do Inema para as praias de Salvador (BA), apresentado de forma clara. Site independente, sem vínculo com o Inema. |
| Região mapa  | Mapa das praias (aria-label)                                                                                                                |
| Região ficha | Ficha da praia (aria-label)                                                                                                                 |

## Mapa (sessão 8a)

| Onde                                               | Texto                                                                                          | Origem                                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Carregando (pílula)                                | Carregando o mapa…                                                                             | Figma 117:4816                                                                                           |
| Erro: título                                       | Não conseguimos carregar o mapa                                                                | Figma 117:4959                                                                                           |
| Erro: corpo                                        | Tente de novo ou busque uma praia pelo nome.                                                   | Figma 117:4959                                                                                           |
| Erro: botão                                        | Tente novamente                                                                                | Figma 117:4959                                                                                           |
| Zoom + (aria-label)                                | Aumentar o zoom                                                                                | Sem texto no Figma (derivado)                                                                            |
| Zoom − (aria-label)                                | Diminuir o zoom                                                                                | Sem texto no Figma (derivado)                                                                            |
| Marcador (aria-label)                              | Praia, Ponto de coleta N, status (desatualizado: "Boletim desatualizado, último resultado: X") | Derivado                                                                                                 |
| Ajustar à tela (aria-label)                        | Ajustar o mapa à tela                                                                          | Definido por Caio (sessão 8a-2)                                                                          |
| Aviso de posição: níveis g, a, b (cartão do ponto) | Posição aproximada                                                                             | Provisório (sessão 8d). Sempre visível. Definir com Caio e conferir no Figma                             |
| Aviso de posição: níveis c, d, e (cartão do ponto) | Posição muito aproximada                                                                       | Provisório (sessão 8d). Sempre visível, em destaque (cor de aviso). Definir com Caio e conferir no Figma |
| Marcador (aria-label), acréscimo                   | …, Posição aproximada / Posição muito aproximada                                               | Provisório (sessão 8d)                                                                                   |

## Praia de referência (sessão 10, provisório)

| Onde                             | Texto                                                             | Origem                                            |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| Nota da ficha                    | Esta praia não consta no boletim nº X.                            | Tabela de estados do CLAUDE.md (já existente)     |
| Chip da ficha (praia sem pontos) | Sem resultado                                                     | Terminologia fixa                                 |
| Marcador (aria-label)            | Praia, Praia fora do boletim, Sem resultado                       | Provisório (sessão 10). Sem "Ponto de coleta"     |
| Resumo do boletim (rótulo)       | N pontos de coleta (não inclui praias que não constam no boletim) | Provisório (sessão 10); a tela do resumo é futura |

| Aviso de chuva (ficha com ponto Própria) | Depois de chuva forte, a água pode piorar. Evite o banho e confira o próximo boletim. | Figma 123:2645 (texto do design, não do boletim). Regra em `docs/decisions.md`, sessão 11 |
| Botões da ficha | Ver detalhes · Compartilhar praia · Como ler e fonte · Boletim original | Figma 123:2440 |

Sessão 11: "Posição aproximada" e "Posição muito aproximada" (linhas acima) **não são mais exibidas** no cartão do ponto (decisão do Caio; o Figma não tem). O chip do boletim passou a "Boletim nº X · emitido em dd/mm/aaaa" (Figma 123:2445).

## Ficha sem resultado (Figma 125:3674, 2026-11-12)

| Onde                                     | Texto                                      | Observação                                                              |
| ---------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| Chip do boletim                          | Boletim não encontrado                     | Substitui "Boletim nº X · emitido em dd/mm/aaaa" na ficha sem resultado |
| Estado vazio, título                     | Sem resultado                              |                                                                         |
| Estado vazio, texto                      | Não há resultado do Inema para esta praia. |                                                                         |
| Nota "Esta praia não consta no boletim…" | Não exibida mais                           | A faixa já diz. Fica só a nota de "antiga demais" (R4b)                 |

## Busca (Figma 117:5075, 2026-11-12)

| Onde                                     | Texto                                                                      | Observação                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Título do painel                         | Buscar                                                                     | Figma                                                       |
| Chip do boletim                          | Boletim nº X · emitido em dd/mm/aaaa                                       | Figma; número e data do boletim atual                       |
| Campo (placeholder e rótulo acessível)   | Buscar praia                                                               | Figma                                                       |
| Rótulo da seção de sugestões             | Bairros                                                                    | Figma; os bairros vêm do catálogo (ver `docs/decisions.md`) |
| Fechar (rótulo acessível)                | Fechar busca                                                               | Provisório                                                  |
| Lista de resultados (rótulo acessível)   | Resultados da busca                                                        | Provisório                                                  |
| Item de resultado                        | Nome · bairro · "N ponto(s) de coleta" · chip de status                    | Derivado. Praia sem ponto: sem contagem                     |
| Item de resultado, D1                    | N de M pontos impróprios                                                   | Só com 2+ pontos e ao menos um impróprio                    |
| Item de resultado, desatualizada         | Boletim desatualizado                                                      | Texto existente; chip mostra o último status conhecido      |
| Sem resultado de busca, título           | Nenhuma praia encontrada                                                   | **Provisório** (sem frame no Figma); trocar quando houver   |
| Sem resultado de busca, texto            | Confira a escrita ou busque pelo bairro.                                   | **Provisório** (sem frame no Figma); trocar quando houver   |
| Anúncio para leitor de tela              | "N praias encontradas" / "1 praia encontrada" / "Nenhuma praia encontrada" | Provisório                                                  |
| "Perto de você · Usar minha localização" | Não implementado                                                           | Pendente do design (ver `docs/decisions.md`)                |
