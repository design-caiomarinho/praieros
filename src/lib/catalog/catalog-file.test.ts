import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readCatalogFile,
  serializeCatalog,
  writeCatalogFile,
} from './catalog-file.ts';
import { movePoint } from './review.ts';
import type { Catalog } from './types.ts';

const v3 = {
  schemaVersion: 3,
  region: 'salvador',
  beaches: [
    {
      name: 'Praia A',
      neighborhood: 'Bairro A',
      neighborhoodSource: null,
      neighborhoodVerified: false,
      proposalNote: null,
      points: [
        {
          code: 'SSA 1',
          lat: -12.9,
          lng: -38.4,
          source: null,
          verified: false,
        },
      ],
    },
  ],
};

let dir: string;
let file: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'catalog-'));
  file = join(dir, 'salvador.json');
  await writeFile(file, JSON.stringify(v3), 'utf8');
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('writeCatalogFile', () => {
  it('lê o v3 como v4 e grava o v4 sem deixar arquivo temporário', async () => {
    const prev = await readCatalogFile(file);
    const moved = movePoint(
      prev,
      'Praia A',
      'SSA 1',
      -12.95,
      -38.45,
      '2026-11-12',
    );
    if (!moved.ok) throw new Error(moved.error);
    expect(await writeCatalogFile(file, prev, moved.catalog)).toEqual([]);
    const saved = JSON.parse(await readFile(file, 'utf8')) as Catalog;
    expect(saved.schemaVersion).toBe(4);
    expect(saved.beaches[0]!.points[0]).toMatchObject({
      lat: -12.95,
      source: { method: 'manual' },
    });
    expect(await readdir(dir)).toEqual(['salvador.json']);
    expect(await readFile(file, 'utf8')).toBe(serializeCatalog(saved));
  });

  it('não grava nada quando a validação recusa', async () => {
    const prev = await readCatalogFile(file);
    const bad = structuredClone(prev);
    bad.beaches[0]!.points[0]!.lat = 40;
    const before = await readFile(file, 'utf8');
    const errors = await writeCatalogFile(file, prev, bad);
    expect(errors.length).toBeGreaterThan(0);
    expect(await readFile(file, 'utf8')).toBe(before);
    expect(await readdir(dir)).toEqual(['salvador.json']);
  });
});
