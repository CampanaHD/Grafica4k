# Nagano — preços automáticos da FuturaIM

Atualização de 01/10/2026. O preço de venda dos produtos importados é o preço consultado na FuturaIM multiplicado por 2, mais o frete quando incluído. A conferência automática ocorre a cada 24 horas por produto, enquanto o servidor do Nagano estiver ligado e com internet.

## Instalar a atualização

1. Feche o servidor anterior. Faça uma cópia de segurança da pasta `data` e preserve o navegador/perfil usado no Nagano: alguns módulos continuam armazenados nele.
2. Extraia `Nagano-FuturaIM-modelos.zip` em uma pasta própria. Se já usa a versão anterior, copie a pasta `data` dessa instalação para a pasta `Nagano` extraída. Preserve também seu `.env`, se houver. O pacote não contém bancos de clientes.
3. Abra `INICIAR.cmd`. É necessário Node.js 22.13 ou superior; na primeira execução, as dependências são instaladas pela internet.
4. Acesse `http://localhost:3000` pelo mesmo navegador/perfil de antes. Mantenha a janela do servidor aberta. Não execute as duas instalações ao mesmo tempo.

## Importar um produto

1. Entre em **Configurações do Sistema → Produtos Gráficos** ou **Materiais**.
2. Clique em **Importar da Futura**. Busque pelo nome e escolha uma categoria. Também pode colar o link do produto da Futura contendo `?id=`.
3. Selecione o produto. Existem campos separados para **Modelo**, **Papel / Material**, **Gramatura**, **Formato**, **Cor**, **Enobrecimento**, **Acabamento** e **Escolha a quantidade**, conforme as informações disponíveis na Futura. O sistema também lê os campos específicos do configurador de cada produto e dados como **Formato Aberto**, quando informados. Escolha as opções disponíveis; quando houver apenas uma, o campo informa “Opção fixa neste produto”.
4. Escolha **Gráfica** ou **Comunicação Visual**.
5. A opção **Incluir frete da Futura no preço de venda** vem marcada. Confira o endereço e clique em **Conferir preço de venda**. A prévia separa preço Futura, produto com margem, frete, transportadora, prazo estimado de transporte e total. Confirme a importação. Pode desmarcar a opção para importar sem frete.

Exemplo: lote da Futura a R$ 100,00 e frete de R$ 9,90 → venda Nagano a **R$ 209,90**. O frete é somado depois da multiplicação, sem margem sobre o frete. Serviços extras não são incluídos.

## Frete para Marília

Destino configurado: **R. Vinte e Quatro de Dezembro, 948 - Centro, Marília - SP, 17504-010**. O simulador público da Futura consulta pelo CEP; a rua e o número aparecem na prévia como destino pretendido. É usada a entrega no endereço de menor valor retornada, descartando retirada em balcão.

Para um produto já importado sem frete, abra **Produtos importados e atualizações → Incluir frete no preço**. Confira e confirme. A partir daí a atualização automática consulta **produto e frete**. Os produtos antigos não recebem frete sem essa confirmação.

O frete entra no preço do lote cadastrado e, portanto, no valor do item no orçamento. **Não adicione novamente esse mesmo frete no campo Taxa de Entrega do orçamento.** Esse campo continua disponível para outros custos de entrega que você realmente queira cobrar.

A consulta é uma **estimativa para um lote da configuração selecionada**, sem fazer pedidos. Se vender vários lotes pelo cadastro, cada lote inclui sua parcela de frete; isso não representa uma cotação consolidada do carrinho da Futura. Pedidos conjuntos podem ter outro frete no fechamento. O prazo mostrado é de transporte e não inclui produção. Confira a disponibilidade para o endereço completo no fechamento da compra.

Se não houver entrega no endereço ou a consulta falhar, o sistema informa o problema, sem trocar por retirada nem inventar um preço. Nas atualizações automáticas, conserva o total anterior. A confirmação consulta novamente e pede uma nova prévia se preço ou frete tiverem mudado.

