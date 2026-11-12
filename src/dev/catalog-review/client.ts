import { neighborhoodOriginText } from '../../lib/catalog/neighborhood.ts';
import { beachState, type BeachState } from '../../lib/catalog/review.ts';
import type {
  Catalog,
  CatalogEntry,
  CatalogSource,
  OsmSource,
} from '../../lib/catalog/types.ts';
import { createReviewMap, type ReviewPin } from './review-map.ts';

interface PageData {
  catalog: Catalog;
  /** Descrição do local de cada código, do boletim mais recente. */
  locations: Record<string, string>;
}
interface Suggestion {
  neighborhood: string;
  source: OsmSource;
}

const data: PageData = JSON.parse(
  document.getElementById('review-data')!.textContent!,
);
let catalog = data.catalog;
const suggestions = new Map<string, Suggestion | 'none'>();
let selectedBeach: string | null = null;
let selectedPoint: string | null = null;
let placing: { beach: string; code: string } | null = null;
let filter: 'all' | BeachState = 'all';

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const listEl = $('review-list');
const statusEl = $('review-status');
const summaryEl = $('review-summary');
const mapEl = $('review-map');

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
const pinId = (beach: string, code: string) => `${beach}|${code}`;
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const STATE_TEXT: Record<BeachState, string> = {
  unplaced: '! Sem posição',
  proposed: '? Proposto',
  verified: '✓ Verificado',
};
const METHOD_TEXT: Record<string, string> = {
  name: 'nome',
  overpass: 'Overpass',
  description: 'descrição',
  reverse: 'consulta inversa',
  manual: 'manual',
  'auto-placed': 'automático',
};
const CONFIDENCE_TEXT = {
  high: 'alta',
  medium: 'média',
  low: 'baixa',
  'very-low': 'muito baixa',
};

function sourceText(s: CatalogSource | null): string {
  if (!s) return 'sem origem';
  if (s.provider === 'manual') return 'manual';
  if (s.method === 'polygon') return neighborhoodOriginText(s);
  if (s.provider === 'auto') {
    return `automático (nível ${s.level ?? 'g'}) · confiança ${CONFIDENCE_TEXT[s.confidence]}`;
  }
  return `${METHOD_TEXT[s.method]} · confiança ${CONFIDENCE_TEXT[s.confidence]}`;
}

function say(text: string, kind: 'ok' | 'error' = 'ok') {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}

// ---------- mapa ----------
let map: Awaited<ReturnType<typeof createReviewMap>> | null = null;

function pins(): ReviewPin[] {
  const out: ReviewPin[] = [];
  for (const b of catalog.beaches) {
    let labeled = false;
    b.points.forEach((p, i) => {
      if (p.lat === null || p.lng === null) return;
      out.push({
        id: pinId(b.name, p.code),
        number: i + 1,
        // Só um pin por praia mostra o nome.
        label: labeled ? null : b.name,
        lat: p.lat,
        lng: p.lng,
        state: p.verified ? 'verified' : 'proposed',
        ariaLabel: `${b.name}, ponto ${i + 1}, ${p.code}, ${
          p.verified ? 'verificado' : 'proposto'
        }`,
      });
      labeled = true;
    });
  }
  return out;
}

function highlightIds(): Set<string> {
  const b = catalog.beaches.find((x) => x.name === selectedBeach);
  if (!b) return new Set();
  if (selectedPoint) return new Set([pinId(b.name, selectedPoint)]);
  return new Set(b.points.map((p) => pinId(b.name, p.code)));
}

function coordsOf(b: CatalogEntry, code?: string) {
  return b.points
    .filter((p) => (code ? p.code === code : true))
    .flatMap((p) =>
      p.lat !== null && p.lng !== null ? [{ lat: p.lat, lng: p.lng }] : [],
    );
}

function syncMap() {
  map?.setPins(pins());
  map?.highlight(highlightIds());
  map?.setPlacing(placing !== null);
}

