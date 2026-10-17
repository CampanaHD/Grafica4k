# Nagano — operação real, backup e recuperação

## Estado da entrega

A arquitetura existente foi preservada: React/TypeScript, Express/Node 24 e SQLite. Clientes, pedidos, estoque, financeiro, usuários e configurações operacionais são lidos do servidor. O navegador mantém estado de interface e compatibilidade com importações antigas; ele não é o banco central.

A instalação local não é publicação na internet. Os arquivos de implantação estão preparados, mas domínio, servidor, certificado público, chaves reais de CAPTCHA e destino externo dependem da infraestrutura do proprietário. Não há cópia externa ativa enquanto o destino não for configurado e testado.

## Três custos diferentes

- **Última compra**: custo unitário normalizado para a unidade do estoque na última compra recebida, com frete rateado quando houver. O total e o fornecedor também ficam registrados. O cálculo manual de bobina é identificado como valor informado, sem lançar entrada de material.
- **Custo médio**: média ponderada no recebimento: (saldo anterior × custo anterior + custo recebido) / saldo novo. Alterações administrativas de custo continuam registradas com motivo; elas corrigem o custo de referência do saldo e não são recebimentos fictícios.
- **Custo aplicado no pedido**: custo congelado na reserva/aprovação e registrado no consumo de produção. É consultado em Custos internos, com material, quantidade, unidade e custo aplicado. Receber outro lote ou corrigir o cadastro não reprecifica o consumo antigo.

Compras novas registram data, fornecedor, quantidade, unidade, custo unitário, total, frete, custo médio após compra e usuário. O histórico é aditivo. Dados antigos sem esses detalhes não recebem valores inventados.

## Usuários e permissões

Abra Configurações → Usuários e permissões. Existem perfis Administrador, Financeiro, Estoque, Vendas, Atendimento, Produção, Acabamento, Arte-finalista e Consulta.

As abas permitidas continuam existindo. A matriz acrescenta Visualizar, Criar, Editar, Excluir e Aprovar. O servidor aplica essas restrições nas APIs e mantém as proteções específicas de valores, custos, versões, pagamentos e propriedade do perfil. Novas funções partem do menor privilégio; o administrador pode ajustar a matriz.

Backup, importação de backup, restauração, reset e confirmação final do inventário são exclusivos do administrador. A auditoria de acessos identifica quem pode consultar financeiro, alterar custos, alterar estoque, excluir pedidos e restaurar backups. O próprio funcionário não pode alterar suas permissões pelo formulário Meu Perfil.

A conta principal e os PINs existentes foram preservados. Antes de publicar, revise e-mails e configure PINs individuais; as exigências de produção continuam verificadas no servidor.

## Inventário físico

Em Estoque → Inventário, clique em Iniciar inventário. Escolha todos os materiais, categoria, localização, fornecedor, bobinas ou itens em unidades. O saldo esperado é registrado no início.

Preencha a contagem. Toda diferença precisa de motivo; há observação opcional. Salvar não ajusta o estoque. Envie para conferência e peça ao administrador para confirmar.

Status: Em andamento → Aguardando conferência → Concluído, ou Cancelado com motivo. A confirmação registra as diferenças uma única vez, com usuário, data, motivo e aprovação. Se houver movimentação ou reserva após o início, a aprovação é bloqueada: cancele e inicie uma nova contagem. Material reservado não pode ser retirado por um ajuste que torne o saldo insuficiente.

Bobinas são contadas por código, boca e comprimento restante. O comprimento é convertido pela boca quando o estoque usa m². Saldo sem bobina identificada aparece separado para não contar o mesmo material duas vezes.

## Backup completo

Abra Configurações → Segurança → Segurança / Backup. Use Fazer backup agora, Ver histórico de backups, Restaurar backup ou Importar backup.

A agenda inicial é domingo às 03:00, no fuso America/Sao_Paulo. O servidor precisa estar ligado. Se perder a data, executa na próxima inicialização disponível. Falhas são registradas e uma nova tentativa pode ocorrer após uma hora. A agenda pode ser alterada ou desativada pelo administrador.

O arquivo .ngb inclui cópias consistentes de todos os bancos, arquivos da área persistente de dados, anexos, imagens armazenadas nos bancos, documentos e arquivos da aplicação/configuração. Dependências instaláveis, caches, backups anteriores e quarentenas não são copiados recursivamente. A chave que abre o backup não é colocada dentro dele.

Os bancos são copiados por VACUUM INTO, incluindo o conteúdo confirmado do WAL; não se faz uma cópia simples do arquivo SQLite ativo. Os arquivos são enumerados com tamanho e SHA-256. O pacote é comprimido e criptografado por AES-256-GCM. Após gerar, ele é decifrado em pasta isolada; tabelas, contagens e conteúdo lógico são comparados, e referências de anexos são verificadas. Somente então aparece Validado com sucesso.

