import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  bulletinFileName,
  ingestPdf,
  ingestText,
  readBulletin,
} from './ingest-bulletin.ts';
import { parseBulletinText } from './parse-bulletin.ts';
import { extractPdfText } from './read-pdf.ts';
import { regionFromCosta, validateBulletin } from './validate-bulletin.ts';

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)),
  );
const NOW = new Date('2026-11-11T12:00:00Z');

let salvador = '';
let bts = '';
beforeAll(async () => {
  salvador = await extractPdfText(fixture('salvador.pdf'));
  bts = await extractPdfText(fixture('baia-de-todos-os-santos.pdf'));
});

function parsed(text: string) {
  const r = parseBulletinText(text);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.bulletin;
}

describe('leitura dos PDFs reais (boletim 37/2026)', () => {
  it('Salvador: cabeçalho, 38 pontos e validação sem erros', () => {
    const b = parsed(salvador);
    expect(b).toMatchObject({
      costa: 'Litoral de Salvador',
      number: 37,
      year: 2026,
      issuedAt: '2026-11-06',
    });
    expect(b.points).toHaveLength(38);
    expect(validateBulletin(b, 'salvador', NOW)).toEqual([]);
  });

  it('Baía de Todos os Santos: 29 pontos e validação sem erros', () => {
    const b = parsed(bts);
    expect(b.costa).toBe('Baía de Todos os Santos');
    expect(b.points).toHaveLength(29);
    expect(validateBulletin(b, 'baia-de-todos-os-santos', NOW)).toEqual([]);
  });

  it('cola a categoria quebrada em linhas (Imprópria / Própria)', () => {
    const p = parsed(salvador).points;
    expect(p[0]).toEqual({
      code: 'SSA IN 100',
      beach: 'São Tomé de Paripe',
      location:
        'Em frente à casa Vila Maria, ao lado da rampa de acesso à praia.',
      category: 'Imprópria',
    });
    expect(p.find((x) => x.code === 'SSA PR 200')?.category).toBe('Própria');
  });

  it('junta descrição em 2 linhas', () => {
    const bv = parsed(salvador).points.find((x) => x.code === 'SSA BV 100');
    expect(bv?.beach).toBe('Boa Viagem');
    expect(bv?.category).toBe('Própria');
    expect(bv?.location).toBe(
      'Ao lado do forte Monte Serrat, em frente ao muro lateral da Fundação Luís Eduardo Magalhães, junto à rampa de acesso à praia.',
    );
  });

  it('praia com mais de um ponto fica com um registro por ponto', () => {
    const fb = parsed(salvador).points.filter(
      (x) => x.beach === 'Farol da Barra',
    );
    expect(fb.map((x) => x.code)).toEqual(['SSA FB 100', 'SSA FB 200']);
  });

  it('aceita código com cedilha e não "corrige" o texto do boletim', () => {
    const p = parsed(bts).points;
    expect(p.find((x) => x.code === 'BTS CÇ 100')?.beach).toBe('Conceição');
    expect(
      parsed(salvador).points.some((x) => x.beach === 'Stella Mares'),
    ).toBe(true);
    expect(p.find((x) => x.code === 'BTS BP 100')?.location).toBe(
      'Em frente à Barraca Veleiro',
    );
  });

  it('guarda as Observações como linhas, sem o cabeçalho de página repetido', () => {
    const s = parsed(salvador).observations;
    expect(s[0]).toMatch(/^A Praia de São Tomé de Paripe/);
    expect(s.join(' ')).toContain('Evite banho de praia em tempo chuvoso');
    const b = parsed(bts).observations;
    expect(b.some((l) => l.startsWith('CAMPANHA'))).toBe(false);
    expect(b[0]).toMatch(/^Evitar contato/);
  });
});

