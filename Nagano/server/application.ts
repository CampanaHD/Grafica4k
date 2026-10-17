import type {Maintenance} from './maintenance/manager';
import {createMaintenanceRouter} from './maintenance/router';
import {setMaintenanceBusyCheck} from './maintenance/runtime';
import {canViewCosts} from '../src/utils/profileAccess';
import {redactCosts} from '../src/utils/costAccess';
import 'dotenv/config';
import {createErpSystem} from './erp/api';
import {securityHeaders} from './security/headers';
import { createGraphicProductsRouter } from './graphicProductsApi';
import { createFuturaIntegration } from './futura/api';
import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { createQuotationsRouter } from './quotationsApi';
import { Material } from '../src/types';
import {
  getWhatsAppConfig,
  publicWhatsAppConfig,
  saveWhatsAppConfig,
  testWhatsAppConnection,
  sendWhatsAppMessage,
  getAllWhatsAppLogs,
  clearWhatsAppLogs,
  retryWhatsAppMessage,
  handleMetaWebhookStatuses
} from '../src/services/whatsappServer';
import { materialsRouter, getStoredMaterial, getStoredMaterials } from './materialsApi';
import { createVisualServicesRouter } from './visualServicesApi';
import { createAuthSystem } from './auth';
import { createTeamOperations } from './teamOperations';
import { protectServerFiles,serveClientFiles } from './clientFiles';


