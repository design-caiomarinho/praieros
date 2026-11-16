# Manutenção

## Rotinas

- **Antes de cada sessão de desenvolvimento:** rodar `git pull`. O workflow de ingestão faz commits direto na main, então o repositório local pode estar atrás do GitHub.
- **Quando um boletim novo sair (a cada semana, em geral na sexta):** conferir em data/bulletins/ no GitHub se os arquivos novos apareceram. Se não aparecerem, olhar a aba Actions.
- **Se o workflow falhar:** o GitHub avisa por e-mail. Conferir se as notificações de Actions estão ligadas na conta do GitHub. Abrir a execução, copiar a anotação de erro e investigar. A regra D4 vale: nada foi gravado com dado duvidoso.
- **Pendente de manutenção:** atualizar actions/checkout@v4 e actions/setup-node@v4 (aviso de Node 20 deprecated). Verificar a versão mais recente que roda em Node 24 e atualizar o workflow ingest-bulletins.

## Hospedagem no Cloudflare Pages

Situação: **preparado, ainda não migrado.** O site continua no GitHub Pages até Caio criar a conta no Cloudflare. A migração é feita uma vez, em `*.pages.dev`; o domínio próprio entra depois.

### Configurar (uma vez, no painel do Cloudflare)

1. Criar a conta (plano gratuito) em https://dash.cloudflare.com e abrir **Workers & Pages → Create → Pages → Connect to Git**.
2. Autorizar o GitHub e escolher o repositório `praieros`; branch de produção: `main`.
3. Build: comando `npm run build`. O painel novo cria um projeto **Workers** (deploy command `npx wrangler deploy`); o arquivo `wrangler.jsonc` da raiz diz que a pasta `dist` é o site, e o nome (`praieros`) deve ser igual ao do projeto no painel.
4. Variáveis em **Settings → Builds → Build variables and secrets** (não em "Runtime variables", que só vale depois do build):
   - `NODE_VERSION` = `24.19.0` (a versão usada nos testes locais). **Não usar só `22`:** o Cloudflare resolve para uma 22.x antiga e o Astro 7 exige Node `>=22.23.4`, então o build falha.
   - `SITE_URL` = o endereço do projeto (ex.: `https://praieros.pages.dev`; depois, o domínio próprio).
   - **Não** definir `BASE_PATH` nem `GITHUB_ACTIONS`: sem eles o site fica na raiz (`/`).
5. Salvar e rodar o primeiro build. Conferir o endereço `https://<projeto>.pages.dev`.

### Conferir depois do primeiro build

- `curl -I https://<projeto>.pages.dev/` mostra `Content-Security-Policy`, `X-Content-Type-Options` e `Referrer-Policy`.
- `curl -I https://<projeto>.pages.dev/_astro/<arquivo>.js` mostra `Cache-Control: public, max-age=31536000, immutable`.
- O mapa carrega, a busca abre e `/praia/amaralina/` redireciona para `/?praia=amaralina`.
- Em `https://<projeto>.pages.dev/robots.txt` e `/sitemap.xml` os endereços usam o `SITE_URL` certo.
- Testar a prévia no WhatsApp com um link de praia (o cache do WhatsApp guarda a prévia por um tempo).

### Ingestão e novo build

O workflow de ingestão faz commit direto na `main`. O Cloudflare reage ao push do GitHub (evento do próprio GitHub, não a outro workflow), então **o build sai sem chamar nada**: a limitação do `GITHUB_TOKEN` não vale aqui. Depois de confirmar isso uma vez (esperar um boletim novo ou rodar o workflow à mão), remover do `ingest-bulletins.yml` o passo `gh workflow run deploy-pages.yml` e a permissão `actions: write`.

### Desligar o GitHub Pages (decisão de Caio)

Quando o site estiver no ar no Cloudflare: em **Settings → Pages** do repositório, desativar a publicação, e trocar o gatilho do `deploy-pages.yml` para só `workflow_dispatch` (o arquivo e o repositório continuam, como backup e para voltar se precisar). O endereço antigo deixa de responder; links já compartilhados com ele deixam de abrir.

### Voltar ao GitHub Pages

Reativar em **Settings → Pages (Source: GitHub Actions)** e devolver o gatilho `push` ao `deploy-pages.yml`. Não precisa mexer no código: sem `SITE_URL`/`BASE_PATH`, o build do Actions usa o endereço do GitHub Pages.

### Cabeçalhos (`public/_headers`)

Valem só no Cloudflare. A CSP libera apenas o próprio site e `tiles.openfreemap.org` (mapa); `unsafe-inline` em script e estilo é necessário porque o Astro e o MapLibre embutem trechos no HTML. Ao adicionar um recurso externo (fonte, imagem, API), incluir o endereço na CSP; sem isso o navegador bloqueia (erro no console: "violates the following Content Security Policy").
