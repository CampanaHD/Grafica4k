export const protocol = 'nagano-whatsapp-flow-v2';
export const flowStates = ['CLOSED','OPENING','WAITING_FOR_UI','READY','SEARCHING_CONTACT','OPENING_CHAT','INSERTING_MESSAGE','COMPLETED','ERROR','CANCELLED'];
export const errorMessages = {
  WHATSAPP_OPEN_TIMEOUT:'O WhatsApp não terminou de abrir no prazo. Aguarde a aba carregar e tente novamente.',
  WHATSAPP_UI_NOT_READY:'O WhatsApp ainda não está pronto para uso. Aguarde a lista de conversas aparecer e tente novamente.',
  AUTH_REQUIRED:'Conecte seu WhatsApp pelo QR Code ou pela tela de login e clique novamente no botão do sistema.',
  SEARCH_FIELD_NOT_FOUND:'A busca de contatos ainda não está disponível. Nenhuma página foi recarregada.',
  CONTACT_NOT_FOUND:'Não encontrei uma conversa única para esse número após a pesquisa. Confira o DDD e se o número está no WhatsApp.',
  CHAT_NOT_READY:'A conversa ainda não está pronta ou o número não pôde ser confirmado. Nenhum texto foi preenchido em outra conversa.',
  MESSAGE_FIELD_NOT_FOUND:'A conversa abriu, mas o campo da mensagem ainda não ficou disponível.',
  MESSAGE_INSERT_FAILED:'Não foi possível confirmar a mensagem completa. Confira o rascunho; o texto original está preservado no sistema.',
  FLOW_BUSY:'Uma preparação já está em andamento. Aguarde sua conclusão.',
  CANCELLED:'Preparação cancelada. Nenhuma mensagem foi enviada.',
};
