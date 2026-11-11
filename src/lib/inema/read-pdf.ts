import { extractText, getDocumentProxy } from 'unpdf';

/** Extrai o texto do PDF, páginas unidas por quebra de linha. Lança se o PDF for ilegível. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.join('\n');
}
