import {businessRead,businessWrite,runtimeReset} from './businessData';
import {activeProfile,teamRequest} from './teamApi';
import {
  CompanySettings,
  Customer,
  CustomerAddress,
  CustomerObservation,
  CustomerAuditLog,
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
  AuditLog,
  UserRole,
  BudgetGeneralSettings,
  PhysicalRoll
} from '../types';

const STORAGE_KEYS = {
  COMPANY: 'printshop_company_v2',
  CUSTOMERS: 'printshop_customers_v2',
  CUSTOMER_OBSERVATIONS: 'printshop_customer_observations_v2',
  CUSTOMER_AUDIT_LOGS: 'printshop_customer_audit_logs_v2',
  CUSTOMER_ADDRESSES: 'printshop_customer_addresses_v2',
  MATERIALS: 'printshop_materials_v2',
  PHYSICAL_ROLLS: 'printshop_physical_rolls_v2',
  SERVICES: 'printshop_services_v2',
  FINISHES: 'printshop_finishes_v2',
  BUDGET_SETTINGS: 'printshop_budget_settings_v2',
  QUOTATIONS: 'printshop_quotations_v2',
  WORK_ORDERS: 'printshop_work_orders_v2',
  PAYMENTS: 'printshop_payments_v2',
  RECEIPTS: 'printshop_receipts_v2',
  NOTION: 'printshop_notion_v2',
  WHATSAPP: 'printshop_whatsapp_v2',
  INTEGRATION_QUEUE: 'printshop_queue_v2',
  AUDIT_LOGS: 'printshop_audit_v2',
  CURRENT_ROLE: 'printshop_current_role_v2'
};

export const DEFAULT_BUDGET_SETTINGS: BudgetGeneralSettings = {
  urgencyMarkupPct: 30,
  urgencyDeadlineDaysReduction: 2,
  defaultMarkupPct: 100,
  maxDiscountPct: 15,
  minOrderValue: 30.00,
  stockCheckRule: 'SHOW_ALERT',
  defaultValidityDays: 7,
  defaultProductionDays: 3,
  nonWorkingDays: ['SABADO', 'DOMINGO'],
  holidays: [],
  paymentTermsOptions: [
    '50% no pedido e 50% na entrega',
    '100% à vista PIX (5% desconto)',
    'Faturado 15 dias (Somente PJ)',
    '100% na retirada balcão',
    '3x no Cartão de Crédito'
  ],
  installationDefaultCost: 120.00,
  designDefaultCost: 50.00,
  deliveryDefaultCost: 25.00
};

// Seed Data Initialization
export const DEFAULT_COMPANY: CompanySettings = {
  companyName: 'Nagano Comunicação Visual',
  tradingName: 'Nagano Comunicação Visual',
  cnpjCpf: '',
  stateRegistration: '',
  telephone: '',
  whatsapp: '',
  email: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  cep: '',
  logoUrl: '',
  quotationFooter: 'Orçamento válido por 7 dias. Prazo de produção iniciado após aprovação formal da arte final.',
  workOrderFooter: 'Conferir o material no ato do recebimento. Não aceitamos reclamações após 48 horas da entrega.',
  receiptFooter: 'Este recibo dá quitação do valor especificado referente aos serviços prestados.',
  defaultQuotationValidityDays: 7,
  defaultProductionDeadlineDays: 3,
  cmykNotes: 'Arquivos em RGB serão convertidos para CMYK podendo ocorrer variação cromática de até 10%.',
  pixKey: '',
  bankDetails: ''
};

