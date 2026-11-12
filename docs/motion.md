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

| Elemento                                                             | Gatilho      | O que anima                                                                                                                                        | Duração                | Curva                                                                       | Com movimento reduzido |
| -------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------- | ---------------------- |
| Painel de busca (desktop)                                            | Abrir        | `translateX(100% → 0)`                                                                                                                             | 1500 ms, atraso 300 ms | `easing-panel` (`0.175, 0.885, 0.32, 0.99`)                                 | Sem transição          |
| Coluna da busca com a camada azul de fundo (`.search-slot`, desktop) | Abrir        | `width` 4px → 477px, ancorada à direita, **sobrepondo** o mapa (fora do fluxo; o mapa não muda de tamanho)                                         | 1500 ms, atraso 200 ms | `easing-panel`                                                              | Sem transição          |
| Botões de zoom e ajustar (`.zoom`, desktop)                          | Abrir/fechar | `right` 24px → 477px + 16px, acompanhando a coluna (16px entre os botões e o painel)                                                               | como a coluna          | `easing-panel`                                                              | Sem transição          |
| Câmera do mapa (derivado)                                            | Abrir        | Praia selecionada escondida pelo painel: `easeTo` até a área visível; sem seleção ou já visível, não mexe                                          | 1500 ms, atraso 300 ms | `easing-panel`                                                              | Sem animação           |
| Linha do cabeçalho (`.header::after`)                                | Abrir        | `clip-path` encolhe 56 px à direita                                                                                                                | 418 ms, atraso 304 ms  | `easing-header-line`                                                        | Sem transição          |
| Os três acima                                                        | Fechar       | Inverso: o painel sai primeiro (atraso 0) e a camada azul depois (atraso 100 ms); linha volta com atraso 1078 ms; `.search` some ao fim de 1500 ms | mesmas durações        | mesma curva da entrada (`easing-panel`, `easing-header-line`; sem espelhar) | Some na hora           |
| Folha de busca (mobile, derivado)                                    | Abrir/fechar | `translateY(100% → 0)`, sem camada azul                                                                                                            | como o painel          | `easing-panel`                                                              | Sem transição          |

> **Tempos atuais (sessão 25):** painel, camada azul e câmera 800 ms; banner e faixa de carregamento 800 ms; linha do cabeçalho 223 ms (atrasos 162 e 575 ms). Os números abaixo são os originais do Figma; valem os tokens.

Tokens (`tokens/extra.json`, `--motion-*`): `duration-{panel,panel-surface,header-line,hover,dissolve,pin-label,pin-hover}`, `delay-{panel,panel-surface,panel-surface-close,header-line,header-line-close}`, `easing-{panel,header-line,hover,dissolve,pin-label,pin-hover}`. Valores do Figma 187:3839; derivações em `docs/decisions.md`.

| Botões (`Button`, `ButtonIcon`) | Hover, foco, selecionado, painel aberto | `background-color`, `border-color`, `color` | 300 ms (`duration-hover`) | `easing-hover` = `0.42, 0, 0.58, 1` (dado por Caio) | Sem transição |
| Botão de busca do cabeçalho (derivado) | Abrir/fechar a busca | Troca `filled` ↔ aparência desabilitada, com a transição do hover | Liga a 50% da entrada do painel (atraso 300 ms + o instante em que a curva chega a 50%); desliga na saída, também a 50% do painel em cena (curva de saída) | `easing-hover` | Muda na hora |

| Sidebar único (`#sidebar`: busca, ficha, Classificação e Fonte, desktop) | Abrir/fechar | Os mesmos tempos do painel e da camada azul acima, para todos os conteúdos; origem **fora da tela** (largura 0, painel `translateX(100%)`) | 1300/1500 ms | `easing-panel` | Sem transição |
| Troca de conteúdo com o sidebar aberto (derivado) | Busca → ficha, ficha → Classificação, → Fonte, outra praia | Não fecha nem reabre: o conteúdo que saiu (clone) dissolve por cima do novo | 150 ms (`duration-dissolve`) | `easing-dissolve` | Troca na hora |
| Câmera do mapa (derivado) | Clique no pin, escolher praia, cartão de ponto, ajustar, bairro | `easeTo`/`fitBounds` suaves até a área visível | duração do painel (1500 ms), sem atraso | `easing-panel` | Sem animação |

| Botão de informação (Fonte e como ler, desktop) | Abrir/fechar a Fonte | Aparência de desabilitado (`data-engaged`) como o de busca: liga a 50% do painel na entrada e desliga a 50% na saída; trocando de painel com o sidebar aberto, na hora | transição do hover (300 ms) | `easing-hover` | Muda na hora |
| Nome do pin (todos os pins) | Aparece/some (zoom, seleção, hover/foco) | Opacidade 0 → 1 e distância ao ícone 0 → 8px; no sentido contrário, mesma curva e mesmo tempo | 1000 ms (`duration-pin-label`) | `easing-pin-label` = `0.175, 0.885, 0.32, 0.99` | Sem transição |
| Ícone do pin (todos os pins, com ou sem nome) | Hover e foco do teclado | `scale(1 → 1.15)` (`scale-pin-hover`); ao sair, volta com a mesma curva e o mesmo tempo | 500 ms (`duration-pin-hover`) | `easing-pin-hover` = `0.17, 0.88, 0.32, 0.99` | Sem transição |
| Troca do pin ao selecionar (derivado) | Selecionar / desselecionar um pin | Círculo do status encolhe (1 → 0,4) e some enquanto o pino azul cresce da ponta (0,4 → 1) e o marcador sobe 12px (fusão entre duas camadas); o inverso ao desselecionar | 250 ms (`duration-pin-select`) | `easing-pin-hover` | Sem transição |
| Sidebar no mobile (folha inferior) | Abrir/fechar busca, ficha, Classificação, Fonte | Mesmo sidebar do desktop na vertical: camada azul e painel branco sobem de baixo (origem fora da tela); mesmos atrasos, durações e curva; troca de conteúdo = dissolve | idem desktop (painel 1500 ms/300 ms; camada 1500 ms/200 ms; saída: branco 0, azul 100 ms) | `easing-panel` | Sem animação |

Comportamento: `transform` e `clip-path` (a coluna anima `width` sobre o mapa; o mapa não é redimensionado, e a câmera usa só a área visível à esquerda: `padding.right` e `offset` do MapLibre = largura do painel); interrompível (reabrir durante a saída reverte a partir da posição atual); o foco vai ao campo ao abrir e volta ao botão ao fechar, sem esperar a animação; durante a saída o painel fica `inert`. Troca de painel (marcador, escolher praia, abrir Fonte) tira a busca na hora, sem animar.

### Pendente de motion

- **Esqueleto de carregamento** e **câmera do mapa** (voo até a praia): seguem pendentes.
- **Ficha, Classificação e Fonte** (abrir/fechar): ainda sem motion.

- **Brilho/pulso do skeleton da busca** (sessão 19): os blocos já existem, estáticos; falta duração, curva e movimento reduzido do Figma.
