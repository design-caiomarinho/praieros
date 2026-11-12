## Plano de motion

Quem define o movimento: o designer, no Figma. O Claude Code cria os tokens e implementa a partir do que estiver escrito no Figma. Não inventar valores de duração, curva ou comportamento; se faltar, parar e perguntar.

### Quando

- Depois da Fase 3 (fluxos funcionando): tokens de motion e transições de fluxo (abrir e fechar o painel, folha inferior no mobile, marcador selecionado, mapa voando até a praia, carregamento).
- Na Fase 4 (acabamento): microinterações de componentes (hover, foco, clique, troca de estado de botões, busca, chip e cartão), junto de acessibilidade.
- Até lá, nenhuma sessão de código mexe com animação.

### O que o Figma deve ter antes de começar

1. Coleção de variáveis de motion: durações (ex.: duration/fast, duration/base, duration/slow, em ms) e curvas (ex.: easing/standard, easing/enter, easing/exit).
2. Um quadro de especificação com uma anotação por interação: elemento, gatilho, o que anima, duração e curva (usando os nomes das variáveis) e o comportamento com movimento reduzido.

O Claude Code não deve depender das interações de protótipo do Figma, porque não são lidas de forma confiável.

### Regras

- Tokens de motion entram em tokens/ (ou tokens/extra.json até existirem no Figma) e são gerados em CSS como os demais.
- CSS primeiro. JavaScript só onde for indispensável (gesto da folha inferior, voo do mapa). Evitar bibliotecas de animação.
- Respeitar prefers-reduced-motion em toda animação.
- Nada é transmitido só por movimento. Sem animações que pisquem ou prendam a atenção.

### Catálogo de interações

Tabela a preencher quando o motion for implementado:

| Elemento                                                             | Gatilho      | O que anima                                                                                                       | Duração                | Curva                                                                                                            | Com movimento reduzido |
| -------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Painel de busca (desktop)                                            | Abrir        | `translateX(100% → 0)`                                                                                            | 1500 ms, atraso 300 ms | `easing-panel` (`0.175, 0.885, 0.32, 1.1`)                                                                       | Sem transição          |
| Coluna da busca com a camada azul de fundo (`.search-slot`, desktop) | Abrir        | `width` 4px → 477px, ancorada à direita, **sobrepondo** o mapa (fora do fluxo; o mapa não muda de tamanho)        | 1500 ms, atraso 200 ms | `easing-panel`                                                                                                   | Sem transição          |
| Botões de zoom e ajustar (`.zoom`, desktop)                          | Abrir/fechar | `right` 24px → 477px + 16px, acompanhando a coluna (16px entre os botões e o painel)                              | como a coluna          | `easing-panel`                                                                                                   | Sem transição          |
| Câmera do mapa (derivado)                                            | Abrir        | Praia selecionada escondida pelo painel: `easeTo` até a área visível; sem seleção ou já visível, não mexe         | 1500 ms, atraso 300 ms | `easing-panel`                                                                                                   | Sem animação           |
| Linha do cabeçalho (`.header::after`)                                | Abrir        | `clip-path` encolhe 56 px à direita                                                                               | 418 ms, atraso 304 ms  | `easing-header-line`                                                                                             | Sem transição          |
| Os três acima                                                        | Fechar       | Inverso: painel e camada saem juntos (atraso 0); linha volta com atraso 1078 ms; `.search` some ao fim de 1500 ms | mesmas durações        | `easing-panel-close` (a espelhada: `0.68, -0.1, 0.825, 0.115`); linha com `easing-header-line-close` (espelhada) | Some na hora           |
| Folha de busca (mobile, derivado)                                    | Abrir/fechar | `translateY(100% → 0)`, sem camada azul                                                                           | como o painel          | `easing-panel`                                                                                                   | Sem transição          |

Tokens (`tokens/extra.json`, `--motion-*`): `duration-{panel,panel-surface,header-line,hover,dissolve}`, `delay-{panel,panel-surface,header-line,header-line-close}`, `easing-{panel,header-line,header-line-close,hover,dissolve}`. Valores do Figma 187:3839; derivações em `docs/decisions.md`.

| Botões (`Button`, `ButtonIcon`) | Hover, foco, selecionado, painel aberto | `background-color`, `border-color`, `color` | 300 ms (`duration-hover`) | `easing-hover` = `0.42, 0, 0.58, 1` (dado por Caio) | Sem transição |
| Botão de busca do cabeçalho (derivado) | Abrir/fechar a busca | Troca `filled` ↔ aparência desabilitada, com a transição do hover | Liga a 50% da entrada do painel (atraso 300 ms + o instante em que a curva chega a 50%); desliga na saída, também a 50% do painel em cena (curva de saída) | `easing-hover` | Muda na hora |

| Sidebar único (`#sidebar`: busca, ficha, Classificação e Fonte, desktop) | Abrir/fechar | Os mesmos tempos do painel e da camada azul acima, para todos os conteúdos; origem **fora da tela** (largura 0, painel `translateX(100%)`) | 1300/1500 ms | `easing-panel` | Sem transição |
| Troca de conteúdo com o sidebar aberto (derivado) | Busca → ficha, ficha → Classificação, → Fonte, outra praia | Não fecha nem reabre: o conteúdo que saiu (clone) dissolve por cima do novo | 300 ms (`duration-dissolve`) | `easing-dissolve` | Troca na hora |
| Câmera do mapa (derivado) | Clique no pin, escolher praia, cartão de ponto, ajustar, bairro | `easeTo`/`fitBounds` suaves até a área visível | duração do painel (1500 ms), sem atraso | `easing-panel` | Sem animação |

Comportamento: `transform` e `clip-path` (a coluna anima `width` sobre o mapa; o mapa não é redimensionado, e a câmera usa só a área visível à esquerda: `padding.right` e `offset` do MapLibre = largura do painel); interrompível (reabrir durante a saída reverte a partir da posição atual); o foco vai ao campo ao abrir e volta ao botão ao fechar, sem esperar a animação; durante a saída o painel fica `inert`. Troca de painel (marcador, escolher praia, abrir Fonte) tira a busca na hora, sem animar.

### Pendente de motion

- **Esqueleto de carregamento** e **câmera do mapa** (voo até a praia): seguem pendentes.
- **Ficha, Classificação e Fonte** (abrir/fechar): ainda sem motion.

- **Brilho/pulso do skeleton da busca** (sessão 19): os blocos já existem, estáticos; falta duração, curva e movimento reduzido do Figma.
