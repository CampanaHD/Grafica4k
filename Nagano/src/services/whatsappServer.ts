import fs from 'node:fs';
import path from 'node:path';
import {atomicJson,readJson} from '../../server/maintenance/files';
const dataDirectory=process.env.PRINTSHOP_DATA_DIR||path.resolve('data'),configurationFile=path.join(dataDirectory,'whatsapp-config.json'),messageLogFile=path.join(dataDirectory,'whatsapp-logs.json');
import { WhatsAppSettings, WhatsAppMessageLog, WhatsAppMessageStatus } from '../types';
import { normalizeBrazilianPhone, mapWhatsAppError } from '../utils/whatsappUtils';

// In-memory server logs storage for WhatsApp API messages
let whatsappLogs: WhatsAppMessageLog[] = readJson(messageLogFile,[]);
let savedWhatsAppConfig: WhatsAppSettings = {
  appId: process.env.META_APP_ID || '',
  appSecret: process.env.META_APP_SECRET || '',
  phoneNumberId: process.env.META_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  accessToken: process.env.META_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '',
  businessAccountId: process.env.META_WABA_ID || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  graphApiVersion: process.env.META_GRAPH_API_VERSION || process.env.WHATSAPP_GRAPH_API_VERSION || 'v22.0',
  webhookVerifyToken: process.env.META_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
  testPhoneNumber: '(11) 98765-4321',
  testTemplateName: 'hello_world',
  testTemplateLanguage: 'en_US',
  autoSendPickupNotice: true,
  autoSendQuoteMessage: true
};

savedWhatsAppConfig={...savedWhatsAppConfig,...readJson(configurationFile,{})};
const persistLogs=()=>atomicJson(messageLogFile,whatsappLogs.slice(0,10000));
function addLog(entry:WhatsAppMessageLog){whatsappLogs.unshift(entry);persistLogs();}
export function getWhatsAppConfig(): WhatsAppSettings {
  return { ...savedWhatsAppConfig };
}

export function publicWhatsAppConfig(config=getWhatsAppConfig()){
  return {...config,accessToken:'',appSecret:'',webhookVerifyToken:'',hasAccessToken:!!config.accessToken,hasAppSecret:!!config.appSecret,hasWebhookVerifyToken:!!config.webhookVerifyToken};
}
function mergeConfig(override:Partial<WhatsAppSettings>={}){
  const safe={...override};for(const key of ['accessToken','appSecret','webhookVerifyToken'] as const)if(!safe[key]?.trim())delete safe[key];
  return {...savedWhatsAppConfig,...safe};
}

export function saveWhatsAppConfig(newConfig: Partial<WhatsAppSettings>): WhatsAppSettings {
  savedWhatsAppConfig = mergeConfig(newConfig);
  atomicJson(configurationFile,savedWhatsAppConfig);
  return { ...savedWhatsAppConfig };
}

/**
 * Validates connection with Meta Graph API using GET /{phoneNumberId}
 */
