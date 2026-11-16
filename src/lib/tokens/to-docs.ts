// Gera docs/tokens.md a partir dos tokens (tokens.json + code.json) e da contagem de usos.
// Função pura: sem I/O. A leitura dos arquivos fica em scripts/build-token-docs.ts.
import { flatten, varName } from './to-css.ts';
import type { FlatToken } from './to-css.ts';

type Tree = Parameters<typeof flatten>[0];
export type Usage = Record<string, number>;

const ALIAS = /^\{(.+)\}$/;

/** Segue os aliases até o valor final. Devolve também o primitivo (último token antes do valor). */
function resolve(
  byPath: Map<string, FlatToken>,
  token: FlatToken,
): { value: string | number; primitive: string | null } {
  let current = token;
  let primitive: string | null = null;
  for (let i = 0; i < 10; i++) {
    const m =
      typeof current.value === 'string' ? current.value.match(ALIAS) : null;
    if (!m) break;
    const next = byPath.get(m[1]);
    if (!next) throw new Error(`Alias sem destino: ${m[1]}`);
    primitive = next.path.join('.');
    current = next;
  }
  return { value: current.value, primitive };
}

const cell = (s: string | number) => String(s).replace(/\|/g, '\\|');
const table = (head: string[], rows: (string | number)[][]) =>
  [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');

const code = (s: string) => `\`${s}\``;

/** Papel de cada cor semântica, em uma frase. */
function colorRole(path: string[]): string {
  const [, kind, a, b] = path;
  const status: Record<string, string> = {
    positive: 'Própria',
    negative: 'Imprópria',
    neutral: 'Sem resultado',
    warning: 'Boletim desatualizado',
    accent: 'destaque da marca',
  };
  const tone = (name: string) =>
    ({
      subtle: 'fundo claro',
      soft: 'fundo de chip',
      default: 'cor cheia (marcador, badge)',
      hover: 'hover',
      translucent: 'translúcida, sobre o mapa',
    })[name] ?? name;
  if (kind === 'surface') {
    if (b && status[a]) return `${status[a]}: ${tone(b)}`;
    return (
      {
        default: 'Fundo padrão de telas, painéis e cartões',
        muted: 'Fundo de apoio, mais suave que o padrão',
        strong: 'Fundo de ênfase leve, acima de muted',
        hover: 'Fundo de itens interativos no hover e no foco',
        disabled: 'Fundo de controles desabilitados',
        inverse: 'Fundo escuro, de contraste invertido',
      }[a] ?? ''
    );
  }
  if (kind === 'border') {
    if (status[a]) return `Borda de ${status[a]}`;
    return (
      {
        default: 'Borda padrão de cartões, campos e divisórias',
        strong: 'Borda de ênfase',
        inverse: 'Borda sobre fundo escuro',
        accent: 'Borda de destaque da marca',
        disabled: 'Borda de controles desabilitados',
        focus: 'Anel de foco (só teclado)',
      }[a] ?? ''
    );
  }
  if (kind === 'content') {
    if (status[a]) return `Texto e ícone de ${status[a]}`;
    return (
      {
        primary: 'Texto principal',
        secondary: 'Texto de apoio',
        muted: 'Texto discreto (legendas, metadados)',
        disabled: 'Texto e ícone desabilitados',
        accent: 'Texto de destaque da marca',
        'on-accent': 'Texto e ícone sobre a cor de destaque',
        inverse: 'Texto sobre fundo escuro',
      }[a] ?? ''
    );
  }
  return '';
}

export function tokensToDocs(tree: Tree, usage: Usage): string {
  const all = flatten(tree);
  const byPath = new Map(all.map((t) => [t.path.join('.'), t]));
  const uses = (path: string[]) => usage[varName(path)] ?? 0;
  const usesPrefix = (prefix: string) =>
    Object.entries(usage)
      .filter(([k]) => k.startsWith(prefix))
      .reduce((n, [, v]) => n + v, 0);
  const group = (name: string) => all.filter((t) => t.path[0] === name);
  const res = (t: FlatToken) => resolve(byPath, t);
  const out: string[] = [];

  out.push(
    '# Tokens de design',
    '',
    'Gerado por `npm run tokens:docs` a partir de `tokens/tokens.json` (espelho do Figma) e `tokens/code.json` (só do código). **Não editar à mão.**',
    '',
    '- Dois níveis: **primitivos** (`primitives.*`, valores brutos) e **semânticos** (o resto, apontam para primitivos).',
    '- No código usa-se sempre o semântico, pela variável CSS (`var(--color-surface-default)`). Primitivo só dentro de um token.',
    '- A coluna **Usos** conta as ocorrências da variável em `src/`; `0` indica token sem uso no código.',
    '- Valor solto (cor, espaço, fonte) não é permitido: ver `CLAUDE.md`.',
    '',
  );

  // ---- Cores
  out.push('## Cores semânticas', '');
  const colorGroups: [string, string][] = [
    ['surface', 'Superfícies (fundos)'],
    ['border', 'Bordas'],
    ['content', 'Conteúdo (texto e ícones)'],
  ];
  out.push(
    'Mapa dos status: `positive` = Própria, `negative` = Imprópria, `neutral` = Sem resultado, `warning` = Boletim desatualizado, `accent` = destaque da marca. Status nunca é transmitido só por cor: sempre cor + texto (+ símbolo no mapa).',
    '',
  );
  for (const [kind, title] of colorGroups) {
    const rows = group('color')
      .filter((t) => t.path[1] === kind)
      .map((t) => {
        const r = res(t);
        return [
          code(t.path.slice(1).join('.')),
          code(varName(t.path)),
          code(String(r.value)),
          r.primitive ? code(r.primitive.replace('primitives.color.', '')) : '',
          uses(t.path),
          colorRole(t.path),
        ];
      });
    out.push(
      `### ${title}`,
      '',
      table(['Token', 'Variável', 'Valor', 'Primitivo', 'Usos', 'Papel'], rows),
      '',
    );
  }

  // ---- Tipografia
  out.push('## Tipografia', '');
  const typo = group('typo');
  const styles = [...new Set(typo.map((t) => t.path.slice(1, 3).join('/')))];
  const typoRows = styles.map((s) => {
    const [kind, size] = s.split('/');
    const get = (prop: string) => {
      const t = byPath.get(`typo.${kind}.${size}.${prop}`);
      if (!t) throw new Error(`typo.${kind}.${size}.${prop} ausente`);
      return res(t).value;
    };
    const spacing = Number(get('spacing'));
    return [
      code(s),
      get('family'),
      get('weight'),
      `${get('size')} px`,
      get('line'),
      `${spacing} %`,
      code(`--typo-${kind}-${size}-*`),
      usesPrefix(`--typo-${kind}-${size}-`),
    ];
  });
  out.push(
    table(
      [
        'Estilo',
        'Família',
        'Peso',
        'Tamanho',
        'Altura de linha',
        'Espaço entre letras',
        'Variáveis',
        'Usos',
      ],
      typoRows,
    ),
    '',
    'Cada estilo tem cinco variáveis: `family`, `weight`, `size`, `line` e `spacing`. A altura de linha é multiplicador (1,1 = 110 %). No Figma, altura de linha e espaço entre letras em % são digitados à mão nos estilos de texto (variáveis não aceitam %).',
    '',
  );
  const fontPrim = (sub: string) =>
    all.filter(
      (t) =>
        t.path[0] === 'primitives' && t.path[2] === sub && t.path[1] === 'font',
    );
  out.push(
    '### Primitivos de fonte',
    '',
    table(
      ['Primitivo', 'Valor'],
      fontPrim('size')
        .map((t) => [code(t.path.slice(1).join('.')), `${t.value} px`])
        .concat(
          fontPrim('weight').map((t) => [
            code(t.path.slice(1).join('.')),
            String(t.value),
          ]),
          fontPrim('line-height').map((t) => [
            code(t.path.slice(1).join('.')),
            String(t.value),
          ]),
          fontPrim('letter-spacing').map((t) => [
            code(t.path.slice(1).join('.')),
            `${t.value} %`,
          ]),
          fontPrim('family').map((t) => [
            code(t.path.slice(1).join('.')),
            String(t.value),
          ]),
        ),
    ),
    '',
  );

  // ---- Espaçamento
  out.push('## Espaçamento', '');
  const steps = [...new Set(group('space').map((t) => t.path[2]))];
  const fams = ['inset', 'gap', 'stack', 'inline'];
  const spaceRows = steps.map((s) => {
    const any = byPath.get(`space.inset.${s}`) ?? byPath.get(`space.gap.${s}`);
    const px = any ? res(any).value : '';
    return [
      code(s),
      `${px} px`,
      ...fams.map((f) =>
        byPath.has(`space.${f}.${s}`) ? uses(['space', f, s]) : '—',
      ),
    ];
  });
  out.push(
    'Escala única (4, 8, 12, 16, 24, 32, 40, 48 px) repetida em quatro papéis. O papel diz o uso; o número sai da escala.',
    '',
    '- `inset`: padding (espaço interno de um elemento).',
    '- `gap`: espaço entre itens de uma linha ou grade.',
    '- `stack`: espaço entre itens empilhados na vertical.',
    '- `inline`: espaço entre itens na horizontal, dentro de uma linha.',
    '',
    table(
      ['Passo', 'Valor', 'Usos inset', 'Usos gap', 'Usos stack', 'Usos inline'],
      spaceRows,
    ),
    '',
    'Variável: `--space-<papel>-<passo>` (ex.: `--space-inset-md`).',
    '',
  );

  // ---- Tamanhos, raio, borda
  out.push('## Tamanhos, raio e borda', '');
  const sizeRows = group('size').map((t) => {
    const r = res(t);
    return [
      code(t.path.join('.')),
      code(varName(t.path)),
      `${r.value} px`,
      r.primitive
        ? code(r.primitive.replace('primitives.', ''))
        : 'só do código',
      uses(t.path),
    ];
  });
  const rbRows = [...group('radius'), ...group('border-width')].map((t) => {
    const r = res(t);
    return [
      code(t.path.join('.')),
      code(varName(t.path)),
      `${r.value} px`,
      r.primitive ? code(r.primitive.replace('primitives.', '')) : '',
      uses(t.path),
    ];
  });
  out.push(
    table(
      ['Token', 'Variável', 'Valor', 'Primitivo', 'Usos'],
      sizeRows.concat(rbRows),
    ),
    '',
    '`size.icon.*` é o lado do ícone; `size.control.*` é a altura de botões e campos (small 40, medium 48). `size.panel-width` e `size.share-preview-height` são só do código (não existem no Figma).',
    '',
  );

  // ---- Opacidade
  out.push('## Opacidade', '');
  const opRows = all
    .filter(
      (t) =>
        t.path[0] === 'opacity' ||
        (t.path[0] === 'motion' && t.path[1] === 'opacity'),
    )
    .map((t) => [
      code(t.path.join('.')),
      code(varName(t.path)),
      res(t).value,
      uses(t.path),
    ]);
  out.push(table(['Token', 'Variável', 'Valor', 'Usos'], opRows), '');

  // ---- Movimento
  out.push(
    '## Movimento',
    '',
    'Só do código (`tokens/code.json`). Catálogo das interações em `docs/motion.md`.',
    '',
  );
  const motionRows = all
    .filter((t) => t.path[0] === 'motion' && t.path[1] !== 'opacity')
    .map((t) => {
      const r = res(t);
      const unit =
        t.type === 'duration' ? ' ms' : t.type === 'cubicBezier' ? '' : '';
      return [
        code(t.path.join('.')),
        code(varName(t.path)),
        `${r.value}${unit}`,
        r.primitive ? code(r.primitive.replace('primitives.motion.', '')) : '',
        uses(t.path),
      ];
    });
  out.push(
    table(['Token', 'Variável', 'Valor', 'Primitivo', 'Usos'], motionRows),
    '',
  );

  // ---- Fora dos tokens
  out.push(
    '## Fora dos tokens',
    '',
    '- **Breakpoint:** 1024 px (desktop a partir de 1024 px, mobile abaixo). Está direto nas `@media`.',
    '- **z-index:** valores locais nos componentes; não há escala global.',
    '- **Alvo de toque:** no mobile os botões de ícone ganham área de toque maior por `::after` (ver `docs/decisions.md`).',
    '',
  );
  return out.join('\n');
}
