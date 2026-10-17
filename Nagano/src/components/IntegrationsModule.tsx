import React, { useState, useEffect } from 'react';
import { WhatsAppWebConnection } from './WhatsAppWebConnection';
import { NotionSettings, WhatsAppSettings, IntegrationQueueItem, WhatsAppMessageLog } from '../types';
import { Globe, Send, RefreshCw, CheckCircle2, AlertTriangle, Database, Smartphone, ShieldCheck, Key, Phone, Activity, Trash2, HelpCircle, Copy } from 'lucide-react';
import { whatsappClient, TestConnectionResponse, SendWhatsAppResponse } from '../services/whatsappClient';

interface IntegrationsModuleProps {
  notionSettings: NotionSettings;
  whatsAppSettings: WhatsAppSettings;
  queue: IntegrationQueueItem[];
  onSaveNotion: (settings: NotionSettings) => void;
  onSaveWhatsApp: (settings: WhatsAppSettings) => void;
  onRetryQueueItem: (id: string) => void;
}

export const IntegrationsModule: React.FC<IntegrationsModuleProps> = ({
  notionSettings,
  whatsAppSettings,
  queue,
  onSaveNotion,
  onSaveWhatsApp,
  onRetryQueueItem
}) => {
  // Notion State
  const [notionToken, setNotionToken] = useState(notionSettings.apiToken);
  const [notionDbId, setNotionDbId] = useState(notionSettings.databaseId);
  const [notionEnabled, setNotionEnabled] = useState(notionSettings.syncEnabled);

  // WhatsApp Config State
  const [waPhoneId, setWaPhoneId] = useState(whatsAppSettings.phoneNumberId || '');
  const [waToken, setWaToken] = useState(whatsAppSettings.accessToken || '');
  const [waAccountId, setWaAccountId] = useState(whatsAppSettings.businessAccountId || '');
  const [waGraphVersion, setWaGraphVersion] = useState(whatsAppSettings.graphApiVersion || 'v22.0');
  const [waWebhookToken, setWaWebhookToken] = useState(whatsAppSettings.webhookVerifyToken || '');
  const [waTestPhone, setWaTestPhone] = useState(whatsAppSettings.testPhoneNumber || '(11) 98765-4321');
  const [waTestTemplate, setWaTestTemplate] = useState(whatsAppSettings.testTemplateName || 'hello_world');
  const [waTestLang, setWaTestLang] = useState(whatsAppSettings.testTemplateLanguage || 'pt_BR');

  // Diagnostic State
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<TestConnectionResponse | null>(null);

  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSendResult, setTestSendResult] = useState<SendWhatsAppResponse | null>(null);

  const [whatsappLogs, setWhatsappLogs] = useState<WhatsAppMessageLog[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [toastMessage, setToastMessage] = useState<string>('');

  // Fetch initial logs and config from server
  useEffect(() => {
    loadServerData();
  }, []);

  const loadServerData = async () => {
    const config = await whatsappClient.getConfig();
    if (config) {
      if (config.phoneNumberId) setWaPhoneId(config.phoneNumberId);
      if (config.accessToken) setWaToken(config.accessToken);
      if (config.businessAccountId) setWaAccountId(config.businessAccountId);
      if (config.graphApiVersion) setWaGraphVersion(config.graphApiVersion);
      if (config.webhookVerifyToken) setWaWebhookToken(config.webhookVerifyToken);
      if (config.testPhoneNumber) setWaTestPhone(config.testPhoneNumber);
      if (config.testTemplateName) setWaTestTemplate(config.testTemplateName);
      if (config.testTemplateLanguage) setWaTestLang(config.testTemplateLanguage);
    }
    refreshLogs();
  };

  const refreshLogs = async () => {
    const logs = await whatsappClient.getLogs();
    setWhatsappLogs(logs);
  };

  const currentWhatsAppConfig = (): WhatsAppSettings => ({
    phoneNumberId: waPhoneId.trim(),
    accessToken: waToken.trim(),
    businessAccountId: waAccountId.trim(),
    graphApiVersion: waGraphVersion.trim() || 'v22.0',
    webhookVerifyToken: waWebhookToken.trim(),
    testPhoneNumber: waTestPhone.trim(),
    testTemplateName: waTestTemplate.trim(),
    testTemplateLanguage: waTestLang.trim(),
    autoSendPickupNotice: false,
    autoSendQuoteMessage: false
  });

  const handleSaveNotionForm = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveNotion({
      apiToken: notionToken,
      databaseId: notionDbId,
      syncEnabled: notionEnabled,
      autoSyncOnStatusChange: true
    });
    showToast('Configurações do Notion salvas com sucesso!');
  };

  const handleSaveWhatsAppForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const config = currentWhatsAppConfig();
    const result=await whatsappClient.saveConfig(config);
    if(!result.success){showToast(result.message||'Não foi possível salvar as configurações.');return;}
    onSaveWhatsApp(config);
    showToast('Configurações da WhatsApp Business Cloud API salvas no servidor!');
  };

  const handleTestConnection = async () => {
    setIsTestingConn(true);
    setConnResult(null);
    const config = currentWhatsAppConfig();
    const res = await whatsappClient.testConnection(config);
    setConnResult(res);
    setIsTestingConn(false);
  };

  const handleSendTestMessage = async () => {
    setIsSendingTest(true);
    setTestSendResult(null);
    const config = currentWhatsAppConfig();
    const res = await whatsappClient.sendTestMessage(config, waTestPhone, waTestTemplate, waTestLang);
    setTestSendResult(res);
    setIsSendingTest(false);
    refreshLogs();
  };

  const handleRetryLog = async (logId: string) => {
    const res = await whatsappClient.retryMessage(logId);
    if (res.userMessage) {
      showToast(res.userMessage);
    }
    refreshLogs();
  };

  const handleClearLogs = async () => {
    await whatsappClient.clearLogs();
    setWhatsappLogs([]);
    showToast('Histórico de mensagens limpo.');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const filteredLogs = whatsappLogs.filter(log => {
    if (statusFilter === 'ALL') return true;
    return log.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="module-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Globe className="w-5 h-5 text-indigo-600" />
            <span>Integrações</span>
          </h1>
          <p className="text-xs text-slate-500">
            Conecte o WhatsApp Web ao navegador e gerencie as integrações da gráfica.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={refreshLogs}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar Logs</span>
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className="p-3 bg-emerald-100 text-emerald-900 rounded-lg text-xs font-bold flex items-center space-x-2 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <WhatsAppWebConnection/>
      <p className="text-sm text-slate-600">Os botões de orçamento, clientes e retirada usam a conversa no navegador. Edite os textos em <strong>Configurações → Mensagens do WhatsApp</strong>. A API abaixo é opcional e possui testes próprios de envio.</p>
      <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <summary className="cursor-pointer font-bold text-sm text-slate-700">Integrações avançadas: API da Meta e Notion</summary>
      <div className="mt-5">
      {/* MAIN TWO-COLUMN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: WHATSAPP CLOUD API INTEGRATION (8 COLS) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-sm">WhatsApp Business Cloud API (Oficial Meta)</h2>
                  <p className="text-xxs text-slate-500">Envio de templates e mensagens via Graph API</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xxs font-bold flex items-center space-x-1 ${
                connResult?.success
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-600'
              }`}>
                <ShieldCheck className="w-3 h-3" />
                <span>{connResult?.success ? 'Conexão Ativa' : 'Não Testado / Pendente'}</span>
              </span>
            </div>

            <form onSubmit={handleSaveWhatsAppForm} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone Number ID (Meta)</label>
                  <input
                    type="text"
                    value={waPhoneId}
                    onChange={(e) => setWaPhoneId(e.target.value)}
                    placeholder="Ex: 102938475610293"
                    className="w-full border border-slate-300 rounded-lg p-2.5 font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                  />
                  <span className="text-xxs text-slate-400">ID exclusivo do número no Gerenciador Meta</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">WhatsApp Business Account ID (WABA)</label>
                  <input
                    type="text"
                    value={waAccountId}
                    onChange={(e) => setWaAccountId(e.target.value)}
                    placeholder="Ex: 9876543210123"
                    className="w-full border border-slate-300 rounded-lg p-2.5 font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <span className="text-xxs text-slate-400">ID da Conta do WhatsApp Business</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Permanent System Access Token (Meta for Developers)</label>
                <div className="relative">
                  <input
                    type="password"
                    value={waToken}
                    onChange={(e) => setWaToken(e.target.value)}
                    placeholder="EAAB..."
                    className="w-full border border-slate-300 rounded-lg p-2.5 font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none pr-8"
                    required
                  />
                  <Key className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
                </div>
                <span className="text-xxs text-slate-400">Token permanente de Usuário do Sistema com permissão whatsapp_business_messaging</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Versão Graph API Meta</label>
                  <input
                    type="text"
                    value={waGraphVersion}
                    onChange={(e) => setWaGraphVersion(e.target.value)}
                    placeholder="v22.0"
                    className="w-full border border-slate-300 rounded-lg p-2.5 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Webhook Verify Token</label>
                  <input
                    type="text"
                    value={waWebhookToken}
                    onChange={(e) => setWaWebhookToken(e.target.value)}
                    placeholder="Token de verificação do Webhook"
                    className="w-full border border-slate-300 rounded-lg p-2.5 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <h3 className="font-bold text-slate-800 text-xs flex items-center space-x-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Configurações de Teste de Envio</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xxs text-slate-600 mb-0.5">Telefone de Teste</label>
                    <input
                      type="text"
                      value={waTestPhone}
                      onChange={(e) => setWaTestPhone(e.target.value)}
                      placeholder="(11) 98765-4321"
                      className="w-full border border-slate-300 rounded p-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xxs text-slate-600 mb-0.5">Modelo (Template)</label>
                    <input
                      type="text"
                      value={waTestTemplate}
                      onChange={(e) => setWaTestTemplate(e.target.value)}
                      placeholder="hello_world"
                      className="w-full border border-slate-300 rounded p-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xxs text-slate-600 mb-0.5">Idioma</label>
                    <input
                      type="text"
                      value={waTestLang}
                      onChange={(e) => setWaTestLang(e.target.value)}
                      placeholder="pt_BR"
                      className="w-full border border-slate-300 rounded p-1.5 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500">Os avisos operacionais são preparados pelo botão de cada pedido. Finalizar a produção não dispara mensagens pela API.</p>

              <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-sm transition text-xs flex items-center justify-center space-x-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Salvar Configurações</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingConn}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold transition text-xs flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <Activity className={`w-4 h-4 ${isTestingConn ? 'animate-spin' : ''}`} />
                  <span>{isTestingConn ? 'Validando...' : 'Testar Conexão API'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendTestMessage}
                  disabled={isSendingTest}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition text-xs flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <Send className={`w-4 h-4 ${isSendingTest ? 'animate-spin' : ''}`} />
                  <span>{isSendingTest ? 'Enviando...' : 'Enviar Teste'}</span>
                </button>
              </div>
            </form>

            {/* DIAGNOSTIC RESULTS CARDS */}
            {connResult && (
              <div className={`p-4 rounded-xl text-xs space-y-2 ${
                connResult.success
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border border-rose-200 text-rose-900'
              }`}>
                <div className="flex items-center space-x-2 font-bold text-sm">
                  {connResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                  )}
                  <span>{connResult.success ? 'Validação Meta API Concluída com Sucesso!' : 'Falha na Validação da Meta Cloud API'}</span>
                </div>

                <p className="font-medium">{connResult.userMessage}</p>

                {connResult.success ? (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200 text-xxs font-mono">
                    <div><strong>Número Meta:</strong> {connResult.displayPhoneNumber}</div>
                    <div><strong>Nome Verificado:</strong> {connResult.verifiedName}</div>
                    <div><strong>Phone Number ID:</strong> {connResult.phoneNumberId}</div>
                    <div><strong>Qualidade:</strong> {connResult.qualityRating}</div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-rose-200 text-xxs font-mono space-y-1">
                    <div><strong>Código de Erro:</strong> {connResult.code} {connResult.subcode ? `(Subcode: ${connResult.subcode})` : ''}</div>
                    <div><strong>Detalhes Técnicos:</strong> {connResult.details}</div>
                  </div>
                )}
              </div>
            )}

            {testSendResult && (
              <div className={`p-4 rounded-xl text-xs space-y-2 ${
                testSendResult.success
                  ? 'bg-blue-50 border border-blue-200 text-blue-900'
                  : 'bg-amber-50 border border-amber-200 text-amber-900'
              }`}>
                <div className="flex items-center space-x-2 font-bold text-sm">
                  {testSendResult.success ? (
                    <Send className="w-5 h-5 text-blue-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  )}
                  <span>{testSendResult.success ? 'Mensagem de Teste Enviada!' : 'Resultado do Envio de Teste'}</span>
                </div>
                <p className="font-medium">{testSendResult.userMessage}</p>
                {testSendResult.wamid && (
                  <div className="font-mono text-xxs bg-white/80 p-2 rounded border border-blue-200">
                    <strong>WhatsApp Message ID (wamid):</strong> {testSendResult.wamid}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: NOTION INTEGRATION & WEBHOOK INFO (5 COLS) */}
        <div className="lg:col-span-5 space-y-6">
          {/* NOTION FORM */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
              <Database className="w-5 h-5 text-indigo-600" />
              <h2 className="font-bold text-slate-900 text-sm">Notion API Oficial</h2>
            </div>

            <form onSubmit={handleSaveNotionForm} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Notion Integration Token</label>
                <input
                  type="password"
                  value={notionToken}
                  onChange={(e) => setNotionToken(e.target.value)}
                  placeholder="secret_..."
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notion Database ID</label>
                <input
                  type="text"
                  value={notionDbId}
                  onChange={(e) => setNotionDbId(e.target.value)}
                  placeholder="32-character database id"
                  className="w-full border border-slate-300 rounded-lg p-2 font-mono text-xs"
                />
              </div>

              <label className="flex items-center space-x-2 cursor-pointer font-bold text-slate-800 pt-1">
                <input
                  type="checkbox"
                  checked={notionEnabled}
                  onChange={(e) => setNotionEnabled(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Sincronizar OSs com o Notion</span>
              </label>

              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm text-xs"
              >
                Salvar Conexão Notion
              </button>
            </form>
          </div>

          {/* WEBHOOK & ENDPOINTS CARD */}
          <div className="bg-slate-900 text-slate-200 rounded-xl p-5 shadow-sm space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold">
                <Globe className="w-4 h-4" />
                <span>URL do Webhook do WhatsApp (Meta Callback)</span>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xxs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Pronto para Meta
              </span>
            </div>
            <p className="text-slate-400 text-xxs leading-relaxed">
              <strong>Sim, o sistema precisa estar online</strong> para que os servidores da Meta (Facebook) consigam acessar esta URL pública HTTPS e confirmar a verificação.
            </p>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xxs space-y-2.5 text-slate-300">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/80 p-2 rounded border border-slate-800">
                <div className="truncate">
                  <span className="text-emerald-400 font-bold block sm:inline mr-2">Callback URL:</span>
                  <span className="text-slate-200 select-all">{window.location.origin}/api/whatsapp/webhook</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/api/whatsapp/webhook`);
                    alert('Callback URL copiada para a área de transferência!');
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded text-xxs font-sans font-bold transition flex items-center justify-center space-x-1 shrink-0"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copiar URL</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/80 p-2 rounded border border-slate-800">
                <div className="truncate">
                  <span className="text-emerald-400 font-bold block sm:inline mr-2">Verify Token:</span>
                  <span className="text-slate-200 select-all">{waWebhookToken}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(waWebhookToken);
                    alert('Verify Token copiado para a área de transferência!');
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded text-xxs font-sans font-bold transition flex items-center justify-center space-x-1 shrink-0"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copiar Token</span>
                </button>
              </div>
            </div>

            <div className="bg-slate-800/60 p-2.5 rounded border border-slate-700/60 text-slate-300 text-xxs space-y-1">
              <p className="font-bold text-slate-200">Passo a passo no Meta for Developers:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-slate-400">
                <li>Acesse o aplicativo no <strong>Meta for Developers</strong> e vá em <strong>WhatsApp &gt; Webhook</strong>.</li>
                <li>Clique em <strong>Editar</strong> no Callback URL e cole a URL e o Verify Token copiados acima.</li>
                <li>Clique em <strong>Verificar e Salvar</strong>. A Meta fará uma requisição de teste instantânea.</li>
                <li>Em campos do Webhook, assine os eventos <strong>messages</strong> e <strong>message_template_status_update</strong>.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* WHATSAPP MESSAGE LOGS TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
              <Activity className="w-4 h-4 text-emerald-600" />
              <span>Histórico de Mensagens do WhatsApp & Respostas da Meta API</span>
            </h3>
            <p className="text-xs text-slate-500">
              Registro completo de solicitações de envio, IDs da Meta (wamid), respostas e erros em português
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-slate-300 rounded-lg p-1.5 text-xs font-bold text-slate-700 bg-white"
            >
              <option value="ALL">Todos os Status</option>
              <option value="SENT">Enviado (SENT)</option>
              <option value="DELIVERED">Entregue (DELIVERED)</option>
              <option value="READ">Lido (READ)</option>

              <option value="SUBMITTED">Processando (SUBMITTED)</option>
              <option value="FAILED">Falhas (FAILED)</option>
            </select>

            <button
              onClick={handleClearLogs}
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition"
              title="Limpar Histórico"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 uppercase text-xxs font-bold text-slate-500">
              <tr>
                <th className="p-2.5">Data/Hora</th>
                <th className="p-2.5">Destinatário</th>
                <th className="p-2.5">Referência</th>
                <th className="p-2.5">Tipo / Template</th>
                <th className="p-2.5">Conteúdo / Status Meta</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition">
                  <td className="p-2.5 font-mono text-xxs whitespace-nowrap text-slate-500">
                    {new Date(log.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="p-2.5">
                    <div className="font-bold text-slate-800 font-mono text-xs">{log.recipientPhone}</div>
                    {log.customerName && <div className="text-xxs text-slate-500">{log.customerName}</div>}
                  </td>
                  <td className="p-2.5 font-medium">
                    {log.referenceNumber ? (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-xxs font-bold">
                        {log.referenceNumber}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xxs">Teste</span>
                    )}
                  </td>
                  <td className="p-2.5">
                    <span className="capitalize font-medium text-slate-700">{log.messageType}</span>
                    {log.templateName && (
                      <div className="font-mono text-xxs text-indigo-600">{log.templateName} ({log.templateLanguage})</div>
                    )}
                  </td>
                  <td className="p-2.5 max-w-xs">
                    <div className="truncate text-slate-700" title={log.content}>
                      {log.content || 'Template WhatsApp'}
                    </div>
                    {log.wamid && (
                      <div className="font-mono text-xxs text-slate-400 truncate" title={log.wamid}>
                        wamid: {log.wamid}
                      </div>
                    )}
                    {log.errorMessage && (
                      <div className="text-xxs text-rose-600 font-medium mt-0.5">
                        Erro: {log.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="p-2.5 text-center whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-xxs font-bold inline-flex items-center space-x-1 ${
                        log.status === 'SENT' || log.status === 'DELIVERED' || log.status === 'READ'
                          ? 'bg-emerald-100 text-emerald-800'
                          : log.status === 'FAILED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      <span>{log.status}</span>
                    </span>
                  </td>
                  <td className="p-2.5 text-right whitespace-nowrap">
                    {log.status === 'FAILED' && (
                      <button
                        onClick={() => handleRetryLog(log.id)}
                        className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded text-xxs transition"
                      >
                        Reenviar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Nenhuma mensagem registrada no histórico do WhatsApp com o filtro selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
      </details>
    </div>
  );
};