export async function testWhatsAppConnection(configOverride?: Partial<WhatsAppSettings>) {
  const config = mergeConfig(configOverride);

  if (!config.phoneNumberId || !config.phoneNumberId.trim()) {
    return {
      success: false,
      code: 'MISSING_PHONE_NUMBER_ID',
      userMessage: 'O Phone Number ID do WhatsApp não foi informado nas configurações.',
      details: 'Campo Phone Number ID em branco.'
    };
  }

  if (!config.accessToken || !config.accessToken.trim()) {
    return {
      success: false,
      code: 'MISSING_ACCESS_TOKEN',
      userMessage: 'O Token de Acesso (Access Token) do WhatsApp não foi informado nas configurações.',
      details: 'Campo Access Token em branco.'
    };
  }

  const apiVersion = config.graphApiVersion || 'v22.0';
  const url = `https://graph.facebook.com/${apiVersion}/${config.phoneNumberId.trim()}?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.accessToken.trim()}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok || data.error) {
      const mappedError = mapWhatsAppError(data);
      return {
        success: false,
        code: mappedError.code,
        subcode: mappedError.subcode,
        userMessage: mappedError.userMessage,
        details: mappedError.technicalDetails,
        rawMetaResponse: data
      };
    }

    return {
      success: true,
      phoneNumberId: data.id,
      displayPhoneNumber: data.display_phone_number || 'Número Ativo',
      verifiedName: data.verified_name || 'Conta WhatsApp Business',
      qualityRating: data.quality_rating || 'UNKNOWN',
      userMessage: `Conexão validada com sucesso! Número: ${data.display_phone_number || data.id} (${data.verified_name || 'Verificado'})`
    };
  } catch (err: any) {
    const mappedError = mapWhatsAppError(err);
    return {
      success: false,
      code: 'FETCH_ERROR',
      userMessage: mappedError.userMessage,
      details: err.message || 'Falha de rede ao conectar com os servidores da Meta.'
    };
  }
}

export interface SendWhatsAppParams {
  phone: string;
  messageType?: 'template' | 'text';
  templateName?: string;
  templateLanguage?: string;
  templateParameters?: string[];
  content?: string;
  customerName?: string;
  referenceType?: 'QUOTATION' | 'WORK_ORDER' | 'PICKUP_NOTICE' | 'TEST';
  referenceId?: string;
  referenceNumber?: string;
  idempotencyKey?: string;
  configOverride?: Partial<WhatsAppSettings>;
}

/**
 * Sends a WhatsApp message (Template or Free-form text) via Meta Business Cloud API
 */
export async function sendWhatsAppMessage(params: SendWhatsAppParams): Promise<{
  success: boolean;
  wamid?: string;
  logEntry: WhatsAppMessageLog;
  userMessage: string;
  metaResponse?: any;
}> {
  const config = mergeConfig(params.configOverride);

  // Normalization of recipient phone number
  const normResult = normalizeBrazilianPhone(params.phone);
  if (!normResult.valid) {
    const errorLog: WhatsAppMessageLog = {
      id: `walog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      recipientPhone: normResult.normalizedPhone || params.phone,
      rawPhone: params.phone,
      messageType: params.messageType || 'text',
      templateName: params.templateName,
      templateLanguage: params.templateLanguage,
      content: params.content || '',
      customerName: params.customerName,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      referenceNumber: params.referenceNumber,
      idempotencyKey: params.idempotencyKey,
      status: 'FAILED',
      attempts: 1,
      lastAttemptAt: new Date().toISOString(),
      failedAt: new Date().toISOString(),
      errorCode: 'INVALID_PHONE',
      errorMessage: normResult.error,
      createdAt: new Date().toISOString()
    };
    addLog(errorLog);
    return {
      success: false,
      logEntry: errorLog,
      userMessage: normResult.error || 'O telefone do cliente é inválido.'
    };
  }

  // Idempotency check: prevent sending duplicate message if already sent recently
  if (params.idempotencyKey) {
    const existingLog = whatsappLogs.find(
      l => l.idempotencyKey === params.idempotencyKey && (l.status === 'SENT' || l.status === 'DELIVERED' || l.status === 'READ' || l.status === 'SUBMITTED')
    );
    if (existingLog) {
      return {
        success: true,
        wamid: existingLog.wamid,
        logEntry: existingLog,
        userMessage: `Notificação já enviada anteriormente para esta referência (${existingLog.referenceNumber || existingLog.idempotencyKey}).`
      };
    }
  }

  // Verify configuration
  if (!config.phoneNumberId || !config.accessToken) {
    const configErrorLog: WhatsAppMessageLog = {
      id: `walog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      recipientPhone: normResult.normalizedPhone,
      rawPhone: params.phone,
      messageType: params.messageType || 'text',
      templateName: params.templateName,
      templateLanguage: params.templateLanguage,
      content: params.content || '',
      customerName: params.customerName,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      referenceNumber: params.referenceNumber,
      idempotencyKey: params.idempotencyKey,
      status: 'FAILED',
      attempts: 1,
      lastAttemptAt: new Date().toISOString(),
      failedAt: new Date().toISOString(),
      errorCode: 'MISSING_CREDENTIALS',
      errorMessage: 'Configurações de integração com WhatsApp (Phone Number ID / Access Token) não foram preenchidas.',
      createdAt: new Date().toISOString()
    };
    addLog(configErrorLog);
    return {
      success: false,
      logEntry: configErrorLog,
      userMessage: 'As credenciais do WhatsApp Meta API não estão configuradas.'
    };
  }

  // Create initial log entry with SUBMITTED status
  const logEntry: WhatsAppMessageLog = {
    id: `walog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    recipientPhone: normResult.normalizedPhone,
    rawPhone: params.phone,
    messageType: params.messageType || 'text',
    templateName: params.templateName,
    templateLanguage: params.templateLanguage,
    content: params.content || '',
    customerName: params.customerName,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    referenceNumber: params.referenceNumber,
    idempotencyKey: params.idempotencyKey,
    status: 'SUBMITTED',
    attempts: 1,
    lastAttemptAt: new Date().toISOString(),
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  addLog(logEntry);

  const apiVersion = config.graphApiVersion || 'v22.0';
  const url = `https://graph.facebook.com/${apiVersion}/${config.phoneNumberId.trim()}/messages`;

  // Build payload
  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normResult.normalizedPhone
  };

  if (params.messageType === 'template') {
    const templateName = params.templateName || config.testTemplateName || 'hello_world';
    const templateLang = params.templateLanguage || config.testTemplateLanguage || 'pt_BR';

    payload.type = 'template';
    payload.template = {
      name: templateName,
      language: {
        code: templateLang
      }
    };

    if (params.templateParameters && params.templateParameters.length > 0) {
      payload.template.components = [
        {
          type: 'body',
          parameters: params.templateParameters.map(p => ({
            type: 'text',
            text: p
          }))
        }
      ];
    }
  } else {
    payload.type = 'text';
    payload.text = {
      preview_url: false,
      body: params.content || 'Mensagem enviada pelo sistema de gestão da gráfica.'
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok || data.error) {
      const mappedError = mapWhatsAppError(data);

      logEntry.status = 'FAILED';
      logEntry.failedAt = new Date().toISOString();
      logEntry.errorCode = mappedError.code;
      logEntry.errorSubcode = mappedError.subcode;
      logEntry.errorMessage = mappedError.userMessage;
      logEntry.metaTraceId = data?.error?.fbtrace_id;

      return {
        success: false,
        logEntry,
        userMessage: mappedError.userMessage,
        metaResponse: data
      };
    }

    // Success response handling
    const wamid = data?.messages?.[0]?.id || `wamid_${Date.now()}`;
    logEntry.wamid = wamid;
    logEntry.status = 'SENT';

    return {
      success: true,
      wamid,
      logEntry,
      userMessage: `Mensagem enviada com sucesso via WhatsApp Business API. (ID: ${wamid})`,
      metaResponse: data
    };
  } catch (err: any) {
    const mappedError = mapWhatsAppError(err);
    logEntry.status = 'FAILED';
    logEntry.failedAt = new Date().toISOString();
    logEntry.errorCode = 'NETWORK_ERROR';
    logEntry.errorMessage = mappedError.userMessage;

    return {
      success: false,
      logEntry,
      userMessage: mappedError.userMessage
    };
  }
}