export const DEFAULT_MATERIALS: Material[] = [
  {
    id: 'mat_lona440',
    name: 'Lona Frontlight 440g',
    code: 'LON-440',
    category: 'Lonas',
    controlType: 'ROLL',
    calculationUnit: 'M2',
    salePrice: 45.00,
    referenceCost: 18.50,
    supplier: 'SignSupply',
    unit: 'm²',
    costPerSqm: 18.50,
    costPerLinm: 25.00,
    sellingPriceSqm: 45.00,
    minimumCharge: 30.00,
    expectedWastePct: 8.0,
    defaultReinforcementCm: 5.0,
    defaultHemCm: 3.0,
    defaultRodPocketCm: 0.0,
    defaultBleedCm: 2.0,
    defaultEdgeSafetyCm: 2.0,
    active: true,
    allowRotation: true,
    autoFindLowestCost: true,
    allowManualRollOverride: true,
    allowedRollWidths: [80, 100, 120, 140, 160, 205, 220, 250, 320],
    volumeDiscountEnabled: true,
    discountTiers: [
      { id: 'dt_lona_1', minimumArea: 10, percentage: 5, active: true },
      { id: 'dt_lona_2', minimumArea: 25, percentage: 10, active: true },
      { id: 'dt_lona_3', minimumArea: 50, percentage: 15, active: true }
    ],
    availableRolls: [
      { id: 'r80', widthCm: 80, usableWidthCm: 76, costPerSqm: 18.50, costPerLinm: 14.80, active: true },
      { id: 'r100', widthCm: 100, usableWidthCm: 96, costPerSqm: 18.50, costPerLinm: 18.50, active: true },
      { id: 'r120', widthCm: 120, usableWidthCm: 116, costPerSqm: 18.50, costPerLinm: 22.20, active: true },
      { id: 'r140', widthCm: 140, usableWidthCm: 136, costPerSqm: 18.50, costPerLinm: 25.90, active: true },
      { id: 'r160', widthCm: 160, usableWidthCm: 156, costPerSqm: 18.50, costPerLinm: 29.60, active: true },
      { id: 'r205', widthCm: 205, usableWidthCm: 200, costPerSqm: 19.00, costPerLinm: 38.95, active: true },
      { id: 'r220', widthCm: 220, usableWidthCm: 215, costPerSqm: 19.50, costPerLinm: 42.90, active: true },
      { id: 'r250', widthCm: 250, usableWidthCm: 245, costPerSqm: 20.00, costPerLinm: 50.00, active: true },
      { id: 'r320', widthCm: 320, usableWidthCm: 312, costPerSqm: 22.00, costPerLinm: 70.40, active: true }
    ]
  },
  {
    id: 'mat_adesivo_vinil',
    name: 'Adesivo Vinil Polimérico Brilho 100u',
    code: 'ADB-BRILHO',
    category: 'Adesivos',
    controlType: 'ROLL',
    calculationUnit: 'M2',
    salePrice: 40.00,
    referenceCost: 15.00,
    supplier: 'Imprimax',
    unit: 'm²',
    costPerSqm: 15.00,
    costPerLinm: 18.00,
    sellingPriceSqm: 40.00,
    minimumCharge: 25.00,
    expectedWastePct: 5.0,
    defaultReinforcementCm: 0.0,
    defaultHemCm: 0.0,
    defaultRodPocketCm: 0.0,
    defaultBleedCm: 1.0,
    defaultEdgeSafetyCm: 1.5,
    active: true,
    allowRotation: true,
    autoFindLowestCost: true,
    allowManualRollOverride: true,
    allowedRollWidths: [100, 122, 152],
    volumeDiscountEnabled: true,
    discountTiers: [
      { id: 'dt_adv_1', minimumArea: 10, percentage: 5, active: true },
      { id: 'dt_adv_2', minimumArea: 30, percentage: 12, active: true }
    ],
    availableRolls: [
      { id: 'ra100', widthCm: 100, usableWidthCm: 97, costPerSqm: 15.00, costPerLinm: 15.00, active: true },
      { id: 'ra122', widthCm: 122, usableWidthCm: 119, costPerSqm: 15.00, costPerLinm: 18.30, active: true },
      { id: 'ra152', widthCm: 152, usableWidthCm: 148, costPerSqm: 15.00, costPerLinm: 22.80, active: true }
    ]
  },
  {
    id: 'mat_papel_couch300',
    name: 'Papel Couché 300g',
    code: 'PAP-COUCH300',
    category: 'Papéis',
    controlType: 'UNIT',
    calculationUnit: 'UNIT',
    salePrice: 20.00,
    referenceCost: 8.00,
    supplier: 'Suzano',
    unit: 'un',
    costPerSqm: 8.00,
    costPerLinm: 0,
    sellingPriceSqm: 20.00,
    minimumCharge: 50.00,
    expectedWastePct: 3.0,
    defaultReinforcementCm: 0.0,
    defaultHemCm: 0.0,
    defaultRodPocketCm: 0.0,
    defaultBleedCm: 0.3,
    defaultEdgeSafetyCm: 0.5,
    active: true,
    allowRotation: false,
    autoFindLowestCost: false,
    allowManualRollOverride: false,
    allowedRollWidths: [66],
    volumeDiscountEnabled: false,
    discountTiers: [],
    availableRolls: [
      { id: 'rp66', widthCm: 66, usableWidthCm: 64, costPerSqm: 8.00, costPerLinm: 5.28, active: true }
    ]
  }
];

export const DEFAULT_PHYSICAL_ROLLS: PhysicalRoll[] = [
  {
    id: 'proll_001',
    rollCode: 'AD-001',
    materialId: 'mat_adesivo_vinil',
    materialName: 'Adesivo Vinil Polimérico Brilho 100u',
    widthM: 1.52,
    initialLengthM: 50.00,
    currentLengthM: 32.40,
    batchNumber: 'IMP-2026-X1',
    location: 'Prateleira A2',
    receivedAt: '2026-07-10',
    status: 'IN_USE'
  },
  {
    id: 'proll_002',
    rollCode: 'LN-001',
    materialId: 'mat_lona440',
    materialName: 'Lona Frontlight 440g',
    widthM: 1.60,
    initialLengthM: 50.00,
    currentLengthM: 48.00,
    batchNumber: 'SS-440-99',
    location: 'Rack Lonas B1',
    receivedAt: '2026-07-25',
    status: 'IN_USE'
  }
];

