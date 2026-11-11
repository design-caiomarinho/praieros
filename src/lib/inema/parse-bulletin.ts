import type { BulletinPoint, Category, ParsedBulletin } from './bulletin.ts';

export type ParseResult =
  { ok: true; bulletin: ParsedBulletin } | { ok: false; errors: string[] };

const CATEGORY_WORD = /\b(Imprópria|Própria)\b/g;
const CODE_AFTER_DASH = / [-–] ([A-Z]{3} [A-ZÇ]{2} \d{3})(?=\s)/g;
const TABLE_HEADER =
  /^\s*Ponto\s*[-–]\s*Código\s+Local da Coleta\s*(?:Categoria|Cat\s+eg\s+ori\s+a)?\s*/;

/**
 * Lê o texto extraído do PDF. Função pura, só estrutura: não decide se a leitura é confiável
 * (isso é da validação). Qualquer coisa que não encaixe vira erro, nunca um palpite.
 */
export function parseBulletinText(text: string): ParseResult {
  const errors: string[] = [];

  const costa = /Costa:[ \t]*(.+)/.exec(text)?.[1].trim();
  if (!costa) errors.push('Cabeçalho: "Costa:" não encontrado.');

  const num = /Boletim\s+N\S{0,2}\s*(\d+)\s*\/\s*(\d{4})/.exec(text);
  if (!num) errors.push('Cabeçalho: número/ano do boletim não encontrados.');

  const date = /Emitido em:\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  if (!date) errors.push('Cabeçalho: data de emissão não encontrada.');

  const lines = text.split(/\r?\n/);
  const obsStart = lines.findIndex((l) =>
    /^\s*Observa[çc][õo]es\s*:?\s*$/.test(l),
  );
  if (obsStart < 0) errors.push('Seção "Observações" não encontrada.');

  if (errors.length > 0 || !costa || !num || !date)
    return { ok: false, errors };

  const afterHeader = text.slice(date.index + date[0].length);
  const obsOffset = afterHeader.search(/^\s*Observa[çc][õo]es\s*:?\s*$/m);
  const rawBody =
    obsOffset >= 0 ? afterHeader.slice(0, obsOffset) : afterHeader;
  const body = rawBody
    .replace(/\s+/g, ' ')
    .replace(/\bImp\s*r[óo]p\s*ria\b/g, 'Imprópria')
    .replace(/\bPr[óo]\s+pria\b/g, 'Própria')
    .trim()
    .replace(/^\/?\s*/, '');

  const headerMatch = TABLE_HEADER.exec(body);
  if (!headerMatch) {
    return {
      ok: false,
      errors: ['Cabeçalho da tabela de pontos não reconhecido.'],
    };
  }
  const table = body.slice(headerMatch[0].length);

  const codes = [...table.matchAll(CODE_AFTER_DASH)];
  if (codes.length === 0) {
    return {
      ok: false,
      errors: ['Nenhum ponto (código) encontrado na tabela.'],
    };
  }

  const points: BulletinPoint[] = [];
  let beach = table.slice(0, codes[0].index).trim();
  for (let i = 0; i < codes.length; i++) {
    const m = codes[i];
    const isLast = i === codes.length - 1;
    const start = (m.index ?? 0) + m[0].length;
    const end = isLast ? table.length : (codes[i + 1].index ?? table.length);
    const segment = table.slice(start, end);
    const categories = [...segment.matchAll(CATEGORY_WORD)];
    const last = categories.at(-1);
    if (!last) {
      errors.push(
        `Ponto ${m[1]}: categoria (Própria | Imprópria) não encontrada.`,
      );
      beach = '';
      continue;
    }
    const location = segment.slice(0, last.index).trim();
    const nextBeach = segment.slice((last.index ?? 0) + last[0].length).trim();
    if (CATEGORY_WORD.test(location)) {
      errors.push(`Ponto ${m[1]}: mais de uma categoria no mesmo registro.`);
    }
    CATEGORY_WORD.lastIndex = 0;
    if (isLast && nextBeach !== '') {
      errors.push(
        `Texto inesperado depois do último ponto: "${nextBeach.slice(0, 80)}".`,
      );
    }
    points.push({ code: m[1], beach, location, category: last[1] as Category });
    beach = nextBeach;
  }
  if (errors.length > 0) return { ok: false, errors };

  const obsEnd = lines.findIndex(
    (l, i) => i > obsStart && /^\s*RESOLU[CÇ]/i.test(l),
  );
  if (obsEnd < 0) {
    return {
      ok: false,
      errors: ['Fim da seção "Observações" não identificado.'],
    };
  }
  const observations = lines
    .slice(obsStart + 1, obsEnd)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !/^CAMPANHA\s+\d+\/\d{4}/i.test(l));

  return {
    ok: true,
    bulletin: {
      costa,
      number: Number(num[1]),
      year: Number(num[2]),
      issuedAt: `${date[3]}-${date[2]}-${date[1]}`,
      points,
      observations,
    },
  };
}
