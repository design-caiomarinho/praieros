# Copy

## Faixas de topo

| Componente     | Texto                                                               | Origem                                                                      |
| -------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| OutdatedBanner | Boletim desatualizado. A situação pode ter mudado.                  | Figma, nó `132:8746`                                                        |
| NoResultBanner | Sem resultado. A praia não consta no boletim ou a análise é antiga. | Figma, nó `125:3786` (decisão de Caio em 2026-11-11: vale o texto do Figma) |

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
