import {BusinessDataBoundary} from './components/BusinessDataBoundary';
import {refreshBusiness,flushBusiness} from './services/businessData';



import {ErpAlerts} from './components/ErpAlerts';
import {teamRequest} from './services/teamApi';
import React, { useState, useEffect } from 'react';
import {
  CompanySettings,
  Customer,
  Material,
  Service,
  FinishOption,
  Quotation,
  WorkOrder,
  PaymentRecord,
  Receipt,
  NotionSettings,
  WhatsAppSettings,
  IntegrationQueueItem,
  UserRole,
  ProductionStatus
} from './types';
import { quotationApi } from './services/quotationApi';
import { pauseWorkOrderForRevision, updateWorkOrderAfterRevision } from './utils/quotationRevision';
import { storage } from './services/storage';
import { whatsappClient } from './services/whatsappClient';
import { numberToWordsPt } from './utils/numberToWordsPt';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { QuotationModule } from './components/QuotationModule';
import { mergeQuotationSnapshot } from './utils/quotationRetention';
import { moveProductionOrder } from './utils/productionFlow';
import { visualServicesApi } from './services/visualServicesApi';
import { CustomerModule } from './components/CustomerModule';
import { WorkOrderModule } from './components/WorkOrderModule';
import { ProductionKanban } from './components/ProductionKanban';
import { PickupModule } from './components/PickupModule';
import { FinanceModule } from './components/FinanceModule';
import { ReceiptsModule } from './components/ReceiptsModule';
import { IntegrationsModule } from './components/IntegrationsModule';
import { SettingsModule } from './components/SettingsModule';
import { WhatsAppWebFeedback } from './components/WhatsAppWebFeedback';
import { prepareMessage } from './utils/messageTemplates';
import { getMessageTemplates } from './services/messageTemplates';
import {AccessBoundary,useAccess} from './components/AccessBoundary';
import {teamApi} from './services/teamApi';
import {ThirdPartiesModule} from './components/ThirdPartiesModule';
import {ActivityCenter,useActivities} from './components/ActivityCenter';
import {canAccess,canReadOrders,canReadOrderAmounts,allModules,orderForProfile} from './utils/profileAccess';