export const DEFAULT_SERVICES: Service[] = [
  { id: 'srv_banner', name: 'Banner em Lona com Ilhós e Bainha', category: 'Comunicação Visual', pricingMethod: 'PER_SQM', isGraphic: false, calculationType: 'ROLL', defaultMaterialId: 'mat_lona440', setupFee: 15.00, minimumCharge: 35.00, hourlyRate: 0, active: true },
  { id: 'srv_adesivo', name: 'Adesivo Promocional Impresso', category: 'Adesivos', pricingMethod: 'PER_SQM', isGraphic: false, calculationType: 'ROLL', defaultMaterialId: 'mat_adesivo_vinil', setupFee: 10.00, minimumCharge: 30.00, hourlyRate: 0, active: true },
  {
    id: 'srv_cartao',
    name: 'Cartão de Visita 9x5cm (Couché 300g)',
    category: 'Papelaria',
    pricingMethod: 'PER_UNIT',
    isGraphic: true,
    calculationType: 'UNIT',
    referenceQuantity: 1000,
    referencePrice: 200.00,
    defaultMaterialId: 'mat_papel_couch300',
    setupFee: 0,
    minimumCharge: 90.00,
    hourlyRate: 0,
    active: true,
    quantityDiscountTiers: [
      { id: 'tier_1k', minimumQuantity: 1000, discountPercentage: 3, active: true },
      { id: 'tier_2.5k', minimumQuantity: 2500, discountPercentage: 5, active: true },
      { id: 'tier_5k', minimumQuantity: 5000, discountPercentage: 10, active: true }
    ]
  },
  {
    id: 'srv_panfleto',
    name: 'Panfleto A6 Couché 115g',
    category: 'Papelaria',
    pricingMethod: 'PER_UNIT',
    isGraphic: true,
    calculationType: 'UNIT',
    referenceQuantity: 1000,
    referencePrice: 250.00,
    setupFee: 0,
    minimumCharge: 100.00,
    hourlyRate: 0,
    active: true,
    quantityDiscountTiers: [
      { id: 'tier_p1k', minimumQuantity: 1000, discountPercentage: 5, active: true },
      { id: 'tier_p5k', minimumQuantity: 5000, discountPercentage: 12, active: true }
    ]
  },
  {
    id: 'srv_encadernacao',
    name: 'Encadernação Espiral A4',
    category: 'Acabamentos Especiais',
    pricingMethod: 'PER_UNIT',
    isGraphic: true,
    calculationType: 'UNIT',
    referenceQuantity: 1,
    referencePrice: 15.00,
    setupFee: 0,
    minimumCharge: 15.00,
    hourlyRate: 0,
    active: true,
    quantityDiscountTiers: []
  },
  { id: 'srv_faixa', name: 'Faixa Comercial em Lona com Bastão', category: 'Comunicação Visual', pricingMethod: 'PER_SQM', isGraphic: false, calculationType: 'ROLL', defaultMaterialId: 'mat_lona440', setupFee: 15.00, minimumCharge: 40.00, hourlyRate: 0, active: true },
  { id: 'srv_envelopamento', name: 'Envelopamento de Veículo / Frota', category: 'Serviços Especiais', pricingMethod: 'HOURLY', isGraphic: false, calculationType: 'ROLL', defaultMaterialId: 'mat_adesivo_vinil', setupFee: 100.00, minimumCharge: 350.00, hourlyRate: 120.00, active: true }
];

export const DEFAULT_FINISHES: FinishOption[] = [
  { id: 'fin_ilhos', name: 'Aplicação de Ilhós de Metal (por unidade)', costType: 'PER_UNIT', unitCost: 1.50, productionTimeMinutes: 2, active: true },
  { id: 'fin_bainha', name: 'Bainha Reforçada com Fita VHB (metro linear)', costType: 'PER_METER', unitCost: 4.00, productionTimeMinutes: 5, active: true },
  { id: 'fin_bastao', name: 'Montagem de Bastão de Madeira com Ponteiras', costType: 'PER_UNIT', unitCost: 12.00, productionTimeMinutes: 10, active: true },
  { id: 'fin_laminacao', name: 'Laminação Protetora UV Brilho (m²)', costType: 'PER_SQM', unitCost: 18.00, productionTimeMinutes: 15, active: true },
  { id: 'fin_corte_contorno', name: 'Corte Especial em Plotter de Recorte (m²)', costType: 'PER_SQM', unitCost: 15.00, productionTimeMinutes: 10, active: true }
];