// ---------- lista ----------
function pointRow(b: CatalogEntry, i: number) {
  const p = b.points[i]!;
  const placed = p.lat !== null && p.lng !== null;
  const sel = selectedPoint === p.code && selectedBeach === b.name;
  const where = data.locations[p.code] ?? 'Local não consta no boletim atual';
  const isPlacing = placing?.beach === b.name && placing.code === p.code;
  return `<li class="point${sel ? ' point--selected' : ''}">
    <button type="button" class="point__main" data-act="point" data-beach="${esc(b.name)}" data-code="${esc(p.code)}" aria-pressed="${sel}">
      <strong>Ponto ${i + 1}</strong> · ${esc(p.code)} · ${esc(where)}
      <span class="point__meta">${
        placed
          ? `${p.verified ? '✓ verificado' : '? proposto'} · ${esc(sourceText(p.source))}${p.proposals.length ? ` · ${p.proposals.length} proposta(s) guardada(s)` : ''}`
          : '! sem posição'
      }</span>
    </button>
    ${
      placed
        ? ''
        : `<button type="button" class="btn" data-act="place" data-beach="${esc(b.name)}" data-code="${esc(p.code)}">${isPlacing ? 'Clique no mapa… (Esc cancela)' : 'Posicionar no mapa'}</button>`
    }
  </li>`;
}

function beachDetails(b: CatalogEntry) {
  const sug = suggestions.get(b.name);
  const state = beachState(b);
  const canApprove =
    state !== 'verified' && !!b.neighborhood?.trim() && state !== 'unplaced';
  return `<div class="beach__body">
    ${b.proposalNote ? `<p class="note">Nota da proposta: ${esc(b.proposalNote)}</p>` : ''}
    <ul class="points">${b.points.map((_, i) => pointRow(b, i)).join('')}</ul>
    <form class="hood" data-beach="${esc(b.name)}">
      <label>Bairro
        <input name="neighborhood" type="text" value="${esc(b.neighborhood ?? '')}" autocomplete="off" />
      </label>
      <button type="submit" class="btn">Salvar bairro</button>
    </form>
    <p class="note">Origem do bairro: ${esc(neighborhoodOriginText(b.neighborhoodSource, { verified: b.neighborhoodVerified, note: b.neighborhoodNote }))}</p>
    ${
      sug && sug !== 'none'
        ? `<p class="note">Sugestão do OSM: <strong>${esc(sug.neighborhood)}</strong> <button type="button" class="btn" data-act="use-suggestion" data-beach="${esc(b.name)}">Usar</button></p>`
        : sug === 'none'
          ? '<p class="note">O OSM não sugeriu bairro para esta posição.</p>'
          : ''
    }
    <button type="button" class="btn btn--primary" data-act="approve" data-beach="${esc(b.name)}" ${canApprove ? '' : 'disabled'}>
      ${state === 'verified' ? 'Praia verificada' : 'Aprovar praia'}
    </button>
    ${canApprove || state === 'verified' ? '' : '<p class="note">Aprovar exige posição em todos os pontos e bairro preenchido.</p>'}
  </div>`;
}

function render() {
  const total = catalog.beaches.length;
  const counts = { unplaced: 0, proposed: 0, verified: 0 };
  for (const b of catalog.beaches) counts[beachState(b)]++;
  summaryEl.textContent = `${counts.verified} de ${total} praias verificadas · ${counts.proposed} propostas · ${counts.unplaced} sem posição`;

  const visible = catalog.beaches.filter(
    (b) => filter === 'all' || beachState(b) === filter,
  );
  listEl.innerHTML = visible
    .map((b) => {
      const state = beachState(b);
      const open = b.name === selectedBeach;
      const origins = [
        ...new Set(b.points.map((p) => (p.source ? sourceText(p.source) : ''))),
      ]
        .filter(Boolean)
        .join(' / ');
      return `<li class="beach beach--${state}${open ? ' beach--open' : ''}">
        <button type="button" class="beach__head" data-act="beach" data-beach="${esc(b.name)}" aria-expanded="${open}">
          <span class="beach__name">${esc(b.name)}</span>
          <span class="beach__sub">${esc(b.neighborhood ?? 'sem bairro')} · ${b.points.length} ${b.points.length === 1 ? 'ponto' : 'pontos'}</span>
          <span class="beach__state beach__state--${state}">${STATE_TEXT[state]}</span>
          <span class="beach__sub">${esc(origins || 'sem proposta')}</span>
        </button>
        ${open ? beachDetails(b) : ''}
      </li>`;
    })
    .join('');
}

function refresh() {
  render();
  syncMap();
}