const InventoryModule=React.lazy(()=>import('./components/InventoryModule').then(m=>({default:m.InventoryModule})));
const PayablesModule=React.lazy(()=>import('./components/PayablesModule').then(m=>({default:m.PayablesModule})));
const ReportsModule=React.lazy(()=>import('./components/ReportsModule').then(m=>({default:m.ReportsModule})));
export function App() {
  return <AccessBoundary><BusinessDataBoundary><Workspace/></BusinessDataBoundary></AccessBoundary>;
}
function Workspace() {
  const {profile}=useAccess();
  const [currentTab, selectTab] = useState<string>(()=>allModules.find(key=>canAccess(profile,key))||'dashboard');
  const setCurrentTab=(tab:string)=>{if(canAccess(profile,tab))selectTab(tab);};
  const needsCatalog=canAccess(profile,'settings')||canAccess(profile,'quotations')||canAccess(profile,'inventory')||canAccess(profile,'reports');
  const [quotationAction, setQuotationAction] = useState<'new' | 'simulate' | undefined>();
  const [quotationCustomerId, setQuotationCustomerId] = useState<string | undefined>();
  const openQuotation = (action: 'new' | 'simulate', customerId?: string) => { setQuotationCustomerId(customerId); setQuotationAction(action); setCurrentTab('quotations'); };
  const currentRole=profile.role;

  // App Data State
  const [company, setCompany] = useState<CompanySettings>(storage.getCompanySettings());
  const [customers, setCustomers] = useState<Customer[]>(storage.getCustomers());
  const [materials, setMaterials] = useState<Material[]>(storage.getMaterials());
  const [services, setServices] = useState<Service[]>(storage.getServices());
  const [finishes, setFinishes] = useState<FinishOption[]>(storage.getFinishes());
  const [budgetSettings, setBudgetSettings] = useState(storage.getBudgetSettings());
  const [quotations, setQuotations] = useState<Quotation[]>(canAccess(profile,'quotations')?storage.getQuotations():[]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(canReadOrders(profile)?storage.getWorkOrders().map(order=>orderForProfile(order,profile)):[]);
  const [receipts, setReceipts] = useState<Receipt[]>(canAccess(profile,'receipts')?storage.getReceipts():[]);
  const [payments, setPayments] = useState<PaymentRecord[]>(canAccess(profile,'finance')?storage.getPayments():[]);
  const [queue, setQueue] = useState<IntegrationQueueItem[]>(storage.getQueue());
  const [notionSettings, setNotionSettings] = useState<NotionSettings>(storage.getNotionSettings());
  const [whatsAppSettings, setWhatsAppSettings] = useState<WhatsAppSettings>(storage.getWhatsAppSettings());

  const [materialsRevision, setMaterialsRevision] = useState(needsCatalog?'':'restricted');
  const [servicesRevision,setServicesRevision]=useState(needsCatalog?'':'restricted');
  const [materialsError, setMaterialsError] = useState('');
  const [ordersReady,setOrdersReady]=useState(!canReadOrders(profile));
  const applyOrders=(rows:WorkOrder[])=>{setWorkOrders(rows);if(canReadOrderAmounts(profile))storage.saveWorkOrders(rows);};
  useEffect(()=>{if(!canReadOrders(profile))return;let active=true;const legacy=localStorage.getItem('printshop_work_orders_v2')?storage.getWorkOrders():[];
    (currentRole==='ADMIN'?teamApi.bootstrapOrders(legacy):teamApi.orders()).then(rows=>{if(active){applyOrders(rows);setOrdersReady(true);}}).catch(e=>{if(active)setMaterialsError(e.message);});return()=>{active=false;};
  },[]);
  useEffect(() => {
    if(!needsCatalog)return;
    let cancelled = false;
    fetch('/api/materials').then(async response => {
      if (!response.ok) throw new Error('Não foi possível carregar o cadastro de materiais.');
      return response.json();
    }).then(result => {
      if (cancelled) return;
      setMaterials(result.data);
      setMaterialsRevision(result.revision);
      storage.saveMaterials(result.data);
    }).catch(error => { if (!cancelled) setMaterialsError(error.message); });
    return () => { cancelled = true; };
  }, []);

  const [quotesReady, setQuotesReady] = useState(!canAccess(profile,'quotations'));
  useEffect(()=>{if(!needsCatalog)return;let active=true;(currentRole==='ADMIN'?visualServicesApi.bootstrap(storage.getServices()):visualServicesApi.list()).then(result=>{if(active){setServices(result.data);setServicesRevision(result.revision);storage.saveServices(result.data);}}).catch(error=>{if(active)setMaterialsError(error.message);});return()=>{active=false;};},[]);
  const refreshQuotations = async () => {
    if(!canAccess(profile,'quotations'))return;
    const snapshot = await quotationApi.listSnapshot();
    const protectedIds = new Set([
      ...storage.getWorkOrders().map(order => order.quotationId),
      ...storage.getPayments().map(payment => payment.quotationId).filter(Boolean),
    ] as string[]);
    setQuotations(previous => {
      const merged = mergeQuotationSnapshot(snapshot, previous, protectedIds);
      storage.saveQuotations(merged); return merged;
    });
    setQuotesReady(true);
  };
  useEffect(() => {
    let active = true;
    const refresh = () => { if (active) void refreshQuotations().catch(error => { if (active) setMaterialsError(error.message); }); };
    refresh();
    const interval = window.setInterval(refresh, 60000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);
  const activities=useActivities(()=>{if(canReadOrders(profile))void teamApi.orders().then(applyOrders).catch(e=>setMaterialsError(e.message));void refreshQuotations().catch(e=>setMaterialsError(e.message));});

  // Role Persist
  useEffect(() => {
    storage.setCurrentRole(currentRole);
  }, [currentRole]);

  useEffect(()=>{
    const update=()=>{setCompany(storage.getCompanySettings());setCustomers(storage.getCustomers());setFinishes(storage.getFinishes());setBudgetSettings(storage.getBudgetSettings());if(canAccess(profile,'finance'))setPayments(storage.getPayments());if(canAccess(profile,'receipts'))setReceipts(storage.getReceipts());};
    const failed=(event:Event)=>setMaterialsError((event as CustomEvent).detail);
    window.addEventListener('nagano-business-refreshed',update);window.addEventListener('nagano-business-error',failed);
    const timer=setInterval(()=>{void refreshBusiness().catch(e=>setMaterialsError(e.message));if(canReadOrders(profile))void teamApi.orders().then(applyOrders).catch(e=>setMaterialsError(e.message));},30000);
    return()=>{clearInterval(timer);window.removeEventListener('nagano-business-refreshed',update);window.removeEventListener('nagano-business-error',failed);};
  },[]);
  // Handlers
  const handleReopenQuotation = async (quote: Quotation, reason: string) => {
    const order = workOrders.find(os => os.id === quote.workOrderId || os.quotationId === quote.id);
    if (quote.workOrderId && !order) throw new Error('A OS vinculada não está disponível neste navegador. Abra a revisão no computador onde a OS está registrada.');
    const draft = await quotationApi.reopen(quote, reason, order?.id);
    setQuotations(previous => {
      const updated = [draft, ...previous.filter(q => q.id !== draft.id)];
      storage.saveQuotations(updated); return updated;
    });
    if (order) applyOrders(await teamApi.orders());
    storage.addAuditLog('REABRIR', 'QUOTATION', draft.id, `Revisão ${draft.commercialVersion}: ${reason}`);
    return draft;
  };


  const handleSaveQuotation = async (newQuotation: Quotation) => {
    const saved = await quotationApi.save(newQuotation);
    setQuotations(previous => {
      const updated = [saved, ...previous.filter(q => q.id !== saved.id)];
      storage.saveQuotations(updated);
      return updated;
    });
    storage.addAuditLog('SALVAR', 'QUOTATION', saved.id, `Orçamento ${saved.number} calculado e salvo pelo servidor.`);
    return saved;
  };

  const handleRejectQuotation=async(quote:Quotation,reason:string)=>{const saved=await quotationApi.reject(quote,reason);setQuotations(previous=>{const updated=previous.map(q=>q.id===saved.id?saved:q);storage.saveQuotations(updated);return updated;});};
  const handleApproveQuotation = async (quotation: Quotation, approvalData: any) => {
    if (quotation.revision === undefined) {
      await handleSaveQuotation(quotation);
      throw new Error('Orçamento legado recalculado e salvo. Confira o valor atualizado antes de aprovar.');
    }
    const existingOS = workOrders.find(os => os.id === quotation.workOrderId || os.quotationId === quotation.id);
    if (quotation.workOrderId && !existingOS) throw new Error('A OS vinculada não está disponível neste navegador. Aprove a revisão no computador onde a OS está registrada.');
    const amountPaid = Number(approvalData.amountPaid || 0);
    if (!Number.isFinite(amountPaid) || amountPaid < 0) throw new Error('Informe um pagamento válido.');
    const workOrderId = existingOS?.id ?? `os_${crypto.randomUUID()}`;
    quotation = await quotationApi.approve(quotation, workOrderId);
    // 1. Update Quotation Status
    const updatedQuotes = quotations.map((q) =>
      q.id === quotation.id ? quotation : q
    );
    setQuotations(updatedQuotes);
    storage.saveQuotations(updatedQuotes);

    // 2. Create Work Order (OS-2026-XXXX)
    const osNumber = `OS-2026-${String(workOrders.length + 1).padStart(4, '0')}`;
    const remainingBalance = Math.max(0, quotation.totalAmount - amountPaid);

    const deadlineDate = new Date(
      Date.now() + (quotation.maxDeadlineDays || company.defaultProductionDeadlineDays || 3) * 86400000
    ).toISOString().split('T')[0];

    const items = quotation.items && quotation.items.length > 0 ? quotation.items : [];
    const firstItem = items[0];
    const finishedWidth=firstItem?.widthCm??quotation.widthCm??0,finishedHeight=firstItem?.heightCm??quotation.heightCm??0;

    let newOS: WorkOrder = {
      id: workOrderId,
      number: osNumber,
      quotationId: quotation.id,
      quotationNumber: quotation.number,
      customerId: quotation.customerId,
      customerName: quotation.customerName,
      customerPhone: customers.find(c=>c.id===quotation.customerId)?.whatsapp||customers.find(c=>c.id===quotation.customerId)?.phone||quotation.customerPhone||'',
      approvalDate: approvalData.approvalDate || new Date().toISOString().split('T')[0],
      deadlineDate,
      items: items,
      outsourcedServices:quotation.outsourcedServices,
      serviceName: quotation.serviceName || (firstItem ? firstItem.serviceName : 'Serviço Gráfico'),
      description: quotation.description || (firstItem ? firstItem.description : ''),
      dimensionsText: finishedWidth>0&&finishedHeight>0?`${finishedWidth} x ${finishedHeight} cm`:'Sem medida informada',
      widthCm: finishedWidth,
      heightCm: finishedHeight,
      quantity: firstItem ? firstItem.quantity : (quotation.quantity || 1),
      materialName: firstItem ? firstItem.materialName || '' : (quotation.materialName || (quotation.outsourcedServices?.length?'Serviço de terceiro':'')),
      colors: quotation.colors || '4x0 (Colorido Digital)',
      finishingText: quotation.finishingText || '',
      installationText: quotation.installationText || 'Não inclusa',
      artworkInstructions: quotation.customerNotes || 'Instruções conforme orçamento',
      paymentMethod: `${approvalData.paymentMethod} (${approvalData.paymentCondition})`,
      totalAmount: quotation.totalAmount,
      amountPaid,
      remainingBalance,
      salespersonName: quotation.createdBy?.name||quotation.salespersonName,
      designerName: 'Arte-Finalista Padrão',
      productionResponsible: 'Equipe de Impressão',
      internalNotes: quotation.internalNotes,
      customerNotes: quotation.customerNotes,
      productionStatus: 'PRODUCAO_ARTES',
      statusHistory: [
        {
          id: `sh_${Date.now()}`,
          previousStatus: 'PRODUCAO_ARTES',
          newStatus: 'PRODUCAO_ARTES',
          changedAt: new Date().toISOString(),
          changedBy: approvalData.responsible || 'Atendimento',
          observation: 'Aprovação do orçamento e criação da OS'
        }
      ],
      createdAt: new Date().toISOString()
    };

    if (existingOS) newOS = updateWorkOrderAfterRevision(existingOS, newOS, amountPaid);
    newOS=await teamApi.saveOrder({...newOS,revision:existingOS?.revision});
    const updatedOSList = [newOS, ...workOrders.filter(os => os.id !== newOS.id)];
    applyOrders(updatedOSList);

    await refreshBusiness();

    // 5. Queue Notion & WhatsApp
    const newQueueItem: IntegrationQueueItem = {
      id: `q_${Date.now()}`,
      type: 'NOTION',
      targetId: newOS.id,
      title: `Sincronizar ${newOS.number} no Notion`,
      payload: newOS,
      status: 'SUCCESS',
      attempts: 1,
      createdAt: new Date().toISOString()
    };
    setQueue([newQueueItem, ...queue]);
    storage.saveQueue([newQueueItem, ...queue]);

    storage.addAuditLog('APROVAR', 'WORK_ORDER', newOS.id, `OS ${newOS.number} ${existingOS ? 'atualizada' : 'criada'} a partir de ${quotation.number}`);
  };

  const handleUpdateWorkOrderStatus = async (workOrderId: string, newStatus: ProductionStatus, notes?: string, productionNotes?:string,expectedRevision?:number) => {
    if (newStatus === 'FINALIZADO') newStatus = 'AGUARDANDO_RETIRADA';
    const current = workOrders.find(os => os.id === workOrderId);
    if(!current)throw new Error('OS não encontrada.');
    const saved=await teamApi.saveOrder({...current,revision:expectedRevision??current.revision,productionStatus:newStatus,...productionNotes!==undefined?{productionNotes}:{}},notes);
    applyOrders(workOrders.map(os=>os.id===saved.id?saved:os));
    storage.addAuditLog('ATUALIZAR_STATUS', 'WORK_ORDER', workOrderId, `Fase alterada para ${newStatus}`);

    // Web conversations are opened only by the attendant's explicit message button.
  };

  const handleDeliverOrder = async (workOrder: WorkOrder, receipt: Receipt | null) => {
    if (workOrders.find(os => os.id === workOrder.id)?.quotationRevisionPending) { throw new Error('Aguarde a nova aprovação do orçamento antes de entregar este pedido.'); }
    const updatedOSList = workOrders.map((os) =>
      os.id === workOrder.id
        ? {
            ...os,
            productionStatus: 'ENTREGUE' as const,
            paymentMethod:receipt?.paymentMethod||os.paymentMethod,
            remainingBalance: 0,
            amountPaid: os.totalAmount,
            pickedUpAt: new Date().toISOString()
          }
        : os
    );
    try{const saved=await teamApi.saveOrder(updatedOSList.find(os=>os.id===workOrder.id)!,'Pedido retirado pelo cliente.');applyOrders(updatedOSList.map(os=>os.id===saved.id?saved:os));}catch(e){throw e;}

    await refreshBusiness();

    storage.addAuditLog('ENTREGAR', 'WORK_ORDER', workOrder.id, `OS ${workOrder.number} entregue ao cliente e quitada.`);
  };

  const handleRegisterPayment = async (workOrderId: string, amount: number, method: string, receipt: Receipt | null) => {
    const order=workOrders.find(o=>o.id===workOrderId);if(!order)throw new Error('OS não encontrada.');
    const result=await teamRequest(`/api/erp/orders/${workOrderId}/payments`,{amount,method,revision:order.revision,idempotencyKey:crypto.randomUUID()});
    applyOrders(workOrders.map(o=>o.id===workOrderId?result.order:o));await refreshBusiness();

    storage.addAuditLog('REGISTRAR_PAGAMENTO', 'WORK_ORDER', workOrderId, `Pagamento de R$ ${amount} registrado.`);
  };

  const handleSaveCustomer = async (customerToSave: Customer) => {
    const exists = customers.some((c) => c.id === customerToSave.id);
    let updated: Customer[];
    if (exists) {
      updated = customers.map((c) => (c.id === customerToSave.id ? customerToSave : c));
    } else {
      updated = [customerToSave, ...customers];
    }
    setCustomers(updated);
    storage.saveCustomers(updated);await flushBusiness();
    storage.addAuditLog(
      exists ? 'EDITAR' : 'CRIAR',
      'CUSTOMER',
      customerToSave.id,
      `Cliente ${customerToSave.name} (${customerToSave.cpfCnpj}) ${exists ? 'atualizado' : 'cadastrado'}.`
    );
  };

  const handleSendWhatsAppReminder = async (workOrder: WorkOrder) => {
    const customer = customers.find(c => c.id === workOrder.customerId);
    const message = prepareMessage('PICKUP_READY', getMessageTemplates(), { customer, company, order: workOrder });
    await whatsappClient.sendWhatsAppMessage(customer?.whatsapp || customer?.phone || workOrder.customerPhone, message);
  };

  // Urgent counts
  const urgentCount = workOrders.filter((os) => {
    if (['FINALIZADO', 'AGUARDANDO_RETIRADA', 'ENTREGUE', 'CANCELADO'].includes(os.productionStatus)) return false;
    return new Date(os.deadlineDate).getTime() < new Date().getTime();
  }).length;

  const pendingPickupCount = workOrders.filter((os) => os.productionStatus === 'AGUARDANDO_RETIRADA').length;

  const renderSettings=(inventoryMode=false)=>(
<SettingsModule inventoryMode={inventoryMode}
          currentRole={currentRole}
          onReloadMaterials={async () => {
            const response = await fetch('/api/materials');
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Falha ao recarregar materiais.');
            setMaterials(result.data); setMaterialsRevision(result.revision); storage.saveMaterials(result.data);
          }}
          company={company}
          materials={materials}
          services={services}
          finishes={finishes}
          budgetSettings={budgetSettings}
          quotations={quotations}
          onRetentionChanged={refreshQuotations}
          onSaveCompany={async (s) => {
            setCompany(s);
            storage.saveCompanySettings(s);await flushBusiness();
          }}
          onSaveMaterials={async (m) => {
            const response = await fetch('/api/materials', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materials: m, revision: materialsRevision }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Falha ao salvar materiais.');
            setMaterials(result.data);
            setMaterialsRevision(result.revision);
            storage.saveMaterials(result.data);
          }}
          onSaveServices={async (s) => {
            const result=await visualServicesApi.save(s,servicesRevision);
            setServices(result.data);setServicesRevision(result.revision);
            storage.saveServices(result.data);
          }}
          onSaveFinishes={async (f) => {
            storage.saveFinishes(f);try{await flushBusiness();await refreshBusiness();}catch(error){await refreshBusiness();throw error;}
          }}
          onSaveBudgetSettings={async (b) => {
            setBudgetSettings(b);
            storage.saveBudgetSettings(b);await flushBusiness();
          }}
        />
  );

  if (!materialsRevision || !quotesReady || !servicesRevision || !ordersReady) return <div className="p-8">{materialsError || 'Carregando cadastros…'}{materialsError && <button className="ml-4 underline" onClick={() => window.location.reload()}>Tentar novamente</button>}</div>;

  return (
    <Layout
      currentTab={currentTab}
      setCurrentTab={setCurrentTab}
      currentRole={currentRole}
      onNewQuotation={() => openQuotation('new')}
      urgentCount={urgentCount}
      pendingPickupCount={pendingPickupCount}
    >
      {materialsError&&<div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 p-4 text-sm">{materialsError}<button className="ml-3 underline" onClick={()=>location.reload()}>Atualizar dados</button></div>}
      <React.Suspense fallback={<p className="text-sm text-slate-500 p-6">Carregando módulo…</p>}>
      {currentTab==='inventory'&&<InventoryModule materials={materials} services={services} catalog={renderSettings(true)}/>}
      {currentTab==='payables'&&<PayablesModule/>}
      {currentTab==='reports'&&<ReportsModule customers={customers} services={services} materials={materials} orders={workOrders}/>}
      </React.Suspense>
      {currentTab==='dashboard'&&(canAccess(profile,'inventory')||canAccess(profile,'payables'))&&<ErpAlerts dashboard/>}
      {currentTab === 'dashboard' && (
        <Dashboard
          quotations={quotations}
          workOrders={workOrders}
          payments={payments}
          customers={customers}
          onNavigate={(tab) => setCurrentTab(tab)}
          onNewQuotation={() => openQuotation('new')}
          onSimulate={() => openQuotation('simulate')}
        />
      )}

      {currentTab === 'quotations' && (
        <QuotationModule
          initialAction={quotationAction}
          initialCustomerId={quotationCustomerId}
          onInitialActionHandled={() => setQuotationAction(undefined)}
          quotations={quotations}
          customers={customers}
          materials={materials}
          services={services}
          finishes={finishes}
          company={company}
          onSaveQuotation={handleSaveQuotation}
          onRejectQuotation={handleRejectQuotation}
          budgetSettings={budgetSettings}
          onReopenQuotation={handleReopenQuotation}
          onApproveQuotation={handleApproveQuotation}
        />
      )}

      {currentTab === 'customers' && (
        <CustomerModule
          customers={customers}
          quotations={quotations}
          workOrders={workOrders}
          receipts={receipts}
          onSaveCustomer={handleSaveCustomer}
          onNewQuotationForCustomer={customer => openQuotation('new', customer.id)}
        />
      )}
      {currentTab==='third_parties'&&<ThirdPartiesModule/>}
      {currentTab==='activity'&&<ActivityCenter events={activities.events} error={activities.error}/>}

      {currentTab === 'work_orders' && (
        <WorkOrderModule
          workOrders={workOrders}
          company={company}
          onUpdateStatus={handleUpdateWorkOrderStatus}
        />
      )}

      {currentTab === 'kanban' && (
        <ProductionKanban
          workOrders={workOrders}
          company={company}
          onUpdateStatus={handleUpdateWorkOrderStatus}
        />
      )}

      {currentTab === 'pickup' && (
        <PickupModule customers={customers}
          workOrders={workOrders}
          company={company}
          onDeliverOrder={handleDeliverOrder}
          onSendWhatsAppReminder={handleSendWhatsAppReminder}
        />
      )}

      {currentTab === 'finance' && (
        <FinanceModule customers={customers}
          workOrders={workOrders}
          payments={payments}
          receipts={receipts}
          company={company}
          onRegisterPayment={handleRegisterPayment}
        />
      )}

      {currentTab === 'receipts' && (
        <ReceiptsModule receipts={receipts} company={company} />
      )}

      {currentTab === 'integrations' && (
        <IntegrationsModule
          notionSettings={notionSettings}
          whatsAppSettings={whatsAppSettings}
          queue={queue}
          onSaveNotion={(s) => {
            setNotionSettings(s);
            storage.saveNotionSettings(s);
          }}
          onSaveWhatsApp={(s) => {
            setWhatsAppSettings(s);
            storage.saveWhatsAppSettings(s);
          }}
          onRetryQueueItem={(id) => {
            alert('Reenviando item da fila de integração...');
          }}
        />
      )}

      {currentTab === 'settings' && (
        <>{renderSettings()}</>
      )}
      <WhatsAppWebFeedback/>
      {activities.notice&&<div role="status" className="fixed bottom-5 left-5 z-[90] max-w-sm bg-white border border-indigo-100 shadow-lg rounded-xl p-4 text-sm text-slate-700">{activities.notice.title}</div>}
    </Layout>
  );
}

export default App;