export const DEFAULT_CUSTOMERS: Customer[] = [
  {
    id: 'cli_01',
    type: 'COMPANY',
    name: 'Padaria e Confeitaria Pão D\'Ouro Ltda',
    tradingName: 'Padaria Pão D\'Ouro',
    cpfCnpj: '52.998.224/0001-25',
    stateRegistration: '123.456.789.111',
    municipalRegistration: '987.654-0',
    contactPerson: 'Carlos Eduardo',
    phone: '(11) 2233-4455',
    normalizedPhone: '551122334455',
    whatsapp: '(11) 99887-6655',
    normalizedWhatsapp: '5511998876655',
    secondaryPhone: '(11) 97766-5544',
    email: 'compras@paodeouro.com.br',
    preferredContactMethod: 'WHATSAPP',
    cep: '01311-000',
    street: 'Rua Augusta',
    number: '450',
    complement: 'Térreo',
    neighborhood: 'Consolação',
    city: 'São Paulo',
    state: 'SP',
    landmark: 'Próximo à estação Higienópolis-Mackenzie',
    deliveryInstructions: 'Entregar das 08h às 11h na recepção dos fundos.',
    notes: 'Cliente preferencial. Faturamento quinzenal.',
    attendantNotes: 'Atendimento prioritário pela equipe de vendas de grandes contas.',
    artworkNotes: 'Enviar prova virtual em PDF em até 24h.',
    productionNotes: 'Usar lona 440g fosca para evitar reflexo nas fotos do estabelecimento.',
    finishingNotes: 'Ilhós reforçado em inox.',
    financialNotes: 'Pagamento quinzenal faturado com boleto/PIX.',
    deliveryNotes: 'Aviso prévio por WhatsApp 30min antes de chegar.',
    internalWarnings: 'Atenção: Exigir pedido de compra oficial antes da produção.',
    allowWhatsapp: true,
    allowQuoteNotice: true,
    allowProductionNotice: true,
    allowPickupNotice: true,
    allowPaymentReminder: true,
    allowMarketing: false,
    active: true,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
    totalPurchased: 2450.00,
    totalPaid: 2260.00,
    pendingBalance: 190.00,
    lastPurchaseDate: '2026-08-01',
    lastUpdatedDate: '2026-08-01'
  },
  {
    id: 'cli_02',
    type: 'INDIVIDUAL',
    name: 'Ana Paula Rodrigues',
    cpfCnpj: '529.982.247-25',
    contactPerson: 'Ana Paula',
    phone: '(11) 98112-3344',
    normalizedPhone: '5511981123344',
    whatsapp: '(11) 98112-3344',
    normalizedWhatsapp: '5511981123344',
    email: 'ana.rodrigues@email.com',
    preferredContactMethod: 'WHATSAPP',
    cep: '04001-001',
    street: 'Rua Domingos de Morais',
    number: '1200',
    neighborhood: 'Vila Mariana',
    city: 'São Paulo',
    state: 'SP',
    notes: 'Trabalha com doces artesanais e compra etiquetas com frequência.',
    attendantNotes: 'Gosta de atendimento ágil pelo WhatsApp.',
    allowWhatsapp: true,
    allowQuoteNotice: true,
    allowProductionNotice: true,
    allowPickupNotice: true,
    allowPaymentReminder: true,
    allowMarketing: true,
    active: true,
    createdAt: '2026-03-20T14:30:00Z',
    totalPurchased: 680.00,
    totalPaid: 680.00,
    pendingBalance: 0,
    lastPurchaseDate: '2026-08-03'
  }
];

export const DEFAULT_QUOTATIONS: Quotation[] = [
  {
    id: 'orc_1001',
    number: 'ORC-2026-0001',
    createdAt: '2026-08-01T09:00:00Z',
    expirationDate: '2026-08-08T09:00:00Z',
    customerId: 'cli_01',
    customerName: 'Padaria e Confeitaria Pão D\'Ouro Ltda',
    salespersonName: 'Rodrigo Vendas',
    items: [
      {
        id: 'item_1001_1',
        serviceId: 'srv_banner',
        serviceName: 'Banner em Lona com Ilhós e Bainha',
        description: 'Banner Promocional Festival de Inverno',
        quantity: 2,
        widthCm: 200,
        heightCm: 100,
        materialId: 'mat_lona440',
        materialName: 'Lona Frontlight 440g',
        orientation: 'HORIZONTAL',
        allowances: { reinforcementCm: 5, hemCm: 3, rodPocketCm: 0, bleedCm: 2, edgeSafetyCm: 2 },
        finishings: [
          {
            id: 'fin_1001_1',
            finishingId: 'fin_ilhos',
            finishingName: 'Bainha e Ilhós',
            costType: 'PER_UNIT',
            quantity: 2,
            unitPriceSnapshot: 10,
            subtotal: 20
          }
        ],
        position: 1,
        servicePriceSnapshot: 80,
        baseValue: 320,
        finishingTotal: 20,
        subtotal: 340
      }
    ],
    subtotal: 340.00,
    serviceId: 'srv_banner',
    serviceName: 'Banner em Lona com Ilhós e Bainha',
    description: 'Banner Promocional Festival de Inverno',
    colors: '4x0 (Colorido)',
    widthCm: 200,
    heightCm: 100,
    quantity: 2,
    materialId: 'mat_lona440',
    materialName: 'Lona Frontlight 440g',
    orientation: 'HORIZONTAL',
    allowances: { reinforcementCm: 5, hemCm: 3, rodPocketCm: 0, bleedCm: 2, edgeSafetyCm: 2 },
    finishingText: 'Bainha e 4 ilhós por peça',
    installationText: 'Não inclusa',
    designCost: 30.00,
    installationCost: 0,
    deliveryCost: 20.00,
    discountAmount: 10.00,
    extraCharges: 0,
    totalAmount: 380.00,
    paymentTerms: '50% no pedido e 50% na entrega',
    maxDeadlineDays: 3,
    internalNotes: 'Aguardando envio do logotipo em vetor.',
    customerNotes: 'Considerar prazo após aprovação da arte.',
    status: 'APROVADO',
    workOrderId: 'os_2001'
  },
  {
    id: 'orc_1002',
    number: 'ORC-2026-0002',
    createdAt: '2026-08-04T08:30:00Z',
    expirationDate: '2026-08-11T08:30:00Z',
    customerId: 'cli_02',
    customerName: 'Ana Paula Rodrigues',
    salespersonName: 'Mariana Lima',
    items: [
      {
        id: 'item_1002_1',
        serviceId: 'srv_adesivo',
        serviceName: 'Adesivo Promocional Impresso',
        description: 'Etiquetas Personalizadas para Doces Gourmet',
        quantity: 50,
        widthCm: 90,
        heightCm: 30,
        materialId: 'mat_adesivo_vinil',
        materialName: 'Adesivo Vinil Polimérico Brilho 100u',
        orientation: 'HORIZONTAL',
        allowances: { reinforcementCm: 0, hemCm: 0, rodPocketCm: 0, bleedCm: 1, edgeSafetyCm: 1.5 },
        finishings: [],
        position: 1,
        servicePriceSnapshot: 75,
        baseValue: 220,
        finishingTotal: 0,
        subtotal: 220
      }
    ],
    subtotal: 220.00,
    serviceId: 'srv_adesivo',
    serviceName: 'Adesivo Promocional Impresso',
    description: 'Etiquetas Personalizadas para Doces Gourmet',
    colors: '4x0',
    widthCm: 90,
    heightCm: 30,
    quantity: 50,
    materialId: 'mat_adesivo_vinil',
    materialName: 'Adesivo Vinil Polimérico Brilho 100u',
    orientation: 'HORIZONTAL',
    allowances: { reinforcementCm: 0, hemCm: 0, rodPocketCm: 0, bleedCm: 1, edgeSafetyCm: 1.5 },
    finishingText: 'Half-cut (meio corte retangular)',
    installationText: 'Não aplicável',
    designCost: 0,
    installationCost: 0,
    deliveryCost: 0,
    discountAmount: 0,
    extraCharges: 0,
    totalAmount: 220.00,
    paymentTerms: '100% via PIX na aprovação',
    maxDeadlineDays: 2,
    internalNotes: 'Adesivos pequenos divididos nas filas da bobina.',
    customerNotes: 'Entregar cartela cortada.',
    status: 'ENVIADO'
  }
];

