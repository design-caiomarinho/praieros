# Tokens de design

Gerado por `npm run tokens:docs` a partir de `tokens/tokens.json` (espelho do Figma) e `tokens/code.json` (só do código). **Não editar à mão.**

- Dois níveis: **primitivos** (`primitives.*`, valores brutos) e **semânticos** (o resto, apontam para primitivos).
- No código usa-se sempre o semântico, pela variável CSS (`var(--color-surface-default)`). Primitivo só dentro de um token.
- A coluna **Usos** conta as ocorrências da variável em `src/`; `0` indica token sem uso no código.
- Valor solto (cor, espaço, fonte) não é permitido: ver `CLAUDE.md`.

## Cores semânticas

Mapa dos status: `positive` = Própria, `negative` = Imprópria, `neutral` = Sem resultado, `warning` = Boletim desatualizado, `accent` = destaque da marca. Status nunca é transmitido só por cor: sempre cor + texto (+ símbolo no mapa).

### Superfícies (fundos)

| Token                          | Variável                               | Valor       | Primitivo           | Usos | Papel                                              |
| ------------------------------ | -------------------------------------- | ----------- | ------------------- | ---- | -------------------------------------------------- |
| `surface.default`              | `--color-surface-default`              | `#fcfdfd`   | `neutral.50`        | 35   | Fundo padrão de telas, painéis e cartões           |
| `surface.muted`                | `--color-surface-muted`                | `#f3f6f7`   | `neutral.100`       | 13   | Fundo de apoio, mais suave que o padrão            |
| `surface.accent.soft`          | `--color-surface-accent-soft`          | `#b2d9ff`   | `brand.200`         | 7    | destaque da marca: fundo de chip                   |
| `surface.accent.subtle`        | `--color-surface-accent-subtle`        | `#d4e9ff`   | `brand.100`         | 4    | destaque da marca: fundo claro                     |
| `surface.accent.default`       | `--color-surface-accent-default`       | `#147dff`   | `brand.500`         | 8    | destaque da marca: cor cheia (marcador, badge)     |
| `surface.accent.hover`         | `--color-surface-accent-hover`         | `#0054ff`   | `brand.700`         | 2    | destaque da marca: hover                           |
| `surface.accent.translucent`   | `--color-surface-accent-translucent`   | `#00a6f44d` | `alpha.brand.300`   | 1    | destaque da marca: translúcida, sobre o mapa       |
| `surface.disabled`             | `--color-surface-disabled`             | `#f3f6f7`   | `neutral.100`       | 4    | Fundo de controles desabilitados                   |
| `surface.hover`                | `--color-surface-hover`                | `#f3f6f7`   | `neutral.100`       | 9    | Fundo de itens interativos no hover e no foco      |
| `surface.strong`               | `--color-surface-strong`               | `#e0e9eb`   | `neutral.200`       | 3    | Fundo de ênfase leve, acima de muted               |
| `surface.positive.subtle`      | `--color-surface-positive-subtle`      | `#dbfce7`   | `green.100`         | 0    | Própria: fundo claro                               |
| `surface.positive.soft`        | `--color-surface-positive-soft`        | `#b9f8cf`   | `green.200`         | 5    | Própria: fundo de chip                             |
| `surface.positive.default`     | `--color-surface-positive-default`     | `#05df72`   | `green.400`         | 3    | Própria: cor cheia (marcador, badge)               |
| `surface.positive.hover`       | `--color-surface-positive-hover`       | `#05df72`   | `green.400`         | 0    | Própria: hover                                     |
| `surface.positive.translucent` | `--color-surface-positive-translucent` | `#05df724d` | `alpha.green.300`   | 1    | Própria: translúcida, sobre o mapa                 |
| `surface.negative.subtle`      | `--color-surface-negative-subtle`      | `#ffe2e2`   | `red.100`           | 0    | Imprópria: fundo claro                             |
| `surface.negative.soft`        | `--color-surface-negative-soft`        | `#ffc9c9`   | `red.200`           | 1    | Imprópria: fundo de chip                           |
| `surface.negative.default`     | `--color-surface-negative-default`     | `#ff6467`   | `red.400`           | 3    | Imprópria: cor cheia (marcador, badge)             |
| `surface.negative.hover`       | `--color-surface-negative-hover`       | `#ff6467`   | `red.400`           | 0    | Imprópria: hover                                   |
| `surface.negative.translucent` | `--color-surface-negative-translucent` | `#fb2c364d` | `alpha.red.300`     | 1    | Imprópria: translúcida, sobre o mapa               |
| `surface.neutral.subtle`       | `--color-surface-neutral-subtle`       | `#f3f6f7`   | `neutral.100`       | 0    | Sem resultado: fundo claro                         |
| `surface.neutral.soft`         | `--color-surface-neutral-soft`         | `#e0e9eb`   | `neutral.200`       | 2    | Sem resultado: fundo de chip                       |
| `surface.neutral.default`      | `--color-surface-neutral-default`      | `#8ea9b3`   | `neutral.400`       | 4    | Sem resultado: cor cheia (marcador, badge)         |
| `surface.neutral.hover`        | `--color-surface-neutral-hover`        | `#8ea9b3`   | `neutral.400`       | 0    | Sem resultado: hover                               |
| `surface.neutral.translucent`  | `--color-surface-neutral-translucent`  | `#8ea9b34d` | `alpha.neutral.300` | 1    | Sem resultado: translúcida, sobre o mapa           |
| `surface.inverse`              | `--color-surface-inverse`              | `#1f272d`   | `neutral.950`       | 1    | Fundo escuro, de contraste invertido               |
| `surface.warning.subtle`       | `--color-surface-warning-subtle`       | `#fef3c6`   | `amber.100`         | 3    | Boletim desatualizado: fundo claro                 |
| `surface.warning.soft`         | `--color-surface-warning-soft`         | `#fee685`   | `amber.200`         | 5    | Boletim desatualizado: fundo de chip               |
| `surface.warning.default`      | `--color-surface-warning-default`      | `#ffb900`   | `amber.400`         | 3    | Boletim desatualizado: cor cheia (marcador, badge) |
| `surface.warning.translucent`  | `--color-surface-warning-translucent`  | `#fe9a004d` | `alpha.amber.300`   | 1    | Boletim desatualizado: translúcida, sobre o mapa   |

