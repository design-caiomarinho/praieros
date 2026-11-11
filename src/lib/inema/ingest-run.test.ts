import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FetchResult, PdfResult } from './fetch-bulletins.ts';
import { hasFailure, ingestRegion, runIngest } from './ingest-run.ts';

const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url)),
  );
const NOW = new Date('2026-11-11T12:00:00Z');

const salvador = (url = 'https://x/a.pdf'): PdfResult => ({
  ok: true,
  region: 'SALVADOR',
  url,
  bytes: fixture('salvador.pdf'),
});
const bts: PdfResult = {
  ok: true,
  region: 'BAÍA DE TODOS-OS-SANTOS',
  url: 'https://x/b.pdf',
  bytes: fixture('baia-de-todos-os-santos.pdf'),
};
const badBts: PdfResult = {
  ok: true,
  region: 'BAÍA DE TODOS-OS-SANTOS',
  url: 'https://x/b.pdf',
  bytes: new TextEncoder().encode('%PDF-1.4 lixo'),
};
const ok = (...regions: PdfResult[]): FetchResult => ({
  ok: true,
  html: '',
  regions,
});

let dir = '';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ingest-run-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('ingestRegion', () => {
  it('grava um boletim novo', async () => {
    const r = await ingestRegion(salvador(), dir, NOW);
    expect(r).toMatchObject({
      status: 'written',
      file: '2026-37-salvador.json',
    });
    expect(await readdir(dir)).toEqual(['2026-37-salvador.json']);
  });

  it('igual ao existente: unchanged', async () => {
    await ingestRegion(salvador(), dir, NOW);
    const r = await ingestRegion(salvador(), dir, NOW);
    expect(r.status).toBe('unchanged');
  });

  it('só o sourceUrl mudou: unchanged, arquivo intacto', async () => {
    await ingestRegion(salvador(), dir, NOW);
    const before = await readFile(join(dir, '2026-37-salvador.json'), 'utf8');
    const r = await ingestRegion(
      salvador('https://x/outro-nome.pdf'),
      dir,
      NOW,
    );
    expect(r.status).toBe('unchanged');
    expect(await readFile(join(dir, '2026-37-salvador.json'), 'utf8')).toBe(
      before,
    );
  });

  it('conteúdo diferente: erro e arquivo intacto', async () => {
    await ingestRegion(salvador(), dir, NOW);
    const path = join(dir, '2026-37-salvador.json');
    const changed = JSON.parse(await readFile(path, 'utf8'));
    changed.points[0].category =
      changed.points[0].category === 'Própria' ? 'Imprópria' : 'Própria';
    const text = `${JSON.stringify(changed, null, 2)}\n`;
    await writeFile(path, text);
    const r = await ingestRegion(salvador(), dir, NOW);
    expect(r.status).toBe('error');
    expect(await readFile(path, 'utf8')).toBe(text);
  });

  it('PDF ilegível: erro e nada gravado', async () => {
    const r = await ingestRegion(badBts, dir, NOW);
    expect(r.status).toBe('error');
    expect(await readdir(dir)).toEqual([]);
  });

  it('download falhou: erro com o motivo', async () => {
    const r = await ingestRegion(
      { ok: false, region: 'SALVADOR', reason: 'timeout' },
      dir,
    );
    expect(r).toMatchObject({ status: 'error', errors: ['timeout'] });
  });
});

describe('runIngest', () => {
  it('as duas válidas: grava as duas, sem falha', async () => {
    const out = await runIngest(ok(salvador(), bts), dir, NOW);
    expect(out.regions.map((r) => r.status)).toEqual(['written', 'written']);
    expect(hasFailure(out)).toBe(false);
  });

  it('Baía falha: Salvador é gravada e há falha', async () => {
    const out = await runIngest(ok(salvador(), badBts), dir, NOW);
    expect(out.regions.map((r) => r.status)).toEqual(['written', 'error']);
    expect(await readdir(dir)).toEqual(['2026-37-salvador.json']);
    expect(hasFailure(out)).toBe(true);
  });

  it('Salvador falha: Baía é gravada e há falha', async () => {
    const badSsa: PdfResult = { ok: false, region: 'SALVADOR', reason: 'x' };
    const out = await runIngest(ok(badSsa, bts), dir, NOW);
    expect(out.regions.map((r) => r.status)).toEqual(['error', 'written']);
    expect(hasFailure(out)).toBe(true);
  });

  it('página fora do ar: erro fatal, nada gravado', async () => {
    const out = await runIngest(
      { ok: false, reason: 'fora do ar', regions: [] },
      dir,
    );
    expect(out.fatal).toBe('fora do ar');
    expect(hasFailure(out)).toBe(true);
    expect(await readdir(dir)).toEqual([]);
  });
});
