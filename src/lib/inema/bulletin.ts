import type { RegionLabel } from './fetch-bulletins.ts';

export type Category = 'Própria' | 'Imprópria';
export const CATEGORIES: readonly Category[] = ['Própria', 'Imprópria'];

export type RegionId = 'salvador' | 'baia-de-todos-os-santos';

export interface RegionConfig {
  id: RegionId;
  /** Rótulo do link na página do Inema. */
  label: RegionLabel;
  /** Textos conhecidos de "Costa:" no cabeçalho do PDF. Comparação sem caixa, acento ou pontuação. */
  aliases: readonly string[];
  /** Prefixos aceitos nos códigos dos pontos desta região. */
  codePrefixes: readonly string[];
}

export const REGIONS: Record<RegionId, RegionConfig> = {
  salvador: {
    id: 'salvador',
    label: 'SALVADOR',
    aliases: [
      'Litoral de Salvador',
      'Salvador',
      'Baía de Todos os Santos - Litoral Salvador',
    ],
    codePrefixes: ['SSA'],
  },
  'baia-de-todos-os-santos': {
    id: 'baia-de-todos-os-santos',
    label: 'BAÍA DE TODOS-OS-SANTOS',
    aliases: ['Baía de Todos os Santos', 'Baía de Todos-os-Santos'],
    codePrefixes: ['BTS'],
  },
};

export function regionIdFromLabel(label: RegionLabel): RegionId {
  const found = Object.values(REGIONS).find((r) => r.label === label);
  if (!found) throw new Error(`Região desconhecida: ${label}`);
  return found.id;
}

/** Faixa de pontos considerada plausível por boletim. Fora dela, a leitura é rejeitada. */
export const MIN_POINTS = 10;
export const MAX_POINTS = 80;

export interface BulletinPoint {
  /** Ex.: "SSA IN 100". */
  code: string;
  /** Texto da coluna "Ponto", exatamente como no boletim. */
  beach: string;
  /** Texto da coluna "Local da Coleta". */
  location: string;
  category: Category;
}

/** Resultado estrutural da leitura do texto, ainda sem validação. */
export interface ParsedBulletin {
  /** Texto bruto depois de "Costa:". */
  costa: string;
  number: number;
  year: number;
  /** AAAA-MM-DD, como escrito no boletim (a validação confere se a data existe). */
  issuedAt: string;
  points: BulletinPoint[];
  /** Linhas da seção "Observações", como extraídas (sem o cabeçalho de página repetido). */
  observations: string[];
}

export interface StoredBulletin {
  schemaVersion: 1;
  region: RegionId;
  number: number;
  year: number;
  issuedAt: string;
  costa: string;
  sourceUrl: string | null;
  observations: string[];
  points: BulletinPoint[];
}
