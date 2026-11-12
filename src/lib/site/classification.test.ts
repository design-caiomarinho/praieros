import { describe, expect, it } from 'vitest';
import { classificationFor } from './classification.ts';

describe('classificationFor', () => {
  it('oferece para praia no boletim atual, própria', () => {
    expect(
      classificationFor({ kind: 'current', worstStatus: 'suitable' }),
    ).toMatchObject({
      status: 'suitable',
    });
  });
  it('oferece para praia desatualizada com último status Própria', () => {
    expect(
      classificationFor({ kind: 'stale', worstStatus: 'suitable' }),
    ).not.toBeNull();
  });
  it('não oferece Imprópria (texto pendente)', () => {
    expect(
      classificationFor({ kind: 'current', worstStatus: 'unsuitable' }),
    ).toBeNull();
    expect(
      classificationFor({ kind: 'stale', worstStatus: 'unsuitable' }),
    ).toBeNull();
  });
  it('não oferece quando o pior status é Sem resultado', () => {
    expect(
      classificationFor({ kind: 'current', worstStatus: 'no-result' }),
    ).toBeNull();
  });
  it('não oferece para nunca apareceu, antiga demais e referência', () => {
    for (const kind of ['never', 'too-old', 'reference'] as const) {
      expect(classificationFor({ kind, worstStatus: 'no-result' })).toBeNull();
      expect(classificationFor({ kind, worstStatus: 'suitable' })).toBeNull();
    }
  });
});
