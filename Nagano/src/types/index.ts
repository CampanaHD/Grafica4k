import { ServiceGroup, GraphicPricingSnapshot } from './graphicProduct';
import type { SimulationSnapshot } from './quotationSimulation';
import type { ActorStamp, OutsourcedService } from './team';
export type UserRole = 
  | 'ADMIN' 
  | 'SALES' 
  | 'DESIGN' 
  | 'PRODUCTION' 
  | 'FINISHING' 
  | 'FINANCE' 
  | 'READONLY'
  | 'STOCK'
  | 'ATTENDANCE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
}

export interface CompanySettings {
  companyName: string;
  tradingName: string;
  cnpjCpf: string;
  stateRegistration: string;
  telephone: string;
  whatsapp: string;
  email: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  logoUrl?: string;
  quotationFooter: string;
  workOrderFooter: string;
  receiptFooter: string;
  defaultQuotationValidityDays: number;
  defaultProductionDeadlineDays: number;
  cmykNotes: string;
  pixKey: string;
  bankDetails: string;
}

export type PricingMethod = 
  | 'POR_AREA_CONSUMIDA_BOBINA'
  | 'POR_AREA_ARTE'
  | 'POR_METRO_LINEAR'
  | 'POR_UNIDADE'
  | 'VALOR_FIXO'
  | 'POR_FAIXA_QUANTIDADE'
  | 'FORMULA_PERSONALIZADA'
  | 'PER_SQM' 
  | 'PER_LINM' 
  | 'PER_UNIT' 
  | 'FIXED' 
  | 'HOURLY' 
  | 'MINIMUM_CHARGE'
  | 'TIERED';

export type BillableWidthBase =
  | 'TOTAL_ROLL_WIDTH'       // Largura total da bobina selecionada (Padrão)
  | 'USABLE_ROLL_WIDTH'      // Largura útil da bobina
  | 'PRODUCTION_WIDTH';      // Largura de produção com acréscimos

export interface RollOption {
  id: string;
  name?: string;
  materialId?: string;
  widthCm: number;
  usableWidthCm?: number;
  lengthM?: number;
  unit?: string;
  costPerSqm: number;
  costPerLinm: number;
  sellingPriceSqm?: number;
  sellingPriceLinm?: number;
  edgeSafetyCm?: number;
  defaultWastePct?: number;
  supplier?: string;
  stockQty?: number;
  minStock?: number;
  active: boolean;
  notes?: string;
}

export interface PriceTier {
  id: string;
  minQty: number;
  maxQty?: number;
  pricePerUnit: number;
}

export type MaterialControlType = 'ROLL' | 'SHEET' | 'UNIT';
export type MaterialCalculationUnit = 'M2' | 'UNIT' | 'LINEAR_METER' | 'SHEET';

