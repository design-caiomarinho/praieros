## Plano de motion

Quem define o movimento: o designer, no Figma. O Claude Code cria os tokens e implementa a partir do que estiver escrito no Figma. Não inventar valores de duração, curva ou comportamento; se faltar, parar e perguntar.

### Quando

- Depois da Fase 3 (fluxos funcionando): tokens de motion e transições de fluxo (abrir e fechar o painel, folha inferior no mobile, marcador selecionado, mapa voando até a praia, carregamento).
- Na Fase 4 (acabamento): microinterações de componentes (hover, foco, clique, troca de estado de botões, busca, chip e cartão), junto de acessibilidade.
- Até lá, nenhuma sessão de código mexe com animação.

### O que o Figma deve ter antes de começar

1. Coleção de variáveis de motion: durações (ex.: duration/fast, duration/base, duration/slow, em ms) e curvas (ex.: easing/standard, easing/enter, easing/exit).
2. Um quadro de especificação com uma anotação por interação: elemento, gatilho, o que anima, duração e curva (usando os nomes das variáveis) e o comportamento com movimento reduzido.

O Claude Code não deve depender das interações de protótipo do Figma, porque não são lidas de forma confiável.

### Regras

- Tokens de motion entram em tokens/ (ou tokens/extra.json até existirem no Figma) e são gerados em CSS como os demais.
- CSS primeiro. JavaScript só onde for indispensável (gesto da folha inferior, voo do mapa). Evitar bibliotecas de animação.
- Respeitar prefers-reduced-motion em toda animação.
- Nada é transmitido só por movimento. Sem animações que pisquem ou prendam a atenção.

### Catálogo de interações

Tabela a preencher quando o motion for implementado:

| Elemento | Gatilho | O que anima | Duração | Curva | Com movimento reduzido |
| -------- | ------- | ----------- | ------- | ----- | ---------------------- |