describe('aliases de região', () => {
  it.each([
    ['Litoral de Salvador', 'salvador'],
    ['Salvador', 'salvador'],
    ['Baía de Todos os Santos - Litoral Salvador', 'salvador'],
    ['BAIA DE TODOS OS SANTOS – LITORAL SALVADOR', 'salvador'],
    ['Baía de Todos os Santos', 'baia-de-todos-os-santos'],
    ['Baía de Todos-os-Santos', 'baia-de-todos-os-santos'],
  ])('"%s" -> %s', (costa, id) => {
    expect(regionFromCosta(costa)).toBe(id);
  });

  it('texto desconhecido não vira região', () => {
    expect(regionFromCosta('Costa dos Coqueiros')).toBeNull();
  });

  it('aceita o alias longo no cabeçalho de Salvador', () => {
    const t = salvador.replace(
      'Costa: Litoral de Salvador',
      'Costa: Baía de Todos os Santos - Litoral Salvador',
    );
    expect(readBulletin(t, 'salvador', NOW).ok).toBe(true);
  });

  it('rejeita região que não é a esperada', () => {
    const r = readBulletin(salvador, 'baia-de-todos-os-santos', NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toContain('não é a esperada');
  });
});

describe('validação: qualquer falha rejeita a leitura', () => {
  const errorsOf = (
    text: string,
    region: 'salvador' | 'baia-de-todos-os-santos' = 'salvador',
  ) => {
    const r = readBulletin(text, region, NOW);
    if (r.ok) throw new Error('era para falhar');
    return r.errors.join(' | ');
  };

  it('cabeçalho ausente', () => {
    expect(
      errorsOf(salvador.replace(/Boletim\s+N\S*\s*\d+\/\d{4}/, '')),
    ).toContain('número/ano');
    expect(errorsOf(salvador.replace(/Emitido em:/, ''))).toContain(
      'data de emissão',
    );
    expect(errorsOf(salvador.replace(/Costa:/, ''))).toContain('Costa');
  });

  it('data inexistente ou no futuro', () => {
    expect(errorsOf(salvador.replace('06/11/2026', '31/02/2026'))).toContain(
      'Data de emissão inválida',
    );
    expect(errorsOf(salvador.replace('06/11/2026', '06/11/2027'))).toContain(
      'futuro',
    );
  });

  it('categoria desconhecida', () => {
    expect(
      errorsOf(
        bts.replace(
          'Em frente à Igreja. Imprópria',
          'Em frente à Igreja. Indisponível',
        ),
        'baia-de-todos-os-santos',
      ),
    ).toContain('BTS MD 100');
  });

  it('código repetido', () => {
    expect(
      errorsOf(
        bts.replace('BTS MD 200', 'BTS MD 100'),
        'baia-de-todos-os-santos',
      ),
    ).toContain('Código repetido');
  });

  it('prefixo do código incompatível com a região', () => {
    const t = bts.replace(
      'Costa: Baía de Todos os Santos',
      'Costa: Litoral de Salvador',
    );
    expect(errorsOf(t, 'salvador')).toContain('prefixo "BTS"');
  });

  it('quantidade de pontos implausível', () => {
    const [head] = salvador.split('São Tomé de Paripe - SSA IN 100');
    const few = `${head}São Tomé de Paripe - SSA IN 100 Em frente à casa. Imprópria\nObservações:\nRESOLUÇÃO CONAMA`;
    expect(errorsOf(few)).toContain('Quantidade de pontos implausível: 1');
  });

  it('texto sobrando depois do último ponto', () => {
    const t = salvador.replace(
      'Observações:',
      'Linha inesperada qualquer\nObservações:',
    );
    expect(errorsOf(t)).toContain('Texto inesperado');
  });

  it('sem Observações ou sem fim das Observações', () => {
    expect(errorsOf(salvador.replace('Observações:', ''))).toContain(
      'Observações',
    );
    expect(errorsOf(salvador.replace(/RESOLU[CÇ]/, 'XXXX'))).toContain(
      'Fim da seção',
    );
  });

  it('cabeçalho da tabela mudou', () => {
    expect(
      errorsOf(salvador.replace('Ponto - Código', 'Praia - Identificador')),
    ).toContain('Cabeçalho da tabela');
  });
});

describe('gravação em data/bulletins', () => {
  let dir = '';
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = '';
  });
  const tmp = async () => (dir = await mkdtemp(join(tmpdir(), 'praieros-')));

  it('grava o JSON quando a validação passa', async () => {
    const d = await tmp();
    const res = await ingestPdf(fixture('salvador.pdf'), {
      region: 'salvador',
      sourceUrl: 'https://x.test/s.pdf',
      dir: d,
      now: NOW,
    });
    expect(res).toEqual({
      ok: true,
      status: 'written',
      file: '2026-37-salvador.json',
    });
    const saved = JSON.parse(
      await readFile(join(d, '2026-37-salvador.json'), 'utf8'),
    );
    expect(saved).toMatchObject({
      schemaVersion: 1,
      region: 'salvador',
      number: 37,
      year: 2026,
      sourceUrl: 'https://x.test/s.pdf',
    });
    expect(saved.points).toHaveLength(38);
  });

  it('repetir a gravação não muda nada; conteúdo diferente vira conflito e não sobrescreve', async () => {
    const d = await tmp();
    const input = {
      region: 'salvador' as const,
      sourceUrl: null,
      dir: d,
      now: NOW,
    };
    await ingestText(salvador, input);
    expect(await ingestText(salvador, input)).toMatchObject({
      ok: true,
      status: 'unchanged',
    });

    const path = join(
      d,
      bulletinFileName({ year: 2026, number: 37, region: 'salvador' }),
    );
    await writeFile(path, '{"manual":true}\n');
    expect(await ingestText(salvador, input)).toMatchObject({
      ok: true,
      status: 'conflict',
    });
    expect(await readFile(path, 'utf8')).toBe('{"manual":true}\n');
  });

  it('validação falhou: não grava nada', async () => {
    const d = await tmp();
    const res = await ingestText(
      salvador.replace('BTS', 'XXX').replace('SSA IN 100', 'SSA IN 1'),
      {
        region: 'salvador',
        sourceUrl: null,
        dir: d,
        now: NOW,
      },
    );
    expect(res.ok).toBe(false);
    expect(await readdir(d)).toEqual([]);
  });

  it('PDF ilegível: devolve erro, não lança e não grava', async () => {
    const d = await tmp();
    const res = await ingestPdf(new TextEncoder().encode('%PDF-1.7 lixo'), {
      region: 'salvador',
      sourceUrl: null,
      dir: d,
      now: NOW,
    });
    expect(res.ok).toBe(false);
    expect(await readdir(d)).toEqual([]);
  });
});