### Bordas

| Token             | Variável                  | Valor     | Primitivo     | Usos | Papel                                        |
| ----------------- | ------------------------- | --------- | ------------- | ---- | -------------------------------------------- |
| `border.default`  | `--color-border-default`  | `#e0e9eb` | `neutral.200` | 46   | Borda padrão de cartões, campos e divisórias |
| `border.inverse`  | `--color-border-inverse`  | `#fcfdfd` | `neutral.50`  | 0    | Borda sobre fundo escuro                     |
| `border.accent`   | `--color-border-accent`   | `#147dff` | `brand.500`   | 9    | Borda de destaque da marca                   |
| `border.disabled` | `--color-border-disabled` | `#e0e9eb` | `neutral.200` | 3    | Borda de controles desabilitados             |
| `border.focus`    | `--color-border-focus`    | `#0a2461` | `brand.950`   | 10   | Anel de foco (só teclado)                    |
| `border.strong`   | `--color-border-strong`   | `#8ea9b3` | `neutral.400` | 4    | Borda de ênfase                              |
| `border.positive` | `--color-border-positive` | `#00c950` | `green.500`   | 7    | Borda de Própria                             |
| `border.negative` | `--color-border-negative` | `#fb2c36` | `red.500`     | 6    | Borda de Imprópria                           |
| `border.neutral`  | `--color-border-neutral`  | `#557885` | `neutral.500` | 4    | Borda de Sem resultado                       |
| `border.warning`  | `--color-border-warning`  | `#fe9a00` | `amber.500`   | 10   | Borda de Boletim desatualizado               |