A validação não altera o banco em uso. O painel mostra último backup, próximo backup, último teste de restauração, falhas e situação da cópia externa. Os avisos de falha também aparecem no painel do administrador.

## Retenção e cópia externa

Padrão configurável: quatro semanas, três meses e um trimestre. Um mesmo arquivo pode atender mais de uma faixa. O último backup válido é sempre mantido. Somente backups automáticos excedentes entram na retenção: primeiro ficam 30 dias em quarentena e depois podem ser descartados. Backups manuais e anteriores a operações críticas são protegidos para revisão. Os backups antigos em backups-erp são preservados e não entram silenciosamente na nova retenção.

Use BACKUP_MIRROR_DIR para apontar a um volume remoto já montado, como armazenamento de outro equipamento ou serviço de nuvem montado no servidor. O destino precisa existir. O arquivo criptografado é copiado e seu checksum é conferido; destino indisponível gera falha visível. Uma segunda pasta no mesmo disco não é proteção contra perda física. O sistema não afirma que uma cópia local foi sincronizada na nuvem sem um destino remoto validado.

Nenhum bucket, conta de nuvem ou credencial externa foi criado nesta entrega. É possível baixar o .ngb e guardá-lo em um destino externo escolhido pelo administrador.

## Chave de recuperação

No uso local, a chave aleatória fica em data-backups/.encryption-key, fora da área pública. No servidor, configure BACKUP_KEY_FILE em volume persistente separado, ou BACKUP_ENCRYPTION_KEY com 32 bytes codificados em base64. Não troque essa chave sem um plano de migração dos backups antigos.

Guarde uma cópia da chave em local seguro, separado dos arquivos .ngb e fora do computador principal. Não envie a chave pelo chat, e-mail comum ou repositório. Perder a chave impede abrir os backups criptografados. A chave é necessária mesmo para importar um backup em uma instalação nova; configure a chave original e reinicie antes da importação.

Permissões de arquivos e volumes devem permitir acesso somente à conta de serviço/administrador. As restrições HTTP e a criptografia não substituem as permissões do Windows ou Linux.

## Restauração pela interface

1. Escolha um backup validado no histórico ou importe um .ngb usando a chave original.
2. Clique em Restaurar e confirme a senha administrativa atual.
3. Confira data, tabelas e quantidades. Um backup do estado atual é criado e testado.
4. Marque a confirmação e digite RESTAURAR BACKUP.
5. O servidor reinicia em modo de manutenção, prepara uma cópia, valida e troca a pasta de dados. A base anterior fica recuperável. As sessões e tokens antigos são invalidados.
6. Entre novamente e confira clientes, pedidos, materiais, saldos e anexos.

A troca preserva caminhos, domínio, proxy, chaves e configuração de implantação do servidor de destino. A configuração antiga completa, inclusive .env, pode ser extraída do arquivo criptografado para recuperação administrativa. Não se aplica cegamente um domínio localhost antigo em um servidor publicado.

Um diário de troca permite voltar à pasta anterior se a operação for interrompida antes da confirmação final. Reset e restauração são feitos com o processo da aplicação parado, sob o supervisor. Nunca substitua arquivos SQLite de um processo ainda em execução.

## Recuperação em outro computador

Instale Node 24.13 ou superior, copie o programa compatível, o backup .ngb e a chave guardada separadamente. Configure os diretórios persistentes e pare o serviço antes da manutenção offline.

Comandos disponíveis após a compilação:

```text
node dist/maintenance.cjs inspect
node dist/maintenance.cjs backup
node dist/maintenance.cjs import CAMINHO_DO_ARQUIVO.ngb
node dist/maintenance.cjs test IDENTIFICADOR
node dist/maintenance.cjs extract IDENTIFICADOR PASTA_NOVA
node dist/maintenance.cjs restore IDENTIFICADOR "RESTAURAR BACKUP" IDENTIFICADOR
```

A extração entrega as pastas data e application, incluindo os arquivos da aplicação e a configuração privada arquivada. Dependências podem ser reinstaladas com npm ci. Revise o .env para o novo domínio/servidor, inicie o Nagano e valide acesso e documentos. Não envie o arquivo .env ao navegador.

## Reset operacional

Em Segurança / Backup → Manutenção, o administrador pode gerar a prévia de Resetar dados operacionais. A prévia pede a senha, cria backup validado e mostra as quantidades antes da limpeza. A execução exige checkbox, frase RESETAR BASE, identificador da prévia e confirmação da sessão administrativa. Se a base mudar, é necessário gerar outra prévia.

O reset remove da base ativa clientes, pedidos, orçamentos, produtos, serviços cadastrados, materiais, estoque, fornecedores, terceiros, financeiro, movimentações, composições, anexos operacionais e cópias legadas desses dados. Preserva contas, senhas, PINs, permissões, dados essenciais da empresa, regras gerais, configurações de integrações e segurança.

