# Instalação na hospedagem — Nagano Comunicação Visual

## Antes de instalar

1. Use Node.js 24.13 ou superior, com npm e instalação das dependências permitida.
2. Disponibilize um processo contínuo, porta interna e proxy reverso HTTPS.
3. Reserve diretórios persistentes separados para dados, backups e chave de recuperação. Não use pastas temporárias de build.
4. Use uma única instância escritora. Não compartilhe os arquivos SQLite/WAL entre réplicas ou por NFS/pasta de rede.
5. Configure domínio e DNS. Configure SMTP e chaves reais do Cloudflare Turnstile para esse domínio.

O pacote não publica automaticamente o sistema nem configura o provedor. Não basta enviar a pasta `dist` para uma hospedagem estática: o backend também precisa executar.

## Dados e acesso

Este ZIP é o pacote da aplicação, sem banco ou usuários atuais. Escolha um dos caminhos:

- **Instalação nova**: configure `NAGANO_INITIAL_EMAIL`, uma senha forte com pelo menos 12 caracteres em `NAGANO_INITIAL_PASSWORD` e um PIN de 6 a 12 números em `NAGANO_INITIAL_PIN`. Os valores são definidos diretamente no servidor. Remova a senha e o PIN do ambiente de inicialização depois de criar a conta, mantendo somente os dados de acesso protegidos no banco.
- **Migração da instalação atual**: obtenha um backup criptografado validado e sua chave por um canal separado e seguro; em um destino vazio, importe e valide o backup pela ferramenta offline, extraia para uma pasta nova e instale a pasta `data` extraída no volume persistente antes de iniciar o servidor. A chave original é necessária para abrir esse backup. Não substitua bancos de um servidor em execução. Se o destino já possui dados, use o fluxo de restauração com backup prévio do estado atual. Preserve também o arquivo completo de configuração do servidor de origem em local privado para consulta, sem copiar cegamente domínio e caminhos do Windows.

Nunca execute o reset operacional como parte da instalação. Não envie o `.env` preenchido, banco, chave de recuperação ou senhas junto deste pacote público.

## Opção A — servidor com Docker Compose

Os arquivos de implantação estão em `deploy`. Eles preparam o Node, volumes persistentes e Caddy para HTTPS. É necessário Docker Compose com suporte a `include` se for usado o compose da raiz; os comandos abaixo usam diretamente o arquivo de implantação.

Na raiz do pacote:

```sh
cp deploy/env.production.example .env.production
```

Preencha diretamente `.env.production`:

- `NAGANO_DOMAIN`: domínio sem protocolo.
- `APP_PUBLIC_URL`: origem HTTPS exata do mesmo domínio, sem caminho adicional.
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_HOSTNAMES`: chaves reais e domínio correspondente.
- `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`: conta remetente e credencial de envio. Para Gmail use senha de app; não use a senha habitual da conta.
- `NAGANO_INITIAL_*`: somente se a instalação for nova.

O Compose já define os caminhos persistentes, a porta interna, o usuário da aplicação e o endereço confiável do proxy. Os diretórios pertencem ao volume do servidor, não ao computador de quem criou este ZIP.

```sh
docker compose --env-file .env.production -f deploy/compose.production.yml config --quiet
docker compose --env-file .env.production -f deploy/compose.production.yml build
docker compose --env-file .env.production -f deploy/compose.production.yml up -d
docker compose --env-file .env.production -f deploy/compose.production.yml ps
```

Libere as portas públicas 80 e 443 para o proxy e aponte o DNS. A porta do Node não é publicada diretamente. Verifique logs sem compartilhar senhas ou códigos. Não execute `down -v` em uma instalação com dados que precisem ser preservados.

O container e o certificado precisam ser testados no servidor escolhido; não foram apresentados como implantação já concluída.

## Opção B — hospedagem Node sem Docker

Extraia o projeto inteiro e execute os comandos na pasta que contém `package.json`.

```sh
npm ci
npm run build
```

Configure as variáveis no painel do provedor ou num `.env` privado. Use o modelo `deploy/env.production.example`, adaptando os caminhos absolutos à hospedagem. O arquivo `.env` do servidor precisa ser carregado pelo processo, ou as variáveis devem ser injetadas pelo painel.

Obrigatórios: `NODE_ENV=production`, `APP_ENV=production`, `APP_PUBLIC_URL` HTTPS, `PRINTSHOP_DATA_DIR`, `BACKUP_DIR`, `BACKUP_KEY_FILE` persistentes, SMTP, confirmação por e-mail ativa e Turnstile real. Configure `HOST` e `PORT` conforme o provedor. Autorize em `TRUSTED_PROXY_IPS` somente o proxy real que encaminha as requisições HTTPS, para preservar cookies e validações de origem.

Os diretórios precisam ser graváveis apenas pela conta de serviço/administrador. A chave de backup é criada automaticamente se ainda não existir no caminho configurado. Não a regenere ao atualizar a aplicação.

```sh
npm start
```

Configure o gerenciador de processos do provedor para manter o servidor ativo e iniciar após reinicialização. Configure o proxy HTTPS para a porta interna. O arquivo Windows `INICIAR.cmd` não é a entrada de execução do Linux.

## Conferência após instalar

- Página de login abre pelo domínio HTTPS.
- Conta inicial ou contas migradas conseguem entrar.
- E-mail de confirmação/recuperação chega ao destinatário correto.
- CAPTCHA é validado pelo backend, com chaves reais e domínio correto.
- Dados permanecem após reiniciar o serviço.
- A aplicação mantém uma única base compartilhada entre os computadores.
- Diretórios de dados, backups e chaves não são servidos publicamente.
- Configurações → Segurança → Segurança / Backup consegue gerar e validar uma cópia.
- Configure destino externo dos backups e guarde a chave por um canal separado.
- A extensão do WhatsApp incluída ainda autoriza somente localhost. Quando o domínio final for definido, autorize apenas sua origem HTTPS exata em `browser-extension/nagano-whatsapp/manifest.json` e em `tabRouter.js` (`isAllowedSender`), mantendo as verificações de aba e origem. Gere novamente o ZIP da extensão servido em `public/extensions/nagano-whatsapp.zip` e faça o build antes de distribuí-la aos computadores. Não libere todos os sites como atalho.

O backup semanal padrão é domingo às 03h de Brasília, com o servidor ligado. Manuais de segurança, manutenção e Futura estão em `documentacao`.

## Conteúdo e integridade

`MANIFESTO-ARQUIVOS.json` contém o tamanho e SHA-256 de cada arquivo do pacote. O manifesto não inclui seu próprio checksum. O ZIP foi conferido por integridade e pela presença dos arquivos de inicialização, build e assets atuais. Este teste não substitui configurar e testar a infraestrutura real.
