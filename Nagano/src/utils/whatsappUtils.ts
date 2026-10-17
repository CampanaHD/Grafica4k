/**
 * Utility module for WhatsApp Business Cloud API integrations.
 * Phone number normalization, validation, and error translation.
 */

export interface PhoneNormalizationResult {
  valid: boolean;
  normalizedPhone: string;
  rawPhone: string;
  error?: string;
}

/**
 * Normalizes Brazilian telephone numbers to standard international E.164 format for WhatsApp Meta API.
 * Expected input formats:
 * - (14) 99999-9999
 * - 14 99999-9999
 * - 14999999999
 * - +55 14 99999-9999
 * - 5514999999999
 * 
 * Output format: "5514999999999" (digits only with country code 55)
 */
export function normalizeBrazilianPhone(phoneInput?: string | null): PhoneNormalizationResult {
  const rawPhone = phoneInput || '';
  if (!rawPhone.trim()) {
    return {
      valid: false,
      normalizedPhone: '',
      rawPhone,
      error: 'O telefone do cliente é inválido ou está incompleto.'
    };
  }

  // Remove all non-numeric characters
  let digits = rawPhone.replace(/\D/g, '');

  // If starts with 0 (e.g., 014999999999), remove leading zero
  if (digits.startsWith('0') && digits.length > 10) {
    digits = digits.substring(1);
  }

  // Check if country code 55 is already included
  // A local number with DDD 55 still needs the country code 55.
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;

  // Check valid total length for Brazilian phone numbers with country code:
  // 12 digits: 55 + 2-digit DDD + 8-digit landline (e.g. 551432109876)
  // 13 digits: 55 + 2-digit DDD + 9-digit mobile (e.g. 5514999999999)
  if (!digits.startsWith('55') || (digits.length !== 12 && digits.length !== 13)) {
    return {
      valid: false,
      normalizedPhone: digits,
      rawPhone,
      error: 'O telefone do cliente é inválido ou está incompleto. Verifique se possui DDD e quantidade correta de dígitos.'
    };
  }

  // Check DDD validity (11 to 99)
  const ddd = parseInt(digits.substring(2, 4), 10);
  if (isNaN(ddd) || ddd < 11 || ddd > 99) {
    return {
      valid: false,
      normalizedPhone: digits,
      rawPhone,
      error: 'O DDD informado no telefone do cliente é inválido.'
    };
  }

  return {
    valid: true,
    normalizedPhone: digits,
    rawPhone
  };
}

/**
 * Maps Meta Graph API error codes/responses to clear, human-readable Portuguese messages.
 */
export function mapWhatsAppError(errorObj: any): {
  code: string | number;
  subcode?: string | number;
  userMessage: string;
  technicalDetails: string;
} {
  if (!errorObj) {
    return {
      code: 'UNKNOWN',
      userMessage: 'Ocorreu um erro desconhecido ao processar a requisição no WhatsApp.',
      technicalDetails: 'Nenhum objeto de erro fornecido.'
    };
  }

  // Normalize error body from Meta structure: { error: { message, type, code, error_subcode, fbtrace_id } }
  const err = errorObj.error || errorObj;
  const code = err.code || errorObj.status || 'API_ERROR';
  const subcode = err.error_subcode || err.subcode;
  const rawMessage = err.message || errorObj.message || JSON.stringify(errorObj);
  const type = err.type || '';

  let userMessage = 'Ocorreu uma falha ao comunicar com a WhatsApp Business API.';

  // HTTP 401 / Token Expired / OAuth Exception (Code 190, 401)
  if (code === 190 || code === 401 || type === 'OAuthException' || rawMessage.toLowerCase().includes('access token')) {
    userMessage = 'O token do WhatsApp é inválido ou expirou. Atualize o Token de Acesso nas configurações de integração.';
  }
  // Phone Number ID invalid or resource not found (Code 100 with subcode 33 or HTTP 400/404)
  else if (code === 100 && (subcode === 33 || rawMessage.toLowerCase().includes('phone_number_id') || rawMessage.toLowerCase().includes('does not exist'))) {
    userMessage = 'O identificador do número do WhatsApp está incorreto. Verifique o Phone Number ID nas configurações.';
  }
  // Invalid recipient / phone number format (Code 100, 131009)
  else if (code === 131009 || (code === 100 && rawMessage.toLowerCase().includes('recipient'))) {
    userMessage = 'O telefone do cliente não está em um formato válido ou não possui conta cadastrada no WhatsApp.';
  }
  // Template not found / unapproved (Code 132001, 132005, 132012)
  else if (code === 132001 || code === 132005 || code === 132012 || rawMessage.toLowerCase().includes('template')) {
    userMessage = 'O modelo de mensagem (template) ainda não foi aprovado pela Meta ou o nome/idioma do modelo está incorreto.';
  }
  // Missing permissions (Code 200, 10, 200-299)
  else if (code === 200 || code === 10 || (typeof code === 'number' && code >= 200 && code <= 299)) {
    userMessage = 'A integração não possui permissão para enviar mensagens. Verifique as permissões do aplicativo no Meta Business Suite.';
  }
  // Account Restricted / Banned (Code 131031, 131030)
  else if (code === 131031 || code === 131030 || rawMessage.toLowerCase().includes('restricted')) {
    userMessage = 'A conta do WhatsApp Business possui uma restrição temporária ou permanente que impede o envio de mensagens.';
  }
  // Customer 24h Window Closed (Code 131047)
  else if (code === 131047 || rawMessage.toLowerCase().includes('re-engagement') || rawMessage.toLowerCase().includes('24 hour')) {
    userMessage = 'A janela de atendimento de 24 horas está fechada. Para contatar o cliente fora desta janela, é necessário utilizar um modelo (template) aprovado.';
  }
  // Network / Timeout
  else if (rawMessage.toLowerCase().includes('timeout') || rawMessage.toLowerCase().includes('fetch failed') || rawMessage.toLowerCase().includes('econnrefused')) {
    userMessage = 'Não foi possível conectar aos servidores da Meta WhatsApp. Verifique sua conexão ou tente novamente em instantes.';
  }

  return {
    code,
    subcode,
    userMessage,
    technicalDetails: `${type ? type + ': ' : ''}${rawMessage}${subcode ? ' (Subcode: ' + subcode + ')' : ''}`
  };
}
