import { WhatsAppSettings, WhatsAppMessageLog } from '../types';
import { prepareMessage } from '../utils/messageTemplates';
import { getMessageTemplates } from './messageTemplates';
import { storage } from './storage';
import { openWhatsAppConversation } from './whatsappWeb';
import type { Quotation } from '../types';

export interface TestConnectionResponse {
  success: boolean;
  code?: string;
  subcode?: string;
  userMessage: string;
  details?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
}

export interface SendWhatsAppResponse {
  success: boolean;
  wamid?: string;
  logEntry?: WhatsAppMessageLog;
  userMessage: string;
  metaResponse?: any;
}

export const whatsappClient = {
  async getConfig(): Promise<WhatsAppSettings> {
    try {
      const res = await fetch('/api/whatsapp/config');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Failed to fetch WhatsApp config from server, returning default:', err);
      return {
        phoneNumberId: '',
        accessToken: '',
        businessAccountId: '',
        graphApiVersion: 'v22.0',
        webhookVerifyToken: 'grafica_printshop_verify_secret',
        testPhoneNumber: '(11) 98765-4321',
        testTemplateName: 'hello_world',
        testTemplateLanguage: 'pt_BR',
        autoSendPickupNotice: true,
        autoSendQuoteMessage: true
      };
    }
  },

  async saveConfig(settings: WhatsAppSettings): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao salvar configurações no servidor.' };
    }
  },

  async testConnection(settings: WhatsAppSettings): Promise<TestConnectionResponse> {
    try {
      const res = await fetch('/api/whatsapp/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        code: 'NETWORK_ERROR',
        userMessage: 'Não foi possível se conectar com o servidor local para validar o WhatsApp.',
        details: err.message
      };
    }
  },

  async sendTestMessage(
    settings: WhatsAppSettings,
    phone?: string,
    templateName?: string,
    templateLanguage?: string
  ): Promise<SendWhatsAppResponse> {
    try {
      const res = await fetch('/api/whatsapp/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone || settings.testPhoneNumber,
          templateName: templateName || settings.testTemplateName,
          templateLanguage: templateLanguage || settings.testTemplateLanguage,
          settings
        })
      });
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        userMessage: 'Falha ao enviar mensagem de teste via API do WhatsApp.',
        metaResponse: err.message
      };
    }
  },

  async sendNotification(params: {
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
    settings?: WhatsAppSettings;
  }): Promise<SendWhatsAppResponse> {
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        userMessage: 'Erro na comunicação com o servidor ao enviar notificação WhatsApp.',
        metaResponse: err.message
      };
    }
  },

  async getLogs(): Promise<WhatsAppMessageLog[]> {
    try {
      const res = await fetch('/api/whatsapp/logs');
      if (!res.ok) return [];
      const data = await res.json();
      return data.logs || [];
    } catch {
      return [];
    }
  },

  async retryMessage(logId: string): Promise<SendWhatsAppResponse> {
    try {
      const res = await fetch('/api/whatsapp/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId })
      });
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        userMessage: 'Erro de rede ao tentar reenviar mensagem.'
      };
    }
  },

  async clearLogs(): Promise<void> {
    try {
      await fetch('/api/whatsapp/clear-logs', { method: 'POST' });
    } catch {
      // Ignore
    }
  },

  formatQuotationMessage(quotation: Quotation, paymentOptions: string[] = []): string {
    return prepareMessage('QUOTATION', getMessageTemplates(), { quotation, paymentOptions, company: storage.getCompanySettings() });
  },

  sendWhatsAppMessage(phone: string, message: string) {
    return openWhatsAppConversation(phone, message);
  }
};
