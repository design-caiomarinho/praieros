# Praieros

**🇧🇷 Português** · [🇺🇸 English](#english)

Site independente que mostra o Boletim de Balneabilidade do Inema para as praias de Salvador (BA) de forma clara, em um mapa.

> **Aviso:** o Praieros não tem vínculo com o Inema e não é um canal oficial. Os dados vêm do boletim público do Inema. Para decisões importantes, consulte sempre o [boletim original](https://www.ba.gov.br/inema/iniciativas/qualidade-das-praias).

**Site:** https://praieros.design-caiomarinho.workers.dev/

## O problema

O Inema publica o boletim toda semana em PDF, um arquivo por região. Para saber se uma praia está própria ou imprópria para banho, a pessoa precisa abrir o PDF e procurar o ponto de coleta. O Praieros lê esse PDF e mostra o resultado de cada praia em um mapa, com a data do boletim e a fonte.

## Princípios

1. **Nunca inventar, corrigir ou "suavizar" um resultado.** O status exibido é exatamente o do boletim.
2. **Toda ficha mostra a fonte e a data do boletim.**
3. **O status nunca é transmitido só por cor.** Sempre cor, texto e, no mapa, um símbolo.
4. **Em caso de dúvida na leitura do PDF, o site mantém o último boletim válido** e avisa. Nunca publica um dado lido com incerteza.

## Como funciona

- Uma tarefa agendada (GitHub Actions, todo dia às 6h de Salvador) abre a página do Inema, acha os PDFs pelo rótulo da região e lê o texto.
- A leitura é validada (campos obrigatórios, número de pontos, categoria reconhecida). Se passar, o boletim vira um JSON versionado em `data/bulletins/`. Se falhar, nada é sobrescrito.
- As regras de negócio (boletim atual, praia desatualizada, "sem resultado") são **funções puras com testes**, em `src/lib/rules/`.
- O site é estático: não tem banco de dados nem servidor.

## Tecnologias

Astro, TypeScript, CSS puro com tokens de design (`tokens/tokens.json`, a mesma fonte do Figma), MapLibre GL, Vitest e ESLint. Mapa e tiles do [OpenFreeMap](https://openfreemap.org), dados do [OpenStreetMap](https://www.openstreetmap.org/copyright) e do Inema.

## Como rodar

Precisa de Node 22 ou mais novo.

```bash
npm install
npm run dev
```

Outros comandos:

```bash
npm test          # testes (Vitest)
npm run lint      # ESLint
npm run check     # tipos (astro check)
npm run build     # build estático em dist/
```

## Documentação

- [`docs/decisions.md`](docs/decisions.md): decisões de produto e de código, sessão por sessão.
- [`docs/tokens.md`](docs/tokens.md): tokens de design (cores, tipografia, espaçamento, movimento).
- [`docs/components.md`](docs/components.md): catálogo de componentes.
- [`docs/motion.md`](docs/motion.md): catálogo de animações.
- [`docs/copy.md`](docs/copy.md): textos da interface.
- [`docs/maintenance.md`](docs/maintenance.md): rotinas de manutenção e hospedagem.

## Créditos

Dados: [Inema](https://www.ba.gov.br/inema/iniciativas/qualidade-das-praias). Mapa: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, © [OpenMapTiles](https://openmaptiles.org), [OpenFreeMap](https://openfreemap.org).

---

<a id="english"></a>

**[🇧🇷 Português](#praieros)** · 🇺🇸 **English**

# Praieros

An independent website that shows the water quality bulletin from Inema for the beaches of Salvador (Bahia, Brazil) in a clear way, on a map.

> **Notice:** Praieros is not connected to Inema and is not an official channel. The data comes from Inema's public bulletin. For important decisions, always check the [original bulletin](https://www.ba.gov.br/inema/iniciativas/qualidade-das-praias).

**Website:** https://praieros.design-caiomarinho.workers.dev/

## The problem

Inema publishes the bulletin every week as a PDF, one file for each region. To know if a beach is safe for swimming, a person has to open the PDF and look for the sampling point. Praieros reads this PDF and shows the result of each beach on a map, with the bulletin date and the source.

## Principles

1. **Never invent, fix or "soften" a result.** The status on screen is exactly the one in the bulletin.
2. **Every beach page shows the source and the bulletin date.**
3. **Status is never shown by color alone.** Always color, text and, on the map, a symbol.
4. **If the PDF reading is in doubt, the site keeps the last valid bulletin** and shows a warning. It never publishes data that was read with doubt.

## How it works

- A scheduled job (GitHub Actions, every day at 6 a.m. in Salvador) opens the Inema page, finds the PDFs by the region label and reads the text.
- The reading is checked (required fields, number of points, known category). If it passes, the bulletin is saved as a versioned JSON file in `data/bulletins/`. If it fails, nothing is overwritten.
- The business rules (current bulletin, outdated beach, "no result") are **pure functions with tests**, in `src/lib/rules/`.
- The site is static: there is no database and no server.

## Tech

Astro, TypeScript, plain CSS with design tokens (`tokens/tokens.json`, the same source as Figma), MapLibre GL, Vitest and ESLint. Map and tiles from [OpenFreeMap](https://openfreemap.org), data from [OpenStreetMap](https://www.openstreetmap.org/copyright) and Inema.

## How to run

You need Node 22 or newer.

```bash
npm install
npm run dev
```

Other commands:

```bash
npm test          # tests (Vitest)
npm run lint      # ESLint
npm run check     # types (astro check)
npm run build     # static build in dist/
```

## Documentation

The docs are written in Portuguese.

- [`docs/decisions.md`](docs/decisions.md): product and code decisions, session by session.
- [`docs/tokens.md`](docs/tokens.md): design tokens (colors, typography, spacing, motion).
- [`docs/components.md`](docs/components.md): component catalog.
- [`docs/motion.md`](docs/motion.md): animation catalog.
- [`docs/copy.md`](docs/copy.md): interface texts.
- [`docs/maintenance.md`](docs/maintenance.md): maintenance routines and hosting.

## Credits

Data: [Inema](https://www.ba.gov.br/inema/iniciativas/qualidade-das-praias). Map: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, © [OpenMapTiles](https://openmaptiles.org), [OpenFreeMap](https://openfreemap.org).
