import React from 'react';

/** Text-only preview of WhatsApp's *bold* markers; customer content is never HTML. */
export function WhatsAppMessagePreview({ text }: { text: string }) {
  const parts = text.split(/(?<!\*)\*([^*\n]+)\*(?!\*)/g);
  return <div aria-label="Prévia da mensagem" className="whitespace-pre-wrap break-words text-sm text-slate-700 leading-relaxed">
    {parts.map((part, index) => index % 2 ? <strong key={index} className="font-bold text-slate-900">{part}</strong> : part)}
  </div>;
}
