import { describe, expect, it } from 'vitest';
import {
  openBeachPath,
  shareImagePath,
  shareImageUrl,
  shareMessage,
  sharePreview,
  shareUrl,
  siteShareMessage,
  siteUrl,
  slugFromSearch,
  whatsappUrl,
} from './share.ts';

const ORIGIN = 'https://design-caiomarinho.github.io';
const current = { number: 37, year: 2026, issuedAt: '2026-11-06' };
const older = { number: 36, year: 2026, issuedAt: '2026-10-29' };

describe('links', () => {
  it('monta o link da praia com e sem prefixo', () => {
    expect(shareUrl(ORIGIN, '/praieros', 'porto-da-barra')).toBe(
      `${ORIGIN}/praieros/praia/porto-da-barra/`,
    );
    expect(shareUrl(`${ORIGIN}/`, '/', 'porto-da-barra')).toBe(
      `${ORIGIN}/praia/porto-da-barra/`,
    );
  });
  it('monta a imagem da prévia', () => {
    expect(shareImageUrl(ORIGIN, '/praieros/', 'porto-da-barra')).toBe(
      `${ORIGIN}/praieros/share/porto-da-barra.jpg`,
    );
  });
  it('a miniatura usa o caminho local', () => {
    expect(shareImagePath('/praieros/', 'porto-da-barra')).toBe(
      '/praieros/share/porto-da-barra.jpg',
    );
    expect(shareImagePath('/', 'porto-da-barra')).toBe(
      '/share/porto-da-barra.jpg',
    );
  });
  it('o redirecionamento abre a ficha no site', () => {
    expect(openBeachPath('/praieros', 'porto-da-barra')).toBe(
      '/praieros/?praia=porto-da-barra',
    );
    expect(openBeachPath('/', 'porto-da-barra')).toBe('/?praia=porto-da-barra');
  });
});

describe('compartilhar o site', () => {
  it('o link é a raiz, com e sem prefixo', () => {
    expect(siteUrl(ORIGIN, '/praieros')).toBe(`${ORIGIN}/praieros/`);
    expect(siteUrl(`${ORIGIN}/`, '/')).toBe(`${ORIGIN}/`);
  });
  it('a mensagem leva o link e nenhum status', () => {
    const msg = siteShareMessage('https://x/');
    expect(msg).toContain('https://x/');
    expect(msg).not.toMatch(/Própria|Imprópria/);
  });
});

describe('slugFromSearch', () => {
  const known = new Set(['porto-da-barra']);
  it('aceita só praia conhecida', () => {
    expect(slugFromSearch('?praia=porto-da-barra', known)).toBe(
      'porto-da-barra',
    );
    expect(slugFromSearch('?praia=inventada', known)).toBeNull();
    expect(slugFromSearch('', known)).toBeNull();
  });
});

describe('mensagem do WhatsApp', () => {
  it('leva o nome e o link, sem status nem data (R6)', () => {
    const msg = shareMessage('Porto da Barra', 'https://x/praia/p/');
    expect(msg).toContain('Porto da Barra');
    expect(msg).toContain('https://x/praia/p/');
    expect(msg).not.toMatch(/Própria|Imprópria|\d{2}\/\d{2}/);
  });
  it('codifica o texto na URL', () => {
    expect(whatsappUrl('a b\nc')).toBe('https://wa.me/?text=a%20b%0Ac');
  });
});

describe('sharePreview', () => {
  it('praia no boletim atual: status e data do boletim', () => {
    const p = sharePreview(
      {
        name: 'Porto da Barra',
        kind: 'current',
        banner: 'none',
        worstStatus: 'suitable',
        referenceBulletin: current,
      },
      current,
    );
    expect(p.title).toBe('Porto da Barra · Praieros');
    expect(p.description).toBe(
      'Própria · Boletim nº 37/2026 · emitido em 06/11/2026 · Fonte: Inema',
    );
  });
  it('R3: desatualizada mantém o último status, avisa e usa a data da última aparição', () => {
    const p = sharePreview(
      {
        name: 'Farol da Barra',
        kind: 'stale',
        banner: 'outdated',
        worstStatus: 'unsuitable',
        referenceBulletin: older,
      },
      current,
    );
    expect(p.description).toBe(
      'Imprópria · Boletim desatualizado · Boletim nº 36/2026 · emitido em 29/10/2026 · Fonte: Inema',
    );
  });
  it.each(['never', 'too-old', 'reference'] as const)(
    'R4 (%s): nunca mostra status antigo, usa o boletim atual',
    (kind) => {
      const p = sharePreview(
        {
          name: 'Praia X',
          kind,
          banner: 'none',
          worstStatus: 'unsuitable',
          referenceBulletin: older,
        },
        current,
      );
      expect(p.description).toBe(
        'Sem resultado · Boletim nº 37/2026 · emitido em 06/11/2026 · Fonte: Inema',
      );
    },
  );
  it('sem boletim, não afirma nada', () => {
    const p = sharePreview(
      {
        name: 'Praia X',
        kind: 'never',
        banner: 'none',
        worstStatus: 'no-result',
      },
      null,
    );
    expect(p.description).not.toMatch(/Própria|Imprópria|Boletim nº/);
  });
});
