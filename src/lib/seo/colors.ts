// Resolve um token de cor semântico até o valor final (ex.: "color.surface.default" -> "#fcfdfd").
// Função pura, para a cor do tema (meta theme-color, manifest) sair dos tokens e não de um valor solto.

export function resolveColor(tree: object, path: string): string {
  let current = path;
  for (let i = 0; i < 10; i++) {
    let node: unknown = tree;
    for (const key of current.split('.')) {
      node = (node as Record<string, unknown> | undefined)?.[key];
    }
    const value = (node as { $value?: unknown } | undefined)?.$value;
    if (typeof value !== 'string') {
      throw new Error(`Token de cor não encontrado: ${current}`);
    }
    const alias = value.match(/^\{(.+)\}$/);
    if (!alias) return value;
    current = alias[1];
  }
  throw new Error(`Alias circular em ${path}`);
}
