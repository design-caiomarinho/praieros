# Decisões

## Fase 0: ferramentas

- **Vitest** para testes: combina com as funções puras de R1–R4 e D1–D3 e roda TypeScript sem configuração extra.
- **ESLint 9 (flat config)** com `typescript-eslint` e `eslint-plugin-astro` para lint.
- **Prettier** com `prettier-plugin-astro` para formatação.
- `@astrojs/check` e `typescript` para checagem de tipos (`npm run check`).

## Fase 1 / sessão 1: busca dos PDFs

- **cheerio** (dependência nova) para achar os links pelo rótulo. O HTML do gov.br é irregular e uma regex seria frágil.
- **@types/node** (devDependency) para tipar `node:fs` nos testes e no script de fixtures.
- **`fetch` nativo** do Node, sem biblioteca de rede. Timeout de 20 s por requisição, 1 nova tentativa (só para erro de rede, timeout e HTTP 5xx), 1 s de espera. HTTP 4xx não repete.
- **Nunca lança:** o módulo devolve resultado por região (`ok` / `reason`). Uma região falhar não impede a outra. Quem chama decide (D4).
- **Rótulo ambíguo** (mesmo rótulo apontando para endereços diferentes) é erro, não escolha. Rótulo repetido com o mesmo endereço é aceito.
- **Validação do download:** o arquivo precisa começar com `%PDF-`. Não confiamos só no `content-type`.
- **User-Agent** identifica o projeto como independente, sem dados pessoais.
- **Fixtures** salvas com `npm run fixtures:save` (acessa o site; uso manual e raro): `salvador.pdf`, `baia-de-todos-os-santos.pdf`, `qualidade-das-praias.html`, `robots.txt`. Boletim de 06/11/2026.
- **Termos de uso: continua pendente.** Nenhuma conclusão sobre permissão foi tirada do robots.txt nem do rodapé.