export const DEFAULT_WORK_ORDERS: WorkOrder[] = [
  {
    id: 'os_2001',
    number: 'OS-2026-0001',
    quotationId: 'orc_1001',
    quotationNumber: 'ORC-2026-0001',
    customerId: 'cli_01',
    customerName: 'Padaria e Confeitaria Pão D\'Ouro Ltda',
    customerPhone: '(11) 99887-6655',
    approvalDate: '2026-08-01',
    deadlineDate: '2026-08-05',
    serviceName: 'Banner em Lona com Ilhós e Bainha',
    description: 'Banner Promocional Festival de Inverno',
    dimensionsText: '200 x 100 cm',
    widthCm: 200,
    heightCm: 100,
    quantity: 2,
    materialName: 'Lona Frontlight 440g',
    colors: '4x0 (Colorido)',
    finishingText: 'Bainha e 4 ilhós por peça',
    installationText: 'Não inclusa',
    artworkInstructions: 'Texto: Festival de Inverno Pão D\'Ouro - Fundo tom pastel com ilustração de pães quentes.',
    paymentMethod: 'PIX (Sinal 50%)',
    totalAmount: 380.00,
    amountPaid: 190.00,
    remainingBalance: 190.00,
    salespersonName: 'Rodrigo Vendas',
    designerName: 'Fernando Designer',
    productionResponsible: 'Marcos Impressão',
    internalNotes: 'Usar bobina de 120 cm para impressão.',
    customerNotes: 'Enviar prévia por WhatsApp antes de rodar.',
    productionStatus: 'AGUARDANDO_RETIRADA',
    statusHistory: [
      { id: 'sh1', previousStatus: 'PRODUCAO_ARTES', newStatus: 'ARTE_APROVADA', changedAt: '2026-08-01T14:00:00Z', changedBy: 'Fernando Designer', observation: 'Arte aprovada via WhatsApp' },
      { id: 'sh2', previousStatus: 'ARTE_APROVADA', newStatus: 'PRODUCAO', changedAt: '2026-08-02T09:00:00Z', changedBy: 'Marcos Impressão', observation: 'Impresso na plotadora 01' },
      { id: 'sh3', previousStatus: 'PRODUCAO', newStatus: 'ACABAMENTO', changedAt: '2026-08-03T11:00:00Z', changedBy: 'Lucas Acabamento', observation: 'Colocado ilhós e bainha fita' },
      { id: 'sh4', previousStatus: 'ACABAMENTO', newStatus: 'FINALIZADO', changedAt: '2026-08-03T16:00:00Z', changedBy: 'Lucas Acabamento', observation: 'Embalado e identificado' },
      { id: 'sh5', previousStatus: 'FINALIZADO', newStatus: 'AGUARDANDO_RETIRADA', changedAt: '2026-08-03T16:30:00Z', changedBy: 'Balcão', observation: 'Cliente notificado via WhatsApp' }
    ],
    notionPageId: 'notion_page_os_2001',
    createdAt: '2026-08-01T10:00:00Z'
  }
];

