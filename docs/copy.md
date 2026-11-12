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

| Onde                                      | Texto                                                                         | Observação                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Título do painel                          | Buscar                                                                        | Figma                                                       |
| Chip do boletim                           | Boletim nº X · emitido em dd/mm/aaaa                                          | Figma; número e data do boletim atual                       |
| Campo (placeholder e rótulo acessível)    | Buscar praia                                                                  | Figma                                                       |
| Rótulo da seção de sugestões              | Bairros                                                                       | Figma; os bairros vêm do catálogo (ver `docs/decisions.md`) |
| Praia sem ponto de coleta (item da busca) | Sem ponto de coleta                                                           | Decisão de Caio (sessão 19b)                                |
| Fechar (rótulo acessível)                 | Fechar busca                                                                  | Provisório                                                  |
| Lista de resultados (rótulo acessível)    | Resultados da busca                                                           | Provisório                                                  |
| Item de resultado                         | Nome · bairro · "N ponto(s) de coleta" · chip de status                       | Derivado. Praia sem ponto: sem contagem                     |
| Item de resultado, D1                     | N de M pontos impróprios                                                      | Só com 2+ pontos e ao menos um impróprio                    |
| Item de resultado, desatualizada          | Boletim desatualizado                                                         | Texto existente; chip mostra o último status conhecido      |
| Sem resultado de busca, título            | Não encontramos praias para “termo digitado”                                  | Figma (imagem enviada por Caio); usa o texto digitado       |
| Sem resultado de busca, texto             | Tente outro nome ou busque pelo bairro. Você também pode ver todas as praias. | Figma                                                       |
| Sem resultado de busca, botão             | Tente novamente                                                               | Limpa o campo e volta aos bairros                           |
| Anúncio para leitor de tela               | "N praias encontradas" / "1 praia encontrada" / "Nenhuma praia encontrada"    | Provisório                                                  |
| "Perto de você · Usar minha localização"  | Não implementado                                                              | Pendente do design (ver `docs/decisions.md`)                |

## Classificação (Figma 125:3895, 2026-11-12)

| Onde                             | Texto                                                                                                                                                                                          | Observação                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Título                           | Classificação                                                                                                                                                                                  | Figma                                                                                              |
| Subtítulo                        | O resultado vale para o ponto de coleta, segundo o critério da Resolução CONAMA nº 274/2000.                                                                                                   | Figma                                                                                              |
| Blocos                           | Na fonte · Em linguagem simples · Status                                                                                                                                                       | Figma                                                                                              |
| Na fonte (Própria)               | Águas consideradas próprias são aquelas em que a quantidade de bactérias indicadoras de contaminação fecal se mantém dentro dos limites definidos para o uso de recreação de contato primário. | Figma; texto da CONAMA, citado sem reescrever                                                      |
| Em linguagem simples (Própria)   | A análise mede a quantidade de bactérias de origem fecal na água. Neste ponto, o valor ficou abaixo do limite no dia da coleta. Depois de chuva forte, o resultado pode mudar.                 | Figma                                                                                              |
| Status (Própria)                 | A água ficou dentro do limite definido para o banho neste ponto, de acordo com a análise feita na coleta mais recente do boletim.                                                              | Figma                                                                                              |
| Botões e rodapé                  | Compartilhar praia · Ver resolução · Boletim original · Fonte: Inema · Praieros não é canal oficial                                                                                            | Figma                                                                                              |
| Rótulos acessíveis               | Voltar à ficha da praia · Fechar classificação · Classificação: {praia}                                                                                                                        | Derivados (não visíveis)                                                                           |
| Na fonte (Imprópria)             | Águas consideradas impróprias são aquelas que não atendem aos critérios definidos para o uso de recreação de contato primário.                                                                 | **Provisório**, escrito no tom do design (não é do Figma). Substituir pelo texto oficial se houver |
| Em linguagem simples (Imprópria) | A análise mede a quantidade de bactérias de origem fecal na água. Neste ponto, o resultado não atendeu ao critério no dia da coleta. O resultado pode mudar nos próximos boletins.             | **Provisório**                                                                                     |
| Status (Imprópria)               | A água não atendeu ao critério definido para o banho neste ponto, de acordo com a análise feita na coleta mais recente do boletim.                                                             | **Provisório**                                                                                     |
| Sem resultado, referência        | Não se aplica                                                                                                                                                                                  | A Classificação não é oferecida                                                                    |

## Fonte e como ler (Figma 126:4345)

| Elemento           | Texto                                                                                                                                                                           | Origem                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Título             | Fonte e como ler                                                                                                                                                                | Figma                                                             |
| Introdução         | Um jeito mais claro de ler o boletim de balneabilidade das praias de Salvador. Aqui você entende os termos do boletim e de onde vêm as informações.                             | Figma                                                             |
| Caixa              | O Praieros é independente. Não é um canal oficial e não tem vínculo com o Inema. Para consultar o documento original, use o link do boletim.                                    | Figma                                                             |
| Glossário          | Balneabilidade · Própria · Imprópria · Sem resultado (textos do Figma; o título do 4º termo segue a decisão da sessão 15)                                                       | Figma                                                             |
| Fontes e limites   | Fonte: Inema, Boletim de Balneabilidade nº {número}, emitido em {data}. · Posições no mapa · Data da coleta · Atualização (textos do Figma; número e data vêm do boletim atual) | Figma                                                             |
| Créditos do mapa   | Mapa: © OpenStreetMap contributors (https://www.openstreetmap.org/copyright) · © OpenMapTiles (https://openmaptiles.org) · OpenFreeMap (https://openfreemap.org)                | **Provisório** (linha exigida pelas licenças; não está no design) |
| Botão              | Boletim original                                                                                                                                                                | Figma                                                             |
| Rótulos acessíveis | Voltar · Fechar fonte e como ler · (abre em nova aba) nos links de crédito                                                                                                      | Derivados (não visíveis)                                          |
