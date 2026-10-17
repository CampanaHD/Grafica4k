# Segurança da Nagano Comunicação Visual

Esta atualização preserva o login principal da gráfica, a seleção de perfis, os PINs, os cadastros e os fluxos de orçamento, produção e WhatsApp. Não substitua a pasta `data` por uma pasta vazia.

## Atualização e compatibilidade

1. Faça backup da instalação e da pasta `data` com o sistema parado, incluindo os bancos SQLite. Exporte também os cadastros que esta versão guarda no navegador; não limpe os dados do navegador durante a atualização.
2. Instale Node.js **24.13 ou superior**. O Argon2id utiliza a implementação nativa desse ambiente.
3. Atualize os arquivos do programa, preservando `data` e o `.env` do servidor. Atualize as dependências com `npm install` ou `pnpm install --frozen-lockfile`.
4. Reinicie pelo `INICIAR.cmd`. A atualização do banco é automática, aditiva e repetível. Os usuários existentes continuam com suas credenciais; os verificadores antigos scrypt são convertidos para Argon2id depois de uma autenticação válida. Nenhuma senha antiga é enviada por e-mail.

Em uma instalação nova, sem `data/team.sqlite`, configure `NAGANO_INITIAL_EMAIL`, `NAGANO_INITIAL_PASSWORD` (12 a 200 caracteres) e, para produção, `NAGANO_INITIAL_PIN` (6 a 12 números). Essas variáveis servem somente à primeira criação. Remova senha e PIN do ambiente após a criação. Não existe conta ou senha padrão embutida nesta versão.

Os executáveis e o código precisam pertencer ao mesmo pacote. Não misture este servidor com uma interface antiga: a nova interface acompanha a rotação de sessão e os tokens de proteção de requisições.

## Usar o Gmail normal

É possível enviar os e-mails de segurança pela conta Gmail da gráfica. Ative a verificação em duas etapas na conta Google e gere uma **senha de app** para “Nagano”. Use essa senha exclusivamente no servidor. Não use a senha habitual do Gmail e não envie nenhuma dessas senhas pelo chat.

No `.env`, preencha:

```dotenv
APP_PUBLIC_URL=http://localhost:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=seu-email@gmail.com
SMTP_PASSWORD=
SMTP_FROM=seu-email@gmail.com
SECURITY_EMAIL_REQUIRED=true
```

O espaço vazio acima deve receber a senha de app diretamente no servidor. O exemplo não contém uma senha real. A porta 587 com STARTTLS também é aceita; a conexão exige TLS e certificado válido.

`APP_PUBLIC_URL` precisa ser o endereço exato usado para abrir o programa, incluindo a porta. Se o programa usa `localhost:3108`, coloque essa porta. Links com `localhost` só funcionam no computador onde o sistema está rodando. Para abrir links em outros computadores ou celulares, configure um domínio HTTPS acessível por esses dispositivos.

Após reiniciar, o primeiro login exigirá confirmação do e-mail principal. Abra o link recebido, entre novamente e informe o código de oito números para confirmar o navegador. Consulte falhas de entrega em **Configurações > Segurança**. Uma configuração preenchida não garante que o Gmail aceitou a autenticação: valide recebimento, spam e eventuais restrições da conta.

O Gmail tem limites de envio e pode restringir acessos de servidores. Em volume maior, um serviço de e-mail transacional pode ser configurado pelo mesmo SMTP. Senhas de app podem estar indisponíveis em certas contas ou políticas do Google; nesse caso use outro remetente SMTP compatível ou uma integração OAuth própria.

## CAPTCHA real — Cloudflare Turnstile

Crie um widget **Managed** no Cloudflare Turnstile e autorize somente os domínios utilizados pela aplicação. A aparência da verificação é controlada pelo provedor; ela pode apresentar um checkbox ou concluir a verificação de forma automática.

No ambiente do servidor:

```dotenv
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
TURNSTILE_HOSTNAMES=seu-dominio.com
```

Somente a site key é pública. A secret key nunca é devolvida pela API nem incluída no bundle da interface. Não use chaves de teste em produção.