export const DEFAULT_RECEIPTS: Receipt[] = [
  {
    id: 'rec_3001',
    number: 'REC-2026-0001',
    workOrderId: 'os_2001',
    workOrderNumber: 'OS-2026-0001',
    customerId: 'cli_01',
    customerName: 'Padaria e Confeitaria Pão D\'Ouro Ltda',
    cpfCnpj: '52.998.224/0001-25',
    amount: 190.00,
    amountInWords: 'cento e noventa reais',
    paymentMethod: 'PIX',
    paymentDate: '2026-08-01',
    referringTo: 'Sinal de 50% referente à OS-2026-0001 (Banner Promocional)',
    issuerName: 'Atendimento Gráfica',
    observations: 'Comprovante gerado na aprovação do pedido.',
    createdAt: '2026-08-01T10:05:00Z'
  }
];

export const DEFAULT_PAYMENTS: PaymentRecord[] = [
  {
    id: 'pay_4001',
    workOrderId: 'os_2001',
    quotationId: 'orc_1001',
    customerId: 'cli_01',
    customerName: 'Padaria e Confeitaria Pão D\'Ouro Ltda',
    date: '2026-08-01',
    amount: 190.00,
    method: 'PIX',
    condition: 'SINAL_RESTANTE',
    installments: [
      { id: 'inst1', number: 1, dueDate: '2026-08-01', amount: 190.00, paidAmount: 190.00, status: 'PAID', paidAt: '2026-08-01' },
      { id: 'inst2', number: 2, dueDate: '2026-08-05', amount: 190.00, paidAmount: 0, status: 'PENDING' }
    ],
    receiptId: 'rec_3001',
    receivedBy: 'Balcão Vendas',
    notes: 'Sinal pago na aprovação'
  }
];