### Conteúdo (texto e ícones)

| Token               | Variável                    | Valor     | Primitivo     | Usos | Papel                                  |
| ------------------- | --------------------------- | --------- | ------------- | ---- | -------------------------------------- |
| `content.primary`   | `--color-content-primary`   | `#343e45` | `neutral.900` | 29   | Texto principal                        |
| `content.accent`    | `--color-content-accent`    | `#083aa0` | `brand.900`   | 6    | Texto e ícone de destaque da marca     |
| `content.secondary` | `--color-content-secondary` | `#496471` | `neutral.600` | 22   | Texto de apoio                         |
| `content.muted`     | `--color-content-muted`     | `#557885` | `neutral.500` | 9    | Texto discreto (legendas, metadados)   |
| `content.disabled`  | `--color-content-disabled`  | `#c1d2d7` | `neutral.300` | 10   | Texto e ícone desabilitados            |
| `content.on-accent` | `--color-content-on-accent` | `#ecf6ff` | `brand.50`    | 5    | Texto e ícone sobre a cor de destaque  |
| `content.inverse`   | `--color-content-inverse`   | `#fcfdfd` | `neutral.50`  | 0    | Texto sobre fundo escuro               |
| `content.positive`  | `--color-content-positive`  | `#0d542b` | `green.900`   | 5    | Texto e ícone de Própria               |
| `content.negative`  | `--color-content-negative`  | `#82181a` | `red.900`     | 5    | Texto e ícone de Imprópria             |
| `content.neutral`   | `--color-content-neutral`   | `#343e45` | `neutral.900` | 2    | Texto e ícone de Sem resultado         |
| `content.warning`   | `--color-content-warning`   | `#7a3306` | `amber.900`   | 8    | Texto e ícone de Boletim desatualizado |

## Tipografia

| Estilo           | Família | Peso     | Tamanho | Altura de linha | Espaço entre letras | Variáveis                 | Usos |
| ---------------- | ------- | -------- | ------- | --------------- | ------------------- | ------------------------- | ---- |
| `heading/xlarge` | Switzer | semibold | 40 px   | 1.1             | -2 %                | `--typo-heading-xlarge-*` | 0    |
| `heading/large`  | Switzer | semibold | 24 px   | 1.1             | -2 %                | `--typo-heading-large-*`  | 7    |
| `heading/medium` | Switzer | semibold | 20 px   | 1.1             | -2 %                | `--typo-heading-medium-*` | 53   |
| `body/large`     | Switzer | regular  | 18 px   | 1.5             | -1 %                | `--typo-body-large-*`     | 4    |
| `body/medium`    | Switzer | regular  | 16 px   | 1.5             | -1 %                | `--typo-body-medium-*`    | 84   |
| `body/small`     | Switzer | regular  | 14 px   | 1.5             | -1 %                | `--typo-body-small-*`     | 43   |
| `label/medium`   | Switzer | semibold | 14 px   | 1               | 0 %                 | `--typo-label-medium-*`   | 26   |
| `label/small`    | Switzer | semibold | 12 px   | 1               | 0 %                 | `--typo-label-small-*`    | 4    |
| `caption/small`  | Switzer | medium   | 12 px   | 1.5             | 0 %                 | `--typo-caption-small-*`  | 20   |

Cada estilo tem cinco variáveis: `family`, `weight`, `size`, `line` e `spacing`. A altura de linha é multiplicador (1,1 = 110 %). No Figma, altura de linha e espaço entre letras em % são digitados à mão nos estilos de texto (variáveis não aceitam %).

### Primitivos de fonte