O backend valida diretamente no Siteverify do Cloudflare, com limite de tempo, hostname, ação, data de emissão e proteção local contra reutilização concorrente. Token ausente, inválido, expirado, repetido ou indisponibilidade do provedor impedem a operação protegida. Ações: `register`, `login`, `recovery`, `resend`, `device` e `password`.

Novos perfis exigem CAPTCHA quando o provedor está configurado. Login exige CAPTCHA após falhas repetidas; recuperação, reenvio, alteração de senha e confirmação de dispositivo o exigem conforme o risco. Limites e espera progressiva funcionam independentemente do CAPTCHA. Não há checkbox local que substitua a validação do servidor.

## Conta da gráfica e perfis da equipe

- A conta principal continua sendo compartilhada pela gráfica, como na arquitetura existente. Recuperação e alteração de senha referem-se a **essa conta principal**; somente um perfil administrador pode alterar a senha autenticado.
- A proteção individual dos funcionários continua sendo o PIN do perfil, separado da senha da conta. O administrador pode redefinir esse PIN, sem conhecer o PIN anterior.
- Com confirmação por e-mail ativa, novos perfis precisam de e-mail válido. O administrador informa o endereço em **Configurações > Perfis da equipe**; o funcionário confirma o link antes de entrar. Há ação para reenviar a confirmação.
- Perfis antigos são preservados. Antes de ativar o modo protegido, revise e-mails e PINs. O perfil inicial `administrator` utiliza a confirmação da conta principal; os demais perfis exigem confirmação de seu próprio endereço.
- No uso local antigo, o PIN pode continuar opcional. **Em produção todos os perfis precisam de PIN individual**: sem ele, qualquer pessoa que conhece o login compartilhado poderia selecionar o perfil de outra pessoa.
- Os PINs legados de 4 a 12 números continuam compatíveis. Prefira PINs mais longos; PIN não equivale a autenticação individual completa com senha e MFA.
- Alterar o e-mail do perfil exige nova confirmação antes de continuar acessando as áreas operacionais. O e-mail pessoal do perfil não altera o e-mail da conta principal.

## Sessões, dispositivos e auditoria

**Meu Perfil > Segurança** mostra confirmação do e-mail, sessões, atividade recente e, para o administrador, alteração da senha principal e dispositivos da conta.

Dispositivos são reconhecidos por uma chave aleatória em cookie HttpOnly. Não há fingerprint invasivo, consulta de geolocalização nem identificação baseada somente no IP. Navegador e sistema operacional são resumos aproximados do User-Agent; Brave pode aparecer como Chromium / Brave.

O primeiro acesso de um navegador exige código por e-mail, com validade de 10 minutos e até cinco tentativas. A confiança dura até 30 dias, podendo ser revogada. O aviso de novo login inclui data/hora de Brasília e um link “Não reconheço este acesso”, válido por 24 horas, que só encerra o dispositivo indicado após confirmação explícita.

Sessões expiram em até 12 horas e após 60 minutos de inatividade. A consulta automática da sessão não renova a atividade. Trocar de perfil rotaciona o identificador e preserva o prazo absoluto. Sair invalida o identificador no servidor. Encerrar outras sessões mantém a atual; remover um dispositivo encerra as sessões associadas. Funcionários só podem consultar ou revogar sessões de seu próprio perfil. Administradores gerenciam a conta da gráfica.

Recuperação tem resposta genérica, sem revelar existência de conta. Links de recuperação duram 30 minutos, são de uso único e somente seus hashes são armazenados. A troca da senha invalida sessões, desafios pendentes, tokens e dispositivos anteriores. Tokens de confirmação do e-mail duram 24 horas. Tokens são retirados do fragmento da URL pela interface e nenhuma alteração ocorre apenas por abrir um link.

**Configurações > Segurança** reúne contagens e eventos recentes. Não registra senhas, códigos, tokens completos ou segredos do CAPTCHA. Eventos são mantidos por até 90 dias. Limites temporários usam chaves derivadas por conta e origem; nenhum bloqueio é permanente. Esse histórico é interno ao SQLite e não substitui logs externos imutáveis em uma hospedagem.

## Publicar em HTTPS

