import {
  CATEGORIES,
  MAX_POINTS,
  MIN_POINTS,
  REGIONS,
  type ParsedBulletin,
  type RegionId,
} from './bulletin.ts';
import { normalizeLabel } from './fetch-bulletins.ts';

const CODE = /^([A-Z]{3}) [A-ZÇ]{2} \d{3}$/;
const BEACH_NAME = /^\p{Lu}[\p{L}\p{N} .'’()/-]*$/u;
const MAX_BEACH_LENGTH = 60;
const MAX_LOCATION_LENGTH = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Identifica a região pelo texto de "Costa:", usando os aliases conhecidos. */
export function regionFromCosta(costa: string): RegionId | null {
  const norm = normalizeLabel(costa);
  for (const region of Object.values(REGIONS)) {
    if (region.aliases.some((a) => normalizeLabel(a) === norm))
      return region.id;
  }
  return null;
}

/**
 * Valida o boletim lido. Função pura. Lista vazia = pode gravar.
 * Qualquer erro = não gravar nada (regra D4).
 */
export function validateBulletin(
  parsed: ParsedBulletin,
  expected: RegionId,
  now: Date = new Date(),
): string[] {
  const errors: string[] = [];
  const region = REGIONS[expected];

  const found = regionFromCosta(parsed.costa);
  if (found === null) {
    errors.push(`Região do cabeçalho desconhecida: "${parsed.costa}".`);
  } else if (found !== expected) {
    errors.push(
      `Região do cabeçalho ("${parsed.costa}") não é a esperada (${region.label}).`,
    );
  }

  if (
    !Number.isInteger(parsed.number) ||
    parsed.number < 1 ||
    parsed.number > 99
  ) {
    errors.push(`Número do boletim fora do intervalo: ${parsed.number}.`);
  }
  if (
    !Number.isInteger(parsed.year) ||
    parsed.year < 2000 ||
    parsed.year > now.getUTCFullYear() + 1
  ) {
    errors.push(`Ano do boletim fora do intervalo: ${parsed.year}.`);
  }

  const [y, m, d] = parsed.issuedAt.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const real =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
  if (!real) {
    errors.push(`Data de emissão inválida: ${parsed.issuedAt}.`);
  } else if (date.getTime() > now.getTime() + DAY_MS) {
    errors.push(`Data de emissão no futuro: ${parsed.issuedAt}.`);
  }

  const total = parsed.points.length;
  if (total < MIN_POINTS || total > MAX_POINTS) {
    errors.push(
      `Quantidade de pontos implausível: ${total} (esperado de ${MIN_POINTS} a ${MAX_POINTS}).`,
    );
  }

  const seen = new Set<string>();
  for (const p of parsed.points) {
    const id = p.code || '(sem código)';
    const code = CODE.exec(p.code);
    if (!code) {
      errors.push(`Código inválido: "${p.code}".`);
    } else if (!region.codePrefixes.includes(code[1])) {
      errors.push(
        `Ponto ${id}: prefixo "${code[1]}" não é de ${region.label}.`,
      );
    }
    if (seen.has(p.code)) errors.push(`Código repetido: ${id}.`);
    seen.add(p.code);

    if (
      !p.beach ||
      p.beach.length > MAX_BEACH_LENGTH ||
      !BEACH_NAME.test(p.beach)
    ) {
      errors.push(
        `Ponto ${id}: nome da praia inválido ("${p.beach.slice(0, 60)}").`,
      );
    }
    if (!p.location || p.location.length > MAX_LOCATION_LENGTH) {
      errors.push(`Ponto ${id}: local da coleta ausente ou longo demais.`);
    }
    if (!CATEGORIES.includes(p.category)) {
      errors.push(
        `Ponto ${id}: categoria não reconhecida ("${String(p.category)}").`,
      );
    }
  }
  return errors;
}
