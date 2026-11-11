import { migrateCatalog } from '../../lib/catalog/review.ts';
import { pointState, type PointState } from '../../lib/catalog/placement.ts';
import type { CatalogPoint } from '../../lib/catalog/types.ts';
import {
  createReviewMap,
  type ReviewPin,
} from '../catalog-review/review-map.ts';

// Visão geral: todos os pontos do catálogo num mapa, por estado. Só leitura.
const raw = JSON.parse(document.getElementById('ov-data')!.textContent!);
const catalog = migrateCatalog(raw.catalog);
const locations: Record<string, string> = raw.locations;
interface Ref {
  name: string;
  lat: number;
  lng: number;
  osmType: string;
  osmId: number;
}
const refs: Ref[] = raw.references ?? [];

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const TITLES: Record<PointState, string> = {
  verified: '✓ Verificados (produção)',
  auto: '≈ Automáticos: níveis g, a, b (produção, "Posição aproximada")',
  'very-approximate':
    '≈! Muito aproximados: níveis c, d, e (produção, "Posição muito aproximada")',
  pending: '? Aguardando aprovação (só dev, baixa confiança)',
  unplaced: '! Sem posição (fora do mapa)',
};
const ORDER: PointState[] = [
  'verified',
  'auto',
  'very-approximate',
  'pending',
  'unplaced',
];

interface Row {
  id: string;
  beach: string;
  number: number;
  point: CatalogPoint;
  state: PointState;
  first: boolean;
}
const rows: Row[] = catalog.beaches.flatMap((b) => {
  let labeled = false;
  return b.points.map((point, i) => {
    const state = pointState(point);
    const first = state !== 'unplaced' && !labeled;
    if (state !== 'unplaced') labeled = true;
    return {
      id: `${b.name}|${point.code}`,
      beach: b.name,
      number: i + 1,
      point,
      state,
      first,
    };
  });
});

const visible = new Set<PointState | 'reference'>([
  'verified',
  'auto',
  'very-approximate',
  'pending',
  'reference',
]);
let selected: string | null = null;
let map: Awaited<ReturnType<typeof createReviewMap>> | null = null;

const checkText = (p: CatalogPoint) => {
  const c = p.checks;
  if (!c) return '';
  const m = (v: number | null) => (v === null ? '' : ` (${v} m)`);
  const t = (s: string) => (s === 'pass' ? '✓' : s === 'fail' ? '✗' : 'n/a');
  return `Salvador ${t(c.inSalvador.status)} · praia ${t(c.nearBeach.status)}${m(c.nearBeach.meters)} · entre pontos ${t(c.minSpacing.status)}${m(c.minSpacing.meters)}`;
};
const originText = (p: CatalogPoint) => {
  const s = p.source;
  if (!s) return 'sem origem';
  if (s.provider === 'auto')
    return `nível ${s.level ?? 'g'} (${s.basis}), confiança ${{ medium: 'média', low: 'baixa', 'very-low': 'muito baixa' }[s.confidence]}. ${s.reason}`;
  if (s.provider === 'manual') return 'manual';
  return `proposta do OSM (${s.method})`;
};

function pins(): ReviewPin[] {
  const refPins: ReviewPin[] = visible.has('reference')
    ? refs.map((r) => ({
        id: `ref|${r.name}`,
        number: 0,
        label: r.name,
        lat: r.lat,
        lng: r.lng,
        state: 'reference' as const,
        ariaLabel: `${r.name}, praia de referência (OSM), fora do boletim`,
      }))
    : [];
  return refPins.concat(
    rows
      .filter((r) => r.state !== 'unplaced' && visible.has(r.state))
      .map((r) => ({
        id: r.id,
        number: r.number,
        label: r.first ? r.beach : null,
        lat: r.point.lat!,
        lng: r.point.lng!,
        state: r.state as Exclude<PointState, 'unplaced'>,
        tag:
          r.point.source?.provider === 'auto'
            ? ` ${r.point.source.level ?? 'g'}`
            : undefined,
        ariaLabel: `${r.beach}, ponto ${r.number}, ${TITLES[r.state]}`,
      })),
  );
}

function render() {
  const count = (s: PointState) => rows.filter((r) => r.state === s).length;
  $('ov-summary').textContent =
    `${rows.length} pontos: ${count('verified')} verificados · ${count('auto')} automáticos (g/a/b) · ${count('very-approximate')} muito aproximados (c/d/e) · ${count('pending')} aguardando aprovação · ${count('unplaced')} sem posição · ${refs.length} praias de referência (sem ponto de coleta)`;
  $('ov-list').innerHTML =
    ORDER.map((s) => {
      const list = rows.filter((r) => r.state === s);
      if (list.length === 0) return '';
      return `<h2 class="ov__group">${TITLES[s]} · ${list.length}</h2>${list
        .map((r) => {
          const where = locations[r.point.code] ?? '';
          const detail =
            s === 'unplaced'
              ? (r.point.placementNote ?? 'sem tentativa de posicionamento')
              : `${originText(r.point)}${r.point.checks ? ` — ${checkText(r.point)}` : ''}`;
          return `<button type="button" class="ov__item" data-id="${esc(r.id)}" aria-pressed="${r.id === selected}">
          <strong>${esc(r.beach)} · ponto ${r.number}</strong>
          <span class="ov__note">${esc(r.point.code)}${where ? ` · ${esc(where)}` : ''}</span>
          <span class="ov__note">${esc(detail)}</span>
        </button>`;
        })
        .join('')}`;
    }).join('') +
    (refs.length
      ? `<h2 class="ov__group">◇ Praias de referência (OSM) · ${refs.length}</h2>${refs
          .map(
            (r) =>
              `<button type="button" class="ov__item" data-id="${esc(`ref|${r.name}`)}" aria-pressed="${selected === `ref|${r.name}`}"><strong>${esc(r.name)}</strong><span class="ov__note">${esc(r.osmType)}/${r.osmId}</span></button>`,
          )
          .join('')}`
      : '');
}

function sync() {
  map?.setPins(pins());
  map?.highlight(new Set(selected ? [selected] : []));
}

function select(id: string) {
  selected = id;
  const r = rows.find((x) => x.id === id);
  const ref = refs.find((x) => `ref|${x.name}` === id);
  render();
  if (ref) map?.frame([ref]);
  map?.highlight(new Set([id]));
  if (r && r.state !== 'unplaced')
    map?.frame([{ lat: r.point.lat!, lng: r.point.lng! }]);
}

$('ov-list').addEventListener('click', (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-id]');
  if (t) select(t.dataset.id!);
});
document
  .querySelectorAll<HTMLInputElement>('input[data-state]')
  .forEach((box) =>
    box.addEventListener('change', () => {
      const s = box.dataset.state as PointState | 'reference';
      if (box.checked) visible.add(s);
      else visible.delete(s);
      sync();
    }),
  );

render();
createReviewMap({
  container: $('ov-map'),
  draggable: false,
  palette: {
    land: token('--s-color-surface-strong'),
    water: token('--s-color-surface-accent-soft'),
    park: token('--s-color-surface-positive-soft'),
    sand: token('--s-color-surface-warning-subtle'),
    block: token('--s-color-surface-emphasis'),
    road: token('--s-color-surface-default'),
  },
  onPinSelect: select,
  onPinMove() {},
  onMapClick() {},
})
  .then((m) => {
    map = m;
    sync();
  })
  .catch((e) => {
    $('ov-summary').textContent +=
      ` · Mapa indisponível: ${(e as Error).message}`;
  });
