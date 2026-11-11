import { describe, expect, it } from 'vitest';
import type { MarkerData } from '../site/map-markers.ts';
import type { Status } from '../rules/status.ts';
import { groupAriaLabel, groupBadge, worstStatus } from './group-status.ts';
import { groupBySlug } from './group-markers.ts';
import { isLabelVisible, LABEL_MIN_ZOOM } from './label-visibility.ts';
import {
  centerOf,
  GROUP_OPEN_MIN_SPREAD_PX,
  isGroupSpread,
  maxSpreadPx,
} from './spread.ts';

const S: Status[] = ['suitable', 'unsuitable', 'no-result'];

describe('worstStatus (Imprópria > Sem resultado > Própria)', () => {
  it('todas as combinações de dois status', () => {
    for (const a of S)
      for (const b of S) {
        const expected = (
          ['unsuitable', 'no-result', 'suitable'] as const
        ).find((s) => s === a || s === b);
        expect(worstStatus([a, b])).toBe(expected);
      }
  });
  it('três status e lista com um só', () => {
    expect(worstStatus(['suitable', 'no-result', 'unsuitable'])).toBe(
      'unsuitable',
    );
    expect(worstStatus(['suitable', 'no-result'])).toBe('no-result');
    expect(worstStatus(['suitable'])).toBe('suitable');
  });
  it('lista vazia: sem resultado', () => {
    expect(worstStatus([])).toBe('no-result');
  });
});

describe('groupBadge', () => {
  it('todos iguais: só a quantidade', () => {
    expect(groupBadge(['suitable', 'suitable'])).toEqual({
      status: 'suitable',
      text: '2',
      divergent: false,
    });
    expect(groupBadge(['unsuitable', 'unsuitable', 'unsuitable']).text).toBe(
      '3',
    );
  });
  it('status diferentes: divergência "pior/total"', () => {
    expect(groupBadge(['unsuitable', 'suitable'])).toEqual({
      status: 'unsuitable',
      text: '1/2',
      divergent: true,
    });
    expect(groupBadge(['suitable', 'no-result', 'no-result'])).toEqual({
      status: 'no-result',
      text: '2/3',
      divergent: true,
    });
  });
});

describe('groupAriaLabel', () => {
  it('nome uma vez só, quantidade e contagem por status', () => {
    expect(groupAriaLabel('Ondina', ['unsuitable', 'suitable'])).toBe(
      'Ondina, 2 pontos de coleta, 1 imprópria e 1 própria',
    );
    expect(groupAriaLabel('Ondina', ['suitable', 'suitable'])).toBe(
      'Ondina, 2 pontos de coleta, 2 próprias',
    );
    expect(
      groupAriaLabel('Ondina', ['unsuitable', 'no-result', 'suitable']),
    ).toBe(
      'Ondina, 3 pontos de coleta, 1 imprópria, 1 sem resultado e 1 própria',
    );
  });
  it('avisa boletim desatualizado', () => {
    expect(groupAriaLabel('Ondina', ['suitable', 'suitable'], true)).toMatch(
      /Boletim desatualizado$/,
    );
  });
});

const marker = (slug: string, lat: number, lng: number): MarkerData => ({
  id: `${slug}:${lat}`,
  slug,
  beachName: slug,
  lat,
  lng,
  status: 'suitable',
  baseStatus: 'suitable',
  number: 1,
  ariaLabel: '',
});

describe('groupBySlug', () => {
  it('agrupa por praia, não por proximidade; praia com 1 ponto fica sozinha', () => {
    const groups = groupBySlug([
      marker('a', -13, -38.5),
      marker('b', -13, -38.5), // mesma posição, outra praia
      marker('a', -13.0001, -38.5),
    ]);
    expect(groups.map((g) => [g.slug, g.points.length])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });
  it('centro = centro dos pontos', () => {
    const [g] = groupBySlug([
      marker('a', -13, -38.5),
      marker('a', -13.002, -38.504),
    ]);
    expect(g.center.lat).toBeCloseTo(-13.001, 6);
    expect(g.center.lng).toBeCloseTo(-38.502, 6);
    expect(centerOf([{ lat: 1, lng: 2 }])).toEqual({ lat: 1, lng: 2 });
  });
});

// Dois pontos a ~40 m na latitude de Salvador.
const A = { lat: -12.9714, lng: -38.5 };
const B = { lat: -12.9714, lng: -38.5 + 0.000369 };

describe('abertura por distância em tela', () => {
  it('a distância em pixels dobra a cada zoom', () => {
    const d = maxSpreadPx([A, B], 15);
    expect(maxSpreadPx([A, B], 16)).toBeCloseTo(d * 2, 3);
  });
  it('perto demais (zoom baixo): fica agrupado', () => {
    expect(isGroupSpread([A, B], 14)).toBe(false);
  });
  it('afastado o bastante (zoom alto): abre', () => {
    expect(isGroupSpread([A, B], 17)).toBe(true);
  });
  it('no limite exato abre; um pouco abaixo não', () => {
    const d = maxSpreadPx([A, B], 16);
    expect(isGroupSpread([A, B], 16, d)).toBe(true);
    expect(isGroupSpread([A, B], 16, d + 0.01)).toBe(false);
  });
  it('praia com 1 ponto nunca é "espalhada"', () => {
    expect(isGroupSpread([A], 22)).toBe(false);
  });
  it('usa 56 px por padrão', () => {
    expect(GROUP_OPEN_MIN_SPREAD_PX).toBe(56);
  });
});

describe('praia selecionada permanece aberta', () => {
  // Regra do controlador: aberta = selecionada OU espalhada.
  const open = (selected: boolean, zoom: number) =>
    selected || isGroupSpread([A, B], zoom);
  it('selecionada abre em qualquer zoom', () => {
    expect(open(true, 10)).toBe(true);
    expect(open(true, 22)).toBe(true);
  });
  it('sem seleção segue o zoom', () => {
    expect(open(false, 10)).toBe(false);
    expect(open(false, 18)).toBe(true);
  });
});

describe('isLabelVisible', () => {
  const base = { zoom: 10, selected: false, focused: false, hovered: false };
  it('zoom afastado: esconde o nome', () => {
    expect(isLabelVisible(base)).toBe(false);
    expect(isLabelVisible({ ...base, zoom: LABEL_MIN_ZOOM - 0.01 })).toBe(
      false,
    );
  });
  it('a partir do zoom mínimo: mostra', () => {
    expect(isLabelVisible({ ...base, zoom: LABEL_MIN_ZOOM })).toBe(true);
  });
  it('selecionado, foco ou hover mostram em qualquer zoom', () => {
    expect(isLabelVisible({ ...base, selected: true })).toBe(true);
    expect(isLabelVisible({ ...base, focused: true })).toBe(true);
    expect(isLabelVisible({ ...base, hovered: true })).toBe(true);
  });
  it('limite configurável (Infinity = só por interação)', () => {
    expect(isLabelVisible({ ...base, zoom: 22 }, Infinity)).toBe(false);
    expect(isLabelVisible({ ...base, hovered: true }, Infinity)).toBe(true);
  });
});