Produção exige `NODE_ENV=production`, `SECURITY_EMAIL_REQUIRED=true`, SMTP, URL HTTPS e Turnstile configurados. Configuração incompleta interrompe a inicialização, evitando exposição acidental com proteções desligadas.

Utilize um proxy HTTPS confiável. Em `TRUSTED_PROXY_IPS`, informe apenas o IP ou a rede desse proxy. Não use confiança irrestrita em cabeçalhos encaminhados. Bloqueie acesso externo direto à porta interna do aplicativo; os cookies são Secure em produção. Requisições HTTP de leitura são redirecionadas para a origem fixa e mutações HTTP são rejeitadas. HSTS, CSP, proteção contra enquadramento, MIME sniffing, referrer e permissões desnecessárias acompanham as respostas.

No ambiente local sem serviços configurados, o acesso existente é preservado, limitado ao computador por padrão. Isso aparece como **aguardando configuração** nas telas. E-mails, desafios de dispositivo e CAPTCHA não devem ser apresentados como ativos antes da configuração real.

## Escopo e limites preservados da arquitetura

O backend aplica autenticação, permissões e ownership nas APIs existentes e no módulo de segurança; rotas operacionais desconhecidas deixam de ser liberadas por padrão. Mutações em produção exigem token de sessão contra CSRF, além de validação de origem e rejeição de formulários simples. Consultas ao banco usam parâmetros.

Fotos e QR Codes passam por validação completa de estrutura PNG, CRC, dimensões, dados descomprimidos e tamanho. Metadados são removidos, e conteúdo comprimido é regravado antes de armazenamento. A interface converte JPG e WebP em PNG. Não são armazenados nomes de arquivo enviados pelo cliente, SVGs ou executáveis.

A migração não transfere para o servidor os cadastros/configurações que a arquitetura anterior mantém no navegador. **Esses dados locais não ficam isolados contra uma pessoa que controla o próprio navegador ou o computador compartilhado.** Para contas totalmente individuais e isolamento completo de dados por funcionário, a próxima etapa precisa migrar esse armazenamento e abandonar a senha principal compartilhada. Isso não foi simulado como se já existisse.

A API do WhatsApp não devolve tokens ou segredos nas consultas e respostas de configuração; campos de segredo vazios preservam o valor do servidor. Configuração de credenciais exige administrador. As integrações antigas possuem campos de credenciais próprios. Esta atualização não migra automaticamente credenciais que tenham sido salvas anteriormente no armazenamento do navegador; revise-as e transfira-as para o ambiente do servidor antes de uma publicação externa.

A tabela para MFA TOTP e os pontos de integração estão preparados. Cadastro do autenticador, criptografia do segredo, códigos de recuperação e validação TOTP ainda não estão habilitados. CAPTCHA e confirmação de dispositivo por e-mail não são apresentados como substitutos de MFA TOTP.

Não há promessa de ausência absoluta de falhas. Antes de expor dados reais na internet, valide a infraestrutura HTTPS, a entrega real de e-mails, as chaves reais do Turnstile, o controle de acesso de cada função e a restauração do backup.

## Validação desta atualização

Testes automatizados cobrem confirmação e reenvio, expiração e reutilização de tokens, recuperação genérica, alteração de senha, verificação de dispositivo e limite de códigos, revogação de sessões, permissões, proteção CSRF, cookies Secure, espera progressiva, CAPTCHA válido/inválido/expirado/repetido/com domínio ou ação incorretos/provedor indisponível, segredo não exposto, migração scrypt e uploads inválidos. As dependências externas são simuladas exclusivamente nos testes; o servidor normal usa SMTP e Cloudflare reais.

As telas de entrada, recuperação, Meu Perfil > Segurança e Configurações > Segurança foram verificadas em navegador, incluindo largura de celular. Os fluxos anteriores de orçamentos, terceiros, produção e extensão WhatsApp continuam na suíte de regressão. Envio efetivo pelo Gmail e Turnstile de produção dependem das credenciais que você ainda vai configurar.

Referências: [Gmail e senhas de app](https://support.google.com/mail/answer/185833?hl=pt-BR), [SMTP Nodemailer](https://nodemailer.com/smtp), [validação Turnstile no servidor](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
