import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RegionId, StoredBulletin } from './bulletin.ts';
import { parseBulletinText } from './parse-bulletin.ts';
import { extractPdfText } from './read-pdf.ts';
import { validateBulletin } from './validate-bulletin.ts';

export type ReadResult =
  | { ok: true; bulletin: Omit<StoredBulletin, 'sourceUrl'> }
  | { ok: false; errors: string[] };

/** Texto do PDF -> boletim validado. Pura. */
export function readBulletin(
  text: string,
  region: RegionId,
  now: Date = new Date(),
): ReadResult {
  const parsed = parseBulletinText(text);
  if (!parsed.ok) return parsed;
  const errors = validateBulletin(parsed.bulletin, region, now);
  if (errors.length > 0) return { ok: false, errors };
  const b = parsed.bulletin;
  return {
    ok: true,
    bulletin: {
      schemaVersion: 1,
      region,
      number: b.number,
      year: b.year,
      issuedAt: b.issuedAt,
      costa: b.costa,
      observations: b.observations,
      points: b.points,
    },
  };
}

export function bulletinFileName(
  b: Pick<StoredBulletin, 'year' | 'number' | 'region'>,
): string {
  return `${b.year}-${String(b.number).padStart(2, '0')}-${b.region}.json`;
}

export type WriteStatus = 'written' | 'unchanged' | 'conflict';

/**
 * Grava o JSON do boletim. Nunca sobrescreve um arquivo existente com conteúdo diferente
 * ('conflict'): o mesmo nº/ano com dados diferentes pede decisão humana.
 */
export async function writeBulletin(
  dir: string,
  bulletin: StoredBulletin,
): Promise<WriteStatus> {
  const path = join(dir, bulletinFileName(bulletin));
  const content = `${JSON.stringify(bulletin, null, 2)}\n`;
  try {
    const existing = await readFile(path, 'utf8');
    return existing === content ? 'unchanged' : 'conflict';
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await mkdir(dir, { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, path);
  return 'written';
}

export interface IngestInput {
  region: RegionId;
  sourceUrl: string | null;
  dir: string;
  now?: Date;
}

export type IngestResult =
  | { ok: true; status: WriteStatus; file: string }
  | { ok: false; errors: string[] };

/** Texto -> valida -> grava. Se a validação falhar, não grava nada (D4). Nunca lança. */
export async function ingestText(
  text: string,
  input: IngestInput,
): Promise<IngestResult> {
  try {
    const read = readBulletin(text, input.region, input.now);
    if (!read.ok) return read;
    const bulletin: StoredBulletin = {
      ...read.bulletin,
      sourceUrl: input.sourceUrl,
    };
    const status = await writeBulletin(input.dir, bulletin);
    return { ok: true, status, file: bulletinFileName(bulletin) };
  } catch (err) {
    return {
      ok: false,
      errors: [
        `Falha ao gravar: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

/** PDF -> texto -> valida -> grava. Nunca lança. */
export async function ingestPdf(
  bytes: Uint8Array,
  input: IngestInput,
): Promise<IngestResult> {
  let text: string;
  try {
    text = await extractPdfText(bytes);
  } catch (err) {
    return {
      ok: false,
      errors: [
        `Falha ao ler o PDF: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
  return ingestText(text, input);
}