| Primitivo                     | Valor    |
| ----------------------------- | -------- |
| `font.size.12`                | 12 px    |
| `font.size.14`                | 14 px    |
| `font.size.16`                | 16 px    |
| `font.size.18`                | 18 px    |
| `font.size.20`                | 20 px    |
| `font.size.24`                | 24 px    |
| `font.size.28`                | 28 px    |
| `font.size.32`                | 32 px    |
| `font.size.40`                | 40 px    |
| `font.size.56`                | 56 px    |
| `font.weight.400`             | regular  |
| `font.weight.500`             | medium   |
| `font.weight.600`             | semibold |
| `font.line-height.100`        | 1        |
| `font.line-height.110`        | 1.1      |
| `font.line-height.150`        | 1.5      |
| `font.letter-spacing.tight`   | -1 %     |
| `font.letter-spacing.normal`  | 0 %      |
| `font.letter-spacing.tighter` | -2 %     |
| `font.family.headline`        | Switzer  |
| `font.family.body`            | Switzer  |

## Espaçamento

Escala única (4, 8, 12, 16, 24, 32, 40, 48 px) repetida em quatro papéis. O papel diz o uso; o número sai da escala.

- `inset`: padding (espaço interno de um elemento).
- `gap`: espaço entre itens de uma linha ou grade.
- `stack`: espaço entre itens empilhados na vertical.
- `inline`: espaço entre itens na horizontal, dentro de uma linha.

| Passo | Valor | Usos inset | Usos gap | Usos stack | Usos inline |
| ----- | ----- | ---------- | -------- | ---------- | ----------- |
| `2xs` | 4 px  | 7          | 0        | 8          | 1           |
| `xs`  | 8 px  | 16         | 16       | 19         | 0           |
| `sm`  | 12 px | 22         | 0        | 3          | 0           |
| `md`  | 16 px | 40         | 12       | 11         | 0           |
| `lg`  | 24 px | 32         | 3        | 4          | 0           |
| `xl`  | 32 px | 0          | 3        | 5          | 0           |
| `2xl` | 40 px | 2          | 0        | 1          | 0           |
| `3xl` | 48 px | 0          | 0        | 0          | 0           |

Variável: `--space-<papel>-<passo>` (ex.: `--space-inset-md`).

## Tamanhos, raio e borda

| Token                       | Variável                      | Valor  | Primitivo        | Usos |
| --------------------------- | ----------------------------- | ------ | ---------------- | ---- |
| `size.icon.sm`              | `--size-icon-sm`              | 16 px  | `spacing.16`     | 0    |
| `size.icon.md`              | `--size-icon-md`              | 20 px  | `spacing.20`     | 0    |
| `size.icon.lg`              | `--size-icon-lg`              | 24 px  | `spacing.24`     | 0    |
| `size.control.sm`           | `--size-control-sm`           | 40 px  | `spacing.40`     | 3    |
| `size.control.md`           | `--size-control-md`           | 48 px  | `spacing.48`     | 6    |
| `size.control.lg`           | `--size-control-lg`           | 56 px  | `spacing.56`     | 0    |
| `size.panel-width`          | `--size-panel-width`          | 477 px | só do código     | 15   |
| `size.share-preview-height` | `--size-share-preview-height` | 300 px | só do código     | 1    |
| `radius.full`               | `--radius-full`               | 999 px | `radius.999`     | 12   |
| `border-width.default`      | `--border-width-default`      | 1 px   | `border-width.1` | 71   |
| `border-width.accent`       | `--border-width-accent`       | 4 px   | `border-width.4` | 7    |

`size.icon.*` é o lado do ícone; `size.control.*` é a altura de botões e campos (small 40, medium 48). `size.panel-width` e `size.share-preview-height` são só do código (não existem no Figma).

## Opacidade

| Token                     | Variável                    | Valor | Usos |
| ------------------------- | --------------------------- | ----- | ---- |
| `motion.opacity.skeleton` | `--motion-opacity-skeleton` | 0.5   | 1    |
| `opacity.handle`          | `--opacity-handle`          | 0.3   | 1    |

## Movimento

Só do código (`tokens/code.json`). Catálogo das interações em `docs/motion.md`.

