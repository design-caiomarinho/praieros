# Catálogo de componentes

Situação no Figma: **Componentizado** ou **Pendente de componentizar** (existe no código, mas não como componente no Figma). Regra de trabalho no `CLAUDE.md`.

| Componente     | Estados                                                                                                                                         | Origem no Figma                         | Situação no Figma         | Arquivo                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------- | --------------------------------------- |
| StatusChip     | `suitable` (Própria), `unsuitable` (Imprópria), `outdated` (Desatualizado), `no-result` (Sem resultado)                                         | Nó `37:626`                             | Componentizado            | `src/components/status-chip.astro`      |
| OutdatedBanner | única                                                                                                                                           | Nó `132:8746` (frame)                   | Pendente de componentizar | `src/components/outdated-banner.astro`  |
| NoResultBanner | única                                                                                                                                           | Nó `125:3786` (frame)                   | Pendente de componentizar | `src/components/no-result-banner.astro` |
| PointCard      | `suitable`, `unsuitable`, `outdated`, `no-result` (só `no-result` existe no Figma; borda lateral das outras segue os tokens de borda do status) | Nó `125:3704` (frame, estado no-result) | Pendente de componentizar | `src/components/point-card.astro`       |

Página de teste (só em `npm run dev`): `/dev/components`.
