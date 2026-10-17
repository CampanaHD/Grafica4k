import {StockFinishingEditor} from './StockFinishingEditor';
import {QuotationCalculator} from './QuotationCalculator';
import {CompositionPreview} from './CompositionPreview';
import {LayeredDialog} from './LayeredDialog';
import { SpecificationDetails } from './SpecificationDetails';
import { WhatsAppMessagePreview } from './WhatsAppMessagePreview';
import { OutsourcedQuoteFields } from './OutsourcedQuoteFields';
import { outsourcedCustomerItems } from '../utils/outsourcing';
import { activeProfile } from '../services/teamApi';
import type { OutsourcedService } from '../types/team';
import { VisualQuotationItemEditor } from './VisualQuotationItemEditor';
import { GraphicProductEditor } from './GraphicProductEditor';
import { DialogHeader } from './DialogHeader';
import { QuotationSimulator } from './QuotationSimulator';
import { SimulationPricingDetails } from './SimulationPricingDetails';
import { FuturaVisualItemEditor } from './FuturaVisualItemEditor';
import { GraphicPricingDetails } from './GraphicPricingDetails';
import { quotationApi } from '../services/quotationApi';
import React, { useState, useMemo } from 'react';
import {
  Quotation,
  QuotationItem,
  QuotationItemFinishing,
  Customer,
  Material,
  Service,
  FinishOption,
  CompanySettings,
  BudgetGeneralSettings,
  CalculationSnapshot,
  EvaluatedRollOption,
  RollOverrideAuditLog,
  AllowancesConfig,
  ItemDiscountType
} from '../types';
import {
  calculateItemFinishing,
  calculateQuotationTotals,
  calculateProductionDimensions,
  formatOverflowSidesText,
  calculateItemDiscount,
  findApplicableDiscountTier
} from '../utils/calculationEngine';
import { useRollPricing } from '../services/useRollPricing';
import { materialCalculationRules } from '../utils/materialCalculation';
import { rollOptimizationService } from '../services/rollOptimizationService';
import { PrintableQuotation } from './PrintableQuotation';
import { quotationCustomerItems } from '../utils/quotationMessage';
import { RollSelectorModal } from './RollSelectorModal';
import { RollDiagramSVG } from './RollDiagramSVG';
import { OrientationComparisonModal } from './OrientationComparisonModal';
import { OverflowSideSelector } from './OverflowSideSelector';
import { formatCurrency, formatDate } from '../utils/formatters';
import { whatsappClient } from '../services/whatsappClient';
import {
  Calculator,
  Plus,
  Search,
  CheckCircle2,
  Copy,
  Send,
  Printer,
  FileCheck,
  AlertCircle,
  X,
  Sparkles,
  Layers,
  Sliders,
  RotateCcw,
  BarChart2,
  History,
  Info,
  Check,
  Trash2,
  Edit3,
  Eye,
  ArrowUp,
  ArrowDown,
  FileText,
  Tag,
  DollarSign,
  PackageCheck
} from 'lucide-react';

interface QuotationModuleProps {
  initialAction?: 'new' | 'simulate';
  initialCustomerId?: string;
  onInitialActionHandled?: () => void;
  quotations: Quotation[];
  customers: Customer[];
  materials: Material[];
  services: Service[];
  finishes: FinishOption[];
  company: CompanySettings;
  budgetSettings: BudgetGeneralSettings;
  onRejectQuotation:(quotation:Quotation,reason:string)=>Promise<void>;
  onSaveQuotation: (quotation: Quotation) => Promise<Quotation>;
  onReopenQuotation: (quotation: Quotation, reason: string) => Promise<Quotation>;
  onApproveQuotation: (quotation: Quotation, approvalData: any) => Promise<void>;
}

// Helper to convert legacy single-item quotation into multi-item format
function ensureQuotationItems(q: Quotation): QuotationItem[] {
  if(!q.items?.length && q.outsourcedServices?.length)return [];
  if (q.items && q.items.length > 0) {
    return q.items;
  }
  // Convert legacy single-item quotation
  const allowances: AllowancesConfig = q.allowances || {
    reinforcementCm: 10,
    hemCm: 0,
    rodPocketCm: 0,
    bleedCm: 0,
    edgeSafetyCm: 2
  };
  return [{
    id: `item_legacy_${q.id}`,
    serviceId: q.serviceId || 'srv_legacy',
    serviceName: q.serviceName || 'Serviço Gráfico',
    description: q.description || '',
    quantity: q.quantity || 1,
    widthCm: q.widthCm || 90,
    heightCm: q.heightCm || 30,
    materialId: q.materialId,
    materialName: q.materialName || 'Material Padrão',
    orientation: q.orientation || 'HORIZONTAL',
    allowances,
    finishings: [],
    position: 1,
    recommendedRollWidthCm: q.recommendedRollWidthCm,
    recommendedOrientation: q.recommendedOrientation,
    selectedRollWidthCm: q.selectedRollWidthCm,
    selectedOrientation: q.selectedOrientation,
    isRollSelectionManual: q.isRollSelectionManual,
    manualSelectionReason: q.manualSelectionReason,
    servicePriceSnapshot: 80,
    baseValue: q.calculationSnapshot?.subtotalPrice || q.totalAmount || 0,
    finishingTotal: 0,
    subtotal: q.calculationSnapshot?.finalPrice || q.totalAmount || 0,
    calculationSnapshot: q.calculationSnapshot,
    recommendedSnapshot: q.recommendedSnapshot,
    rollAuditLogs: q.rollAuditLogs
  }];
}

