# Manutenção

## Rotinas

- **Antes de cada sessão de desenvolvimento:** rodar `git pull`. O workflow de ingestão faz commits direto na main, então o repositório local pode estar atrás do GitHub.
- **Quando um boletim novo sair (a cada semana, em geral na sexta):** conferir em data/bulletins/ no GitHub se os arquivos novos apareceram. Se não aparecerem, olhar a aba Actions.
- **Se o workflow falhar:** o GitHub avisa por e-mail. Conferir se as notificações de Actions estão ligadas na conta do GitHub. Abrir a execução, copiar a anotação de erro e investigar. A regra D4 vale: nada foi gravado com dado duvidoso.
- **Pendente de manutenção:** atualizar actions/checkout@v4 e actions/setup-node@v4 (aviso de Node 20 deprecated). Verificar a versão mais recente que roda em Node 24 e atualizar o workflow ingest-bulletins.