A limpeza é aplicada em transação em uma cópia isolada dos bancos, com journal de rollback, antes da troca controlada da pasta. Verifica usuários e configurações antes de ativar a base. Os anexos da base anterior permanecem recuperáveis pelo backup e pela pasta de recuperação; eles não são eliminados sem possibilidade de retorno.

Após reset ou restauração, a importação automática de dados de navegadores antigos fica desativada. Assim, um navegador com cadastros anteriores não repovoa a base vazia. Não existe geração automática de clientes ou materiais fictícios para preencher a tela. Caso as configurações essenciais ainda estejam apenas no navegador original, o administrador pode preservá-las automaticamente no primeiro acesso: somente empresa, regras de orçamento e integrações ausentes no servidor são importadas. Cadastros operacionais antigos continuam bloqueados.

O comando offline equivalente também exige frase e repetição do identificador de backup validado. A execução na base real deve corresponder à confirmação do administrador; os testes de reset são feitos primeiro em ambiente isolado.

## Limpeza segura de arquivos

Analisar arquivos desnecessários gera uma lista conservadora com caminho relativo, tamanho, motivo e checksum. Só entram artefatos de desenvolvimento identificados e sem referências na aplicação. Arquivos não identificados com segurança são preservados.

Depois de conferir e confirmar, é criado um backup e os candidatos são movidos para .quarantine. Ver quarentena permite recuperar os arquivos sem sobrescrever arquivos novos. Não há botão que apague bancos, chaves, certificados, uploads, assets utilizados ou dependências por adivinhação. A limpeza inicial não elimina permanentemente a quarentena.

## Publicação e persistência

Use APP_ENV=development no desenvolvimento local; APP_ENV=staging ou production com NODE_ENV=production em homologação/produção. Esses dois modos exigem diretórios absolutos persistentes, HTTPS, confirmação por e-mail e CAPTCHA real configurado. Homologação deve usar volumes, domínio e credenciais distintos da produção.

O banco central desta arquitetura é SQLite no servidor. Os computadores acessam as mesmas APIs e não precisam de um banco local. Não há pool de rede desnecessário nem PostgreSQL/Redis de fachada. Use uma única instância escritora da aplicação e volume de dados em sistema de arquivos local do servidor, persistente; não compartilhe arquivos SQLite/WAL entre réplicas ou por uma pasta de rede. Para múltiplas instâncias, será necessária uma migração específica para banco de rede.

Os arquivos deploy/Dockerfile, deploy/compose.production.yml e deploy/Caddyfile preparam aplicação não root, volumes persistentes, proxy HTTPS e porta interna não publicada. Copie deploy/env.production.example para .env.production e configure domínio, SMTP e Turnstile sem colocar segredos no código. Os volumes são separados para dados, backups e chave. Configure NAGANO_DOMAIN no ambiente do Compose e o DNS do domínio para o servidor.

As variáveis NAGANO_INITIAL_* só são usadas numa instalação completamente nova. Na migração da instalação existente, restaure os usuários do backup e não crie outra conta administrativa por engano. Não execute docker compose down -v em uma instalação com dados que precisam ser preservados.

A imagem e os arquivos de infraestrutura ainda precisam ser construídos e validados no servidor escolhido. DNS, emissão do certificado e acesso externo não foram simulados como concluídos.

## Migrations, eventos e integrações

Antes da primeira inicialização desta evolução, o bootstrap cria um backup completo validado, antes de carregar os módulos que aplicam migrations aditivas. A versão da manutenção é registrada e só é marcada após o servidor iniciar. Evoluções futuras que mudem o esquema devem aumentar a versão e repetir a proteção.

O supervisor reinicia apenas após uma operação de manutenção confirmada; falhas de inicialização não criam tentativas infinitas. O lock impede duas instâncias do Nagano sobre a mesma instalação. Eventos de backup, restauração, reset, quarentena e falhas ficam fora dos dados operacionais, sem senhas, tokens ou conteúdo de anexos nos logs.

As configurações do WhatsApp API passaram a ser persistidas no servidor; campos secretos continuam ocultos nas respostas. Configurações legadas de integração podem ser importadas pelo administrador e arquivadas no servidor. A sincronização antiga do Notion retornava uma confirmação simulada; agora informa indisponibilidade até existir mapeamento real, evitando registrar sucesso fictício.

## Referências técnicas

- SQLite Backup: https://www.sqlite.org/backup.html
- VACUUM INTO: https://www.sqlite.org/lang_vacuum.html
- Transações de vários bancos e journal: https://www.sqlite.org/atomiccommit.html
- Requisitos e limites de WAL: https://www.sqlite.org/wal.html

