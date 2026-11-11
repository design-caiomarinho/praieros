import { STATUS_LABELS, type ChipStatus } from '../rules/status.ts';
import type { BulletinRef } from '../rules/types.ts';
import type { BeachModel } from './build-beach-models.ts';

/** Página oficial do Inema, usada quando o boletim não guarda o link do PDF. */
export const OFFICIAL_PAGE_URL =
  'https://www.ba.gov.br/inema/iniciativas/qualidade-das-praias';

/** "37/2026" (nº/ano), como no boletim. */
export function bulletinNumber(ref: BulletinRef): string {
  return `${ref.number}/${ref.year}`;
}

/** "AAAA-MM-DD" (com ou sem hora) para "dd/mm/aaaa". Sem converter fuso: o dia é o do boletim. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export interface BeachPanelData {
  name: string;
  neighborhood: string;
  bulletin: { number: string; date: string; pdfUrl: string };
  points: { name: string; location?: string; status: ChipStatus }[];
  notice?: 'outdated' | 'no-result';
  note?: string;
}

/**
 * Props do BeachPanel a partir do modelo da camada de dados (sem regra de negócio nova:
 * R1–R4 já foram aplicadas em `buildSiteModel`). `pdfUrls` indexa "nº/ano" -> link do PDF.
 * Retorna null se não houver boletim para mostrar (nunca inventar data).
 */
export function toPanelData(
  beach: BeachModel,
  current: BulletinRef | null,
  pdfUrls: ReadonlyMap<string, string>,
): BeachPanelData | null {
  const ref = beach.referenceBulletin ?? current;
  if (!ref) return null;
  const number = bulletinNumber(ref);
  const base = {
    name: beach.name,
    neighborhood: beach.neighborhood ?? 'Salvador',
    bulletin: {
      number,
      date: formatDate(ref.issuedAt),
      pdfUrl: pdfUrls.get(number) ?? OFFICIAL_PAGE_URL,
    },
  };

  // R4: sem status exibível. Mostra só a nota (a data do boletim é a do atual).
  if (beach.kind === 'never') {
    return {
      ...base,
      points: [],
      notice: 'no-result',
      note: `Esta praia não consta no boletim nº ${number}.`,
    };
  }
  if (beach.kind === 'too-old') {
    return {
      ...base,
      points: [],
      notice: 'no-result',
      note: beach.lastAnalysisDate
        ? `A última análise foi em ${formatDate(beach.lastAnalysisDate)}, antiga demais para mostrar.`
        : undefined,
    };
  }

  return {
    ...base,
    points: beach.points.map((p, i) => ({
      name: `Ponto ${i + 1}`,
      location: p.location ?? undefined,
      status: p.status,
    })),
    notice: beach.banner === 'outdated' ? 'outdated' : undefined,
  };
}

/** Rótulo acessível de um ponto no mapa: praia, ponto e status (e o último resultado, se desatualizado). */
export function markerAriaLabel(
  beachName: string,
  pointNumber: number,
  status: ChipStatus,
  lastStatus?: ChipStatus,
): string {
  const parts = [beachName, `Ponto de coleta ${pointNumber}`];
  if (status === 'outdated' && lastStatus && lastStatus !== 'outdated') {
    parts.push(
      `Boletim desatualizado, último resultado: ${STATUS_LABELS[lastStatus]}`,
    );
  } else {
    parts.push(STATUS_LABELS[status]);
  }
  return parts.join(', ');
}
