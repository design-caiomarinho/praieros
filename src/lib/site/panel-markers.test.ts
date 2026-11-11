import { describe, expect, it } from 'vitest';
import type { BeachModel, PointModel } from './build-beach-models.ts';
import { toMarkers } from './map-markers.ts';
import { formatDate, toPanelData } from './panel-props.ts';

const ref = (n: number, issuedAt: string) => ({
  number: n,
  year: 2026,
  issuedAt,
});
const CURRENT = ref(37, '2026-11-06');
const urls = new Map([['37/2026', 'https://exemplo/37.pdf']]);

const point = (over: Partial<PointModel> = {}): PointModel => ({
  code: 'SSA IN 100',
  location: 'Em frente ao posto',
  status: 'suitable',
  bulletin: CURRENT,
  stale: false,
  position: { lat: -13, lng: -38.5 },
  onMap: true,
  approximate: false,
  ...over,
});

const beach = (over: Partial<BeachModel> = {}): BeachModel => ({
  slug: 'porto-da-barra',
  name: 'Porto da Barra',
  neighborhood: 'Barra',
  kind: 'current',
  points: [point()],
  worstStatus: 'suitable',
  shownPoints: 1,
  improperPoints: 0,
  stalePoints: 0,
  referenceBulletin: CURRENT,
  banner: 'none',
  lastAnalysisDate: null,
  notInCurrentBulletin: false,
  ...over,
});

describe('formatDate', () => {
  it('converte AAAA-MM-DD para dd/mm/aaaa', () => {
    expect(formatDate('2026-11-06')).toBe('06/11/2026');
  });
});

describe('toPanelData (estados da ficha)', () => {
  it('própria no boletim atual: sem faixa, data do boletim atual', () => {
    const d = toPanelData(beach(), CURRENT, urls)!;
    expect(d.notice).toBeUndefined();
    expect(d.bulletin).toEqual({
      number: '37/2026',
      date: '06/11/2026',
      pdfUrl: 'https://exemplo/37.pdf',
    });
    expect(d.points[0]).toMatchObject({ name: 'Ponto 1', status: 'suitable' });
  });

  it('imprópria no boletim atual: chip Imprópria, sem faixa', () => {
    const d = toPanelData(
      beach({ points: [point({ status: 'unsuitable' })] }),
      CURRENT,
      urls,
    )!;
    expect(d.points[0].status).toBe('unsuitable');
    expect(d.notice).toBeUndefined();
  });

  it('sem informação no boletim atual: chip Sem resultado, sem faixa', () => {
    const d = toPanelData(
      beach({ points: [point({ status: 'no-result' })] }),
      CURRENT,
      urls,
    )!;
    expect(d.points[0].status).toBe('no-result');
    expect(d.notice).toBeUndefined();
  });

  it('nunca apareceu: faixa Sem resultado, nota e data do boletim atual', () => {
    const d = toPanelData(
      beach({
        kind: 'never',
        referenceBulletin: CURRENT,
        notInCurrentBulletin: true,
      }),
      CURRENT,
      urls,
    )!;
    expect(d.notice).toBe('no-result');
    expect(d.points).toEqual([]);
    expect(d.note).toBe('Esta praia não consta no boletim nº 37/2026.');
    expect(d.bulletin.date).toBe('06/11/2026');
  });

  it('antiga demais: nunca mostra o status antigo, só a data da última análise', () => {
    const d = toPanelData(
      beach({
        kind: 'too-old',
        lastAnalysisDate: '2026-06-01',
        points: [point({ status: 'unsuitable' })],
      }),
      CURRENT,
      urls,
    )!;
    expect(d.notice).toBe('no-result');
    expect(d.points).toEqual([]);
    expect(d.note).toBe(
      'A última análise foi em 01/06/2026, antiga demais para mostrar.',
    );
  });

  it('desatualizada: último status, faixa e data do último boletim em que apareceu', () => {
    const old = ref(35, '2026-10-23');
    const d = toPanelData(
      beach({
        kind: 'stale',
        banner: 'outdated',
        referenceBulletin: old,
        points: [point({ status: 'unsuitable', stale: true, bulletin: old })],
      }),
      CURRENT,
      urls,
    )!;
    expect(d.notice).toBe('outdated');
    expect(d.points[0].status).toBe('unsuitable');
    expect(d.bulletin.number).toBe('35/2026');
    expect(d.bulletin.date).toBe('23/10/2026');
    // PDF desconhecido: cai na página oficial, sem inventar link.
    expect(d.bulletin.pdfUrl).toContain('ba.gov.br/inema');
  });

  it('sem boletim algum: não inventa data', () => {
    expect(
      toPanelData(beach({ referenceBulletin: null }), null, urls),
    ).toBeNull();
  });

  it('bairro ausente cai em "Salvador"', () => {
    expect(
      toPanelData(beach({ neighborhood: null }), CURRENT, urls)!.neighborhood,
    ).toBe('Salvador');
  });
});

describe('toMarkers (R5: um por ponto)', () => {
  it('cria um marcador por ponto com posição e ignora os sem posição', () => {
    const b = beach({
      points: [
        point({ code: 'A' }),
        point({ code: 'B', status: 'unsuitable' }),
        point({ code: 'C', position: null, onMap: false }),
      ],
    });
    const m = toMarkers([b]);
    expect(m.map((x) => x.id)).toEqual([
      'porto-da-barra:A',
      'porto-da-barra:B',
    ]);
    expect(m[1].status).toBe('unsuitable');
    expect(m[1].ariaLabel).toBe('Porto da Barra, Ponto de coleta 2, Imprópria');
  });

  it('ponto desatualizado vira "outdated" e o rótulo traz o último resultado', () => {
    const m = toMarkers([
      beach({
        kind: 'stale',
        banner: 'outdated',
        points: [point({ status: 'unsuitable', stale: true })],
      }),
    ]);
    expect(m[0].status).toBe('outdated');
    expect(m[0].ariaLabel).toBe(
      'Porto da Barra, Ponto de coleta 1, Boletim desatualizado, último resultado: Imprópria',
    );
  });

  it('praia antiga demais ou nunca vista: Sem resultado, sem status antigo', () => {
    const m = toMarkers([
      beach({
        kind: 'too-old',
        points: [point({ status: 'unsuitable', stale: true })],
      }),
    ]);
    expect(m[0].status).toBe('no-result');
    expect(m[0].ariaLabel).toContain('Sem resultado');
  });
});
