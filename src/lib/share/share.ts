import { STATUS_LABELS, type ChipStatus } from '../rules/status.ts';
import type { BeachModel } from '../site/build-beach-models.ts';
import { bulletinNumber, formatDate } from '../site/panel-props.ts';
import type { BulletinRef } from '../rules/types.ts';

// Compartilhar praia (R6). Funções puras: o link aponta para uma página estática da praia
// (`/praia/<slug>/`) que leva as meta tags da prévia e abre o site já na ficha.

/** Raiz do site com a barra final ("https://x.github.io/praieros/"). */
function root(origin: string, base: string): string {
  const b = base.replace(/^\/+|\/+$/g, '');
  return `${origin.replace(/\/+$/, '')}/${b ? `${b}/` : ''}`;
}

/** Link compartilhado do site: a raiz, que abre o mapa. */
export function siteUrl(origin: string, base: string): string {
  return root(origin, base);
}

/** Mensagem do WhatsApp ao compartilhar o site. */
export function siteShareMessage(url: string): string {
  return `Veja a balneabilidade das praias de Salvador de forma clara, no Praieros:\n${url}`;
}

/** Link compartilhado da praia: página com a prévia, que redireciona para o estado atual. */
export function shareUrl(origin: string, base: string, slug: string): string {
  return `${root(origin, base)}praia/${encodeURIComponent(slug)}/`;
}

/** Imagem da prévia (pin da praia sobre o mapa). */
export function shareImageUrl(
  origin: string,
  base: string,
  slug: string,
): string {
  return `${root(origin, base)}share/${encodeURIComponent(slug)}.jpg`;
}

/** Caminho local da mesma imagem (miniatura no painel: não depende do endereço publicado). */
export function shareImagePath(base: string, slug: string): string {
  const b = base.replace(/^\/+|\/+$/g, '');
  return `${b ? `/${b}` : ''}/share/${encodeURIComponent(slug)}.jpg`;
}

/** Destino do redirecionamento: o site com a ficha da praia aberta (`?praia=<slug>`). */
export function openBeachPath(base: string, slug: string): string {
  const b = base.replace(/^\/+|\/+$/g, '');
  return `${b ? `/${b}` : ''}/?praia=${encodeURIComponent(slug)}`;
}

/** Slug pedido em `?praia=`; só o que existe no site (nunca abre algo inventado). */
export function slugFromSearch(
  search: string,
  known: ReadonlySet<string>,
): string | null {
  const slug = new URLSearchParams(search).get('praia');
  return slug && known.has(slug) ? slug : null;
}

/** Mensagem enviada pelo WhatsApp. Fica como foi enviada (R6): não leva status nem data. */
export function shareMessage(beachName: string, url: string): string {
  return `Confira a balneabilidade de ${beachName} no Praieros:\n${url}`;
}

export function whatsappUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export interface SharePreview {
  title: string;
  /** Status + data do boletim do momento (R6), com a fonte. */
  description: string;
}

/**
 * Texto da prévia, com as mesmas regras da ficha: R3 (desatualizada mantém o último status e
 * avisa), R4 (sem resultado nunca mostra status antigo). Sem boletim, não afirma nada.
 */
export function sharePreview(
  beach: Pick<BeachModel, 'name' | 'kind' | 'banner' | 'worstStatus'> &
    Partial<Pick<BeachModel, 'referenceBulletin'>>,
  current: BulletinRef | null,
): SharePreview {
  const title = `${beach.name} - Praieros`;
  const ref = beach.referenceBulletin ?? current;
  if (!ref) {
    return { title, description: 'Balneabilidade das praias de Salvador.' };
  }
  const noResult =
    beach.kind === 'never' ||
    beach.kind === 'too-old' ||
    beach.kind === 'reference';
  const status: ChipStatus = noResult ? 'no-result' : beach.worstStatus;
  const parts = [STATUS_LABELS[status]];
  if (!noResult && beach.banner === 'outdated') {
    parts.push('Boletim desatualizado');
  }
  const bulletin = noResult && current ? current : ref;
  parts.push(
    `Boletim nº ${bulletinNumber(bulletin)} - emitido em ${formatDate(bulletin.issuedAt)}`,
    'Fonte: Inema',
  );
  return { title, description: parts.join(' - ') };
}