export async function startServer(maintenance:Maintenance) {
  const app = express();
  setMaintenanceBusyCheck(()=>maintenance.busy);
  app.use('/api',(req,res,next)=>{if(maintenance.busy&&!['/admin/status','/health'].includes(req.path)){res.status(503).setHeader('Retry-After','5');res.json({success:false,error:'Manutenção em andamento. Aguarde e tente novamente.'});return;}next();});
  const PORT = Number(process.env.PORT || 3000);

  // Trust only explicitly named proxy addresses, never arbitrary forwarded headers.
  if(process.env.TRUSTED_PROXY_IPS)app.set('trust proxy',process.env.TRUSTED_PROXY_IPS.split(',').map(x=>x.trim()).filter(Boolean));
  app.use(securityHeaders());
  app.use(express.json({ limit: '10mb',verify:(req:any,_res,buffer)=>{req.rawBody=buffer;} }));
  app.disable('x-powered-by');
  app.use(protectServerFiles);
  const auth=createAuthSystem();
  app.use(auth.router);
  app.use('/api',(req,res,next)=>{
    if(req.path==='/health'||req.path.replace(/\/$/,'')==='/whatsapp/webhook'){next();return;}
    res.setHeader('Cache-Control','no-store');
    auth.requireLogin(req,res,()=>auth.requireProfile(req,res,next));
  });
  app.use('/api',(req:any,res,next)=>{
    if(req.naganoProfile&&!canViewCosts(req.naganoProfile)){
      const json=res.json.bind(res);res.json=(value:any)=>json(redactCosts(value));
      if(req.method!=='GET'&&req.path.startsWith('/materials')){res.status(403).json({success:false,error:'Peça autorização para alterar os custos de materiais.'});return;}
    }next();
  });
  app.use(createMaintenanceRouter(maintenance,()=>process.exit(77)));
  app.use('/api',async(req:any,res,next)=>{try{const url=req.path,body=req.body||{};let critical=req.method==='DELETE'&&!url.startsWith('/admin/')&&!url.startsWith('/security/');
    if(url==='/erp/business/bootstrap'&&Object.keys(body.records||{}).length)critical=true;
    if(url==='/work-orders/bootstrap'&&(body.orders||[]).some((o:any)=>!operations.getOrder(o.id)))critical=true;
    if(url==='/visual-services/bootstrap'&&body.services?.length&&!visualServices.list().length)critical=true;
    if(url==='/materials'&&req.method==='PUT'&&Array.isArray(body.materials)&&getStoredMaterials().some(old=>!body.materials.some((r:any)=>r.id===old.id)))critical=true;
    if(url==='/visual-services'&&req.method==='PUT'&&Array.isArray(body.services)&&visualServices.list().some(old=>!body.services.some((r:any)=>r.id===old.id)))critical=true;
    if(critical)await maintenance.createBackup('PRE_BULK_OPERATION',req.naganoActor);next();
  }catch{res.status(409).json({success:false,error:'A operação foi impedida porque não foi possível validar um backup de segurança.'});}});

  app.use(materialsRouter);
  const visualServices=createVisualServicesRouter(getStoredMaterials);
  app.use(visualServices.router);
  const graphicProducts = createGraphicProductsRouter();
  app.use(graphicProducts.router);
  const erp=createErpSystem(()=>getStoredMaterials() as Material[]);app.use(erp.router);
  app.use(createFuturaIntegration().router);
  let operations:ReturnType<typeof createTeamOperations>;
  const quoteRepository=createQuotationsRouter(id => erp.inventory.materialForPricing(getStoredMaterial(id) as Material | undefined), undefined, graphicProducts.get,visualServices.get,{beforeCleanup:async()=>{await maintenance.createBackup('PRE_QUOTATION_RETENTION');},getFinish:(id,version)=>erp.finishingCatalog.find(id,version),getStockItem:id=>erp.store.get('stock_items',id),getThirdParty:id=>operations.getThirdParty(id),onSaved:(quote,actor)=>{erp.quotationSaved(quote,actor);operations.quotationSaved(quote,actor);}});
  operations=createTeamOperations(auth.activity,quoteRepository.get,undefined,quoteRepository.getApproved,{database:erp.store.db,transaction:erp.transaction,beforeOrderSave:erp.beforeOrderSave});
  quoteRepository.flushPending();
  const quoteSyncTimer=setInterval(()=>{try{if(!maintenance.busy)quoteRepository.flushPending();}catch{console.error('Sincronização de orçamento pendente; será tentada novamente.');}},10000);quoteSyncTimer.unref();
  app.use(operations.router);
  app.use(quoteRepository.router);

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      system: 'Print Shop Management System - Brazilian Print Shop',
      timestamp: new Date().toISOString()
    });
  });

  // Notion Sync endpoint
  app.post('/api/notion/sync',auth.admin, (_req,res)=>res.status(501).json({success:false,error:'A sincronização real com o Notion requer configuração e mapeamento da base. Nenhum registro foi enviado.'}));

  // ==========================================
  // WHATSAPP BUSINESS CLOUD API ENDPOINTS
  // ==========================================

  // Get current server WhatsApp configuration
  app.get('/api/whatsapp/config', (req, res) => {
    res.json(publicWhatsAppConfig());
  });

  // Save WhatsApp configuration
  app.post('/api/whatsapp/config',auth.admin, (req, res) => {
    const updated = saveWhatsAppConfig(req.body);
    res.json({
      success: true,
      message: 'Configurações do WhatsApp salvas com sucesso no servidor.',
      config: publicWhatsAppConfig(updated)
    });
  });

  // Test Meta Graph API Connection (GET /{phoneNumberId})
  app.post('/api/whatsapp/test-connection', async (req, res) => {
    const result = await testWhatsAppConnection(req.body);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Send real test WhatsApp message (Template or Text)
  app.post('/api/whatsapp/send-test', async (req, res) => {
    const { phone, templateName, templateLanguage, settings } = req.body;
    const configToUse = settings || req.body;

    const result = await sendWhatsAppMessage({
      phone: phone || configToUse.testPhoneNumber || '(11) 98765-4321',
      messageType: 'template',
      templateName: templateName || configToUse.testTemplateName || 'hello_world',
      templateLanguage: templateLanguage || configToUse.testTemplateLanguage || 'pt_BR',
      content: 'Mensagem de teste de envio via Meta WhatsApp Cloud API.',
      referenceType: 'TEST',
      configOverride: configToUse
    });

    res.status(result.success ? 200 : 400).json(result);
  });

  // Send notification (Quotes, Work Orders, Pickup notices, etc)
  app.post('/api/whatsapp/send', async (req, res) => {
    const {
      phone,
      messageType,
      templateName,
      templateLanguage,
      templateParameters,
      message,
      content,
      customerName,
      referenceType,
      referenceId,
      referenceNumber,
      idempotencyKey,
      settings
    } = req.body;

    const result = await sendWhatsAppMessage({
      phone,
      messageType: messageType || (templateName ? 'template' : 'text'),
      templateName,
      templateLanguage,
      templateParameters,
      content: content || message || '',
      customerName,
      referenceType,
      referenceId,
      referenceNumber,
      idempotencyKey,
      configOverride: settings
    });

    res.status(result.success ? 200 : 400).json(result);
  });

  // Get message history logs
  app.get('/api/whatsapp/logs', (req, res) => {
    res.json({
      logs: getAllWhatsAppLogs()
    });
  });

  // Retry sending a message
  app.post('/api/whatsapp/retry', async (req, res) => {
    const { logId } = req.body;
    const result = await retryWhatsAppMessage(logId);
    res.status(result.success ? 200 : 400).json(result);
  });

  // Clear message logs
  app.post('/api/whatsapp/clear-logs', (req, res) => {
    clearWhatsAppLogs();
    res.json({ success: true, message: 'Histórico de mensagens limpo com sucesso.' });
  });

  // Meta Webhook Verification (GET)
  app.get(['/api/whatsapp/webhook', '/api/whatsapp/webhook/'], (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const config = getWhatsAppConfig();
    const expectedToken = (
      process.env.META_VERIFY_TOKEN ||
      config.webhookVerifyToken ||
      process.env.META_WEBHOOK_VERIFY_TOKEN ||
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
      ''
    ).trim();

    const tokenReceived = typeof token === 'string' ? token.trim() : '';

    let isValid = false;
    if (tokenReceived && expectedToken && tokenReceived.length === expectedToken.length) {
      try {
        isValid = crypto.timingSafeEqual(Buffer.from(tokenReceived), Buffer.from(expectedToken));
      } catch {
        isValid = tokenReceived === expectedToken;
      }
    } else {
      isValid = tokenReceived === expectedToken;
    }

    if (mode === 'subscribe' && isValid) {
      console.log(`[Meta Webhook GET] Verificação efetuada com sucesso. Challenge: ${challenge}`);
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(String(challenge || ''));
    }

    console.warn(`[Meta Webhook GET] Falha na verificação de token. Recebido: "${tokenReceived}", Esperado: "${expectedToken}"`);
    res.setHeader('Content-Type', 'text/plain');
    return res.status(403).send('Token de verificação inválido.');
  });

  // Meta Webhook Receiver (POST for message status events and incoming messages)
  app.post(['/api/whatsapp/webhook', '/api/whatsapp/webhook/'], (req, res) => {
    const signature = (req.headers['x-hub-signature-256'] || req.headers['X-Hub-Signature-256']) as string | undefined;
    const config = getWhatsAppConfig();

    // Verify HMAC SHA-256 Signature if Meta App Secret is configured and signature header exists
    if(!config.appSecret||!signature)return res.status(401).json({error:'Assinatura do Webhook Meta obrigatória.'});
    if (config.appSecret && config.appSecret.trim() && signature) {
      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', config.appSecret.trim())
        .update((req as any).rawBody||Buffer.alloc(0))
        .digest('hex');

      try {
        const sigBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);
        if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
          console.warn('Assinatura do Webhook Meta (X-Hub-Signature-256) inválida ou adulterada.');
          return res.status(401).json({ error: 'Assinatura inválida do Webhook Meta.' });
        }
      } catch (err) {
        console.warn('Erro ao comparar assinaturas do Webhook Meta.');
        return res.status(401).json({ error: 'Falha na validação de assinatura.' });
      }
    }

    const body = req.body;

    if (body.object === 'whatsapp_business_account' && Array.isArray(body.entry)) {
      let processed = 0;
      for (const entry of body.entry) {
        if (Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            if (change.value && Array.isArray(change.value.statuses)) {
              const { updatedCount } = handleMetaWebhookStatuses(change.value.statuses);
              processed += updatedCount;
            }
          }
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    }

    return res.sendStatus(404);
  });

  // Serve Vite in development, static files in production
  if (process.env.NODE_ENV !== 'production' && !process.argv[1]?.endsWith('server.cjs')) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    serveClientFiles(app,distPath);
  }

  app.use((error:any,_req:any,res:any,_next:any)=>{const status=error?.type==='entity.too.large'?413:error instanceof SyntaxError?400:500;res.status(status).json({success:false,error:status===413?'O arquivo ou conteúdo excede o tamanho permitido.':status===400?'A solicitação não é válida.':'Não foi possível concluir a operação.'});});

  const host=process.env.HOST||(process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1');
  const httpServer=app.listen(PORT, host, () => {
    maintenance.markStarted();
    if(process.send)process.send({type:"READY"});
    console.log(`Nagano: http://${host}:${PORT}`);
  });
  httpServer.on('error',(error:any)=>{console.error(error?.code==='EADDRINUSE'?'A porta do Nagano já está em uso. Abra a instalação que já está iniciada.':'Não foi possível abrir o servidor Nagano.');process.exitCode=1;maintenance.close();});
}

