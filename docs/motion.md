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

| Elemento                                                             | Gatilho      | O que anima                                                                                                                      | Duração                | Curva                                                                  | Com movimento reduzido |
| -------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------- | ---------------------- |
| Painel de busca (desktop)                                            | Abrir        | `translateX(100% → 0)`                                                                                                           | 1300 ms, atraso 400 ms | `easing-panel`                                                         | Sem transição          |
| Coluna da busca com a camada azul de fundo (`.search-slot`, desktop) | Abrir        | `width` 4px → 477px, ancorada à direita; empurra o mapa, que se adapta a cada quadro (o canvas redimensiona pelo ResizeObserver) | 1500 ms, atraso 200 ms | `easing-panel`                                                         | Sem transição          |
| Linha do cabeçalho (`.header::after`)                                | Abrir        | `clip-path` encolhe 56 px à direita                                                                                              | 418 ms, atraso 304 ms  | `easing-header-line`                                                   | Sem transição          |
| Os três acima                                                        | Fechar       | Inverso: painel e camada saem juntos (atraso 0); linha volta com atraso 978 ms; `.search` some ao fim de 1500 ms                 | mesmas durações        | mesma `easing-panel`; linha com `easing-header-line-close` (espelhada) | Some na hora           |
| Folha de busca (mobile, derivado)                                    | Abrir/fechar | `translateY(100% → 0)`, sem camada azul                                                                                          | como o painel          | `easing-panel`                                                         | Sem transição          |

Tokens (`tokens/extra.json`, `--motion-*`): `duration-{panel,panel-surface,header-line}`, `delay-{panel,panel-surface,header-line,header-line-close}`, `easing-{panel,header-line,header-line-close}`. Valores do Figma 187:3839; derivações em `docs/decisions.md`.

Comportamento: `transform` e `clip-path` (a coluna anima `width`, de propósito: o mapa deve acompanhar o espaço); interrompível (reabrir durante a saída reverte a partir da posição atual); o foco vai ao campo ao abrir e volta ao botão ao fechar, sem esperar a animação; durante a saída o painel fica `inert`. Troca de painel (marcador, escolher praia, abrir Fonte) tira a busca na hora, sem animar.

### Pendente de motion

- **Esqueleto de carregamento** e **câmera do mapa** (voo até a praia): seguem pendentes.
- **Ficha, Classificação e Fonte** (abrir/fechar): ainda sem motion.

- **Brilho/pulso do skeleton da busca** (sessão 19): os blocos já existem, estáticos; falta duração, curva e movimento reduzido do Figma.