export interface MaterialDiscountTier {
  id: string;
  materialId?: string;
  minimumArea: number; // m²
  percentage: number;  // 0 - 100
  sortOrder?: number;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface MaterialRollConfiguration {
  allowRotation: boolean;
  autoFindLowestCost: boolean;
  allowManualRollOverride: boolean;
  allowedWidths: number[]; // in meters (e.g. 1.60) or cm (e.g. 160)
  volumeDiscountEnabled?: boolean;
  discountTiers?: MaterialDiscountTier[];
}

export interface Material {
  stockByWidth?:Record<string,number>;
  availableSheets?: { id: string; name?: string; widthCm: number; heightCm: number; active: boolean }[];
  futuraImportId?: string;
  id: string;
  name: string;
  code?: string;
  category: string; // e.g. "Lonas", "Adesivos", "Papéis", "Rígidos", "Tecidos", "Sublimação"
  controlType?: MaterialControlType;
  calculationUnit?: MaterialCalculationUnit;
  salePrice?: number;
  referenceCost?: number;
  supplier: string;
  unit: string;
  description?: string;
  availableRolls: RollOption[];
  allowedRollWidths?: number[];
  allowRotation?: boolean;
  autoFindLowestCost?: boolean;
  allowManualRollOverride?: boolean;
  volumeDiscountEnabled?: boolean;
  discountTiers?: MaterialDiscountTier[];
  rollConfiguration?: MaterialRollConfiguration;
  pricingMethod?: PricingMethod;
  billableWidthBase?: BillableWidthBase;
  allowsSideBySideFit?: boolean;
  costPerSqm: number;
  costPerLinm: number;
  sellingPriceSqm: number;
  sellingPriceLinm?: number;
  minimumCharge: number;
  expectedWastePct: number;
  defaultReinforcementCm: number;
  defaultHemCm: number;
  defaultRodPocketCm: number;
  defaultBleedCm: number;
  defaultEdgeSafetyCm: number;
  compatibleFinishIds?: string[];
  extraDeadlineDays?: number;
  active: boolean;
}

export interface PhysicalRoll {
  id: string;
  rollCode: string;
  materialId: string;
  materialName?: string;
  widthM: number;           // e.g. 1.60
  initialLengthM: number;   // e.g. 50.00
  currentLengthM: number;   // e.g. 32.40
  batchNumber?: string;
  location?: string;
  receivedAt?: string;
  status: 'IN_STOCK' | 'IN_USE' | 'DEPLETED';
}

export type ServiceCalculationType = 'ROLL' | 'UNIT';

export interface QuantityDiscountTier {
  id: string;
  serviceId?: string;
  minimumQuantity: number;
  discountPercentage: number;
  active?: boolean;
}

export interface Service {
  /** Legacy input only. Ignored and removed from the service catalog. */
  materialPrices?: { materialId: string; price: number }[];
  volumeDiscountEnabled?: boolean;
  areaDiscountTiers?: MaterialDiscountTier[];
  serviceGroup?: ServiceGroup;
  id: string;
  name: string;
  category: string;
  description?: string;
  pricingMethod: PricingMethod;
  productType?: 'BOBINA' | 'PAPEL';
  isGraphic?: boolean;
  calculationType?: ServiceCalculationType;
  minQuantity?: number;
  minQuantityValue?: number;
  baseUnitPrice?: number;
  referenceQuantity?: number;
  referencePrice?: number;
  quantityDiscountTiers?: QuantityDiscountTier[];
  billableWidthBase?: BillableWidthBase;
  allowsSideBySideFit?: boolean;
  defaultMaterialId?: string;
  basePrice?: number;
  setupFee: number;
  minimumCharge: number;
  hourlyRate: number;
  internalCost?: number;
  profitMarginPct?: number;
  unit?: string;
  allowedMaterialIds?: string[];
  allowedFinishIds?: string[];
  productionDeadlineDays?: number;
  artworkDeadlineDays?: number;
  layoutApprovalDeadlineDays?: number;
  installationDeadlineDays?: number;
  extraDeadlinePerQty?: number;
  requiresArtwork?: boolean;
  requiresApproval?: boolean;
  allowsInstallation?: boolean;
  priceTiers?: PriceTier[];
  internalNotes?: string;
  customerNotes?: string;
  active: boolean;
}

export interface FinishOption {
  components?: {id:string;itemId:string;quantity:number;unit:string;name?:string;sku?:string}[];
  compositionVersion?:string;
  id: string;
  name: string;
  category?: string;
  description?: string;
  costType: 'FIXED' | 'PER_UNIT' | 'PER_METER' | 'PER_SQM' | 'PER_SIDE' | 'PERCENTAGE';
  unitCost: number;
  unitPrice?: number;
  minimumCharge?: number;
  minQuantity?: number;
  unit?: string;
  percentage?: number;
  productionTimeMinutes: number;
  additionalDeadlineDays?: number;
  compatibleMaterialIds?: string[];
  compatibleServiceIds?: string[];
  active: boolean;
}

export interface BudgetGeneralSettings {
  urgencyMarkupPct: number;
  urgencyDeadlineDaysReduction: number;
  defaultMarkupPct: number;
  maxDiscountPct: number;
  minOrderValue: number;
  stockCheckRule: 'ALLOW_ALWAYS' | 'IGNORE_OUT_OF_STOCK' | 'SHOW_ALERT';
  defaultValidityDays: number;
  defaultProductionDays: number;
  nonWorkingDays: string[]; // e.g. ["SABADO", "DOMINGO"]
  holidays: string[]; // YYYY-MM-DD
  paymentTermsOptions: string[];
  installationDefaultCost: number;
  designDefaultCost: number;
  deliveryDefaultCost: number;
}

export type CustomerType = 'INDIVIDUAL' | 'COMPANY';

export interface CustomerAddress {
  id: string;
  customerId: string;
  type: 'BILLING' | 'DELIVERY' | 'COMMERCIAL' | 'OTHER';
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  landmark?: string;
  deliveryInstructions?: string;
  isPrimary: boolean;
  active: boolean;
}

export type ObservationCategory = 
  | 'GERAL' 
  | 'ATENDIMENTO' 
  | 'ARTE' 
  | 'PRODUCAO' 
  | 'ACABAMENTO' 
  | 'ENTREGA' 
  | 'FINANCEIRO' 
  | 'AVISO_IMPORTANTE';

export interface CustomerObservation {
  id: string;
  customerId: string;
  category: ObservationCategory;
  text: string;
  isImportantWarning: boolean;
  isInternal: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface CustomerAuditLog {
  id: string;
  customerId: string;
  action: string;
  changedField?: string;
  oldValue?: string;
  newValue?: string;
  user: string;
  reason?: string;
  ip?: string;
  timestamp: string;
}

export interface Customer {
  id: string;
  type: CustomerType;
  name: string; // Nome ou Razão Social
  tradingName?: string; // Nome Fantasia
  cpfCnpj: string;
  stateRegistration?: string;
  municipalRegistration?: string;
  contactPerson?: string;
  phone: string;
  normalizedPhone?: string;
  whatsapp: string;
  normalizedWhatsapp?: string;
  secondaryPhone?: string;
  email: string;
  preferredContactMethod?: 'WHATSAPP' | 'EMAIL' | 'PHONE' | 'SMS';
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  landmark?: string;
  deliveryInstructions?: string;
  notes?: string; // Observações gerais
  attendantNotes?: string;
  artworkNotes?: string;
  productionNotes?: string;
  finishingNotes?: string;
  financialNotes?: string;
  deliveryNotes?: string;
  internalWarnings?: string;
  allowWhatsapp?: boolean;
  allowQuoteNotice?: boolean;
  allowProductionNotice?: boolean;
  allowPickupNotice?: boolean;
  allowPaymentReminder?: boolean;
  allowMarketing?: boolean;
  active: boolean;
  inactivatedReason?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt?: string;
  totalPurchased: number;
  totalPaid?: number;
  pendingBalance?: number;
  lastPurchaseDate?: string;
  lastUpdatedDate?: string;
}

export type QuotationStatus = 
  | 'EM_REVISAO'
  | 'RASCUNHO' 
  | 'CALCULADO' 
  | 'ENVIADO' 
  | 'AGUARDANDO_APROVACAO' 
  | 'APROVADO' 
  | 'REJEITADO' 
  | 'EXPIRADO' 
  | 'CANCELADO';

export interface AllowancesConfig {
  reinforcementCm?: number;
  hemCm?: number;
  rodPocketCm?: number;
  bleedCm?: number;
  edgeSafetyCm?: number;
  topCm?: number;
  bottomCm?: number;
  leftCm?: number;
  rightCm?: number;
  overflowValueCm?: number;
  overflowTop?: boolean;
  overflowBottom?: boolean;
  overflowLeft?: boolean;
  overflowRight?: boolean;
}

export interface RollOverrideAuditLog {
  id: string;
  quotationId?: string;
  itemId?: string;
  timestamp: string;
  user: string;
  action: 'MANUAL_OVERRIDE' | 'RESTORE_AUTOMATIC';
  previousRollWidthCm: number;
  newRollWidthCm: number;
  previousOrientation: 'HORIZONTAL' | 'VERTICAL';
  newOrientation: 'HORIZONTAL' | 'VERTICAL';
  previousFinalPrice: number;
  newFinalPrice: number;
  previousWastePct: number;
  newWastePct: number;
  reason: string;
}

export interface EvaluatedRollOption {
  rollId?: string;
  rollName?: string;
  rollWidthCm: number;
  usableRollWidthCm: number;
  billableWidthCm?: number;
  orientation: 'HORIZONTAL' | 'VERTICAL';
  fits: boolean;
  rejectionReason?: string;
  productionWidthCm: number;
  productionHeightCm: number;
  unitsAcross: number;
  rowsNeeded: number;
  linearMetersNeeded: number;
  totalSqmUsed: number;
  billableAreaM2?: number;
  netSqmPrinted: number;
  wasteSqm: number;
  wastePercentage: number;
  materialCost: number;
  finishingCost: number;
  installationCost: number;
  designCost: number;
  deliveryCost: number;
  setupCharge: number;
  totalBaseCost: number;
  subtotalPrice: number;
  discountAmount: number;
  minimumChargeApplied?: boolean;
  finalPrice: number;
  priceDifferenceVsRecommended: number;
  wasteDifferenceVsRecommended: number;
  linearMeterDifferenceVsRecommended: number;
  stockQty?: number;
  stockStatus: 'DISPONIVEL' | 'SEM_ESTOQUE' | 'ALERTA';
  tags: ('RECOMENDADA' | 'MENOR_DESPERDICIO' | 'MENOR_CUSTO' | 'MENOR_CONSUMO_LINEAR' | 'SELECIONADA_MANUALMENTE' | 'SEM_ESTOQUE' | 'INCOMPATIVEL')[];
  explanation: string;
}

export interface CalculationSnapshot {
  recommendedRollWidthCm: number;
  selectedRollWidthCm?: number;
  rollName?: string;
  usableRollWidthCm: number;
  billableWidthCm?: number;
  orientation: 'HORIZONTAL' | 'VERTICAL';
  productionWidthCm: number;
  productionHeightCm: number;
  unitsAcross: number;
  rowsNeeded: number;
  linearMetersNeeded: number;
  totalSqmUsed: number;
  billableAreaM2?: number;
  netSqmPrinted: number;
  wasteSqm: number;
  wastePercentage: number;
  materialCost: number;
  finishingCost: number;
  installationCost: number;
  designCost: number;
  deliveryCost: number;
  setupCharge: number;
  totalBaseCost: number;
  subtotalPrice: number;
  discountAmount: number;
  minimumChargeApplied?: boolean;
  finalPrice: number;
  explanation: string;
  isManualSelection?: boolean;
  manualSelectionReason?: string;
  areaPerUnitM2?: number;
  grossUnitPrice?: number;
  grossTotalPrice?: number;
  totalCalculatedAreaM2?: number;
  discountPercentage?: number;
  discountValue?: number;
  requiredWidthCm?: number;
  usedLengthCm?: number;
}

export type ItemDiscountType = 'NONE' | 'PERCENTAGE' | 'FIXED_AMOUNT';

export interface QuotationItemFinishing {
  compositionVersion?:string;
  componentsSnapshot?:NonNullable<FinishOption['components']>;
  id: string;
  finishingId: string;
  finishingName: string;
  costType: 'FIXED' | 'PER_UNIT' | 'PER_METER' | 'PER_SQM' | 'PER_SIDE' | 'PERCENTAGE';
  quantity: number;
  unitPriceSnapshot: number;
  minimumChargeSnapshot?: number;
  subtotal: number;
  notes?: string;
}

export interface QuotationItem {
  composedFinishingTotal?:number;
  stockFinishings?: {id:string;itemId:string;name?:string;sku?:string;quantity:number;unit:string;perUnit:boolean;quantitySnapshot?:number;stockUnit?:string;saleUnitPriceSnapshot?:number;saleTotal?:number}[];
  stockFinishingTotal?:number;
  internalCosts?:{labor?:number;installation?:number;transport?:number;other?:number;thirdParties?:number};
  sheetSnapshot?: { sheetId: string; sheetName: string; widthCm: number; heightCm: number; columns: number; rows: number; capacity: number; sheetsNeeded: number; rotated: boolean; consumedAreaM2: number };
  simulationSnapshot?: SimulationSnapshot;
  futuraImportId?: string;
  serviceGroup?: ServiceGroup;
  graphicProductId?: string;
  graphicSnapshot?: GraphicPricingSnapshot;
  id: string;
  quotationId?: string;
  serviceId: string;
  serviceName: string;
  description?: string;
  quantity: number;
  widthCm: number;
  heightCm: number;
  materialId?: string;
  materialName?: string;
  orientation: 'HORIZONTAL' | 'VERTICAL' | 'AUTO';
  allowances: AllowancesConfig;
  overflowValueCm?: number;
  overflowTop?: boolean;
  overflowBottom?: boolean;
  overflowLeft?: boolean;
  overflowRight?: boolean;
  productionWidthCm?: number;
  productionHeightCm?: number;
  finishings: QuotationItemFinishing[];
  notes?: string;
  position: number;
  recommendedRollWidthCm?: number;
  recommendedOrientation?: 'HORIZONTAL' | 'VERTICAL';
  selectedRollWidthCm?: number;
  selectedOrientation?: 'HORIZONTAL' | 'VERTICAL';
  isRollSelectionManual?: boolean;
  manualSelectionReason?: string;
  allowRotation?: boolean;
  isGraphic?: boolean;
  isGraphicSnapshot?: boolean;
  productType?: 'BOBINA' | 'PAPEL';
  productTypeSnapshot?: 'BOBINA' | 'PAPEL';
  minQuantitySnapshot?: number;
  minQuantityValueSnapshot?: number;
  baseUnitPriceSnapshot?: number;
  promotionalUnitPrice?: number;
  promotionalUnitPriceSnapshot?: number;
  validationError?: string;
  calculationType?: ServiceCalculationType;
  servicePriceSnapshot: number;
  referenceQuantitySnapshot?: number;
  referencePriceSnapshot?: number;
  unitPriceSnapshot?: number;
  suggestedDiscountPct?: number;
  discountOrigin?: 'NONE' | 'QUANTITY_TIER' | 'MANUAL_OVERRIDE';
  baseValue: number;
  finishingTotal: number;
  subtotalBeforeDiscount?: number;
  discountType?: ItemDiscountType;
  discountInputValue?: number;
  discountEffectiveAmount?: number;
  subtotal: number;
  calculationSnapshot?: CalculationSnapshot;
  recommendedSnapshot?: CalculationSnapshot;
  rollAuditLogs?: RollOverrideAuditLog[];
}

export interface Quotation {
  customerPhone?: string;
  createdBy?: ActorStamp;
  updatedBy?: ActorStamp;
  outsourcedServices?: OutsourcedService[];
  commercialVersion?: number;
  revisionReason?: string;
  rejectionReason?: string;
  revisedAt?: string;
  lastApprovedTotal?: number;
  revision?: number;
  id: string;
  number: string; // ORC-2026-XXXX
  createdAt: string;
  expirationDate: string;
  customerId: string;
  customerName: string;
  salespersonName: string;
  items: QuotationItem[];
  subtotal: number;
  deliveryCost: number;
  designCost: number;
  installationCost: number;
  extraCharges: number;
  discountAmount: number;
  totalAmount: number;
  paymentTerms: string;
  maxDeadlineDays: number;
  internalNotes: string;
  customerNotes: string;
  status: QuotationStatus;
  
