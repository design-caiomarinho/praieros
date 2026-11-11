import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { regionIdFromLabel } from './bulletin.ts';
import type { StoredBulletin } from './bulletin.ts';
import type { FetchResult, PdfResult, RegionLabel } from './fetch-bulletins.ts';
import {
  bulletinFileName,
  readBulletin,
  writeBulletin,
} from './ingest-bulletin.ts';
import { extractPdfText } from './read-pdf.ts';

export type RegionOutcome =
  | { region: RegionLabel; status: 'written' | 'unchanged'; file: string }
  | { region: RegionLabel; status: 'error'; errors: string[] };

export interface RunOutcome {
  /** Falha antes de qualquer região (ex.: página do Inema fora do ar). */
  fatal: string | null;
  regions: RegionOutcome[];
}

const withoutSourceUrl = (b: StoredBulletin) => ({ ...b, sourceUrl: null });

/**
 * Lê, valida e grava UMA região, de forma independente das outras (D4 por região).
 * Mesmo nº/ano já gravado: só o `sourceUrl` diferente = 'unchanged'; qualquer outro
 * conteúdo diferente = erro (nunca sobrescreve). Nunca lança.
 */
export async function ingestRegion(
  pdf: PdfResult,
  dir: string,
  now?: Date,
): Promise<RegionOutcome> {
  const region = pdf.region;
  const fail = (...errors: string[]): RegionOutcome => ({
    region,
    status: 'error',
    errors,
  });
  if (!pdf.ok) return fail(pdf.reason);
  try {
    let text: string;
    try {
      text = await extractPdfText(pdf.bytes);
    } catch (err) {
      return fail(
        `Falha ao ler o PDF: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const read = readBulletin(text, regionIdFromLabel(region), now);
    if (!read.ok) return fail(...read.errors);
    const bulletin: StoredBulletin = { ...read.bulletin, sourceUrl: pdf.url };
    const file = bulletinFileName(bulletin);

    let existing: StoredBulletin | null = null;
    try {
      existing = JSON.parse(await readFile(join(dir, file), 'utf8'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        return fail(
          `Não foi possível ler ${file} existente: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (existing) {
      return isDeepStrictEqual(
        withoutSourceUrl(existing),
        withoutSourceUrl(bulletin),
      )
        ? { region, status: 'unchanged', file }
        : fail(
            `Conflito: ${file} já existe com conteúdo diferente. O arquivo não foi alterado; é preciso decisão humana.`,
          );
    }
    const status = await writeBulletin(dir, bulletin);
    return status === 'written'
      ? { region, status: 'written', file }
      : fail(`Conflito inesperado ao gravar ${file}.`);
  } catch (err) {
    return fail(
      `Falha ao gravar: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Processa cada região de forma independente: uma falha não bloqueia a outra. */
export async function runIngest(
  fetched: FetchResult,
  dir: string,
  now?: Date,
): Promise<RunOutcome> {
  if (!fetched.ok) return { fatal: fetched.reason, regions: [] };
  const regions: RegionOutcome[] = [];
  for (const pdf of fetched.regions) {
    regions.push(await ingestRegion(pdf, dir, now));
  }
  return { fatal: null, regions };
}

/** O workflow deve terminar com falha se houve erro fatal ou em qualquer região. */
export function hasFailure(outcome: RunOutcome): boolean {
  return (
    outcome.fatal !== null || outcome.regions.some((r) => r.status === 'error')
  );
}
