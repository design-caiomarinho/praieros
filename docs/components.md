# Catálogo de componentes

Situação no Figma: **Componentizado** ou **Pendente de componentizar** (existe no código, mas não como componente no Figma). Regra de trabalho no `CLAUDE.md`.

| Componente     | Estados                                                                                                 | Origem no Figma | Situação no Figma | Arquivo                                 |
| -------------- | ------------------------------------------------------------------------------------------------------- | --------------- | ----------------- | --------------------------------------- |
| StatusChip     | `suitable` (Própria), `unsuitable` (Imprópria), `outdated` (Desatualizado), `no-result` (Sem resultado) | Nó `37:626`     | Componentizado    | `src/components/status-chip.astro`      |
| OutdatedBanner | a criar                                                                                                 | a definir       | Não criado        | `src/components/outdated-banner.astro`  |
| NoResultBanner | a criar                                                                                                 | a definir       | Não criado        | `src/components/no-result-banner.astro` |
| PointCard      | a criar                                                                                                 | a definir       | Não criado        | `src/components/point-card.astro`       |

Página de teste (só em `npm run dev`): `/dev/components`.
