// Funções puras dos ícones do site (sem I/O): símbolo do logo, arquivo .ico e manifest.

const SYMBOL_FILL = '#147DFF';

/**
 * Símbolo da onda: os caminhos azuis (#147DFF) que o logo traz antes do nome. O logo tem 20 px de
 * altura e o símbolo ocupa os primeiros 20 px da largura.
 */
export function symbolSvg(logoSvg: string): string {
  const paths = [...logoSvg.matchAll(/<path\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((p) => p.toUpperCase().includes(`FILL="${SYMBOL_FILL}"`));
  if (paths.length !== 3) {
    throw new Error(
      `O logo deveria ter 3 caminhos do símbolo (${SYMBOL_FILL}); achei ${paths.length}.`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">\n${paths.join('\n')}\n</svg>\n`;
}

/** Arquivo .ico com uma imagem PNG por tamanho (formato aceito por todos os navegadores atuais). */
export function buildIco(images: { size: number; png: Uint8Array }[]): Buffer {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: ícone
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((img, i) => {
    const at = 6 + i * 16;
    header.writeUInt8(img.size >= 256 ? 0 : img.size, at); // largura
    header.writeUInt8(img.size >= 256 ? 0 : img.size, at + 1); // altura
    header.writeUInt8(0, at + 2); // sem paleta
    header.writeUInt8(0, at + 3);
    header.writeUInt16LE(1, at + 4); // planos
    header.writeUInt16LE(32, at + 6); // bits por pixel
    header.writeUInt32LE(img.png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += img.png.length;
  });
  return Buffer.concat([header, ...images.map((i) => Buffer.from(i.png))]);
}

/** Manifest do site. Caminhos relativos ao próprio arquivo: valem na raiz e em subcaminho. */
export function buildManifest(colors: {
  themeColor: string;
  backgroundColor: string;
}): string {
  return (
    JSON.stringify(
      {
        name: 'Praieros',
        short_name: 'Praieros',
        description:
          'Balneabilidade das praias de Salvador (BA), a partir do boletim do Inema. Site independente.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: colors.themeColor,
        background_color: colors.backgroundColor,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      null,
      2,
    ) + '\n'
  );
}