Ao alterar qualquer opção, o sistema consulta o produto correspondente na Futura e atualiza **todos os campos e o preço**. Uma mudança de formato pode levar a outra quantidade ou acabamento disponível; confira o conjunto antes de confirmar. Papel e gramatura são apresentados separadamente quando identificados no material da fonte, sem inventar combinações. O cadastro guarda a especificação e a quantidade da combinação final, para usar esse produto corretamente no orçamento. O multiplicador e a atualização automática continuam funcionando como antes.

### Exemplo: Pasta com Bolsa

No [produto informado](https://www.futuraim.com.br/produto/pasta-com-bolsa?id=7306), o campo **Modelo** permite escolher **Bolsa Colada**, **Bolsa Encaixe** ou **Bolsa Personalizada**. Ao trocar, confira novamente formato, acabamento e quantidade: a Futura pode retornar uma tiragem diferente para o novo modelo. O modelo escolhido aparece na prévia e fica salvo na especificação do cadastro.

Os produtos importados nas versões anteriores podem receber os campos que faltavam na próxima atualização, desde que código, quantidade e todos os atributos já conhecidos continuem iguais. Os orçamentos salvos não são reescritos por essa atualização.

## Como funciona a atualização automática

- A cada minuto, o servidor verifica quais produtos estão há 24 horas sem atualização bem-sucedida. Processa até 20 por rodada.
- Se o computador ou servidor estiver desligado, a atualização aguarda a próxima execução. Não é necessário deixar a página do navegador aberta.
- Se houver falha na consulta, o preço anterior é mantido. A tela de produtos importados mostra o erro e uma nova tentativa pode ocorrer após uma hora.
- Produtos inativos ou com preço/método alterado manualmente ficam fora da atualização automática. Para voltar a usar o preço da Futura, use **Atualizar preço agora**, confira a prévia e confirme. Se o método de cálculo foi alterado, ele precisa voltar à configuração importada para permitir essa atualização.
- A atualização muda o cadastro para novos cálculos. Ela não reescreve orçamentos já salvos, versões aprovadas ou pagamentos. Editar e salvar um rascunho/revisão pode recalculá-lo pelos preços vigentes, como no fluxo existente.
- Em **Produtos importados e atualizações**, use **Recarregar lista** para ver a consulta mais recente e **Ver histórico** para consultar os registros. **Atualizar preço agora** continua disponível para uma conferência antecipada.

## Usar no orçamento

- **Gráfica:** adicione um item, escolha Produtos Gráficos e selecione o produto importado. A quantidade corresponde à tiragem exata importada. Outra tiragem exige selecionar/importar a configuração correspondente na Futura.
- **Comunicação Visual:** use **Produto pronto Futura** e informe quantos lotes deseja. Trata-se de um produto terceirizado pronto, com formato e acabamento fixos. Os materiais de produção por bobina continuam no fluxo de cálculo existente.

## Alterar o multiplicador ou intervalo

Opcionalmente, acrescente estas linhas ao arquivo `.env` da pasta do sistema:

```dotenv
FUTURA_MARKUP_MULTIPLIER=2.00
FUTURA_AUTO_REFRESH_MINUTES=1440
```

O intervalo é em minutos; 1440 = 24 horas e 60 = 1 hora, mínimo permitido. Use ponto no multiplicador. Reinicie o servidor após alterar. A mudança passa a ser aplicada nas próximas importações/atualizações, respeitando o intervalo de cada produto.

## Alcance

A integração consulta informações públicas de produtos, preços e estimativa de frete; não usa sua conta nem faz pedidos. Preços de contrato, descontos exclusivos do seu login e itens personalizados sem preço público não são consultados. A busca usa as vitrines permitidas por categoria e pode não trazer todo o catálogo; nesse caso use o link exato.

Se a Futura mudar a estrutura da página, o sistema pode deixar de conseguir confirmar o preço. Nesse caso, informa a falha e conserva o preço anterior até a integração ser ajustada.

Esta entrega atualiza o sistema local. A autenticação no servidor e a sincronização multiusuário dos módulos legados continuam fora do escopo. Os detalhes e resultados de verificação estão em `Relatorio-FuturaIM.md`.