class StorageService {
  private get<T>(key: string, fallback: T): T {
    const operational=[STORAGE_KEYS.CUSTOMERS,STORAGE_KEYS.CUSTOMER_OBSERVATIONS,STORAGE_KEYS.CUSTOMER_AUDIT_LOGS,STORAGE_KEYS.CUSTOMER_ADDRESSES,STORAGE_KEYS.MATERIALS,STORAGE_KEYS.PHYSICAL_ROLLS,STORAGE_KEYS.SERVICES,STORAGE_KEYS.FINISHES,STORAGE_KEYS.QUOTATIONS,STORAGE_KEYS.WORK_ORDERS,STORAGE_KEYS.PAYMENTS,STORAGE_KEYS.RECEIPTS,STORAGE_KEYS.INTEGRATION_QUEUE,STORAGE_KEYS.AUDIT_LOGS].includes(key);
    const central=businessRead(key,fallback);if(central.handled)return central.value;
    if(runtimeReset&&operational)return [] as T;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : operational?[] as T:fallback;
    } catch {
      return operational?[] as T:fallback;
    }
  }

  private set<T>(key: string, value: T): void {
    if(businessWrite(key,value))return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  // Company
  getCompanySettings(): CompanySettings {
    return this.get(STORAGE_KEYS.COMPANY, DEFAULT_COMPANY);
  }
  saveCompanySettings(settings: CompanySettings): void {
    this.set(STORAGE_KEYS.COMPANY, settings);
  }

  // Customers
  getCustomers(): Customer[] {
    return this.get(STORAGE_KEYS.CUSTOMERS, DEFAULT_CUSTOMERS);
  }
  saveCustomers(customers: Customer[]): void {
    this.set(STORAGE_KEYS.CUSTOMERS, customers);
  }

  // Materials
  getMaterials(): Material[] {
    const rawMaterials = this.get<Material[]>(STORAGE_KEYS.MATERIALS, DEFAULT_MATERIALS);
    return rawMaterials.map(m => {
      const controlType = m.controlType || (m.unit === 'un' || m.category === 'Papéis' ? 'UNIT' : 'ROLL');
      const calculationUnit = m.calculationUnit || (m.unit === 'un' ? 'UNIT' : 'M2');
      const salePrice = m.salePrice !== undefined ? m.salePrice : (m.sellingPriceSqm || 0);
      const referenceCost = m.referenceCost !== undefined ? m.referenceCost : (m.costPerSqm || 0);
      const code = m.code || (m.id.startsWith('mat_') ? m.id.replace('mat_', '').toUpperCase() : m.name.substring(0, 8).toUpperCase());
      const allowRotation = m.allowRotation !== undefined ? m.allowRotation : true;
      const autoFindLowestCost = m.autoFindLowestCost !== undefined ? m.autoFindLowestCost : true;
      const allowManualRollOverride = m.allowManualRollOverride !== undefined ? m.allowManualRollOverride : true;
      const allowedRollWidths = m.allowedRollWidths && m.allowedRollWidths.length > 0
        ? m.allowedRollWidths
        : (m.availableRolls ? m.availableRolls.map(r => r.widthCm) : [80, 100, 120, 140, 160]);
      const volumeDiscountEnabled = m.volumeDiscountEnabled !== undefined ? m.volumeDiscountEnabled : false;
      const discountTiers = m.discountTiers || [];

      return {
        ...m,
        code,
        controlType,
        calculationUnit,
        salePrice,
        referenceCost,
        allowRotation,
        autoFindLowestCost,
        allowManualRollOverride,
        allowedRollWidths,
        volumeDiscountEnabled,
        discountTiers
      };
    });
  }
  saveMaterials(materials: Material[]): void {
    this.set(STORAGE_KEYS.MATERIALS, materials);
  }

  // Physical Rolls (Separation between Material Configuration and Physical Inventory)
  getPhysicalRolls(): PhysicalRoll[] {
    return this.get<PhysicalRoll[]>(STORAGE_KEYS.PHYSICAL_ROLLS, DEFAULT_PHYSICAL_ROLLS);
  }
  savePhysicalRolls(rolls: PhysicalRoll[]): void {
    this.set(STORAGE_KEYS.PHYSICAL_ROLLS, rolls);
  }

  // Services
  getServices(): Service[] {
    const rawServices = this.get(STORAGE_KEYS.SERVICES, DEFAULT_SERVICES);
    return rawServices.map(s => {
      let isGraphic = s.isGraphic;
      if (isGraphic === undefined) {
        if (s.calculationType === 'UNIT' || s.pricingMethod === 'PER_UNIT') {
          isGraphic = true;
        } else {
          isGraphic = false;
        }
      }

      let calculationType = s.calculationType;
      if (!calculationType) {
        calculationType = isGraphic ? 'UNIT' : 'ROLL';
      }

      const referenceQuantity = s.referenceQuantity && s.referenceQuantity > 0 ? s.referenceQuantity : (s.minQuantity || 1000);
      const referencePrice = s.referencePrice !== undefined && s.referencePrice >= 0 ? s.referencePrice : (s.basePrice || s.minimumCharge || 0);

      return {
        ...s,
        serviceGroup: s.serviceGroup ?? (s.isGraphic === true || s.calculationType === 'UNIT' ? 'GRAPHIC_PRODUCTS' : s.isGraphic === false || s.calculationType === 'ROLL' ? 'VISUAL_COMMUNICATION' : undefined),
        isGraphic,
        calculationType,
        referenceQuantity,
        referencePrice,
        quantityDiscountTiers: s.quantityDiscountTiers || s.priceTiers?.map(pt => ({
          id: pt.id,
          minimumQuantity: pt.minQty,
          discountPercentage: pt.pricePerUnit,
          active: true
        })) || []
      };
    });
  }
  saveServices(services: Service[]): void {
    this.set(STORAGE_KEYS.SERVICES, services);
  }

  // Finishes
  getFinishes(): FinishOption[] {
    return this.get(STORAGE_KEYS.FINISHES, DEFAULT_FINISHES);
  }
  saveFinishes(finishes: FinishOption[]): void {
    this.set(STORAGE_KEYS.FINISHES, finishes);
  }

  // Budget General Settings
  getBudgetSettings(): BudgetGeneralSettings {
    return this.get(STORAGE_KEYS.BUDGET_SETTINGS, DEFAULT_BUDGET_SETTINGS);
  }
  saveBudgetSettings(settings: BudgetGeneralSettings): void {
    this.set(STORAGE_KEYS.BUDGET_SETTINGS, settings);
  }

  // Quotations
  getQuotations(): Quotation[] {
    return this.get(STORAGE_KEYS.QUOTATIONS, []);
  }
  saveQuotations(quotations: Quotation[]): void {
    this.set(STORAGE_KEYS.QUOTATIONS, quotations);
  }

  // Work Orders
  getWorkOrders(): WorkOrder[] {
    return this.get(STORAGE_KEYS.WORK_ORDERS, DEFAULT_WORK_ORDERS);
  }
  saveWorkOrders(workOrders: WorkOrder[]): void {
    this.set(STORAGE_KEYS.WORK_ORDERS, workOrders);
  }

  // Receipts
  getReceipts(): Receipt[] {
    return this.get(STORAGE_KEYS.RECEIPTS, DEFAULT_RECEIPTS);
  }
  saveReceipts(receipts: Receipt[]): void {
    this.set(STORAGE_KEYS.RECEIPTS, receipts);
  }

  // Payments
  getPayments(): PaymentRecord[] {
    return this.get(STORAGE_KEYS.PAYMENTS, DEFAULT_PAYMENTS);
  }
  savePayments(payments: PaymentRecord[]): void {
    this.set(STORAGE_KEYS.PAYMENTS, payments);
  }

  // Role
  getCurrentRole(): UserRole {
    return this.get(STORAGE_KEYS.CURRENT_ROLE, 'ADMIN' as UserRole);
  }
  setCurrentRole(role: UserRole): void {
    this.set(STORAGE_KEYS.CURRENT_ROLE, role);
  }

  // Integrations Queue
  getQueue(): IntegrationQueueItem[] {
    return this.get(STORAGE_KEYS.INTEGRATION_QUEUE, []);
  }
  saveQueue(queue: IntegrationQueueItem[]): void {
    this.set(STORAGE_KEYS.INTEGRATION_QUEUE, queue);
  }

  // Notion Settings
  getNotionSettings(): NotionSettings {
    return this.get(STORAGE_KEYS.NOTION, {
      apiToken: '',
      databaseId: '',
      syncEnabled: false,
      autoSyncOnStatusChange: true
    });
  }
  saveNotionSettings(settings: NotionSettings): void {
    this.set(STORAGE_KEYS.NOTION, settings);
  }

  // WhatsApp Settings
  getWhatsAppSettings(): WhatsAppSettings {
    return this.get(STORAGE_KEYS.WHATSAPP, {
      phoneNumberId: '',
      accessToken: '',
      businessAccountId: '',
      autoSendPickupNotice: false,
      autoSendQuoteMessage: false
    });
  }
  saveWhatsAppSettings(settings: WhatsAppSettings): void {
    this.set(STORAGE_KEYS.WHATSAPP, settings);
  }

  // Customer Observations
  getCustomerObservations(customerId?: string): CustomerObservation[] {
    const list = this.get<CustomerObservation[]>(STORAGE_KEYS.CUSTOMER_OBSERVATIONS, [
      {
        id: 'cobs_01',
        customerId: 'cli_01',
        category: 'FINANCEIRO',
        text: 'Cliente faturado quinzenalmente. Sempre exigir ordem de compra ou autorização assinada.',
        isImportantWarning: true,
        isInternal: true,
        createdBy: 'Gerência Financeira',
        createdAt: '2026-01-16T10:00:00Z',
        status: 'ACTIVE'
      },
      {
        id: 'cobs_02',
        customerId: 'cli_01',
        category: 'PRODUCAO',
        text: 'Prefere cores vivas em CMYK. Utilizar sempre perfil de cor Coated FOGRA39.',
        isImportantWarning: false,
        isInternal: true,
        createdBy: 'Fernando Designer',
        createdAt: '2026-02-10T14:20:00Z',
        status: 'ACTIVE'
      }
    ]);
    if (customerId) {
      return list.filter((item) => item.customerId === customerId);
    }
    return list;
  }

  saveCustomerObservations(observations: CustomerObservation[]): void {
    this.set(STORAGE_KEYS.CUSTOMER_OBSERVATIONS, observations);
  }

  addCustomerObservation(obs: Omit<CustomerObservation, 'id' | 'createdAt'>): CustomerObservation {
    const list = this.getCustomerObservations();
    const newObs: CustomerObservation = {
      ...obs,
      id: `cobs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString()
    };
    list.unshift(newObs);
    this.saveCustomerObservations(list);
    return newObs;
  }

  // Customer Audit Logs
  getCustomerAuditLogs(customerId?: string): CustomerAuditLog[] {
    const list = this.get<CustomerAuditLog[]>(STORAGE_KEYS.CUSTOMER_AUDIT_LOGS, [
      {
        id: 'caud_01',
        customerId: 'cli_01',
        action: 'CLIENTE_CRIADO',
        changedField: 'Cadastro Inicial',
        oldValue: '',
        newValue: 'Padaria e Confeitaria Pão D\'Ouro Ltda',
        user: 'Rodrigo Vendas',
        reason: 'Cadastro inicial do cliente no sistema',
        timestamp: '2026-01-15T10:00:00Z'
      }
    ]);
    if (customerId) {
      return list.filter((item) => item.customerId === customerId);
    }
    return list;
  }

  saveCustomerAuditLogs(logs: CustomerAuditLog[]): void {
    this.set(STORAGE_KEYS.CUSTOMER_AUDIT_LOGS, logs);
  }

  addCustomerAuditLog(log: Omit<CustomerAuditLog, 'id' | 'timestamp'>): CustomerAuditLog {
    const list = this.getCustomerAuditLogs();
    const newLog: CustomerAuditLog = {
      ...log,
      id: `caud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString()
    };
    list.unshift(newLog);
    this.saveCustomerAuditLogs(list);
    return newLog;
  }

  // Customer Addresses
  getCustomerAddresses(customerId?: string): CustomerAddress[] {
    const list = this.get<CustomerAddress[]>(STORAGE_KEYS.CUSTOMER_ADDRESSES, []);
    if (customerId) {
      return list.filter((item) => item.customerId === customerId);
    }
    return list;
  }

  saveCustomerAddresses(addresses: CustomerAddress[]): void {
    this.set(STORAGE_KEYS.CUSTOMER_ADDRESSES, addresses);
  }

  // Audit Logs
  getAuditLogs(): AuditLog[] {
    return this.get(STORAGE_KEYS.AUDIT_LOGS, []);
  }
  addAuditLog(action: string, entity: string, entityId: string, details: string, user: string = activeProfile?.name || 'Sistema'): void {
    const logs = this.getAuditLogs();
    logs.unshift({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      user,
      action,
      entity,
      entityId,
      details
    });
    this.set(STORAGE_KEYS.AUDIT_LOGS, logs.slice(0, 500)); // Keep last 500 logs
    if(activeProfile&&!['WORK_ORDER','QUOTATION'].includes(entity))void teamRequest('/api/team/activity',{action,entity,entityId,details}).catch(()=>undefined);
  }
}

export const storage = new StorageService();