/**
 * Handles Webhook status updates from Meta (sent, delivered, read, failed)
 */
export function handleMetaWebhookStatuses(statuses: any[]): { updatedCount: number } {
  let updatedCount = 0;
  if (!Array.isArray(statuses)) return { updatedCount: 0 };

  for (const item of statuses) {
    const wamid = item.id;
    const metaStatus = item.status; // sent, delivered, read, failed
    const timestampSec = parseInt(item.timestamp, 10);
    const dateStr = !isNaN(timestampSec) ? new Date(timestampSec * 1000).toISOString() : new Date().toISOString();

    const logEntry = whatsappLogs.find(l => l.wamid === wamid);
    if (logEntry) {
      if (metaStatus === 'sent') {
        logEntry.status = 'SENT';
        logEntry.submittedAt = dateStr;
      } else if (metaStatus === 'delivered') {
        logEntry.status = 'DELIVERED';
        logEntry.deliveredAt = dateStr;
      } else if (metaStatus === 'read') {
        logEntry.status = 'READ';
        logEntry.readAt = dateStr;
      } else if (metaStatus === 'failed') {
        logEntry.status = 'FAILED';
        logEntry.failedAt = dateStr;
        if (item.errors && item.errors.length > 0) {
          const errInfo = item.errors[0];
          const mapped = mapWhatsAppError(errInfo);
          logEntry.errorCode = errInfo.code || mapped.code;
          logEntry.errorMessage = mapped.userMessage;
        }
      }
      updatedCount++;
    }
  }

  persistLogs();
  return { updatedCount };
}

export function getAllWhatsAppLogs(): WhatsAppMessageLog[] {
  persistLogs();
  return [...whatsappLogs];
}

export function clearWhatsAppLogs(): void {
  whatsappLogs = [];persistLogs();
}

export async function retryWhatsAppMessage(logId: string): Promise<{ success: boolean; userMessage: string; logEntry?: WhatsAppMessageLog }> {
  const existing = whatsappLogs.find(l => l.id === logId);
  if (!existing) {
    return { success: false, userMessage: 'Registro de mensagem não encontrado para reenvio.' };
  }

  existing.attempts += 1;
  existing.lastAttemptAt = new Date().toISOString();

  const sendResult = await sendWhatsAppMessage({
    phone: existing.rawPhone || existing.recipientPhone,
    messageType: existing.messageType,
    templateName: existing.templateName,
    templateLanguage: existing.templateLanguage,
    content: existing.content,
    customerName: existing.customerName,
    referenceType: existing.referenceType,
    referenceId: existing.referenceId,
    referenceNumber: existing.referenceNumber
  });

  return {
    success: sendResult.success,
    userMessage: sendResult.userMessage,
    logEntry: sendResult.logEntry
  };
}
