# Nagano Comunicação Visual — pacote para hospedagem

Versão empacotada em 16/10/2026, a partir da instalação atualizada.

Leia **INSTALAR-NA-HOSPEDAGEM.md** antes de instalar.

O pacote contém código-fonte, build de produção, dependências declaradas e lockfile, testes, identidade visual, extensão do WhatsApp e arquivos de implantação. Não inclui dependências instaladas do Windows: elas devem ser instaladas no servidor.

Requer Node.js 24.13 ou superior, processo permanente, HTTPS e armazenamento persistente. O banco é SQLite centralizado no servidor, com uma única instância escritora. Hospedagem apenas PHP ou de arquivos estáticos não executa esta aplicação completa.

O pacote não contém o `.env` real, bancos de dados, usuários cadastrados, senhas de acesso, sessões, chaves privadas, backups ou quarentena. Os exemplos de configuração estão vazios. Os testes usam credenciais fictícias exclusivamente em bases isoladas.

Para preservar os usuários atuais, planeje a migração separada dos dados. Não recrie contas por cima de uma migração e não compartilhe a chave de backup junto do arquivo criptografado.

Entradas de execução:

- Instalação: `npm ci`
- Build: `npm run build`
- Aplicação: `npm start`
- Testes: `npm test`
- Manutenção offline: `npm run maintenance -- inspect`

O diretório `python_engine` é mantido por compatibilidade; o processo principal entregue é Node.js/Express. O ambiente Docker usa as dependências Node declaradas no projeto.

Os arquivos de produção já foram gerados. Docker, domínio, SMTP, CAPTCHA e persistência ainda precisam ser configurados e validados no provedor escolhido.
