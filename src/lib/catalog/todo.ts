import type { RulePoint } from '../rules/types.ts';
import type { Catalog } from './types.ts';

/** Markdown com o que falta preencher ou conferir no catálogo. Função pura. */
export function buildCatalogTodo(
  catalog: Catalog,
  currentPoints: readonly RulePoint[],
): string {
  const location = new Map(
    currentPoints.map((p) => [p.code, p.location ?? '']),
  );
  const lines = [
    '# Catálogo: o que falta preencher ou conferir',
    '',
    'Gerado por `npm run catalog:todo` a partir de `data/catalog/salvador.json` e do boletim mais recente. Não editar à mão.',
    'Posições e bairros com `verified: false` são propostas do OpenStreetMap: aparecem só em desenvolvimento. Para publicar, conferir e marcar `verified: true`.',
    'Ponto sem coordenada fica fora do mapa.',
    '',
  ];
  let pending = 0;
  for (const beach of catalog.beaches) {
    const items: string[] = [];
    if (beach.proposalNote) {
      items.push(`- [ ] Proposta descartada: ${beach.proposalNote}`);
    }
    if (beach.neighborhood === null) {
      items.push('- [ ] Bairro');
    } else if (!beach.neighborhoodVerified) {
      items.push(`- [ ] Conferir bairro (proposta: ${beach.neighborhood})`);
    }
    for (const p of beach.points) {
      const where = location.get(p.code);
      const suffix = where ? `: ${where}` : '';
      if (p.lat === null || p.lng === null) {
        items.push(`- [ ] Coordenadas de \`${p.code}\`${suffix}`);
      } else if (!p.verified) {
        const how =
          p.source?.method === 'description'
            ? ' (baixa confiança: pela descrição do local)'
            : p.source?.method === 'overpass'
              ? ' (confiança média: lista do OSM)'
              : '';
        items.push(`- [ ] Conferir posição de \`${p.code}\`${how}${suffix}`);
      }
    }
    if (items.length === 0) continue;
    pending++;
    lines.push(`## ${beach.name}`, '', ...items, '');
  }
  if (pending === 0) lines.push('Nada pendente.', '');
  return lines.join('\n');
}
