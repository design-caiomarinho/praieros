import { describe, expect, it } from 'vitest';
import { abbreviateLabel } from './abbreviate.ts';

describe('abbreviateLabel', () => {
  it('nome que cabe não muda', () => {
    expect(abbreviateLabel('Boca do Rio')).toBe('Boca do Rio');
    expect(abbreviateLabel('São Tomé de Paripe')).toBe('São Tomé de Paripe');
  });
  it('abrevia a primeira palavra e tira a ligação', () => {
    expect(abbreviateLabel('Quilombo do Alto do Tororó')).toBe(
      'Q. Alto do Tororó',
    );
  });
  it('repete com a palavra seguinte se ainda for longo', () => {
    expect(abbreviateLabel('Vila São Tomé de Paripe')).toBe(
      'V. S. Tomé de Paripe',
    );
  });
  it('nunca abrevia o que sobraria com menos de 2 palavras', () => {
    expect(abbreviateLabel('Pseudopneumoultramicroscópico')).toBe(
      'Pseudopneumoultramicroscópico',
    );
    expect(abbreviateLabel('Alto Muitolongonomedebairrox')).toBe(
      'Alto Muitolongonomedebairrox',
    );
  });
});
