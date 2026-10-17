import { defaultMessageTemplates, upgradeDefaultMessageTemplates, validateMessageTemplates, type MessageTemplateSettings } from '../utils/messageTemplates';
const KEY = 'printshop_message_templates_v1';
export function getMessageTemplates(): MessageTemplateSettings {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) { const settings = JSON.parse(stored); validateMessageTemplates(settings); return upgradeDefaultMessageTemplates(settings); }
  } catch { /* Existing or malformed data never blocks opening customer conversations. */ }
  return defaultMessageTemplates();
}
export function saveMessageTemplates(settings: MessageTemplateSettings): void {
  validateMessageTemplates(settings);
  localStorage.setItem(KEY, JSON.stringify(settings));
}