export const QuotationModule: React.FC<QuotationModuleProps> = ({
  initialAction,
  initialCustomerId,
  onInitialActionHandled,
  quotations,
  customers,
  materials,
  services,
  finishes,
  company,
  budgetSettings,
  onSaveQuotation,
  onRejectQuotation,
  onReopenQuotation,
  onApproveQuotation
}) => {
  const [stockFinishingItem,setStockFinishingItem]=useState<QuotationItem|null>(null);
  const [rejecting,setRejecting]=useState<Quotation|null>(null),[rejectReason,setRejectReason]=useState(''),[rejectError,setRejectError]=useState(''),[rejectBusy,setRejectBusy]=useState(false);
  const [visualEditor, setVisualEditor] = useState<{item?:QuotationItem}|null>(null);
  const [graphicEditor, setGraphicEditor] = useState<{ item?: QuotationItem } | null>(null);
  const [simulator, setSimulator] = useState<{ newQuote?: boolean; item?: QuotationItem } | null>(null);
  const [simulationValidityHours, setSimulationValidityHours] = useState<number | null>(null);
  const [futuraEditor, setFuturaEditor] = useState<{ item?: QuotationItem } | null>(null);
  const [revisionQuote, setRevisionQuote] = useState<Quotation | null>(null);
  const [revisionReason, setRevisionReason] = useState('');
  const [revisionError, setRevisionError] = useState('');
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvedVersions, setApprovedVersions] = useState<Quotation[] | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  
  // Modals state
  const [isMainModalOpen, setIsMainModalOpen] = useState(false);
  const [isItemEditorOpen, setIsItemEditorOpen] = useState(false);
  const [viewCalculationItem, setViewCalculationItem] = useState<QuotationItem | null>(null);
  const [whatsappModalQuote, setWhatsappModalQuote] = useState<Quotation | null>(null);
  const [approvalModalQuote, setApprovalModalQuote] = useState<Quotation | null>(null);
  const [auditHistoryModalQuote, setAuditHistoryModalQuote] = useState<Quotation | null>(null);

  // Roll override modal state (inside Item Editor)
  const [isSavingQuotation, setIsSavingQuotation] = useState(false);
  const [printQuotation, setPrintQuotation] = useState<Quotation | null>(null);
  const [isRollSelectorModalOpen, setIsRollSelectorModalOpen] = useState(false);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);

  // Quotation Form State
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id || '');
  const [quoteItems, setQuoteItems] = useState<QuotationItem[]>([]);
  const [outsourcedServices,setOutsourcedServices]=useState<OutsourcedService[]>([]);
  const [deliveryCost, setDeliveryCost] = useState<number>(0);
  const [designCost, setDesignCost] = useState<number>(0);
  const [installationCost, setInstallationCost] = useState<number>(0);
  const [extraCharges, setExtraCharges] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [paymentTerms, setPaymentTerms] = useState(() => budgetSettings.paymentTermsOptions.find(option => option.trim())?.trim() ?? '');
  const [maxDeadlineDays, setMaxDeadlineDays] = useState<number>(company.defaultProductionDeadlineDays || 3);
  const [internalNotes, setInternalNotes] = useState('');
  const [customerNotes, setCustomerNotes] = useState('Considerar prazo de produção após a aprovação da arte final.');

  // Item Editor Form State (for adding / editing a single item)
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemServiceId, setItemServiceId] = useState<string>(services[0]?.id || '');
  const [itemMaterialId, setItemMaterialId] = useState<string>(materials[0]?.id || '');
  const [itemDescription, setItemDescription] = useState<string>('');
  const [itemNotes,setItemNotes]=useState('');
  const [itemWidthCm, setItemWidthCm] = useState<number>(90);
  const [itemHeightCm, setItemHeightCm] = useState<number>(30);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemOrientation, setItemOrientation] = useState<'HORIZONTAL' | 'VERTICAL' | 'AUTO'>('AUTO');

  // Allowances for active item
  const [itemReinforcementCm, setItemReinforcementCm] = useState<number>(10);
  const [itemHemCm, setItemHemCm] = useState<number>(0);
  const [itemRodPocketCm, setItemRodPocketCm] = useState<number>(0);
  const [itemBleedCm, setItemBleedCm] = useState<number>(0);
  const [itemEdgeSafetyCm, setItemEdgeSafetyCm] = useState<number>(0);

  // Per-side overflow state for active item
  const [itemOverflowValueCm, setItemOverflowValueCm] = useState<number>(10);
  const [itemOverflowTop, setItemOverflowTop] = useState<boolean>(false);
  const [itemOverflowBottom, setItemOverflowBottom] = useState<boolean>(false);
  const [itemOverflowLeft, setItemOverflowLeft] = useState<boolean>(false);
  const [itemOverflowRight, setItemOverflowRight] = useState<boolean>(false);

  // Roll overrides for active item
  const [itemSelectedRollWidthCm, setItemSelectedRollWidthCm] = useState<number | undefined>(undefined);
  const [itemSelectedOrientation, setItemSelectedOrientation] = useState<'HORIZONTAL' | 'VERTICAL' | undefined>(undefined);
  const [itemManualReason, setItemManualReason] = useState<string>('');
  const [itemAuditLogs, setItemAuditLogs] = useState<RollOverrideAuditLog[]>([]);

  // Finishings for active item
  const [itemSelectedFinishings, setItemSelectedFinishings] = useState<{
    finishingId: string;
    compositionVersion?:string;
    quantity: number;
    notes?: string;
  }[]>([]);

  // Individual Discount for active item
  const [itemDiscountType, setItemDiscountType] = useState<ItemDiscountType>('NONE');
  const [itemDiscountInputValue, setItemDiscountInputValue] = useState<number>(0);
  const [itemDiscountOrigin, setItemDiscountOrigin] = useState<'NONE' | 'QUANTITY_TIER' | 'MANUAL_OVERRIDE'>('NONE');

  // Approval Form State
  const [approvalPaymentMethod, setApprovalPaymentMethod] = useState('PIX');
  const [approvalCondition, setApprovalCondition] = useState('SINAL_RESTANTE');
  const [approvalAmountPaid, setApprovalAmountPaid] = useState<number>(0);
  const [approvalResponsible, setApprovalResponsible] = useState(activeProfile?.name || 'Atendimento');

  // Derived Active Item Service & Material
  const activeService = useMemo(() => {
    return services.find(s => s.id === itemServiceId) || services[0];
  }, [services, itemServiceId]);

  const activeMaterial = useMemo(() => {
    return materials.find(m => m.id === itemMaterialId);
  }, [materials, itemMaterialId]);

  const materialRules = activeMaterial ? materialCalculationRules(activeMaterial) : null;

  // Check if item service uses roll pricing
  const isRollService = useMemo(() => {
    if (activeMaterial?.controlType) return activeMaterial.controlType === 'ROLL';
    if (!activeService) return true;
    if (activeService.isGraphic === true) return false;
    if (activeService.isGraphic === false) return true;
    if (activeService.calculationType === 'UNIT') return false;
    if (activeService.calculationType === 'ROLL') return true;
    const pType = activeService.pricingMethod;
    if (pType === 'PER_SQM' || pType === 'PER_LINM' || pType === 'POR_AREA_CONSUMIDA_BOBINA') {
      if (activeMaterial && activeMaterial.availableRolls && activeMaterial.availableRolls.length > 0) return true;
    }
    return false;
  }, [activeService, activeMaterial]);

  const servicePriceSnapshot = useMemo(() => (activeService?.pricingMethod==='HOURLY'?activeService.hourlyRate:activeService?.basePrice) ?? 0,[activeService,itemMaterialId]);
  // Roll totals are returned by the server using persisted material configuration.
  const rollPricing = useRollPricing({
    materialId: itemMaterialId, serviceId: itemServiceId, serviceName: activeService?.name,
    widthCm: itemWidthCm, heightCm: itemHeightCm, quantity: itemQuantity, orientation: itemOrientation,
    allowances: {
      reinforcementCm: itemReinforcementCm, hemCm: itemHemCm, rodPocketCm: itemRodPocketCm,
      bleedCm: itemBleedCm, edgeSafetyCm: itemEdgeSafetyCm,
      overflowValueCm: itemOverflowValueCm, overflowTop: itemOverflowTop, overflowBottom: itemOverflowBottom,
      overflowLeft: itemOverflowLeft, overflowRight: itemOverflowRight,
    },
    selectedRollWidthCm: itemSelectedRollWidthCm, selectedOrientation: itemSelectedOrientation,
    manualSelectionReason: itemManualReason,
    discountType: itemDiscountType, discountInputValue: itemDiscountInputValue,
    stockFinishings:quoteItems.find(i=>i.id===editingItemId)?.stockFinishings,internalCosts:quoteItems.find(i=>i.id===editingItemId)?.internalCosts,
    finishings: itemSelectedFinishings.flatMap(selected => {
      const previous=quoteItems.find(i=>i.id===editingItemId)?.finishings.find(f=>f.finishingId===selected.finishingId);
      if(selected.compositionVersion&&previous)return [previous];
      const definition = finishes.find(fin => fin.id === selected.finishingId);
      if (!definition) return previous?[previous]:[];
      return [{ ...calculateItemFinishing(definition, itemWidthCm, itemHeightCm, itemQuantity, 0), id: selected.finishingId }];
    }),
  }, isRollService && isItemEditorOpen, JSON.stringify({activeMaterial,activeService,finishes}));
  const activeItemCalcResult = rollPricing.data?.calculation ?? (rollPricing.error ? {
    success: false, error: rollPricing.error, recommended: null, recommendedSnapshot: null,
    selectedSnapshot: null, isManualSelection: false, allOptions: [],
  } : null);

  // Compute Base Price & Finishings for active item preview in Item Editor
  const activeItemComputed = useMemo(() => {
    if (isRollService) {
      const item = rollPricing.data?.item;
      return {
        baseValue: item?.baseValue ?? 0, finishingTotal: item?.finishingTotal ?? 0,
        finishingDetails: item?.finishings ?? [], subtotalBeforeDiscount: item?.subtotalBeforeDiscount ?? 0,
        discountType: itemDiscountType, discountInputValue: itemDiscountInputValue,
        discountEffectiveAmount: item?.discountEffectiveAmount ?? 0, subtotal: item?.subtotal ?? 0,
        isDiscountValid: !!item, discountErrorMessage: rollPricing.error || 'Aguarde o cálculo do servidor.',
      };
    }
    let unitPrice = servicePriceSnapshot;
    if (activeService?.referenceQuantity && activeService.referenceQuantity > 0 && activeService.referencePrice !== undefined && activeService.referencePrice >= 0) {
      unitPrice = activeService.referencePrice / activeService.referenceQuantity;
    } else if (activeService?.basePrice && activeService.basePrice > 0) {
      unitPrice = activeService.basePrice;
    }
    const baseValue = itemQuantity * unitPrice;

    // Calculate finishings details
    const finishingDetails: QuotationItemFinishing[] = itemSelectedFinishings.map(sf => {
      const finObj = finishes.find(f => f.id === sf.finishingId);
      if (!finObj) return null;
      return calculateItemFinishing(
        finObj,
        itemWidthCm,
        itemHeightCm,
        itemQuantity,
        baseValue,
        finObj.unitPrice || finObj.unitCost || 0
      );
    }).filter(Boolean) as QuotationItemFinishing[];

    const finishingTotal = finishingDetails.reduce((acc, f) => acc + f.subtotal, 0);
    const subtotalBeforeDiscount = Math.round((baseValue + finishingTotal) * 100) / 100;

    const discountRes = calculateItemDiscount(
      subtotalBeforeDiscount,
      itemDiscountType,
      itemDiscountInputValue
    );

    return {
      baseValue: Math.round(baseValue * 100) / 100,
      finishingTotal: Math.round(finishingTotal * 100) / 100,
      finishingDetails,
      subtotalBeforeDiscount,
      discountType: itemDiscountType,
      discountInputValue: itemDiscountInputValue,
      discountEffectiveAmount: discountRes.discountEffectiveAmount,
      isDiscountValid: discountRes.isValid,
      discountErrorMessage: discountRes.errorMessage,
      subtotal: discountRes.subtotalAfterDiscount
    };
  }, [
    isRollService,
    rollPricing.data,
    rollPricing.error,
    activeItemCalcResult,
    activeService,
    itemWidthCm,
    itemHeightCm,
    itemQuantity,
    servicePriceSnapshot,
    itemSelectedFinishings,
    finishes,
    itemDiscountType,
    itemDiscountInputValue
  ]);

  // Global Quotation Totals
  const quotationTotals = useMemo(() => {
    return calculateQuotationTotals(
      [...quoteItems,...outsourcedCustomerItems(outsourcedServices)],
      deliveryCost,
      designCost,
      installationCost,
      extraCharges,
      discountAmount
    );
  }, [quoteItems, outsourcedServices, deliveryCost, designCost, installationCost, extraCharges, discountAmount]);

  // Open New Quotation Modal
  const handleOpenNewQuotationModal = () => {
    setSimulationValidityHours(null);
    setEditingQuotationId(null);
    setSelectedCustomerId(customers.find(customer => customer.id === initialCustomerId)?.id || customers[0]?.id || '');
    setQuoteItems([]);
    setOutsourcedServices([]);
    setDeliveryCost(0);
    setDesignCost(0);
    setInstallationCost(0);
    setExtraCharges(0);
    setDiscountAmount(0);
    setPaymentTerms(budgetSettings.paymentTermsOptions.find(option => option.trim())?.trim() ?? '');
    setMaxDeadlineDays(company.defaultProductionDeadlineDays || 3);
    setInternalNotes('');
    setCustomerNotes('Considerar prazo de produção após a aprovação da arte final.');
    setIsMainModalOpen(true);
  };

  // Edit Existing Quotation
  const handleEditQuotation = (q: Quotation) => {
    setSimulationValidityHours(null);
    if (q.status === 'APROVADO') { setRevisionQuote(q); setRevisionReason(''); setRevisionError(''); return; }
    if (['REJEITADO', 'EXPIRADO', 'CANCELADO'].includes(q.status) || (q.workOrderId && q.status !== 'EM_REVISAO')) { alert('Este orçamento está encerrado.'); return; }
    setEditingQuotationId(q.id);
    setSelectedCustomerId(q.customerId);
    setQuoteItems(ensureQuotationItems(q));
    setOutsourcedServices(q.outsourcedServices||[]);
    setDeliveryCost(q.deliveryCost || 0);
    setDesignCost(q.designCost || 0);
    setInstallationCost(0);
    setExtraCharges((q.extraCharges || 0)+(q.installationCost || 0));
    setDiscountAmount(q.discountAmount || 0);
    setPaymentTerms(q.paymentTerms || '');
    setMaxDeadlineDays(q.maxDeadlineDays || company.defaultProductionDeadlineDays || 3);
    setInternalNotes(q.internalNotes || '');
    setCustomerNotes(q.customerNotes || '');
    setIsMainModalOpen(true);
  };

  const supportsRollEditor=(service?:Service,material?:Material)=>material?.controlType==='ROLL'&&!!service&&['PER_SQM','PER_LINM','POR_AREA_CONSUMIDA_BOBINA'].includes(service.pricingMethod);
  const materialChoices=(service?:Service)=>materials.filter(m=>m.active&&!m.futuraImportId&&(!service?.allowedMaterialIds?.length||service.allowedMaterialIds.includes(m.id)));
  const openVisualItem=(item:Partial<QuotationItem>={})=>{
    const service=services.find(s=>s.id===item.serviceId)??services.find(s=>s.active&&s.serviceGroup!=='GRAPHIC_PRODUCTS');
    const available=materialChoices(service);
    const material=materials.find(m=>m.id===item.materialId)??available.find(m=>m.id===service?.defaultMaterialId)??available[0];
    if(!supportsRollEditor(service,material)){setIsItemEditorOpen(false);setVisualEditor({item:Object.keys(item).length?{...item,serviceId:service?.id,materialId:material?.id} as QuotationItem:undefined});return;}
    setVisualEditor(null);setEditingItemId(item.id??null);setItemServiceId(service!.id);setItemMaterialId(material!.id);
    setItemDescription(item.description??'');setItemNotes(item.notes??'');setItemWidthCm(item.widthCm??90);setItemHeightCm(item.heightCm??30);setItemQuantity(item.quantity??1);setItemOrientation(item.orientation??'AUTO');
    setItemReinforcementCm(item.allowances?.reinforcementCm??0);setItemHemCm(item.allowances?.hemCm??0);
    setItemRodPocketCm(item.allowances?.rodPocketCm??0);setItemBleedCm(item.allowances?.bleedCm??0);setItemEdgeSafetyCm(item.allowances?.edgeSafetyCm??0);
    setItemOverflowValueCm(item.overflowValueCm??item.allowances?.overflowValueCm??10);setItemOverflowTop(item.overflowTop??item.allowances?.overflowTop??false);setItemOverflowBottom(item.overflowBottom??item.allowances?.overflowBottom??false);setItemOverflowLeft(item.overflowLeft??item.allowances?.overflowLeft??false);setItemOverflowRight(item.overflowRight??item.allowances?.overflowRight??false);
    setItemSelectedRollWidthCm(item.isRollSelectionManual?item.selectedRollWidthCm:undefined);setItemSelectedOrientation(item.isRollSelectionManual?item.selectedOrientation:undefined);setItemManualReason(item.isRollSelectionManual?item.manualSelectionReason??'':'');setItemAuditLogs(item.rollAuditLogs??[]);
    setItemSelectedFinishings((item.finishings??[]).map(f=>({finishingId:f.finishingId,quantity:f.quantity,notes:f.notes,compositionVersion:f.compositionVersion})));setItemDiscountType(item.discountType??'NONE');setItemDiscountInputValue(item.discountInputValue??0);
    setIsRollSelectorModalOpen(false);setIsComparisonModalOpen(false);setIsItemEditorOpen(true);
  };
  const currentItemDraft=():Partial<QuotationItem>=>({id:editingItemId??undefined,serviceId:itemServiceId,materialId:itemMaterialId,widthCm:itemWidthCm,heightCm:itemHeightCm,quantity:itemQuantity,description:itemDescription,notes:itemNotes,discountType:itemDiscountType,discountInputValue:itemDiscountInputValue});
  const chooseService=(id:string)=>{
    const service=services.find(s=>s.id===id),available=materialChoices(service),material=available.find(m=>m.id===service?.defaultMaterialId)??available[0];
    openVisualItem({...currentItemDraft(),serviceId:id,materialId:material?.id});
  };
  const handleOpenNewItemModal=()=>openVisualItem();
  const handleEditItemInQuote=(item:QuotationItem)=>{
    if(item.simulationSnapshot){setSimulator({item});return;}
    if(item.futuraImportId){setFuturaEditor({item});return;}
    if(item.serviceGroup==='GRAPHIC_PRODUCTS'){setGraphicEditor({item});return;}
    openVisualItem(item);
  };
  // Save item from Item Editor into quoteItems
  const handleSaveItemToQuote = () => {
    if (isRollService && !rollPricing.data) { alert(rollPricing.error || 'Aguarde o cálculo do servidor.'); return; }
    if (isRollService && (itemWidthCm <= 0 || itemHeightCm <= 0)) {
      alert('Informe dimensões maiores que zero para serviços em bobina.');
      return;
    }
    if (itemQuantity <= 0) {
      alert('Informe uma quantidade maior que zero.');
      return;
    }

    if (!activeItemComputed.isDiscountValid) {
      alert(activeItemComputed.discountErrorMessage || 'Desconto do item é inválido.');
      return;
    }

    if (isRollService && activeItemCalcResult && !activeItemCalcResult.success) {
      alert(activeItemCalcResult.error || 'Nenhuma bobina disponível comporta este tamanho.');
      return;
    }

    const service = services.find(s => s.id === itemServiceId);
    const material = materials.find(m => m.id === itemMaterialId);
    const isGraphic = !isRollService;

    const recSnap = isRollService ? (activeItemCalcResult?.recommendedSnapshot || activeItemCalcResult?.recommended || undefined) : undefined;
    const calcSnap = isRollService ? (activeItemCalcResult?.recommended || undefined) : undefined;

    const prodDims = isRollService ? calculateProductionDimensions(itemWidthCm, itemHeightCm, {
      reinforcementCm: itemReinforcementCm,
      hemCm: itemHemCm,
      rodPocketCm: itemRodPocketCm,
      bleedCm: itemBleedCm,
      edgeSafetyCm: itemEdgeSafetyCm,
      overflowValueCm: itemOverflowValueCm,
      overflowTop: itemOverflowTop,
      overflowBottom: itemOverflowBottom,
      overflowLeft: itemOverflowLeft,
      overflowRight: itemOverflowRight
    }) : { productionWidthCm: 0, productionHeightCm: 0 };

    const newItem: QuotationItem = {
      serviceGroup: 'VISUAL_COMMUNICATION',
      id: editingItemId || `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      serviceId: itemServiceId,
      serviceName: service ? service.name : 'Serviço Gráfico',
      description: itemDescription,
      quantity: itemQuantity,
      widthCm: isGraphic ? 0 : itemWidthCm,
      heightCm: isGraphic ? 0 : itemHeightCm,
      materialId: itemMaterialId,
      materialName: material ? material.name : 'Material Padrão',
      orientation: isGraphic ? 'AUTO' : itemOrientation,
      allowances: isGraphic ? { reinforcementCm: 0, hemCm: 0, rodPocketCm: 0, bleedCm: 0, edgeSafetyCm: 0 } : {
        reinforcementCm: itemReinforcementCm,
        hemCm: itemHemCm,
        rodPocketCm: itemRodPocketCm,
        bleedCm: itemBleedCm,
        edgeSafetyCm: itemEdgeSafetyCm,
        overflowValueCm: itemOverflowValueCm,
        overflowTop: itemOverflowTop,
        overflowBottom: itemOverflowBottom,
        overflowLeft: itemOverflowLeft,
        overflowRight: itemOverflowRight
      },
      overflowValueCm: isGraphic ? undefined : itemOverflowValueCm,
      overflowTop: isGraphic ? undefined : itemOverflowTop,
      overflowBottom: isGraphic ? undefined : itemOverflowBottom,
      overflowLeft: isGraphic ? undefined : itemOverflowLeft,
      overflowRight: isGraphic ? undefined : itemOverflowRight,
      productionWidthCm: isGraphic ? undefined : prodDims.productionWidthCm,
      productionHeightCm: isGraphic ? undefined : prodDims.productionHeightCm,
      stockFinishings:rollPricing.data?.item.stockFinishings??quoteItems.find(i=>i.id===editingItemId)?.stockFinishings,
      stockFinishingTotal:rollPricing.data?.item.stockFinishingTotal??quoteItems.find(i=>i.id===editingItemId)?.stockFinishingTotal,
      internalCosts:rollPricing.data?.item.internalCosts??quoteItems.find(i=>i.id===editingItemId)?.internalCosts,
      composedFinishingTotal:rollPricing.data?.item.composedFinishingTotal??quoteItems.find(i=>i.id===editingItemId)?.composedFinishingTotal,
      finishings: activeItemComputed.finishingDetails,
      position: editingItemId ? (quoteItems.find(i => i.id === editingItemId)?.position || quoteItems.length + 1) : quoteItems.length + 1,
      recommendedRollWidthCm: recSnap?.recommendedRollWidthCm,
      recommendedOrientation: recSnap?.orientation,
      selectedRollWidthCm: calcSnap?.isManualSelection ? calcSnap.selectedRollWidthCm : undefined,
      selectedOrientation: calcSnap?.isManualSelection ? calcSnap.orientation : undefined,
      isRollSelectionManual: isGraphic ? false : !!activeItemCalcResult?.isManualSelection,
      manualSelectionReason: isGraphic ? undefined : itemManualReason,
      isGraphic: isGraphic,
      isGraphicSnapshot: isGraphic,
      calculationType: isGraphic ? 'UNIT' : 'ROLL',
      servicePriceSnapshot: servicePriceSnapshot,
      referenceQuantitySnapshot: service?.referenceQuantity,
      referencePriceSnapshot: service?.referencePrice,
      unitPriceSnapshot: service?.referenceQuantity ? (service.referencePrice || 0) / service.referenceQuantity : servicePriceSnapshot,
      baseValue: activeItemComputed.baseValue,
      finishingTotal: activeItemComputed.finishingTotal,
      subtotalBeforeDiscount: activeItemComputed.subtotalBeforeDiscount,
      discountType: itemDiscountType,
      discountInputValue: itemDiscountInputValue,
      discountEffectiveAmount: activeItemComputed.discountEffectiveAmount,
      subtotal: activeItemComputed.subtotal,
      calculationSnapshot: calcSnap,
      recommendedSnapshot: recSnap,
      rollAuditLogs: isGraphic ? [] : itemAuditLogs
    };

    const pricedItem = isRollService ? { ...newItem, ...rollPricing.data!.item, id: newItem.id, position: newItem.position, description: itemDescription, notes: itemNotes, rollAuditLogs: itemAuditLogs } : newItem;
    if (editingItemId) {
      setQuoteItems(prev => prev.map(i => i.id === editingItemId ? pricedItem : i));
    } else {
      setQuoteItems(prev => [...prev, pricedItem]);
    }

    setIsItemEditorOpen(false);
  };

  // Duplicate an item
  const handleDuplicateItem = (item: QuotationItem) => {
    const duplicatedItem: QuotationItem = {
      ...item,
      id: `item_dup_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      serviceName: `${item.serviceName} (Cópia)`,
      position: quoteItems.length + 1,
      subtotalBeforeDiscount: item.subtotalBeforeDiscount ?? item.subtotal,
      discountType: item.discountType || 'NONE',
      discountInputValue: item.discountInputValue ?? 0,
      discountEffectiveAmount: item.discountEffectiveAmount ?? 0,
      subtotal: item.subtotal
    };
    setQuoteItems(prev => [...prev, duplicatedItem]);
  };

  // Delete an item
  const handleDeleteItem = (itemId: string) => {
    setQuoteItems(prev => prev.filter(i => i.id !== itemId));
  };

  // Move item position up or down
  const handleMoveItem = (index: number, direction: 'UP' | 'DOWN') => {
    const newItems = [...quoteItems];
    const targetIdx = direction === 'UP' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newItems.length) return;
    
    const temp = newItems[index];
    newItems[index] = newItems[targetIdx];
    newItems[targetIdx] = temp;

    // re-assign positions
    newItems.forEach((it, idx) => {
      it.position = idx + 1;
    });

    setQuoteItems(newItems);
  };

  // Roll Override Confirmation inside Item Editor
  const handleConfirmRollOverride = (opt: EvaluatedRollOption, reasonText: string) => {
    if (!activeItemCalcResult) return;
    const prevRollWidth = activeItemCalcResult.recommendedSnapshot?.recommendedRollWidthCm || opt.rollWidthCm;
    const prevOrient = activeItemCalcResult.recommendedSnapshot?.orientation || opt.orientation;
    const prevPrice = activeItemCalcResult.recommendedSnapshot?.finalPrice || opt.finalPrice;
    const prevWaste = activeItemCalcResult.recommendedSnapshot?.wastePercentage || opt.wastePercentage;

    setItemSelectedRollWidthCm(opt.rollWidthCm);
    setItemSelectedOrientation(opt.orientation);
    setItemManualReason(reasonText);

    const auditLog = rollOptimizationService.createAuditLog({
      quotationId: editingQuotationId || undefined,
      user: activeProfile?.name || 'Atendimento',
      action: 'MANUAL_OVERRIDE',
      previousRollWidthCm: prevRollWidth,
      newRollWidthCm: opt.rollWidthCm,
      previousOrientation: prevOrient,
      newOrientation: opt.orientation,
      previousFinalPrice: prevPrice,
      newFinalPrice: opt.finalPrice,
      previousWastePct: prevWaste,
      newWastePct: opt.wastePercentage,
      reason: reasonText
    });

    setItemAuditLogs(prev => [auditLog, ...prev]);
  };

  // Restore automatic roll recommendation
  const handleRestoreAutomaticRecommendation = () => {
    if (itemSelectedRollWidthCm !== undefined && activeItemCalcResult?.recommendedSnapshot) {
      const auditLog = rollOptimizationService.createAuditLog({
        quotationId: editingQuotationId || undefined,
        user: activeProfile?.name || 'Atendimento',
        action: 'RESTORE_AUTOMATIC',
        previousRollWidthCm: itemSelectedRollWidthCm,
        newRollWidthCm: activeItemCalcResult.recommendedSnapshot.recommendedRollWidthCm,
        previousOrientation: itemSelectedOrientation || 'HORIZONTAL',
        newOrientation: activeItemCalcResult.recommendedSnapshot.orientation,
        previousFinalPrice: activeItemCalcResult.recommended?.finalPrice || 0,
        newFinalPrice: activeItemCalcResult.recommendedSnapshot.finalPrice,
        previousWastePct: activeItemCalcResult.recommended?.wastePercentage || 0,
        newWastePct: activeItemCalcResult.recommendedSnapshot.wastePercentage,
        reason: 'Restauração da sugestão automática pelo usuário'
      });

      setItemAuditLogs(prev => [auditLog, ...prev]);
    }

    setItemSelectedRollWidthCm(undefined);
    setItemSelectedOrientation(undefined);
    setItemManualReason('');
  };

  // Save Final Quotation
  const handleSaveFinalQuotation = async (e: React.FormEvent) => {
    if (isSavingQuotation) return;
    e.preventDefault();
    if (quoteItems.length === 0 && outsourcedServices.length === 0) {
      alert('Adicione pelo menos um item ao orçamento.');
      return;
    }

    const customer = customers.find(c => c.id === selectedCustomerId);
    const firstItem = quoteItems[0] || outsourcedCustomerItems(outsourcedServices)[0];

    const newQuote: Quotation = {
      id: editingQuotationId || `orc_${Date.now()}`,
      revision: editingQuotationId ? quotations.find(q => q.id === editingQuotationId)?.revision : undefined,
      number: editingQuotationId
        ? (quotations.find(q => q.id === editingQuotationId)?.number || `ORC-2026-${String(quotations.length + 1).padStart(4, '0')}`)
        : `ORC-2026-${String(quotations.length + 1).padStart(4, '0')}`,
      createdAt: new Date().toISOString(),
      expirationDate: new Date(Date.now() + (simulationValidityHours !== null ? simulationValidityHours * 3600000 : (company.defaultQuotationValidityDays || 7) * 86400000)).toISOString(),
      customerId: selectedCustomerId,
      customerName: customer ? customer.name : 'Cliente Avulso',
      customerPhone:customer?.whatsapp||customer?.phone||'',
      salespersonName: activeProfile?.name || 'Atendimento',
      items: quoteItems,
      outsourcedServices,
      subtotal: quotationTotals.subtotal,
      deliveryCost,
      designCost,
      installationCost,
      extraCharges,
      discountAmount,
      totalAmount: quotationTotals.totalAmount,
      paymentTerms,
      maxDeadlineDays,
      internalNotes,
      customerNotes,
      status: editingQuotationId ? (quotations.find(q => q.id === editingQuotationId)?.status || 'ORCAMENTO') : 'ORCAMENTO',
      
      // Top-level single item compatibility fallback fields
      serviceId: firstItem.serviceId,
      serviceName: quoteItems.length > 1 ? `${quoteItems.length} Itens (Multi-serviço)` : firstItem.serviceName,
      description: firstItem.description || '',
      widthCm: firstItem.widthCm,
      heightCm: firstItem.heightCm,
      quantity: firstItem.quantity,
      materialId: firstItem.materialId,
      materialName: firstItem.materialName,
      allowances: firstItem.allowances,
      calculationSnapshot: firstItem.calculationSnapshot,
      recommendedSnapshot: firstItem.recommendedSnapshot
    };

    setIsSavingQuotation(true);
    try {
      const saved = await onSaveQuotation(newQuote);
      setIsMainModalOpen(false);
      if (saved.status === 'EM_REVISAO') setWhatsappModalQuote(saved);
    } catch (error) { alert(error instanceof Error ? error.message : 'Falha ao salvar orçamento.'); }
    finally { setIsSavingQuotation(false); }
  };

  // Approval Submission
  const handleConfirmApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvalModalQuote || approvalBusy) return;
    setApprovalBusy(true);

    try { await onApproveQuotation(approvalModalQuote, {
      paymentMethod: approvalPaymentMethod,
      paymentCondition: approvalCondition,
      amountPaid: approvalAmountPaid,
      productionResponsible: approvalResponsible
    });

    setApprovalModalQuote(null);
    } catch (error) { alert(error instanceof Error ? error.message : 'Não foi possível aprovar.'); }
    finally { setApprovalBusy(false); }
  };

  // Filtered Quotations
  const filteredQuotations = useMemo(() => {
    return quotations.filter(q => {
      const matchesSearch =
        q.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (q.serviceName && q.serviceName.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [quotations, searchTerm, statusFilter]);

  React.useEffect(() => {
    if (initialAction === 'new') handleOpenNewQuotationModal();
    if (initialAction === 'simulate') setSimulator({ newQuote: true });
    if (initialAction) onInitialActionHandled?.();
  }, [initialAction]);

  return (
    <div className="space-y-6">
      {simulator && <QuotationSimulator services={services} materials={materials} finishes={finishes} initialItem={simulator.item}
        onClose={() => setSimulator(null)} onChoose={(item, hours) => {
          if (simulator.newQuote) handleOpenNewQuotationModal();
          setSimulationValidityHours(hours);
          setQuoteItems(previous => simulator.item
            ? previous.map(old => old.id === simulator.item!.id ? { ...item, position: old.position } : old)
            : [...previous, { ...item, position: previous.length + 1 }]);
          setSimulator(null);
        }} />}
      {/* MODULE HEADER */}
      <div className="module-heading flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Calculator className="w-7 h-7 text-indigo-600" />
            Orçamentos
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Monte propostas, simule quantidades e acompanhe as aprovações.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <QuotationCalculator/>
        <button type="button" onClick={() => setSimulator({ newQuote: true })} className="nagano-button secondary"><Calculator className="w-4 h-4" /> Simular quantidades</button>
        <button
          onClick={handleOpenNewQuotationModal}
          className="nagano-button primary"
        >
          <Plus className="w-5 h-5" />
          Novo orçamento
        </button>
        </div>
      </div>

      {/* FILTERS & SEARCH */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por número, cliente ou serviço..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="ALL">Todos os Status</option>
          <option value="ORCAMENTO">Orçamento Pendente</option>
          <option value="APROVADO">Aprovado (OS Gerada)</option>
          <option value="EM_REVISAO">Em revisão</option>
          <option value="REJEITADO">Rejeitado</option>
          <option value="EXPIRADO">Expirado</option>
        </select>
      </div>

      {/* QUOTATIONS TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="quotation-list-table w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-bold text-slate-600 tracking-wider">
                <th className="p-4">Número / Data</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Itens / Serviços</th>
                <th className="p-4 text-right">Valor Total</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredQuotations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    Nenhum orçamento encontrado.
                  </td>
                </tr>
              ) : (
                filteredQuotations.map(q => {
                  const itemsList = quotationCustomerItems(q);
                  return (
                    <tr key={q.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-4 font-mono font-bold text-indigo-900">
                        <div>{q.number}{(q.commercialVersion ?? 1) > 1 && ` · R${q.commercialVersion}`}</div>
                        <div className="text-xs font-sans text-slate-500 font-normal">
                          {formatDate(q.createdAt)}
                          {q.createdBy?.name&&<span className="block">Por {q.createdBy.name}</span>}
                        </div>
                      </td>
                      <td className="p-4 font-medium text-slate-800">
                        {q.customerName}
                      </td>
                      <td className="p-4 text-slate-700">
                        <div className="font-bold text-slate-900">
                          {itemsList.length} {itemsList.length === 1 ? 'item' : 'itens'}
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-xs">
                          {itemsList.map(i => i.serviceName).join(', ')}
                        </div>
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-900 text-base">
                        {formatCurrency(q.totalAmount)}
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            q.status === 'APROVADO'
                              ? 'bg-emerald-100 text-emerald-800'
                              : q.status === 'REJEITADO'
                              ? 'bg-rose-100 text-rose-800'
                              : q.status === 'EXPIRADO'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {q.status === 'EM_REVISAO' ? 'EM REVISÃO' : q.status}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEditQuotation(q)}
                            title={q.status === 'APROVADO' ? 'Revisar orçamento aprovado' : 'Editar Orçamento'}
                            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                          >
                            <Edit3 className="w-4 h-4" />
                            {q.status === 'APROVADO' && <span className="text-xs ml-1">Revisar</span>}
                          </button>
                          {(q.status === 'APROVADO' || (q.commercialVersion ?? 1) > 1) && <button title="Versões aprovadas" className="p-1.5 text-slate-600" onClick={async () => {
                            try { const versions = await quotationApi.history(q.id); setApprovedVersions(versions.length ? versions : q.status === 'APROVADO' ? [q] : []); }
                            catch (error) { alert((error as Error).message); }
                          }}><History className="w-4 h-4" /></button>}
                          <button title="Orçamento do cliente" onClick={() => setPrintQuotation(q)} className="p-1.5 text-slate-600 hover:text-indigo-600"><Printer className="w-4 h-4" /></button>
                          <button
                            onClick={() => setWhatsappModalQuote(q)}
                            title="Enviar orçamento"
                            className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          {!q.workOrderId&&!['APROVADO','EM_REVISAO','REJEITADO','EXPIRADO','CANCELADO'].includes(q.status)&&<button title="Marcar orçamento não aprovado" aria-label={`Não aprovado · ${q.number}`} className="p-1.5 text-slate-500 hover:text-rose-700 rounded-lg" onClick={()=>{setRejecting(q);setRejectReason('');setRejectError('');}}><X size={16}/></button>}
                          {!['APROVADO', 'REJEITADO', 'EXPIRADO', 'CANCELADO'].includes(q.status) && (
                            <button
                              onClick={() => { setApprovalAmountPaid(0); setApprovalModalQuote(q); }}
                              title={q.status === 'EM_REVISAO' ? 'Aprovar revisão e atualizar OS' : 'Aprovar Orçamento e Gerar OS'}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition flex items-center gap-1"
                            >
                              <FileCheck className="w-3.5 h-3.5" />
                              {q.status === 'EM_REVISAO' ? 'Aprovar revisão' : 'Aprovar'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rejecting&&<LayeredDialog title="Orçamento não aprovado" subtitle={rejecting.number} icon={FileText} compact onClose={()=>{if(!rejectBusy)setRejecting(null);}}><form className="p-5 space-y-4" onSubmit={async e=>{e.preventDefault();setRejectBusy(true);setRejectError('');try{await onRejectQuotation(rejecting,rejectReason);setRejecting(null);}catch(error){setRejectError((error as Error).message);}finally{setRejectBusy(false);}}}><p className="text-sm text-slate-600">O orçamento e os serviços de terceiros continuarão no histórico como não aprovados.</p><label className="block text-sm">Motivo<textarea aria-label="Motivo da não aprovação" maxLength={2000} value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="Ex.: cliente recusou ou não retornou." className="block w-full border border-slate-200 rounded-xl p-3 mt-1"/></label>{rejectError&&<p role="alert" className="text-sm text-rose-700">{rejectError}</p>}<div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={rejectBusy} className="nagano-button secondary" onClick={()=>setRejecting(null)}>Voltar</button><button disabled={rejectBusy} className="nagano-button primary">{rejectBusy?'Salvando…':'Registrar não aprovação'}</button></div></form></LayeredDialog>}
      {printQuotation && <PrintableQuotation quotation={printQuotation} items={quotationCustomerItems(printQuotation)} company={company} paymentOptions={budgetSettings.paymentTermsOptions} onClose={() => setPrintQuotation(null)} />}
      {revisionQuote && <div className="nagano-overlay fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4"><form className="bg-white rounded-xl p-6 max-w-lg w-full space-y-4" onSubmit={async e => {
        e.preventDefault(); if (revisionBusy) return; setRevisionBusy(true); setRevisionError('');
        try { const draft = await onReopenQuotation(revisionQuote, revisionReason); setRevisionQuote(null); handleEditQuotation(draft); }
        catch (error) { setRevisionError((error as Error).message); } finally { setRevisionBusy(false); }
      }}>
        <h3 className="text-lg font-bold">Revisar orçamento {revisionQuote.number}</h3>
        <p>O valor aprovado de {formatCurrency(revisionQuote.totalAmount)} ficará no histórico. A OS vinculada será pausada até a nova aprovação.</p>
        <label className="block text-sm font-semibold">Motivo da alteração<textarea required minLength={3} className="block w-full border rounded p-2 mt-1" value={revisionReason} onChange={e => setRevisionReason(e.target.value)} placeholder="Ex.: cliente solicitou incluir cartões de visita" /></label>
        {revisionError && <p role="alert" className="text-red-700">{revisionError}</p>}
        <div className="flex justify-end gap-3"><button type="button" disabled={revisionBusy} onClick={() => setRevisionQuote(null)}>Cancelar</button><button disabled={revisionBusy} className="bg-indigo-600 text-white px-4 py-2 rounded">{revisionBusy ? 'Reabrindo…' : 'Reabrir para alteração'}</button></div>
      </form></div>}
      {approvedVersions && <div className="nagano-overlay fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-xl p-6 max-w-lg w-full space-y-4 max-h-[85vh] overflow-auto">
        <h3 className="font-bold text-lg">Versões aprovadas</h3>
        {approvedVersions.map(version => <div className="border-b pb-3" key={version.commercialVersion ?? 1}><p>{version.number} · Revisão {version.commercialVersion ?? 1} · {formatCurrency(version.totalAmount)}</p><p className="text-sm text-slate-500">{version.revisionReason}</p><button className="text-indigo-700 underline" onClick={() => { setPrintQuotation(version); setApprovedVersions(null); }}>Ver orçamento desta versão</button></div>)}
        {!approvedVersions.length && <p>Nenhuma versão aprovada registrada.</p>}
        <button onClick={() => setApprovedVersions(null)}>Fechar histórico</button>
      </div></div>}
      {/* MAIN QUOTATION EDITOR MODAL */}
      {isMainModalOpen && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div role="dialog" aria-modal="true" aria-labelledby="quotation-dialog-title" className="quotation-dialog bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <DialogHeader title={editingQuotationId ? 'Editar orçamento' : 'Novo orçamento'} subtitle="Escolha o cliente, adicione os serviços e organize sua proposta." icon={Calculator} titleId="quotation-dialog-title" closeLabel="Fechar orçamento" onClose={() => setIsMainModalOpen(false)} />

            {/* Modal Body */}
            <div className="nagano-dialog-body p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
              {quotations.find(q => q.id === editingQuotationId)?.status === 'EM_REVISAO' && <p className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm">Orçamento em revisão. A OS está pausada. Após salvar, confira a mensagem e reenvie ao cliente; registre a nova aprovação para atualizar a produção.</p>}
              {/* Customer Selector */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Cliente do Orçamento
                </label>
                <select
                  value={selectedCustomerId}
                  disabled={quotations.find(q => q.id === editingQuotationId)?.status === 'EM_REVISAO'}
                  onChange={e => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone || c.email || 'Sem contato'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Items Table Section */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div className="quotation-items-heading flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <PackageCheck className="w-5 h-5 text-indigo-600" />
                      Itens do Orçamento ({quoteItems.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Serviços e mídias incluídos neste orçamento.
                    </p>
                  </div>
                  <QuotationCalculator/><button type="button" className="nagano-button secondary" onClick={() => setSimulator({})}><Calculator size={16} /> Simular quantidades</button>
                </div>

                {quoteItems.length === 0 ? (
                  <div className="quotation-empty-state p-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    <p className="text-sm font-medium text-slate-600">
                      Nenhum item adicionado ao orçamento ainda.
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenNewItemModal}
                      className="nagano-button secondary mt-4"
                    >
                      <Plus size={16} /> Adicionar primeiro item
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 uppercase font-bold text-slate-600">
                          <th className="p-3 w-8 text-center">#</th>
                          <th className="p-3">Serviço / Descrição</th>
                          <th className="p-3">Material</th>
                          <th className="p-3 text-center">Medida / Qtd</th>
                          <th className="p-3 text-center">Bobina / chapa</th>
                          <th className="p-3 text-right">Subtotal</th>
                          <th className="p-3 text-center w-36">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {quoteItems.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50/80">
                            <td className="p-3 text-center font-bold text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="p-3 text-slate-900 font-bold">
                              <div>{item.serviceName}</div>
                              {item.graphicSnapshot?.specification&&<SpecificationDetails value={item.graphicSnapshot.specification}/>}
                              {item.description && (
                                <div className="text-xxs text-slate-500 font-normal">
                                  {item.futuraImportId ? <SpecificationDetails value={item.description}/> : item.description}
                                </div>
                              )}
                              {item.finishings && item.finishings.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {item.finishings.map(f => (
                                    <span key={f.id} className="bg-slate-100 text-slate-700 text-xxs px-1.5 py-0.5 rounded">
                                      {f.finishingName} ({formatCurrency(f.subtotal)})
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-slate-700">
                              {item.materialName || 'N/A'}
                            </td>
                            <td className="p-3 text-center font-mono">
                              {item.simulationSnapshot ? (
                                <div><div className="font-bold text-slate-900">Arte: {item.widthCm} × {item.heightCm} cm</div><div className="text-xs text-slate-600">{item.quantity} un.</div></div>
                              ) : (item.serviceGroup ? item.serviceGroup==='GRAPHIC_PRODUCTS' : item.isGraphicSnapshot || item.calculationType === 'UNIT' || item.isGraphic) ? (
                                <div>
                                  <div className="font-bold text-indigo-900">Serviço Gráfico</div>
                                  <div className="text-xs font-semibold text-slate-700">{item.quantity} un.</div>
                                </div>
                              ) : (
                                <div>
                                  <div className="font-bold text-slate-900">Arte: {item.widthCm} x {item.heightCm} cm</div>
                                  {item.productionWidthCm ? (
                                    <div className="text-xxs font-sans text-indigo-700 font-bold">
                                      Prod: {item.productionWidthCm} x {item.productionHeightCm} cm
                                    </div>
                                  ) : null}
                                  <div className="text-xxs font-sans text-slate-500">
                                    {formatOverflowSidesText(item.allowances || item)}
                                  </div>
                                  <div className="text-slate-500 text-xxs font-sans mt-0.5">
                                    {item.quantity} un.
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {item.simulationSnapshot ? (
                                <span className="inline-block px-2 py-0.5 rounded text-xxs font-semibold bg-emerald-50 text-emerald-800">{item.simulationSnapshot.mode === 'ROLL' ? `Bobina ${item.simulationSnapshot.config.areaWidthCm} cm` : `${item.simulationSnapshot.blocks} folhas/chapas`}<br />{item.simulationSnapshot.layout.capacity} peças por área</span>
                              ) : item.sheetSnapshot ? (<span className="inline-block px-2 py-1 rounded text-xxs bg-emerald-50 text-emerald-800">{item.sheetSnapshot.sheetsNeeded} chapas · {item.sheetSnapshot.widthCm} × {item.sheetSnapshot.heightCm} cm<br/>{item.sheetSnapshot.capacity} peças por chapa</span>) : (item.serviceGroup ? item.serviceGroup==='GRAPHIC_PRODUCTS' : item.isGraphicSnapshot || item.calculationType === 'UNIT' || item.isGraphic) ? (
                                <span className="inline-block px-2 py-0.5 rounded text-xxs font-semibold bg-slate-100 text-slate-600">
                                  N/A (Gráfico)
                                </span>
                              ) : item.calculationSnapshot ? (
                                <span className={`inline-block px-2 py-0.5 rounded text-xxs font-bold ${
                                  item.isRollSelectionManual ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {item.calculationSnapshot.billableWidthCm || item.calculationSnapshot.recommendedRollWidthCm}cm ({item.calculationSnapshot.orientation === 'HORIZONTAL' ? 'Horiz' : 'Vert'})
                                  {item.isRollSelectionManual && ' *Manual'}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xxs">N/A (Fixo)</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-indigo-900">
                              {item.discountEffectiveAmount && item.discountEffectiveAmount > 0 ? (
                                <div>
                                  <div className="line-through text-slate-400 text-xxs font-normal">
                                    {formatCurrency(item.subtotalBeforeDiscount || (item.subtotal + item.discountEffectiveAmount))}
                                  </div>
                                  <div className="text-emerald-700 font-bold">
                                    {formatCurrency(item.subtotal)}
                                  </div>
                                  <div className="text-xxs font-sans text-emerald-600 font-semibold">
                                    (-{item.discountType === 'PERCENTAGE' ? `${item.discountInputValue}%` : formatCurrency(item.discountEffectiveAmount)})
                                  </div>
                                </div>
                              ) : (
                                formatCurrency(item.subtotal)
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                <button type="button" title="Adicionar acabamento" className="nagano-button secondary" onClick={()=>setStockFinishingItem(item)}>Acabamentos</button>
                                <button
                                  type="button"
                                  onClick={() => setViewCalculationItem(item)}
                                  title="Ver Memória de Cálculo"
                                  className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateItem(item)}
                                  title="Duplicar Item"
                                  className="p-1 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                                >
                                  <Copy className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEditItemInQuote(item)}
                                  title="Editar Item"
                                  className="p-1 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(item.id)}
                                  title="Excluir Item"
                                  className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <div className="flex flex-col">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => handleMoveItem(idx, 'UP')}
                                    className="p-0.5 text-slate-400 hover:text-slate-800 disabled:opacity-20"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === quoteItems.length - 1}
                                    onClick={() => handleMoveItem(idx, 'DOWN')}
                                    className="p-0.5 text-slate-400 hover:text-slate-800 disabled:opacity-20"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" className="nagano-button secondary" onClick={handleOpenNewItemModal}><Plus size={16} /> Adicionar outro item</button>
                  </div>
                )}
              </div>

              <CompositionPreview items={quoteItems}/>
            <OutsourcedQuoteFields rows={outsourcedServices} onChange={setOutsourcedServices}/>
              {/* Global Fees & Terms Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Global Fees */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold uppercase text-slate-700 border-b pb-2">
                    Custos adicionais
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">Criação de Arte (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={designCost}
                        onChange={e => setDesignCost(Number(e.target.value))}
                        className="w-full px-3 py-1.5 border rounded border-slate-300 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">Taxa de Entrega (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={deliveryCost}
                        onChange={e => setDeliveryCost(Number(e.target.value))}
                        className="w-full px-3 py-1.5 border rounded border-slate-300 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-600 font-medium mb-1">Acréscimos / Extras (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={extraCharges}
                        onChange={e => setExtraCharges(Number(e.target.value))}
                        className="w-full px-3 py-1.5 border rounded border-slate-300 font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-slate-600 font-medium mb-1">Desconto Concedido (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={discountAmount}
                        onChange={e => setDiscountAmount(Number(e.target.value))}
                        className="w-full px-3 py-1.5 border border-rose-300 rounded font-mono text-rose-800 font-bold"
                      />
                    </div>
                  </div>
                </div>

                {/* Terms and Deadlines */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold uppercase text-slate-700 border-b pb-2">
                    Condições e prazos
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">Condições de Pagamento</label>
                      <input
                        type="text"
                        value={paymentTerms}
                        list="quotation-payment-options"
                        onChange={e => setPaymentTerms(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded"
                      />
                      <datalist id="quotation-payment-options">{budgetSettings.paymentTermsOptions.map((option, index) => <option key={index} value={option} />)}</datalist>
                    </div>
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">Prazo de Produção (Dias Úteis)</label>
                      <input
                        type="number"
                        min="1"
                        value={maxDeadlineDays}
                        onChange={e => setMaxDeadlineDays(Number(e.target.value))}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-medium mb-1">Observações para o Cliente</label>
                      <textarea
                        rows={2}
                        value={customerNotes}
                        onChange={e => setCustomerNotes(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Quotation Financial Summary Bar */}
              <div className="quotation-total-panel bg-slate-900 text-white p-4 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="space-y-1 text-center sm:text-left">
                  <span className="text-xs text-slate-400 block uppercase font-bold tracking-wider">
                    Resumo do Orçamento
                  </span>
                  <div className="text-xs text-slate-300 flex flex-wrap gap-x-4 gap-y-1 font-mono">
                    <span>Itens Bruto: <strong>{formatCurrency(quotationTotals.itemsSubtotalBeforeDiscount)}</strong></span>
                    {quotationTotals.itemsTotalDiscounts > 0 && (
                      <span className="text-emerald-400">Desc. Itens: <strong>-{formatCurrency(quotationTotals.itemsTotalDiscounts)}</strong></span>
                    )}
                    <span>Subtotal Líquido Itens: <strong>{formatCurrency(quotationTotals.subtotal)}</strong></span>
                    <span>+ Adicionais: <strong>{formatCurrency(deliveryCost + designCost + installationCost + extraCharges)}</strong></span>
                    {discountAmount > 0 && (
                      <span className="text-rose-300">- Desc. Global: <strong>{formatCurrency(discountAmount)}</strong></span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xxs uppercase text-indigo-300 font-bold block">Total Geral</span>
                  <span className="text-3xl font-mono font-black text-emerald-400">
                    {formatCurrency(quotationTotals.totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="nagano-dialog-footer p-4 bg-white border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsMainModalOpen(false)}
                className="px-5 py-2.5 text-slate-700 font-bold text-sm hover:bg-slate-100 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingQuotation}
                onClick={handleSaveFinalQuotation}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-lg transition shadow-sm flex items-center gap-2"
              >
                <Check className="w-5 h-5" />
                {quotations.find(q => q.id === editingQuotationId)?.status === 'EM_REVISAO' ? 'Salvar revisão e preparar mensagem' : 'Salvar orçamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ITEM EDITOR MODAL (For Adding/Editing a single QuotationItem) */}
      {isItemEditorOpen && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Item Editor Header */}
            <DialogHeader title={editingItemId ? 'Editar item' : 'Adicionar item ao orçamento'} subtitle="Defina o serviço, as medidas, o material e os acabamentos." icon={Tag} closeLabel="Fechar item" onClose={() => setIsItemEditorOpen(false)} />

            {/* Item Editor Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50">
              <label className="block text-sm font-semibold">Classificação do serviço<select className="block w-full border rounded-lg p-2 mt-1" value="VISUAL_COMMUNICATION" onChange={() => { setIsItemEditorOpen(false); setGraphicEditor({ item: editingItemId ? { id: editingItemId, position: quoteItems.find(i => i.id === editingItemId)?.position ?? 1 } as QuotationItem : undefined }); }}><option value="VISUAL_COMMUNICATION">Comunicação Visual</option><option value="GRAPHIC_PRODUCTS">Gráfica</option></select></label>
              {/* Service & Material Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Serviço de Comunicação Visual
                  </label>
                  <select aria-label="Serviço do item"
                    value={itemServiceId}
                    onChange={e => chooseService(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium"
                  >
                    {services.filter(s => (s.active && s.serviceGroup !== 'GRAPHIC_PRODUCTS') || (!!editingItemId && s.id === itemServiceId)).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Material / Substrato
                  </label>
                  <select aria-label="Material do item"
                    value={itemMaterialId}
                    onChange={e => openVisualItem({...currentItemDraft(),materialId:e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium"
                  >
                    {materials.filter(m => !m.futuraImportId && (m.active || m.id === itemMaterialId) && (!activeService?.allowedMaterialIds?.length||activeService.allowedMaterialIds.includes(m.id))).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Descrição Complementar do Item (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Lona 440g com acabamento especial para fachada"
                    value={itemDescription}
                    onChange={e => setItemDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3"><label className="block text-xs font-semibold text-slate-600 flex-1">Observações do item<input className="block w-full border border-slate-300 rounded-lg p-2 mt-1" value={itemNotes} onChange={e=>setItemNotes(e.target.value)}/></label><button type="button" className="text-sm text-indigo-700 underline" onClick={()=>{setIsItemEditorOpen(false);setFuturaEditor({item:editingItemId?{id:editingItemId,position:quoteItems.find(i=>i.id===editingItemId)?.position??1} as QuotationItem:undefined});}}>Selecionar produto pronto da Futura</button></div>
              {/* Dynamic Section 1: Graphic (Unit) vs Non-Graphic (Roll) */}
              {!isRollService ? (
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h4 className="text-xs font-bold uppercase text-indigo-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      1. Quantidade e Precificação do Serviço Gráfico
                    </h4>
                    <span className="text-xxs px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 font-bold uppercase tracking-wider">
                      Modalidade: Unidade / Quantidade
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Quantidade Solicitada (Unidades)
                      </label>
                      <input
                        type="number"
                        min="1"
                        aria-label="Quantidade do item" value={itemQuantity}
                        onChange={e => setItemQuantity(Math.max(1, Number(e.target.value)))}
                        className="w-full px-3 py-2 border-2 border-indigo-400 rounded-lg font-mono font-bold text-lg text-indigo-950 focus:border-indigo-600 shadow-2xs"
                      />
                    </div>

                    <div className="col-span-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs font-mono space-y-1">
                      <div className="text-slate-500 text-xxs font-sans font-bold uppercase">Parâmetros Cadastrados do Serviço:</div>
                      <div>
                        Referência: <strong>{activeService?.referenceQuantity || 1000} un.</strong> por <strong>{formatCurrency(activeService?.referencePrice || 0)}</strong>
                      </div>
                      <div>
                        Preço Unitário Base: <strong className="text-indigo-700">R$ {((activeService?.referencePrice || 0) / (activeService?.referenceQuantity || 1)).toFixed(4)}</strong> / un.
                      </div>
                      <div className="pt-1 text-slate-800 font-bold border-t border-slate-200">
                        Subtotal Mídia ({itemQuantity} un.): <span className="text-emerald-700 font-extrabold">{formatCurrency(activeItemComputed.baseValue)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Quantity Discount Tiers list if service has them */}
                  {activeService?.quantityDiscountTiers && activeService.quantityDiscountTiers.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <span className="text-xxs font-bold text-slate-600 uppercase block">
                        Faixas de Desconto por Quantidade
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {activeService.quantityDiscountTiers.map(tier => {
                          const isTierActive = itemQuantity >= tier.minimumQuantity;
                          return (
                            <div
                              key={tier.id}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition flex items-center gap-1.5 ${
                                isTierActive
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold shadow-2xs'
                                  : 'bg-slate-50 border-slate-200 text-slate-500'
                              }`}
                            >
                              <span>A partir de {tier.minimumQuantity} un.:</span>
                              <span className="text-emerald-700 font-bold">{tier.discountPercentage}% desc.</span>
                              {isTierActive && (
                                <span className="text-xxs bg-emerald-600 text-white px-1.5 py-0.2 rounded font-sans font-bold">
                                  Ativo
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Dimensions & Quantities for Roll Service */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                    <h4 className="text-xs font-bold uppercase text-slate-700 border-b pb-2">
                      1. Dimensões da Arte e Quantidade
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Largura Arte (cm)</label>
                        <input
                          type="number"
                          min="1"
                          aria-label="Largura da arte (cm)" value={itemWidthCm}
                          onChange={e => setItemWidthCm(Number(e.target.value))}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Altura Arte (cm)</label>
                        <input
                          type="number"
                          min="1"
                          aria-label="Altura da arte (cm)" value={itemHeightCm}
                          onChange={e => setItemHeightCm(Number(e.target.value))}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Quantidade</label>
                        <input
                          type="number"
                          min="1"
                          aria-label="Quantidade do item" value={itemQuantity}
                          onChange={e => setItemQuantity(Number(e.target.value))}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono font-bold text-indigo-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Orientação</label>
                        <select
                          value={itemOrientation}
                          onChange={e => setItemOrientation(e.target.value as any)}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-bold"
                        >
                          <option value="AUTO">Automática (Auto-Fit)</option>
                          <option value="HORIZONTAL">Horizontal</option>
                          <option value="VERTICAL" disabled={!materialRules?.allowRotation}>Girada</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Production Allowances & Per-Side Overflow */}
                  <OverflowSideSelector
                    overflowValueCm={itemOverflowValueCm}
                    overflowTop={itemOverflowTop}
                    overflowBottom={itemOverflowBottom}
                    overflowLeft={itemOverflowLeft}
                    overflowRight={itemOverflowRight}
                    onChangeValue={setItemOverflowValueCm}
                    onChangeTop={setItemOverflowTop}
                    onChangeBottom={setItemOverflowBottom}
                    onChangeLeft={setItemOverflowLeft}
                    onChangeRight={setItemOverflowRight}
                    widthCm={itemWidthCm}
                    heightCm={itemHeightCm}
                  />

                  {/* Dynamic Roll Selector */}
                  <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-200 space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-xs font-bold uppercase text-indigo-900 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-indigo-600" />
                          Otimização de Bobina & Aproveitamento
                        </h4>
                        <p className="text-xxs text-indigo-700">
                          Comparação das bobinas pela largura real e pelo menor valor por peça, antes do desconto.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={!materialRules?.allowManualRollOverride}
                        title={!materialRules?.allowManualRollOverride ? "Troca manual bloqueada no cadastro do material" : "Selecionar bobina"}
                        onClick={() => setIsRollSelectorModalOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded transition flex items-center gap-1 shadow-2xs"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        Alterar Bobina Manualmente
                      </button>
                    </div>

                    {activeItemCalcResult?.success&&activeItemCalcResult.recommended&&<div className="bg-white border border-indigo-200 rounded-lg p-3 text-xs space-y-1" aria-label="Fórmula do valor da bobina">
                      <p className="text-indigo-700 mb-1">Preço do serviço: <strong>{activeService?.name}</strong> · {formatCurrency(rollPricing.data?.item.servicePriceSnapshot??0)} / {activeService?.pricingMethod==='PER_LINM'?'m linear':'m²'}</p><p className="font-bold text-indigo-900">{activeService?.pricingMethod==='PER_LINM'?'Comprimento de produção × valor por metro linear × quantidade':'Boca da bobina × comprimento com estouro × valor do m² × quantidade'}</p>
                      <p className="font-mono text-sm text-slate-900">{activeService?.pricingMethod!=='PER_LINM'&&`${((activeItemCalcResult.recommended.billableWidthCm??activeItemCalcResult.recommended.recommendedRollWidthCm)/100).toLocaleString('pt-BR',{maximumFractionDigits:4})} m × `}{(activeItemCalcResult.recommended.linearMetersNeeded/itemQuantity).toLocaleString('pt-BR',{maximumFractionDigits:4})} m × {formatCurrency(rollPricing.data?.item.servicePriceSnapshot??0)} × {itemQuantity.toLocaleString('pt-BR')} = <strong>{formatCurrency(activeItemCalcResult.recommended.grossTotalPrice??0)}</strong></p>
                      <p className="text-slate-500">Impressão antes de acabamentos, preparação, cobrança mínima e descontos. O estouro dos lados marcados entra nas medidas antes de comparar as bobinas.</p>
                    </div>}
                    {activeItemCalcResult && activeItemCalcResult.success && activeItemCalcResult.recommended ? (
                      <div className="bg-white p-4 rounded-lg border border-indigo-100 flex flex-col md:flex-row gap-4 items-center">
                        <div className="w-full md:w-1/2 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">Bobina Selecionada:</span>
                            <span className="font-mono font-bold text-slate-900 text-sm">
                              {activeItemCalcResult.recommended.billableWidthCm || activeItemCalcResult.recommended.recommendedRollWidthCm} cm
                              ({activeItemCalcResult.recommended.orientation})
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">Aproveitamento / Peças na Boca:</span>
                            <span className="font-bold text-slate-800">
                              {activeItemCalcResult.recommended.unitsAcross} un. na largura ({activeItemCalcResult.recommended.rowsNeeded} fila(s))
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">Comprimento Percorrido:</span>
                            <span className="font-mono font-bold text-slate-800">
                              {activeItemCalcResult.recommended.linearMetersNeeded.toFixed(2)}m
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600">Desperdício Estimado:</span>
                            <span className="font-mono font-bold text-rose-600">
                              {activeItemCalcResult.recommended.wastePercentage.toFixed(1)}% ({activeItemCalcResult.recommended.wasteSqm.toFixed(2)} m²)
                            </span>
                          </div>
                          {activeItemCalcResult.recommended.totalCalculatedAreaM2 && (
                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              <span className="text-slate-600">Área Consumida da Bobina:</span>
                              <span className="font-mono font-bold text-indigo-700">
                                {activeItemCalcResult.recommended.totalCalculatedAreaM2.toFixed(2)} m²
                                {itemQuantity > 1 && ` (${(activeItemCalcResult.recommended.totalCalculatedAreaM2 / itemQuantity).toFixed(2)} m²/un)`}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* SVG Roll Diagram */}
                        <div className="w-full md:w-1/2 flex justify-center">
                          <RollDiagramSVG
                            snapshot={activeItemCalcResult.recommended}
                            finishedWidthCm={itemWidthCm}
                            finishedHeightCm={itemHeightCm}
                            quantity={itemQuantity}
                            materialName={activeMaterial?.name}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs font-medium">
                        {rollPricing.pending ? 'Calculando as opções de bobina…' : rollPricing.error || 'Informe as medidas e o material para calcular.'}
                      </div>
                    )}
                  </div>
                </>
              )}

              <details className="text-sm text-slate-500"><summary className="cursor-pointer">Acabamentos cadastrados</summary>
              {/* Item Finishings Selector */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase text-slate-700 border-b pb-2">
                  Acabamentos do Item
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {finishes.filter(fin=>fin.active||itemSelectedFinishings.some(f=>f.finishingId===fin.id)).map(fin => {
                    const isSelected = itemSelectedFinishings.some(f => f.finishingId === fin.id);
                    const selectedItem = itemSelectedFinishings.find(f => f.finishingId === fin.id);
                    return (
                      <div
                        key={fin.id}
                        className={`p-3 rounded-lg border text-xs transition flex flex-col justify-between ${
                          isSelected ? 'bg-indigo-50 border-indigo-400' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={e => {
                                if (e.target.checked) {
                                  setItemSelectedFinishings(prev => [...prev, { finishingId: fin.id, quantity: 1 }]);
                                } else {
                                  setItemSelectedFinishings(prev => prev.filter(f => f.finishingId !== fin.id));
                                }
                              }}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                            />
                            {fin.name}
                          </label>
                          <span className="font-mono text-slate-600">
                            {formatCurrency(fin.unitPrice || fin.unitCost || 0)}/{fin.costType === 'PER_METER' ? 'm' : fin.costType === 'PER_SQM' ? 'm²' : 'un'}
                          </span>
                        </div>
                        {isSelected && (
                          <div className="mt-2 pt-2 border-t border-indigo-200 flex items-center justify-between">
                            <span className="text-xxs text-indigo-800">Quantidade / Multiplicador:</span>
                            <input
                              type="number"
                              min="1"
                              value={selectedItem?.quantity || 1}
                              onChange={e => {
                                const val = Number(e.target.value);
                                setItemSelectedFinishings(prev =>
                                  prev.map(f => f.finishingId === fin.id ? { ...f, quantity: val } : f)
                                );
                              }}
                              className="w-16 px-2 py-0.5 border border-indigo-300 rounded font-mono font-bold bg-white text-right"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              </details>
              {/* Item Individual Discount Section */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex justify-between items-center border-b pb-2">
                  <h4 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-emerald-600" />
                    Desconto Individual do Item
                  </h4>
                  {itemDiscountType !== 'NONE' && (
                    <button
                      type="button"
                      onClick={() => {
                        setItemDiscountType('NONE');
                        setItemDiscountInputValue(0);
                      }}
                      className="text-xxs font-bold text-rose-600 hover:text-rose-800 underline flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remover desconto
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Tipo de Desconto</label>
                    <div className="flex rounded-lg p-1 bg-slate-100 border border-slate-200 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setItemDiscountType('NONE');
                          setItemDiscountInputValue(0);
                        }}
                        className={`flex-1 py-1.5 rounded-md transition ${
                          itemDiscountType === 'NONE'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Sem Desconto
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (itemDiscountType !== 'PERCENTAGE') {
                            setItemDiscountType('PERCENTAGE');
                            setItemDiscountInputValue(0);
                          }
                        }}
                        className={`flex-1 py-1.5 rounded-md transition ${
                          itemDiscountType === 'PERCENTAGE'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        % Porcentagem
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (itemDiscountType !== 'FIXED_AMOUNT') {
                            setItemDiscountType('FIXED_AMOUNT');
                            setItemDiscountInputValue(0);
                          }
                        }}
                        className={`flex-1 py-1.5 rounded-md transition ${
                          itemDiscountType === 'FIXED_AMOUNT'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        R$ Valor Fixo
                      </button>
                    </div>
                  </div>

                  {itemDiscountType !== 'NONE' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        {itemDiscountType === 'PERCENTAGE' ? 'Percentual de Desconto (%)' : 'Valor do Desconto (R$)'}
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max={itemDiscountType === 'PERCENTAGE' ? 100 : activeItemComputed.subtotalBeforeDiscount}
                          step={itemDiscountType === 'PERCENTAGE' ? '0.1' : '1'}
                          value={itemDiscountInputValue || ''}
                          onChange={e => setItemDiscountInputValue(Number(e.target.value))}
                          placeholder={itemDiscountType === 'PERCENTAGE' ? 'Ex: 10' : 'Ex: 50.00'}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">
                          {itemDiscountType === 'PERCENTAGE' ? '%' : 'R$'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {isRollService && (activeItemCalcResult?.recommended?.discountValue ?? 0) > 0 && (
                  <p className="p-3 bg-emerald-50 rounded text-emerald-900">
                    Desconto por metragem: {activeItemCalcResult?.recommended?.discountPercentage}% sobre {activeItemCalcResult?.recommended?.totalCalculatedAreaM2?.toFixed(2)} m² — {formatCurrency(activeItemCalcResult?.recommended?.discountValue ?? 0)}
                  </p>
                )}
                {/* Discount Summary Preview / Warnings */}
                {itemDiscountType !== 'NONE' && activeItemComputed.isDiscountValid && (
                  <div className="mt-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-emerald-800 font-medium">Subtotal antes do desconto: </span>
                      <span className="font-mono font-bold text-slate-800">{formatCurrency(activeItemComputed.subtotalBeforeDiscount)}</span>
                    </div>
                    <div>
                      <span className="text-emerald-800 font-medium">Economia / Desconto: </span>
                      <span className="font-mono font-bold text-emerald-700">-{formatCurrency(activeItemComputed.discountEffectiveAmount)}</span>
                    </div>
                    <div>
                      <span className="text-emerald-800 font-medium">Subtotal Líquido: </span>
                      <span className="font-mono font-black text-emerald-900 text-sm">{isRollService && !rollPricing.data ? (rollPricing.pending ? 'Calculando…' : 'Cálculo indisponível') : formatCurrency(activeItemComputed.subtotal)}</span>
                    </div>
                  </div>
                )}

                {!activeItemComputed.isDiscountValid && !rollPricing.pending && (
                  <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    {activeItemComputed.discountErrorMessage || 'Desconto informado é inválido.'}
                  </div>
                )}
              </div>

              {/* Item Subtotal Preview Bar */}
              <div className="bg-indigo-900 text-white p-4 rounded-xl flex justify-between items-center font-mono">
                <div>
                  <span className="text-xxs uppercase text-indigo-300 block font-sans font-bold">
                    Subtotal Final do Item
                  </span>
                  <span className="text-xs text-indigo-200 font-sans">
                    Base: {formatCurrency(activeItemComputed.baseValue)} + Acabamentos: {formatCurrency(activeItemComputed.finishingTotal)}
                    {activeItemComputed.discountEffectiveAmount > 0 && (
                      <span className="text-emerald-300 font-bold ml-1">
                        - Desconto: {formatCurrency(activeItemComputed.discountEffectiveAmount)}
                      </span>
                    )}
                  </span>
                </div>
                <div className="text-2xl font-black text-emerald-400">
                  {isRollService && !rollPricing.data ? (rollPricing.pending ? 'Calculando…' : 'Cálculo indisponível') : formatCurrency(activeItemComputed.subtotal)}
                </div>
              </div>
            </div>

            {/* Item Editor Footer */}
            <div className="p-4 bg-white border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsItemEditorOpen(false)}
                className="px-4 py-2 text-slate-700 font-bold text-sm hover:bg-slate-100 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isRollService && !rollPricing.data}
                onClick={handleSaveItemToQuote}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-lg transition flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Confirmar e Adicionar Item
              </button>
            </div>
          </div>
        </div>
      )}

      {stockFinishingItem&&<StockFinishingEditor item={stockFinishingItem} onClose={()=>setStockFinishingItem(null)} onSave={priced=>{setQuoteItems(old=>old.map(i=>i.id===priced.id?priced:i));setStockFinishingItem(null);}}/>}
      {visualEditor && <VisualQuotationItemEditor onRoll={openVisualItem} services={services} materials={materials} finishes={finishes} item={visualEditor.item} onClose={()=>setVisualEditor(null)} onGraphic={()=>{setGraphicEditor({item:visualEditor.item});setVisualEditor(null);}} onImported={()=>{setFuturaEditor({item:visualEditor.item});setVisualEditor(null);}} onSave={item=>{
        setQuoteItems(previous=>previous.some(i=>i.id===item.id)?previous.map(i=>i.id===item.id?{...item,position:i.position}:i):[...previous,{...item,position:previous.length+1}]);setVisualEditor(null);
      }}/>} 
      {futuraEditor && <FuturaVisualItemEditor item={futuraEditor.item} onClose={() => setFuturaEditor(null)} onSave={item => {
        setQuoteItems(previous => previous.some(i => i.id === item.id) ? previous.map(i => i.id === item.id ? { ...item, position: i.position } : i) : [...previous, { ...item, position: previous.length + 1 }]);
        setFuturaEditor(null);
      }} />}
      {graphicEditor && <GraphicProductEditor item={graphicEditor.item} onClose={() => setGraphicEditor(null)} onVisual={() => {
        const original = graphicEditor.item;
        setGraphicEditor(null); openVisualItem(original);
        if (original?.id) setEditingItemId(original.id);
      }} onSave={item => {
        setQuoteItems(previous => previous.some(i => i.id === item.id) ? previous.map(i => i.id === item.id ? { ...item, position: i.position } : i) : [...previous, { ...item, position: previous.length + 1 }]);
        setGraphicEditor(null);
      }} />}

      {/* CALCULATION BREAKDOWN MODAL ("Ver Cálculo" modal) */}
      {viewCalculationItem && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-base font-bold flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-indigo-400" />
                Memória Detalhada de Cálculo - {viewCalculationItem.serviceName}
              </h3>
              <button
                onClick={() => setViewCalculationItem(null)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {!viewCalculationItem.graphicSnapshot && !viewCalculationItem.simulationSnapshot && <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1 font-mono">
                <p><strong>Medidas da Arte:</strong> {viewCalculationItem.widthCm} x {viewCalculationItem.heightCm} cm (Qtd: {viewCalculationItem.quantity})</p>
                <p><strong>Preço Congelado do Serviço:</strong> {formatCurrency(viewCalculationItem.servicePriceSnapshot)}/m²</p>
                {viewCalculationItem.materialName && <p><strong>Material / Bobina:</strong> {viewCalculationItem.materialName}</p>}
              </div>}

              {viewCalculationItem.simulationSnapshot ? <SimulationPricingDetails item={viewCalculationItem} /> : viewCalculationItem.sheetSnapshot ? <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2"><h4 className="font-bold text-emerald-900">Encaixe e consumo de chapas</h4><p>Chapa: {viewCalculationItem.sheetSnapshot.sheetName} · {viewCalculationItem.sheetSnapshot.widthCm} × {viewCalculationItem.sheetSnapshot.heightCm} cm</p><p>{viewCalculationItem.sheetSnapshot.capacity} peças por chapa · {viewCalculationItem.sheetSnapshot.sheetsNeeded} chapas</p><p>Área consumida: {viewCalculationItem.sheetSnapshot.consumedAreaM2.toLocaleString('pt-BR')} m²</p><p>Total do serviço: {formatCurrency(viewCalculationItem.subtotal)}</p></div> : viewCalculationItem.graphicSnapshot ? <GraphicPricingDetails snapshot={viewCalculationItem.graphicSnapshot} /> : (viewCalculationItem.serviceGroup ? viewCalculationItem.serviceGroup==='GRAPHIC_PRODUCTS' : viewCalculationItem.isGraphicSnapshot || viewCalculationItem.calculationType === 'UNIT' || viewCalculationItem.isGraphic) ? (
                <div className="bg-indigo-50/70 p-4 rounded-xl border border-indigo-200 space-y-2">
                  <h4 className="font-bold text-indigo-900 uppercase text-xxs flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Cálculo do Serviço Gráfico por Unidade
                  </h4>
                  <div className="text-indigo-950 font-mono space-y-1 text-xs">
                    <p>• Modalidade: <strong>Serviço Gráfico Por Unidade</strong></p>
                    <p>• Quantidade Solicitada: <strong>{viewCalculationItem.quantity} un.</strong></p>
                    {viewCalculationItem.referenceQuantitySnapshot && viewCalculationItem.referencePriceSnapshot ? (
                      <p>• Parâmetro de Referência: {formatCurrency(viewCalculationItem.referencePriceSnapshot)} para {viewCalculationItem.referenceQuantitySnapshot} un.</p>
                    ) : null}
                    {viewCalculationItem.unitPriceSnapshot ? (
                      <p>• Preço Unitário Resultante: R$ {viewCalculationItem.unitPriceSnapshot.toFixed(4)} / un.</p>
                    ) : null}
                    <p className="text-indigo-900 font-bold pt-1 border-t border-indigo-200">
                      = Base Mídia ({viewCalculationItem.quantity} un. × R$ {(viewCalculationItem.unitPriceSnapshot || viewCalculationItem.servicePriceSnapshot).toFixed(4)}): {formatCurrency(viewCalculationItem.baseValue)}
                    </p>
                  </div>
                </div>
              ) : viewCalculationItem.calculationSnapshot ? (
                <div className="bg-indigo-50/70 p-4 rounded-xl border border-indigo-200 space-y-2">
                  <h4 className="font-bold text-indigo-900 uppercase text-xxs">
                    Cálculo da Mídia em Bobina
                  </h4>
                  <div className="text-indigo-950 font-mono space-y-1">
                    <p>• Boca da Bobina Faturada: {viewCalculationItem.calculationSnapshot.billableWidthCm || viewCalculationItem.calculationSnapshot.recommendedRollWidthCm} cm ({( (viewCalculationItem.calculationSnapshot.billableWidthCm || viewCalculationItem.calculationSnapshot.recommendedRollWidthCm)/100 ).toFixed(2)} m)</p>
                    <p>• Orientação do Trabalho: {viewCalculationItem.calculationSnapshot.orientation}</p>
                    <p>• Peças na Boca (Largura): {viewCalculationItem.calculationSnapshot.unitsAcross} un. na boca ({viewCalculationItem.calculationSnapshot.rowsNeeded} fila(s))</p>
                    <p>• Comprimento Percorrido: {viewCalculationItem.calculationSnapshot.linearMetersNeeded.toFixed(2)} metros lineares</p>
                    <p>• Fórmula: Boca ({((viewCalculationItem.calculationSnapshot.billableWidthCm || viewCalculationItem.calculationSnapshot.recommendedRollWidthCm)/100).toFixed(2)}m) × Comprimento ({viewCalculationItem.calculationSnapshot.linearMetersNeeded.toFixed(2)}m) × R$ {viewCalculationItem.servicePriceSnapshot.toFixed(2)}</p>
                    <p className="text-indigo-900 font-bold pt-1">
                      = Base da Mídia: {formatCurrency(viewCalculationItem.baseValue)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-100 p-3 rounded-lg text-slate-800 font-mono">
                  <p>• Cálculo Direto: Base = {formatCurrency(viewCalculationItem.baseValue)}</p>
                </div>
              )}

              {viewCalculationItem.finishings && viewCalculationItem.finishings.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                  <h4 className="font-bold text-slate-800 uppercase text-xxs">
                    Detalhamento dos Acabamentos
                  </h4>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-xxs uppercase font-bold text-slate-600">
                        <th className="p-1">Acabamento</th>
                        <th className="p-1">Tipo</th>
                        <th className="p-1 text-right">Unitário</th>
                        <th className="p-1 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {viewCalculationItem.finishings.map(f => (
                        <tr key={f.id}>
                          <td className="p-1 font-sans font-bold text-slate-800">{f.finishingName}</td>
                          <td className="p-1 text-slate-500">{f.costType}</td>
                          <td className="p-1 text-right">{formatCurrency(f.unitPriceSnapshot)}</td>
                          <td className="p-1 text-right font-bold text-indigo-900">{formatCurrency(f.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bg-slate-900 text-white p-3 rounded-lg flex justify-between items-center font-mono">
                <span className="font-bold text-slate-300">Total do Item:</span>
                <span className="text-xl font-bold text-emerald-400">{formatCurrency(viewCalculationItem.subtotal)}</span>
              </div>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setViewCalculationItem(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL ROLL SELECTOR MODAL (Inside Item Editor) */}
      {isRollSelectorModalOpen && materialRules?.allowManualRollOverride && activeItemCalcResult && (
        <RollSelectorModal
          isOpen={isRollSelectorModalOpen}
          onClose={() => setIsRollSelectorModalOpen(false)}
          allOptions={activeItemCalcResult.allOptions}
          recommendedSnapshot={activeItemCalcResult.recommendedSnapshot}
          selectedSnapshot={activeItemCalcResult.selectedSnapshot}
          onConfirmSelection={(opt, reason) => {
            handleConfirmRollOverride(opt, reason);
            setIsRollSelectorModalOpen(false);
          }}
          onRestoreAutomatic={() => {
            handleRestoreAutomaticRecommendation();
            setIsRollSelectorModalOpen(false);
          }}
        />
      )}

      {/* APPROVAL MODAL */}
      {approvalModalQuote && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-600" />
                Aprovar Orçamento {approvalModalQuote.number}
              </h3>
              <button onClick={() => setApprovalModalQuote(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmApproval} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Forma de Pagamento</label>
                <select
                  value={approvalPaymentMethod}
                  onChange={e => setApprovalPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border rounded font-medium text-slate-800"
                >
                  <option value="PIX">PIX</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                  <option value="CARTAO_DEBITO">Cartão de Débito</option>
                  <option value="BOLETO">Boleto Bancário</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Condição de Pagamento</label>
                <select
                  value={approvalCondition}
                  onChange={e => setApprovalCondition(e.target.value)}
                  className="w-full px-3 py-2 border rounded font-medium text-slate-800"
                >
                  <option value="SINAL_RESTANTE">50% Sinal + 50% na Entrega</option>
                  <option value="A_VISTA">100% à Vista na Aprovação</option>
                  <option value="RETIRADA">100% na Retirada</option>
                  <option value="PARCELADO">Parcelado</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">{approvalModalQuote.status === 'EM_REVISAO' ? 'Novo pagamento nesta revisão (R$) — não repetir o sinal já pago' : 'Valor Pago (Sinal) - R$'}</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={approvalAmountPaid}
                  onChange={e => setApprovalAmountPaid(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded font-mono font-bold text-emerald-800"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Responsável pelo Atendimento</label>
                <input
                  type="text"
                  value={approvalResponsible}
                  onChange={e => setApprovalResponsible(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setApprovalModalQuote(null)}
                  className="px-4 py-2 text-slate-600 font-bold rounded hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={approvalBusy}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded shadow-xs"
                >
                  {approvalBusy ? 'Aprovando…' : approvalModalQuote.status === 'EM_REVISAO' ? 'Aprovar revisão e atualizar OS' : 'Aprovar e Gerar OS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WHATSAPP MODAL */}
      {whatsappModalQuote && (
        <div className="nagano-overlay fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-600" />
                Enviar Orçamento via WhatsApp
              </h3>
              <button onClick={() => setWhatsappModalQuote(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 max-h-96 overflow-y-auto">
              <WhatsAppMessagePreview text={whatsappClient.formatQuotationMessage(whatsappModalQuote, budgetSettings.paymentTermsOptions)}/>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button className="px-3 py-2 text-indigo-700 font-bold text-xs" onClick={async () => {
                try { await navigator.clipboard.writeText(whatsappClient.formatQuotationMessage(whatsappModalQuote, budgetSettings.paymentTermsOptions)); alert('Mensagem copiada.'); }
                catch { alert('Não foi possível copiar automaticamente. Selecione e copie o texto da prévia.'); }
              }}>Copiar mensagem</button>
              <button
                onClick={() => setWhatsappModalQuote(null)}
                className="px-4 py-2 text-slate-600 font-bold rounded hover:bg-slate-100 text-xs"
              >
                Fechar
              </button>
              <button
                onClick={async () => {
                  const msg = whatsappClient.formatQuotationMessage(whatsappModalQuote, budgetSettings.paymentTermsOptions);
                  const customer = customers.find(c => c.id === whatsappModalQuote.customerId);
                  const result = await whatsappClient.sendWhatsAppMessage(customer?.whatsapp || customer?.phone || whatsappModalQuote.customerPhone, msg);
                  if (result.ok) setWhatsappModalQuote(null);
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs shadow-xs flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Enviar orçamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};