| Token                              | Variável                             | Valor                    | Primitivo                 | Usos |
| ---------------------------------- | ------------------------------------ | ------------------------ | ------------------------- | ---- |
| `motion.duration.panel`            | `--motion-duration-panel`            | 800 ms                   | `duration.800`            | 8    |
| `motion.duration.panel-surface`    | `--motion-duration-panel-surface`    | 800 ms                   | `duration.800`            | 4    |
| `motion.duration.sheet-drag`       | `--motion-duration-sheet-drag`       | 800 ms                   | `duration.800`            | 2    |
| `motion.duration.banner`           | `--motion-duration-banner`           | 800 ms                   | `duration.800`            | 8    |
| `motion.duration.header-line`      | `--motion-duration-header-line`      | 223 ms                   | `duration.223`            | 0    |
| `motion.duration.hover`            | `--motion-duration-hover`            | 300 ms                   | `duration.300`            | 11   |
| `motion.duration.dissolve`         | `--motion-duration-dissolve`         | 150 ms                   | `duration.150`            | 2    |
| `motion.duration.pin-label`        | `--motion-duration-pin-label`        | 500 ms                   | `duration.500`            | 5    |
| `motion.duration.pin-select`       | `--motion-duration-pin-select`       | 250 ms                   | `duration.250`            | 4    |
| `motion.duration.load-progress`    | `--motion-duration-load-progress`    | 2500 ms                  | `duration.2500`           | 3    |
| `motion.duration.pin-hover`        | `--motion-duration-pin-hover`        | 500 ms                   | `duration.500`            | 6    |
| `motion.duration.engage`           | `--motion-duration-engage`           | 700 ms                   | `duration.700`            | 3    |
| `motion.duration.skeleton`         | `--motion-duration-skeleton`         | 2000 ms                  | `duration.2000`           | 2    |
| `motion.delay.panel`               | `--motion-delay-panel`               | 0 ms                     | `duration.0`              | 4    |
| `motion.delay.panel-surface`       | `--motion-delay-panel-surface`       | 0 ms                     | `duration.0`              | 4    |
| `motion.delay.header-line`         | `--motion-delay-header-line`         | 162 ms                   | `duration.162`            | 0    |
| `motion.delay.header-line-close`   | `--motion-delay-header-line-close`   | 575 ms                   | `duration.575`            | 0    |
| `motion.delay.panel-surface-close` | `--motion-delay-panel-surface-close` | 0 ms                     | `duration.0`              | 5    |
| `motion.easing.panel`              | `--motion-easing-panel`              | 0.175, 0.885, 0.32, 0.99 | `easing.decelerate`       | 12   |
| `motion.easing.header-line`        | `--motion-easing-header-line`        | 0.64, 0.05, 0.35, 1      | `easing.emphasized`       | 0    |
| `motion.easing.hover`              | `--motion-easing-hover`              | 0.42, 0, 0.58, 1         | `easing.ease-in-out`      | 15   |
| `motion.easing.dissolve`           | `--motion-easing-dissolve`           | 0.42, 0, 0.58, 1         | `easing.ease-in-out`      | 4    |
| `motion.easing.pin-label`          | `--motion-easing-pin-label`          | 0.175, 0.885, 0.32, 0.99 | `easing.decelerate`       | 10   |
| `motion.easing.pin-hover`          | `--motion-easing-pin-hover`          | 0.17, 0.88, 0.32, 0.99   | `easing.decelerate-pin`   | 7    |
| `motion.easing.skeleton`           | `--motion-easing-skeleton`           | 0.4, 0, 0.6, 1           | `easing.ease-in-out-soft` | 2    |
| `motion.scale.pin-hover`           | `--motion-scale-pin-hover`           | 1.15                     | `scale.115`               | 1    |

## Fora dos tokens

- **Breakpoint:** 1024 px (desktop a partir de 1024 px, mobile abaixo). Está direto nas `@media`.
- **z-index:** valores locais nos componentes; não há escala global.
- **Alvo de toque:** no mobile os botões de ícone ganham área de toque maior por `::after` (ver `docs/decisions.md`).