  // Legacy top-level fields for single-item backward compatibility
  serviceId?: string;
  serviceName?: string;
  description?: string;
  colors?: string;
  widthCm?: number;
  heightCm?: number;
  quantity?: number;
  materialId?: string;
  materialName?: string;
  orientation?: 'HORIZONTAL' | 'VERTICAL' | 'AUTO';
  allowances?: AllowancesConfig;
  finishingText?: string;
  installationText?: string;
  calculationSnapshot?: CalculationSnapshot;
  recommendedSnapshot?: CalculationSnapshot;
  isRollSelectionManual?: boolean;
  manualSelectionReason?: string;
  recommendedRollWidthCm?: number;
  recommendedOrientation?: 'HORIZONTAL' | 'VERTICAL';
  selectedRollWidthCm?: number;
  selectedOrientation?: 'HORIZONTAL' | 'VERTICAL';
  rollAuditLogs?: RollOverrideAuditLog[];
  workOrderId?: string;
}

export type ProductionStatus = 
  | 'PRODUCAO_ARTES' 
  | 'AGUARDANDO_APROVACAO_ARTE' 
  | 'ARTE_APROVADA' 
  | 'PRODUCAO' 
  | 'ACABAMENTO' 
  | 'FINALIZADO' 
  | 'AGUARDANDO_RETIRADA' 
  | 'ENTREGUE'
  | 'PAUSADO'
  | 'AGUARDANDO_INFORMACAO_CLIENTE'
  | 'AGUARDANDO_MATERIAL'
  | 'CANCELADO';

export interface WorkOrderStatusHistory {
  changedByProfileId?: string;
  id: string;
  previousStatus: ProductionStatus;
  newStatus: ProductionStatus;
  changedAt: string;
  changedBy: string;
  observation?: string;
}

export interface WorkOrder {
  revision?: number;
  createdBy?: ActorStamp;
  updatedBy?: ActorStamp;
  productionNotes?: string;
  outsourcedServices?: OutsourcedService[];
  productionCompletedAt?: string;
  quotationRevisionPending?: boolean;
  id: string;
  number: string; // OS-2026-XXXX
  quotationId: string;
  quotationNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  approvalDate: string;
  deadlineDate: string;
  items?: QuotationItem[];
  serviceName: string;
  description: string;
  dimensionsText: string;
  widthCm: number;
  heightCm: number;
  quantity: number;
  materialName: string;
  colors: string;
  finishingText: string;
  installationText: string;
  artworkInstructions: string;
  paymentMethod: string;
  totalAmount: number;
  amountPaid: number;
  remainingBalance: number;
  salespersonName: string;
  designerName: string;
  productionResponsible: string;
  internalNotes: string;
  customerNotes: string;
  productionStatus: ProductionStatus;
  statusHistory: WorkOrderStatusHistory[];
  notionPageId?: string;
  pickupNotifiedAt?: string;
  pickedUpAt?: string;
  createdAt: string;
}

export type PaymentMethod = 'DINHEIRO' | 'PIX' | 'DEBITO' | 'CREDITO' | 'TRANSFERENCIA' | 'OUTRO';

export type PaymentCondition = 'A_VISTA' | 'SINAL_RESTANTE' | 'PARCELADO' | 'RETIRADA' | 'PERSONALIZADO';

export interface Installment {
  id: string;
  number: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
  paidAt?: string;
}

export interface PaymentRecord {
  id: string;
  workOrderId: string;
  quotationId?: string;
  customerId: string;
  customerName: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  condition: PaymentCondition;
  installments: Installment[];
  receiptId?: string;
  receivedBy: string;
  notes?: string;
}

export interface Receipt {
  kind?: 'FINAL_SETTLEMENT' | 'LEGACY_PAYMENT';
  id: string;
  number: string; // REC-2026-XXXX
  workOrderId: string;
  workOrderNumber: string;
  customerId: string;
  customerName: string;
  cpfCnpj: string;
  amount: number;
  amountInWords: string;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  referringTo: string;
  issuerName: string;
  observations?: string;
  createdAt: string;
}

export interface IntegrationQueueItem {
  id: string;
  type: 'NOTION' | 'WHATSAPP';
  targetId: string;
  title: string;
  payload: any;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  attempts: number;
  lastAttemptAt?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface NotionSettings {
  apiToken: string;
  databaseId: string;
  syncEnabled: boolean;
  autoSyncOnStatusChange: boolean;
}

export interface WhatsAppSettings {
  appId?: string;
  appSecret?: string;
  phoneNumberId: string;
  accessToken: string;
  businessAccountId: string;
  graphApiVersion?: string;
  webhookVerifyToken?: string;
  testPhoneNumber?: string;
  testTemplateName?: string;
  testTemplateLanguage?: string;
  autoSendPickupNotice: boolean;
  autoSendQuoteMessage: boolean;
}

export type WhatsAppMessageStatus = 
  | 'PENDING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'SUBMITTED'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'CANCELLED';

export interface WhatsAppMessageLog {
  id: string;
  wamid?: string;
  recipientPhone: string;
  rawPhone: string;
  messageType: 'template' | 'text';
  templateName?: string;
  templateLanguage?: string;
  content: string;
  customerName?: string;
  referenceType?: 'QUOTATION' | 'WORK_ORDER' | 'PICKUP_NOTICE' | 'TEST';
  referenceId?: string;
  referenceNumber?: string;
  idempotencyKey?: string;
  status: WhatsAppMessageStatus;
  attempts: number;
  lastAttemptAt?: string;
  submittedAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  errorCode?: string | number;
  errorSubcode?: string | number;
  errorMessage?: string;
  metaTraceId?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
}

