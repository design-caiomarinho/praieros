import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildIco, buildManifest, symbolSvg } from './icons.ts';

describe('symbolSvg', () => {
  it('extrai só os três caminhos do símbolo do logo real', () => {
    const svg = symbolSvg(readFileSync('src/assets/logo.svg', 'utf8'));
    expect(svg.match(/<path\b/g)).toHaveLength(3);
    expect(svg).toContain('viewBox="0 0 20 20"');
    expect(svg).not.toContain('#0A2461'); // o nome "Praieros" fica de fora
  });

  it('falha se o logo mudar e o símbolo não for achado', () => {
    expect(() => symbolSvg('<svg><path d="M0 0" fill="#000"/></svg>')).toThrow(
      /3 caminhos/,
    );
  });
});

describe('buildIco', () => {
  it('monta cabeçalho e entradas com tamanho e posição de cada PNG', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5, 6, 7]);
    const ico = buildIco([
      { size: 16, png: a },
      { size: 32, png: b },
    ]);
    expect(ico.readUInt16LE(2)).toBe(1); // tipo ícone
    expect(ico.readUInt16LE(4)).toBe(2); // duas imagens
    expect(ico.readUInt8(6)).toBe(16);
    expect(ico.readUInt32LE(6 + 8)).toBe(3); // bytes da primeira
    expect(ico.readUInt32LE(6 + 12)).toBe(38); // começa após cabeçalho (6 + 2×16)
    expect(ico.readUInt8(22)).toBe(32);
    expect(ico.readUInt32LE(22 + 12)).toBe(41);
    expect([...ico.subarray(38)]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('buildManifest', () => {
  it('leva nome, idioma, cores e ícones com caminho relativo', () => {
    const m = JSON.parse(
      buildManifest({ themeColor: '#fcfdfd', backgroundColor: '#fcfdfd' }),
    );
    expect(m.name).toBe('Praieros');
    expect(m.lang).toBe('pt-BR');
    expect(m.theme_color).toBe('#fcfdfd');
    expect(m.icons.map((i: { src: string }) => i.src)).toEqual([
      'icon-192.png',
      'icon-512.png',
    ]);
  });
});