// ---------- ações ----------
async function post(action: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch('/dev/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });
    const body = await res.json();
    if (!res.ok) {
      say(`Não gravou: ${body.error}`, 'error');
      return false;
    }
    catalog = body.catalog;
    return true;
  } catch {
    say('Não gravou: o servidor de desenvolvimento não respondeu.', 'error');
    return false;
  }
}

async function suggest(beach: string, lat: number, lng: number) {
  try {
    const res = await fetch(`/dev/api/catalog?lat=${lat}&lng=${lng}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    suggestions.set(beach, body.suggestion ?? 'none');
  } catch (e) {
    say(
      `Posição gravada, mas sem sugestão de bairro: ${(e as Error).message}`,
      'error',
    );
    return;
  }
  refresh();
}

async function movePoint(
  beach: string,
  code: string,
  lat: number,
  lng: number,
) {
  const ok = await post({ type: 'move', beach, code, lat, lng });
  refresh(); // em caso de erro, o pin volta para a posição gravada
  if (!ok) return;
  say(
    `Posição de ${code} gravada (manual). A aprovação desse ponto foi retirada.`,
  );
  void suggest(beach, lat, lng);
}

function selectBeach(
  name: string,
  code: string | null,
  frame: 'beach' | 'point',
) {
  selectedBeach = name;
  selectedPoint = code;
  const b = catalog.beaches.find((x) => x.name === name)!;
  refresh();
  const coords = frame === 'point' && code ? coordsOf(b, code) : coordsOf(b);
  map?.frame(coords);
}

listEl.addEventListener('click', async (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!t) return;
  const beach = t.dataset.beach!;
  const code = t.dataset.code;
  switch (t.dataset.act) {
    case 'beach':
      if (selectedBeach === beach && !selectedPoint) {
        selectedBeach = null; // segundo clique recolhe
        refresh();
      } else selectBeach(beach, null, 'beach');
      break;
    case 'point':
      selectBeach(beach, code!, 'point');
      break;
    case 'place':
      placing = placing?.code === code ? null : { beach, code: code! };
      say(
        placing
          ? `Clique no mapa para posicionar ${code}.`
          : 'Posicionamento cancelado.',
      );
      refresh();
      break;
    case 'approve':
      if (await post({ type: 'approve', beach })) {
        say(`${beach} aprovada e gravada.`);
      }
      refresh();
      break;
    case 'use-suggestion': {
      const s = suggestions.get(beach);
      const input = listEl.querySelector<HTMLInputElement>(
        `form[data-beach="${CSS.escape(beach)}"] input`,
      );
      if (s && s !== 'none' && input) input.value = s.neighborhood;
      break;
    }
  }
});

listEl.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target as HTMLFormElement;
  const beach = form.dataset.beach!;
  const value = (form.elements.namedItem('neighborhood') as HTMLInputElement)
    .value;
  const s = suggestions.get(beach);
  const suggestion =
    s && s !== 'none' && s.neighborhood === value.trim() ? s.source : undefined;
  if (await post({ type: 'neighborhood', beach, value, suggestion })) {
    say(
      `Bairro de ${beach} gravado. A aprovação foi retirada: aprove de novo.`,
    );
  }
  refresh();
});

$('review-filter').addEventListener('change', (ev) => {
  filter = (ev.target as HTMLSelectElement).value as typeof filter;
  render();
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && placing) {
    placing = null;
    say('Posicionamento cancelado.');
    refresh();
  }
});

// ---------- inicialização ----------
render();
createReviewMap({
  container: mapEl,
  palette: {
    land: token('--s-color-surface-strong'),
    water: token('--s-color-surface-accent-soft'),
    park: token('--s-color-surface-positive-soft'),
    sand: token('--s-color-surface-warning-subtle'),
    block: token('--s-color-surface-emphasis'),
    road: token('--s-color-surface-default'),
  },
  onPinSelect(id) {
    const [beach, code] = id.split('|') as [string, string];
    selectBeach(beach, code, 'beach');
  },
  onPinMove(id, lat, lng) {
    const [beach, code] = id.split('|') as [string, string];
    void movePoint(beach, code, lat, lng);
  },
  onMapClick(lat, lng) {
    if (!placing) return;
    const { beach, code } = placing;
    placing = null;
    void movePoint(beach, code, lat, lng);
  },
})
  .then((m) => {
    map = m;
    syncMap();
  })
  .catch((e) => say(`Mapa indisponível: ${(e as Error).message}`, 'error'));
